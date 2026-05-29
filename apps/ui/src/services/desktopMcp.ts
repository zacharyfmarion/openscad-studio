import { invoke } from '@tauri-apps/api/core';
import { getRenderService, type Diagnostic, type ExportFormat } from './renderService';
import { captureOffscreen, type PresetView } from './offscreenRenderer';
import { buildProjectContextSummary } from './studioTooling';
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
import {
  resolveWorkingDirDeps,
  resolveWorkingDirDepsDetailed,
} from '../utils/resolveWorkingDirDeps';
import {
  getArtifactByRequestId,
  getLatestArtifactForTarget,
  getRenderArtifactDebugState,
  getRenderArtifactState,
  type RenderArtifact,
} from '../stores/renderArtifactStore';
type RenderTrigger = Parameters<typeof requestRender>[0];
type McpScreenshotView = Exclude<PresetView, 'current'>;

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

export type DesktopWindowStartupPhase =
  | 'module_loaded'
  | 'window_error'
  | 'unhandled_rejection'
  | 'bootstrap_started'
  | 'platform_initializing'
  | 'platform_ready'
  | 'page_load_started'
  | 'page_load_finished'
  | 'bridge_initializing'
  | 'bridge_ready'
  | 'launch_intent_consumed'
  | 'launch_intent_none'
  | 'open_request_started'
  | 'open_request_succeeded'
  | 'open_request_failed'
  | 'welcome_ready'
  | 'startup_error';

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

type RenderStateClassification =
  | 'missing_render_target'
  | 'missing_artifact'
  | 'render_error'
  | 'diagnostic_error'
  | 'unavailable_preview'
  | 'success';

interface LibraryContext {
  libraryFiles: Record<string, string>;
  libraryPaths: string[];
}

interface McpRenderSnapshotSummary {
  renderTargetPath: string;
  dirtyPaths: string[];
  refreshedPaths: string[];
  dependencyCount: number;
  diskReadCount: number;
}

const DEFAULT_STATUS: McpServerStatus = {
  enabled: true,
  port: 32123,
  status: 'disabled',
  endpoint: null,
  message: null,
};

export const OPENSCAD_STUDIO_SKILL_URL =
  'https://skills.sh/zacharyfmarion/openscad-studio/openscad-studio';

function isDesktopTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const libraryContextCache = {
  key: '',
  value: null as LibraryContext | null,
};
const MCP_SCREENSHOT_VIEWS = new Set<McpScreenshotView>([
  'front',
  'back',
  'top',
  'bottom',
  'left',
  'right',
  'isometric',
]);

