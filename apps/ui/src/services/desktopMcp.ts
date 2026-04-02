import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Diagnostic } from './renderService';
import { FALLBACK_PREVIEW_SCENE_STYLE, type PreviewSceneStyle } from './previewSceneConfig';
import { captureCurrentPreview } from '../utils/capturePreview';
import {
  buildProjectContextSummary,
  capturePreviewScreenshot,
  type PreviewScreenshotOptions,
} from './studioTooling';
import {
  getProjectState,
  getProjectStore,
  getRenderTargetContent,
  listProjectFiles as listProjectFilesFromState,
} from '../stores/projectStore';
import { requestRender } from '../stores/renderRequestStore';
import { normalizeProjectRelativePath } from '../utils/projectFilePaths';

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

interface McpToolRequestPayload {
  requestId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
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
    default:
      return textResponse(`Unsupported MCP tool: ${payload.toolName}`, true);
  }
}

async function submitToolResponse(requestId: string, response: McpToolResponse) {
  await invoke('mcp_submit_tool_response', { requestId, response });
}

export async function initializeDesktopMcpBridge(): Promise<() => void> {
  if (!isDesktopTauri()) {
    return () => {};
  }

  if (!bridgeUnlistenPromise) {
    bridgeUnlistenPromise = listen<McpToolRequestPayload>('mcp:tool-request', async (event) => {
      const payload = event.payload;
      const response = await executeToolRequest(payload).catch((error: unknown) =>
        textResponse(
          error instanceof Error ? error.message : `Unexpected MCP tool error: ${String(error)}`,
          true
        )
      );

      try {
        await submitToolResponse(payload.requestId, response);
      } catch (error) {
        console.error('[desktopMcp] Failed to submit tool response:', error);
      }
    });
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
  previewSceneStyle,
  useModelColors,
}: {
  previewKind: PreviewKind;
  previewSrc: string;
  previewSceneStyle: PreviewSceneStyle;
  useModelColors: boolean;
}) {
  previewState.previewKind = previewKind;
  previewState.previewSrc = previewSrc;
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

export function buildAgentSnippet(port: number): string {
  return `Use the OpenSCAD Studio MCP server at http://127.0.0.1:${port}/mcp for project context, render-target switching, diagnostics, render refresh, and preview screenshots. Read and edit files directly in the repo; do not use Studio MCP for file reads or writes.`;
}
