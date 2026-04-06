import { invoke } from '@tauri-apps/api/core';
import { getRenderService, type Diagnostic, type ExportFormat } from './renderService';
import { FALLBACK_PREVIEW_SCENE_STYLE, type PreviewSceneStyle } from './previewSceneConfig';
import { captureCurrentPreview } from '../utils/capturePreview';
import {
  buildProjectContextSummary,
  capturePreviewScreenshot,
  type PreviewScreenshotOptions,
} from './studioTooling';
import {
  getAuxiliaryFilesForRender,
  getProjectState,
  getProjectWorkingDirectory,
  getProjectStore,
  getRenderTargetContent,
  listProjectFiles as listProjectFilesFromState,
} from '../stores/projectStore';
import { getPlatform } from '../platform';
import { loadSettings } from '../stores/settingsStore';
import { requestRender } from '../stores/renderRequestStore';
import { getWorkspaceState } from '../stores/workspaceStore';
import { normalizeProjectRelativePath } from '../utils/projectFilePaths';
import { resolveWorkingDirDeps } from '../utils/resolveWorkingDirDeps';

type PreviewKind = 'mesh' | 'svg';
type RenderTrigger = Parameters<typeof requestRender>[0];

export type McpServerState = 'starting' | 'running' | 'disabled' | 'port_conflict' | 'error';

export interface McpServerStatus {
  enabled: boolean;
  port: number;
  status: McpServerState;
  endpoint: string | null;
  message: string | null;
}

export interface WorkspaceDescriptor {
  windowId: string;
  title: string;
  workspaceRoot: string | null;
  renderTargetPath: string | null;
  isFocused: boolean;
}