const renderWaiters = new Map<
  number,
  {
    requestId: number | null;
    resolve: (artifact: RenderArtifact) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();
let nextRenderWaiterId = 1;
let bridgeUnlistenPromise: Promise<() => void> | null = null;

function textResponse(text: string, isError = false): McpToolResponse {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

function debugLog(message: string, payload?: Record<string, unknown>) {
  const isDev = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? false;
  if (isDev) {
    console.debug(message, payload);
  }
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

function hasErrorDiagnostics(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function getCurrentRenderTargetPath(): string | null {
  return normalizeProjectRelativePath(getProjectState().renderTargetPath ?? '');
}

function getCurrentRenderTargetLabel(): string {
  return getCurrentRenderTargetPath() ?? '(no active render target)';
}

function getCurrentRenderArtifact(): RenderArtifact | null {
  return getLatestArtifactForTarget(getCurrentRenderTargetPath());
}

function classifyCurrentRenderState(): RenderStateClassification {
  const artifact = getCurrentRenderArtifact();

  if (!getCurrentRenderTargetPath()) {
    return 'missing_render_target';
  }

  if (!artifact) {
    return 'missing_artifact';
  }

  if (artifact.error) {
    return 'render_error';
  }

  if (hasErrorDiagnostics(artifact.diagnostics)) {
    return 'diagnostic_error';
  }

  if (!artifact.previewSrc) {
    return 'unavailable_preview';
  }

  return 'success';
}

function buildRenderRecoveryGuidance(options: { includeTriggerRender?: boolean } = {}): string {
  const guidance: string[] = [];

  if (!getProjectState().projectRoot) {
    guidance.push(
      'If no workspace is attached, call `get_or_create_workspace(folder_path)` for the correct repo root first.'
    );
  }

  guidance.push('Call `get_diagnostics` to inspect the current render errors and warnings.');
  guidance.push(
    'Call `get_project_context` to verify which file is currently set as the render target.'
  );
  guidance.push(
    'If the wrong file is selected, call `set_render_target` with the correct workspace-relative path.'
  );

  if (options.includeTriggerRender) {
    guidance.push('After correcting the issue, rerun `trigger_render`.');
  }

  return `Next steps:\n- ${guidance.join('\n- ')}`;
}

function buildContextualRenderFailureMessage(options: {
  title: string;
  includeTriggerRender?: boolean;
}): string {
  const artifact = getCurrentRenderArtifact();
  const detail = formatDiagnostics(artifact?.diagnostics ?? [], artifact?.error ?? '');
  return [
    `❌ ${options.title}`,
    `Render target: ${getCurrentRenderTargetLabel()}`,
    detail,
    buildRenderRecoveryGuidance({ includeTriggerRender: options.includeTriggerRender }),
  ].join('\n\n');
}

function buildPreviewTroubleshootingMessage(
  rawError: string,
  options: { requestedView: string }
): string {
  const currentRenderTargetPath = getCurrentRenderTargetPath();
  const artifact = getCurrentRenderArtifact();
  const sections = [
    rawError,
    `Render target: ${currentRenderTargetPath ?? '(no active render target)'}`,
  ];
  const renderState = classifyCurrentRenderState();

  if (renderState === 'missing_artifact') {
    sections.push('No settled render artifact is available yet for the current render target.');
  }

  if (renderState === 'render_error' || renderState === 'diagnostic_error') {
    sections.push(formatDiagnostics(artifact?.diagnostics ?? [], artifact?.error ?? ''));
  } else if (artifact?.previewKind === 'svg') {
    sections.push(
      `The latest settled render produced a 2D SVG preview, so the explicit ${options.requestedView} view is unavailable.`
    );
  }

  sections.push(buildRenderRecoveryGuidance({ includeTriggerRender: true }));

  return sections.join('\n\n');
}

function buildMissingRenderTargetMessage(toolName: string): string {
  return [
    `❌ ${toolName} requires an active render target, but none is currently selected.`,
    buildRenderRecoveryGuidance({ includeTriggerRender: toolName === 'trigger_render' }),
  ].join('\n\n');
}

function waitForNextRender(timeoutMs = 20000): Promise<RenderArtifact> {
  return new Promise<RenderArtifact>((resolve, reject) => {
    const id = nextRenderWaiterId++;
    const timeoutId = setTimeout(() => {
      renderWaiters.delete(id);
      reject(new Error('Timed out waiting for Studio to finish rendering.'));
    }, timeoutMs);

    renderWaiters.set(id, { requestId: null, resolve, reject, timeoutId });
  });
}

function attachRequestIdToNextRenderWaiter(requestId: number) {
  const firstEntry = [...renderWaiters.entries()].find(([, waiter]) => waiter.requestId === null);
  if (!firstEntry) {
    return;
  }
  const [id, waiter] = firstEntry;
  renderWaiters.set(id, {
    ...waiter,
    requestId,
  });
}

function resolveRenderWaiter(requestId: number) {
  const entry = [...renderWaiters.entries()].find(([, waiter]) => waiter.requestId === requestId);
  if (!entry) {
    return;
  }

  const [id, waiter] = entry;
  const artifact = getArtifactByRequestId(requestId);
  if (!artifact) {
    waiter.reject(new Error(`Render ${requestId} settled without a published render artifact.`));
    clearTimeout(waiter.timeoutId);
    renderWaiters.delete(id);
    return;
  }

  clearTimeout(waiter.timeoutId);
  renderWaiters.delete(id);
  waiter.resolve(artifact);
}

async function runRenderAndWait(trigger: RenderTrigger, code?: string): Promise<RenderArtifact> {
  const pending = waitForNextRender();
  requestRender(trigger, { immediate: true, code });
  return pending;
}

function buildAllProjectFiles(state = getProjectState()): Record<string, string> {
  return Object.fromEntries(
    Object.entries(state.files).map(([path, file]) => [path, file.content])
  );
}

function buildDirtyProjectFiles(state = getProjectState()): Record<string, string> {
  return Object.fromEntries(
    Object.entries(state.files)
      .filter(([, file]) => file.isDirty)
      .map(([path, file]) => [path, file.content])
  );
}

function buildSnapshotUsageNote(summary: McpRenderSnapshotSummary): string | null {
  if (summary.dirtyPaths.length === 0) {
    return null;
  }

  const listedPaths = summary.dirtyPaths.slice(0, 3).join(', ');
  const extraCount = summary.dirtyPaths.length - Math.min(summary.dirtyPaths.length, 3);
  const suffix = extraCount > 0 ? `, plus ${extraCount} more` : '';

  return `Snapshot note: used unsaved Studio edits for ${listedPaths}${suffix}.`;
}

async function refreshFileInStore(relativePath: string, content: string) {
  const store = getProjectStore().getState();
  const file = getProjectState().files[relativePath];

  if (file) {
    if (file.isDirty) {
      return false;
    }
    if (file.content !== content) {
      store.updateFileContent(relativePath, content);
      store.markFileSaved(relativePath, content);
      return true;
    }
    return false;
  }

  store.addFile(relativePath, content, { isVirtual: false });
  store.markFileSaved(relativePath, content);
  return true;
}

function buildSnapshotRefreshFailureMessage(
  toolName: 'trigger_render' | 'get_diagnostics' | 'export_file',
  renderTargetPath: string,
  reason: string,
  extraDetails: string[] = []
): string {
  return [
    `❌ Could not refresh the MCP render snapshot for ${renderTargetPath}.`,
    reason,
    ...extraDetails,
    buildRenderRecoveryGuidance({ includeTriggerRender: toolName === 'trigger_render' }),
  ].join('\n\n');
}

async function refreshMcpRenderSnapshot(
  libraryContext: LibraryContext,
  toolName: 'trigger_render' | 'get_diagnostics' | 'export_file'
): Promise<
  { ok: true; source: string; summary: McpRenderSnapshotSummary } | { ok: false; message: string }
> {
  const state = getProjectState();
  const renderTargetPath = normalizeProjectRelativePath(state.renderTargetPath ?? '');
  const workingDir = getProjectWorkingDirectory(state);

  if (!renderTargetPath) {
    return {
      ok: false,
      message: buildMissingRenderTargetMessage(toolName),
    };
  }

  if (!workingDir) {
    const source = getRenderTargetContent(state);
    if (!source) {
      return {
        ok: false,
        message: buildMissingRenderTargetMessage(toolName),
      };
    }

    return {
      ok: true,
      source,
      summary: {
        renderTargetPath,
        dirtyPaths: [],
        refreshedPaths: [],
        dependencyCount: 0,
        diskReadCount: 0,
      },
    };
  }

  const targetFile = state.files[renderTargetPath];
  if (!targetFile) {
    return {
      ok: false,
      message: buildMissingRenderTargetMessage(toolName),
    };
  }

  const { join } = await import('@tauri-apps/api/path');
  const platform = getPlatform();
  const dirtyProjectFiles = buildDirtyProjectFiles(state);
  const dirtyPaths = Object.keys(dirtyProjectFiles).sort((a, b) => a.localeCompare(b));
  const refreshedPaths: string[] = [];

  let source = targetFile.content;
  if (!targetFile.isDirty) {
    const absolutePath = await join(workingDir, renderTargetPath);
    const diskContent = await platform.readTextFile(absolutePath);
    if (diskContent === null) {
      return {
        ok: false,
        message: buildSnapshotRefreshFailureMessage(
          toolName,
          renderTargetPath,
          `Studio could not read the render target from disk at ${absolutePath}.`
        ),
      };
    }

    source = diskContent;
    if (await refreshFileInStore(renderTargetPath, diskContent)) {
      refreshedPaths.push(renderTargetPath);
    }
  }

  const renderTargetDir = renderTargetPath.includes('/')
    ? renderTargetPath.slice(0, renderTargetPath.lastIndexOf('/'))
    : undefined;
  const resolved = await resolveWorkingDirDepsDetailed(source, {
    workingDir,
    libraryFiles: libraryContext.libraryFiles,
    platform,
    projectFiles: buildAllProjectFiles(state),
    dirtyProjectFiles,
    renderTargetDir,
    preferDiskForProjectFiles: true,
    includeProjectFilesAsFallback: false,
  });

  if (resolved.missingPaths.length > 0) {
    return {
      ok: false,
      message: buildSnapshotRefreshFailureMessage(
        toolName,
        renderTargetPath,
        'Studio could not refresh one or more included files from disk.',
        [`Missing dependencies: ${resolved.missingPaths.join(', ')}`]
      ),
    };
  }

  for (const [path, content] of Object.entries(resolved.files)) {
    if (await refreshFileInStore(path, content)) {
      refreshedPaths.push(path);
    }
  }

  const summary: McpRenderSnapshotSummary = {
    renderTargetPath,
    dirtyPaths,
    refreshedPaths: [...new Set(refreshedPaths)].sort((a, b) => a.localeCompare(b)),
    dependencyCount: Object.keys(resolved.files).length,
    diskReadCount: resolved.stats.diskReads,
  };

  debugLog('[desktopMcp] Refreshed MCP render snapshot', {
    renderTargetPath,
    dependencyCount: summary.dependencyCount,
    diskReadCount: summary.diskReadCount,
    dirtyOverrideCount: summary.dirtyPaths.length,
    refreshedFileCount: summary.refreshedPaths.length,
  });

  return { ok: true, source, summary };
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

  if (state.renderTargetPath !== normalizedPath) {
    getProjectStore().getState().setRenderTarget(normalizedPath);
  }
  getRenderArtifactState().setActiveRenderTarget(normalizedPath, state.projectRoot);
  requestRender('manual', { immediate: true });

  return textResponse(
    state.renderTargetPath === normalizedPath
      ? `✅ Render target remains ${normalizedPath}. A fresh render has been requested.`
      : `✅ Render target changed to ${normalizedPath}. A render has been requested for the new target.`
  );
}

async function handleDiagnostics(): Promise<McpToolResponse> {
  if (!getCurrentRenderTargetPath()) {
    return textResponse(buildMissingRenderTargetMessage('get_diagnostics'), true);
  }

  const libraryContext = await loadLibraryExportContext();
  const refresh = await refreshMcpRenderSnapshot(libraryContext, 'get_diagnostics');
  if (!refresh.ok) {
    return textResponse(refresh.message, true);
  }

  const artifact = await runRenderAndWait('manual', refresh.source);
  const snapshotNote = buildSnapshotUsageNote(refresh.summary);
  return textResponse(
    [
      `Diagnostics for render target: ${getCurrentRenderTargetLabel()}`,
      snapshotNote,
      formatDiagnostics(artifact.diagnostics, artifact.error),
    ]
      .filter(Boolean)
      .join('\n\n')
  );
}

async function handleTriggerRender(): Promise<McpToolResponse> {
  if (!getCurrentRenderTargetPath()) {
    return textResponse(buildMissingRenderTargetMessage('trigger_render'), true);
  }

  const libraryContext = await loadLibraryExportContext();
  const refresh = await refreshMcpRenderSnapshot(libraryContext, 'trigger_render');
  if (!refresh.ok) {
    return textResponse(refresh.message, true);
  }

  const artifact = await runRenderAndWait('manual', refresh.source);
  const targetLabel = getCurrentRenderTargetLabel();
  const diagnosticsText = formatDiagnostics(artifact.diagnostics, artifact.error);
  const hasFailure = Boolean(artifact.error) || hasErrorDiagnostics(artifact.diagnostics);
  const snapshotNote = buildSnapshotUsageNote(refresh.summary);

  if (hasFailure) {
    return textResponse(
      [
        `❌ Render failed for ${targetLabel}.`,
        diagnosticsText,
        snapshotNote,
        buildRenderRecoveryGuidance({ includeTriggerRender: true }),
      ]
        .filter(Boolean)
        .join('\n\n'),
      true
    );
  }

  return textResponse(
    [`✅ Render completed for ${targetLabel}.`, diagnosticsText, snapshotNote]
      .filter(Boolean)
      .join('\n\n')
  );
}

async function handlePreviewScreenshot(
  argumentsValue: Record<string, unknown>
): Promise<McpToolResponse> {
  const viewValue = typeof argumentsValue.view === 'string' ? argumentsValue.view : null;
  if (!viewValue) {
    return textResponse(
      '`get_preview_screenshot` requires an explicit `view` argument: front, back, top, bottom, left, right, or isometric.',
      true
    );
  }
  if (!MCP_SCREENSHOT_VIEWS.has(viewValue as McpScreenshotView)) {
    return textResponse(
      `Unsupported screenshot view: ${viewValue}. Use one of: front, back, top, bottom, left, right, or isometric.`,
      true
    );
  }
  const requestedView = viewValue as McpScreenshotView;

  const artifact = getCurrentRenderArtifact();
  if (!artifact) {
    return textResponse(
      buildPreviewTroubleshootingMessage(
        'No settled render artifact is available for the current render target.',
        { requestedView }
      ),
      true
    );
  }

  if (artifact.previewKind !== 'mesh' || !artifact.previewSrc) {
    return textResponse(
      buildPreviewTroubleshootingMessage(
        'A 3D preview is required for MCP screenshots with explicit views.',
        { requestedView }
      ),
      true
    );
  }

  debugLog('[desktopMcp] Capturing screenshot from render artifact', {
    requestedView,
    artifact: {
      artifactId: artifact.artifactId,
      renderTargetPath: artifact.renderTargetPath,
      requestId: artifact.requestId,
      previewKind: artifact.previewKind,
      createdAt: artifact.createdAt,
    },
    store: getRenderArtifactDebugState(),
  });

  let dataUrl = '';
  try {
    dataUrl = await captureOffscreen(artifact.previewSrc, {
      view: requestedView,
      azimuth:
        typeof argumentsValue.azimuth === 'number' ? (argumentsValue.azimuth as number) : undefined,
      elevation:
        typeof argumentsValue.elevation === 'number'
          ? (argumentsValue.elevation as number)
          : undefined,
      sceneStyle: artifact.sceneStyle,
      useModelColors: artifact.useModelColors,
    });
  } catch (error) {
    return textResponse(
      buildPreviewTroubleshootingMessage(
        `Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`,
        { requestedView }
      ),
      true
    );
  }

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

async function loadLibraryExportContext(): Promise<LibraryContext> {
  const platform = getPlatform();
  const settings = loadSettings();
  const systemPaths = settings.library.autoDiscoverSystem ? await platform.getLibraryPaths() : [];
  const libraryPaths = [...systemPaths, ...settings.library.customPaths];
  const cacheKey = JSON.stringify({
    autoDiscoverSystem: settings.library.autoDiscoverSystem,
    customPaths: [...settings.library.customPaths].sort((a, b) => a.localeCompare(b)),
    systemPaths: [...systemPaths].sort((a, b) => a.localeCompare(b)),
  });

  if (libraryContextCache.value && libraryContextCache.key === cacheKey) {
    return libraryContextCache.value;
  }

  const libraryFiles: Record<string, string> = {};

  for (const libPath of libraryPaths) {
    try {
      const files = await platform.readDirectoryFiles(libPath);
      Object.assign(libraryFiles, files);
    } catch (error) {
      console.warn(`[desktopMcp] Failed to read library path ${libPath}:`, error);
    }
  }

  const context = { libraryFiles, libraryPaths };
  libraryContextCache.key = cacheKey;
  libraryContextCache.value = context;
  return context;
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

  const libraryContext = await loadLibraryExportContext();
  const refresh = await refreshMcpRenderSnapshot(libraryContext, 'export_file');
  if (!refresh.ok) {
    return textResponse(refresh.message, true);
  }

  const state = getProjectState();
  const source = getRenderTargetContent(state);
  if (!source) {
    return textResponse(
      ['❌ No active render target is available to export.', buildRenderRecoveryGuidance()].join(
        '\n\n'
      ),
      true
    );
  }

  const renderState = classifyCurrentRenderState();
  const snapshotChanged =
    refresh.summary.refreshedPaths.length > 0 || refresh.summary.dirtyPaths.length > 0;
  if (!snapshotChanged && (renderState === 'render_error' || renderState === 'diagnostic_error')) {
    return textResponse(
      buildContextualRenderFailureMessage({
        title: `Cannot export ${format?.toUpperCase() ?? 'the current render target'} because the latest render failed.`,
      }),
      true
    );
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
  const renderTargetPath = getCurrentRenderTargetPath() ?? undefined;
  const renderTargetDir =
    renderTargetPath && renderTargetPath.includes('/')
      ? renderTargetPath.slice(0, renderTargetPath.lastIndexOf('/'))
      : undefined;

  const { libraryFiles, libraryPaths } = libraryContext;
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

  const snapshotNote = buildSnapshotUsageNote(refresh.summary);
  return textResponse(
    [`✅ Exported ${format.toUpperCase()} to ${resolvedPath}`, snapshotNote]
      .filter(Boolean)
      .join('\n\n')
  );
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
      let unlistenOpenRequest: (() => void) | null = null;
      let unlistenFocus: (() => void) | null = null;

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

      unlistenOpenRequest = await currentWindow.listen<DesktopWindowOpenRequestPayload>(
        'desktop:open-request',
        async (event) => {
          await options.onOpenRequest?.(event.payload);
        }
      );

      unlistenFocus = await currentWindow.onFocusChanged(() => {
        void syncDesktopMcpWindowContext({
          title: document.title || 'OpenSCAD Studio',
          workspaceRoot: getProjectState().projectRoot,
          renderTargetPath: getProjectState().renderTargetPath,
          showWelcome: getWorkspaceState().showWelcome,
          mode: getWorkspaceState().showWelcome ? 'welcome' : 'ready',
        });
      });

      await invoke('mcp_mark_window_bridge_ready');

      void syncDesktopMcpWindowContext({
        title: document.title || 'OpenSCAD Studio',
        workspaceRoot: getProjectState().projectRoot,
        renderTargetPath: getProjectState().renderTargetPath,
        showWelcome: getWorkspaceState().showWelcome,
        mode: getWorkspaceState().showWelcome ? 'welcome' : 'ready',
      }).catch((error) => {
        console.error('[desktopMcp] Initial syncDesktopMcpWindowContext failed:', error);
      });

      return () => {
        unlistenToolRequest();
        unlistenOpenRequest?.();
        unlistenFocus?.();
      };
    })();
  }

  const unlisten = await bridgeUnlistenPromise;
  return () => {
    unlisten();
    bridgeUnlistenPromise = null;
  };
}

export function notifyDesktopMcpRenderStarted(payload: {
  renderTargetPath: string;
  requestId: number;
}) {
  getRenderArtifactState().markRenderStarted(payload.renderTargetPath, payload.requestId);
  attachRequestIdToNextRenderWaiter(payload.requestId);
}

export function notifyDesktopMcpRenderSettled(requestId: number | null) {
  if (requestId === null) {
    return;
  }
  resolveRenderWaiter(requestId);
}

export async function __executeDesktopMcpToolRequestForTests(
  payload: McpToolRequestPayload
): Promise<McpToolResponse> {
  return executeToolRequest(payload);
}

export function __resetDesktopMcpStateForTests() {
  getRenderArtifactState().reset();
  for (const [id, waiter] of renderWaiters.entries()) {
    clearTimeout(waiter.timeoutId);
    waiter.reject(new Error('Desktop MCP test state reset before render settled.'));
    renderWaiters.delete(id);
  }
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

export async function reportDesktopWindowStartupPhase(payload: {
  phase: DesktopWindowStartupPhase;
  detail?: string | null;
}): Promise<void> {
  if (!isDesktopTauri()) return;
  await invoke('mcp_report_window_startup_phase', {
    payload: {
      phase: payload.phase,
      detail: payload.detail ?? null,
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

export function buildSkillInstallCommand(): string {
  return 'npx skills add https://github.com/zacharyfmarion/openscad-studio --skill openscad-studio';
}

export function buildAgentSnippet(port: number): string {
  return `Use the OpenSCAD Studio MCP server at http://127.0.0.1:${port}/mcp for render-target switching, diagnostics, render refresh, preview screenshots, and exports. Read and edit files directly in the repo, then call get_or_create_workspace with the repo root before using Studio tools.`;
}