interface McpToolRequestPayload {
  requestId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export type DesktopWindowLaunchIntent =
  | { kind: 'welcome' }
  | {
      kind: 'open_folder';
      request_id: string;
      folder_path: string;
      create_if_empty: boolean;
    }
  | { kind: 'open_file'; request_id: string; file_path: string };

export type DesktopWindowOpenRequest =
  | {
      kind: 'open_folder';
      folder_path: string;
      create_if_empty: boolean;
    }
  | { kind: 'open_file'; file_path: string };

interface DesktopWindowOpenRequestPayload {
  requestId: string;
  request: DesktopWindowOpenRequest;
}

interface InitializeDesktopMcpBridgeOptions {
  onOpenRequest?: (payload: DesktopWindowOpenRequestPayload) => void | Promise<void>;
}

interface DesktopWindowBootstrapPayload {
  launchIntent?: DesktopWindowLaunchIntent | null;
}

interface McpTextContent {
  type: 'text';
  text: string;
}

interface McpImageContent {
  type: 'image';
  data: string;
  mimeType: 'image/png';
}

type McpContent = McpTextContent | McpImageContent;

interface McpToolResponse {
  content: McpContent[];
  isError?: boolean;
}

interface RenderSnapshotLike {
  previewSrc: string;
  previewKind: PreviewKind;
  diagnostics: Diagnostic[];
  error: string;
}

const DEFAULT_STATUS: McpServerStatus = {
  enabled: true,
  port: 32123,
  status: 'disabled',
  endpoint: null,
  message: null,
};

const previewState = {
  previewKind: 'mesh' as PreviewKind,
  previewSrc: '',
  previewViewerId: null as string | null,
  previewSceneStyle: FALLBACK_PREVIEW_SCENE_STYLE as PreviewSceneStyle,
  useModelColors: true,
};

const renderWaiters = new Map<
  number,
  {
    resolve: (snapshot: RenderSnapshotLike) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();
let nextRenderWaiterId = 1;
let bridgeUnlistenPromise: Promise<() => void> | null = null;

function isDesktopTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function textResponse(text: string, isError = false): McpToolResponse {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

function buildScreenshotCallbacks(): Omit<
  PreviewScreenshotOptions,
  'view' | 'azimuth' | 'elevation'
> {
  return {
    captureCurrentView: async () =>
      captureCurrentPreview({
        viewerId: previewState.previewViewerId,
        svgSourceUrl: previewState.previewKind === 'svg' ? previewState.previewSrc : null,
        targetWidth: 1200,
        targetHeight: 630,
      }),
    get3dPreviewUrl: () =>
      previewState.previewKind === 'mesh' && previewState.previewSrc
        ? previewState.previewSrc
        : null,
    getPreviewSceneStyle: () => previewState.previewSceneStyle,
    getUseModelColors: () => previewState.useModelColors,
  };
}

function formatDiagnostics(diagnostics: Diagnostic[], renderError = ''): string {
  if (diagnostics.length === 0 && !renderError) {
    return '✅ No errors or warnings. The current render target compiled successfully.';
  }

  const formatted = diagnostics
    .map((d) => {
      const severity =
        d.severity === 'error' ? 'Error' : d.severity === 'warning' ? 'Warning' : 'Info';
      const location = d.line ? ` (line ${d.line}${d.col ? `, col ${d.col}` : ''})` : '';
      return `[${severity}]${location}: ${d.message}`;
    })
    .join('\n');

  if (formatted && renderError) {
    return `Render diagnostics:\n\n${formatted}\n\nRender state: ${renderError}`;
  }
  if (formatted) {
    return `Render diagnostics:\n\n${formatted}`;
  }
  return `Render state: ${renderError}`;
}

function waitForNextRender(timeoutMs = 20000): Promise<RenderSnapshotLike> {
  return new Promise<RenderSnapshotLike>((resolve, reject) => {
    const id = nextRenderWaiterId++;
    const timeoutId = setTimeout(() => {
      renderWaiters.delete(id);
      reject(new Error('Timed out waiting for Studio to finish rendering.'));
    }, timeoutMs);

    renderWaiters.set(id, { resolve, reject, timeoutId });
  });
}

function resolveNextRenderWaiter(snapshot: RenderSnapshotLike) {
  const firstEntry = renderWaiters.entries().next();
  if (firstEntry.done) return;

  const [id, waiter] = firstEntry.value;
  clearTimeout(waiter.timeoutId);
  renderWaiters.delete(id);
  waiter.resolve(snapshot);
}

async function runRenderAndWait(trigger: RenderTrigger): Promise<RenderSnapshotLike> {
  const pending = waitForNextRender();
  requestRender(trigger, { immediate: true });
  return pending;
}

async function handleProjectContext(): Promise<McpToolResponse> {
  const state = getProjectState();
  const renderTarget = state.renderTargetPath;
  const summary = buildProjectContextSummary({
    renderTarget,
    renderTargetContent: getRenderTargetContent(state),
    allFiles: listProjectFilesFromState(state),
    includeTopLevelListing: false,
  });

  const parts = [summary];
  if (state.projectRoot) {
    parts.push(`Workspace root: ${state.projectRoot}`);
  }
  if (renderTarget) {
    const file = state.files[renderTarget];
    if (file?.isDirty) {
      parts.push('Render target has unsaved changes inside OpenSCAD Studio.');
    }
  }

  return textResponse(parts.join('\n\n'));
}

async function handleSetRenderTarget(
  argumentsValue: Record<string, unknown>
): Promise<McpToolResponse> {
  const filePath =
    typeof argumentsValue.file_path === 'string'
      ? argumentsValue.file_path
      : typeof argumentsValue.path === 'string'
        ? argumentsValue.path
        : null;

  if (!filePath) {
    return textResponse('`set_render_target` requires a `file_path` argument.', true);
  }

  const normalizedPath = normalizeProjectRelativePath(filePath);
  const state = getProjectState();
  if (!normalizedPath || !(normalizedPath in state.files)) {
    return textResponse(`❌ Render target not found: ${filePath}`, true);
  }

  let snapshot: RenderSnapshotLike;
  if (state.renderTargetPath === normalizedPath) {
    snapshot = await runRenderAndWait('manual');
  } else {
    const pending = waitForNextRender();
    getProjectStore().getState().setRenderTarget(normalizedPath);
    snapshot = await pending;
  }

  return textResponse(
    `✅ Render target changed to ${normalizedPath}.\n\n${formatDiagnostics(
      snapshot.diagnostics,
      snapshot.error
    )}`
  );
}

async function handleDiagnostics(): Promise<McpToolResponse> {
  const snapshot = await runRenderAndWait('manual');
  return textResponse(formatDiagnostics(snapshot.diagnostics, snapshot.error));
}

async function handleTriggerRender(): Promise<McpToolResponse> {
  const snapshot = await runRenderAndWait('manual');
  return textResponse(
    `✅ Render completed for ${getProjectState().renderTargetPath ?? 'the current render target'}.\n\n${formatDiagnostics(
      snapshot.diagnostics,
      snapshot.error
    )}`
  );
}

async function handlePreviewScreenshot(
  argumentsValue: Record<string, unknown>
): Promise<McpToolResponse> {
  const result = await capturePreviewScreenshot({
    ...buildScreenshotCallbacks(),
    view:
      typeof argumentsValue.view === 'string'
        ? (argumentsValue.view as PreviewScreenshotOptions['view'])
        : 'current',
    azimuth:
      typeof argumentsValue.azimuth === 'number' ? (argumentsValue.azimuth as number) : undefined,
    elevation:
      typeof argumentsValue.elevation === 'number'
        ? (argumentsValue.elevation as number)
        : undefined,
  });

  if (result.error) {
    return textResponse(result.error, true);
  }

  const dataUrl = result.image_data_url ?? '';
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return {
    content: [
      { type: 'image', data: base64, mimeType: 'image/png' },
      { type: 'text', text: 'Screenshot captured successfully.' },
    ],
  };
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

async function resolveExportDestination(filePath: string): Promise<string | null> {
  if (isAbsolutePath(filePath)) {
    return filePath;
  }

  const projectRoot = getProjectState().projectRoot;
  if (!projectRoot) {
    return null;
  }

  const { join } = await import('@tauri-apps/api/path');
  return join(projectRoot, filePath);
}

async function loadLibraryExportContext() {
  const platform = getPlatform();
  const settings = loadSettings();
  const systemPaths = settings.library.autoDiscoverSystem ? await platform.getLibraryPaths() : [];
  const libraryPaths = [...systemPaths, ...settings.library.customPaths];
  const libraryFiles: Record<string, string> = {};

  for (const libPath of libraryPaths) {
    try {
      const files = await platform.readDirectoryFiles(libPath);
      Object.assign(libraryFiles, files);
    } catch (error) {
      console.warn(`[desktopMcp] Failed to read library path ${libPath}:`, error);
    }
  }

  return { libraryFiles, libraryPaths };
}

async function handleExportFile(argumentsValue: Record<string, unknown>): Promise<McpToolResponse> {
  const format =
    typeof argumentsValue.format === 'string' ? (argumentsValue.format as ExportFormat) : null;
  const filePath =
    typeof argumentsValue.file_path === 'string'
      ? argumentsValue.file_path
      : typeof argumentsValue.path === 'string'
        ? argumentsValue.path
        : null;

  if (!format) {
    return textResponse('`export_file` requires a `format` argument.', true);
  }
  if (!filePath) {
    return textResponse('`export_file` requires a `file_path` argument.', true);
  }

  const state = getProjectState();
  const source = getRenderTargetContent(state);
  if (!source) {
    return textResponse('❌ No active render target is available to export.', true);
  }

  const resolvedPath = await resolveExportDestination(filePath);
  if (!resolvedPath) {
    return textResponse(
      '❌ Relative export paths require an open desktop workspace with a project root.',
      true
    );
  }

  const projectFiles = getAuxiliaryFilesForRender(state);
  const workingDir = getProjectWorkingDirectory(state);
  const renderTargetPath = state.renderTargetPath ?? undefined;
  const renderTargetDir =
    renderTargetPath && renderTargetPath.includes('/')
      ? renderTargetPath.slice(0, renderTargetPath.lastIndexOf('/'))
      : undefined;

  const { libraryFiles, libraryPaths } = await loadLibraryExportContext();
  let projectAuxFiles: Record<string, string> = { ...projectFiles };

  if (workingDir) {
    const workingDirFiles = await resolveWorkingDirDeps(source, {
      workingDir,
      libraryFiles,
      platform: getPlatform(),
      projectFiles,
      renderTargetDir,
    });

    if (Object.keys(workingDirFiles).length > 0) {
      projectAuxFiles = { ...projectAuxFiles, ...workingDirFiles };
    }
  }

  const exportBytes = await getRenderService().exportModel(source, format, {
    backend: 'manifold',
    auxiliaryFiles: Object.keys(projectAuxFiles).length > 0 ? projectAuxFiles : undefined,
    libraryFiles: Object.keys(libraryFiles).length > 0 ? libraryFiles : undefined,
    libraryPaths: libraryPaths.length > 0 ? libraryPaths : undefined,
    inputPath: renderTargetPath,
    workingDir: workingDir || undefined,
  });

  const { dirname } = await import('@tauri-apps/api/path');
  const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
  const parentDir = await dirname(resolvedPath);
  await mkdir(parentDir, { recursive: true });
  await writeFile(resolvedPath, exportBytes);

  return textResponse(`✅ Exported ${format.toUpperCase()} to ${resolvedPath}`);
}

async function executeToolRequest(payload: McpToolRequestPayload): Promise<McpToolResponse> {
  const args = payload.arguments ?? {};

  switch (payload.toolName) {
    case 'get_project_context':
      return handleProjectContext();
    case 'set_render_target':
      return handleSetRenderTarget(args);
    case 'get_diagnostics':
      return handleDiagnostics();
    case 'trigger_render':
      return handleTriggerRender();
    case 'get_preview_screenshot':
      return handlePreviewScreenshot(args);
    case 'export_file':
      return handleExportFile(args);
    default:
      return textResponse(`Unsupported MCP tool: ${payload.toolName}`, true);
  }
}

async function submitToolResponse(requestId: string, response: McpToolResponse) {
  await invoke('mcp_submit_tool_response', { requestId, response });
}

export async function initializeDesktopMcpBridge(
  options: InitializeDesktopMcpBridgeOptions = {}
): Promise<() => void> {
  if (!isDesktopTauri()) {
    return () => {};
  }

  if (!bridgeUnlistenPromise) {
    bridgeUnlistenPromise = (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWindow = getCurrentWindow();

      const unlistenToolRequest = await currentWindow.listen<McpToolRequestPayload>(
        'mcp:tool-request',
        async (event) => {
          const payload = event.payload;
          const response = await executeToolRequest(payload).catch((error: unknown) =>
            textResponse(
              error instanceof Error
                ? error.message
                : `Unexpected MCP tool error: ${String(error)}`,
              true
            )
          );

          try {
            await submitToolResponse(payload.requestId, response);
          } catch (error) {
            console.error('[desktopMcp] Failed to submit tool response:', error);
          }
        }
      );

      const unlistenOpenRequest = await currentWindow.listen<DesktopWindowOpenRequestPayload>(
        'desktop:open-request',
        async (event) => {
          await options.onOpenRequest?.(event.payload);
        }
      );

      const unlistenFocus = await currentWindow.onFocusChanged(() => {
        void syncDesktopMcpWindowContext({
          title: document.title || 'OpenSCAD Studio',
          workspaceRoot: getProjectState().projectRoot,
          renderTargetPath: getProjectState().renderTargetPath,
          showWelcome: getWorkspaceState().showWelcome,
          mode: getWorkspaceState().showWelcome ? 'welcome' : 'ready',
        });
      });

      await invoke('mcp_mark_window_bridge_ready');
      await syncDesktopMcpWindowContext({
        title: document.title || 'OpenSCAD Studio',
        workspaceRoot: getProjectState().projectRoot,
        renderTargetPath: getProjectState().renderTargetPath,
        showWelcome: getWorkspaceState().showWelcome,
        mode: getWorkspaceState().showWelcome ? 'welcome' : 'ready',
      });

      return () => {
        unlistenToolRequest();
        unlistenOpenRequest();
        unlistenFocus();
      };
    })();
  }

  const unlisten = await bridgeUnlistenPromise;
  return () => {
    unlisten();
    bridgeUnlistenPromise = null;
  };
}

export function updateDesktopMcpPreviewState({
  previewKind,
  previewSrc,
  previewViewerId,
  previewSceneStyle,
  useModelColors,
}: {
  previewKind: PreviewKind;
  previewSrc: string;
  previewViewerId: string | null;
  previewSceneStyle: PreviewSceneStyle;
  useModelColors: boolean;
}) {
  previewState.previewKind = previewKind;
  previewState.previewSrc = previewSrc;
  previewState.previewViewerId = previewViewerId;
  previewState.previewSceneStyle = previewSceneStyle;
  previewState.useModelColors = useModelColors;
}

export function notifyDesktopMcpRenderSettled(snapshot: RenderSnapshotLike) {
  resolveNextRenderWaiter(snapshot);
}

export async function syncDesktopMcpConfig(config: {
  enabled: boolean;
  port: number;
}): Promise<McpServerStatus> {
  if (!isDesktopTauri()) return DEFAULT_STATUS;
  return invoke<McpServerStatus>('configure_mcp_server', config);
}

export async function syncDesktopMcpWindowContext(context: {
  title: string;
  workspaceRoot: string | null;
  renderTargetPath: string | null;
  showWelcome: boolean;
  mode?: 'welcome' | 'opening' | 'ready' | 'open_failed';
  pendingRequestId?: string | null;
}): Promise<void> {
  if (!isDesktopTauri()) return;
  await invoke('mcp_update_window_context', {
    payload: {
      title: context.title,
      workspaceRoot: context.workspaceRoot,
      renderTargetPath: context.renderTargetPath,
      showWelcome: context.showWelcome,
      mode: context.mode ?? (context.showWelcome ? 'welcome' : 'ready'),
      pendingRequestId: context.pendingRequestId ?? null,
      ready: true,
    },
  });
}

export function consumeDesktopBootstrapLaunchIntent(): DesktopWindowLaunchIntent | null {
  if (typeof window === 'undefined') return null;
  const payload = window.__OPENSCAD_STUDIO_BOOTSTRAP__ as DesktopWindowBootstrapPayload | undefined;
  const intent = payload?.launchIntent ?? null;
  if (payload) {
    payload.launchIntent = null;
  }
  return intent;
}

export async function reportDesktopWindowOpenResult(payload: {
  requestId: string;
  success: boolean;
  message?: string;
  openedWorkspaceRoot?: string | null;
  openedFilePath?: string | null;
}): Promise<void> {
  if (!isDesktopTauri()) return;
  await invoke('report_window_open_result', {
    payload: {
      requestId: payload.requestId,
      success: payload.success,
      message: payload.message ?? null,
      openedWorkspaceRoot: payload.openedWorkspaceRoot ?? null,
      openedFilePath: payload.openedFilePath ?? null,
    },
  });
}

export async function getDesktopMcpStatus(): Promise<McpServerStatus> {
  if (!isDesktopTauri()) return DEFAULT_STATUS;
  return invoke<McpServerStatus>('get_mcp_server_status');
}

export function buildClaudeMcpCommand(port: number): string {
  return `claude mcp add --transport http --scope user openscad-studio http://127.0.0.1:${port}/mcp`;
}

export function buildCodexMcpCommand(port: number): string {
  return `codex mcp add openscad-studio --url http://127.0.0.1:${port}/mcp`;
}

export function buildCursorMcpConfig(port: number): string {
  return `{
  "mcpServers": {
    "openscad-studio": {
      "url": "http://127.0.0.1:${port}/mcp"
    }
  }
}`;
}

export function buildOpenCodeMcpConfig(port: number): string {
  return `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openscad-studio": {
      "type": "remote",
      "url": "http://127.0.0.1:${port}/mcp",
      "enabled": true
    }
  }
}`;
}

export function buildAgentSnippet(port: number): string {
  return `Use the OpenSCAD Studio MCP server at http://127.0.0.1:${port}/mcp for render-target switching, diagnostics, render refresh, preview screenshots, and exports. Read and edit files directly in the repo, then call get_or_create_workspace with the repo root before using Studio tools.`;
}
