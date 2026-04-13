import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { ExportDialog } from './components/ExportDialog';
import { ShareDialog } from './components/ShareDialog';
import { ShareBanner } from './components/ShareBanner';
import type { AiPromptPanelRef } from './components/AiPromptPanel';
import { SettingsDialog, type SettingsSection } from './components/SettingsDialog';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NuxLayoutPicker } from './components/NuxLayoutPicker';
import {
  HeaderWorkspaceControls,
  type HeaderLayoutPreset,
} from './components/HeaderWorkspaceControls';
import { WebMenuBar } from './components/WebMenuBar';
import { FileTreePanel } from './components/FileTree';
import { isValidDrop } from './utils/isValidDrop';
import {
  Button,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './components/ui';
import { panelComponents, tabComponents, WorkspaceTab } from './components/panels/PanelComponents';
import { useTheme } from './contexts/ThemeContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import type { WorkspaceState } from './contexts/WorkspaceContext';
import { useAnalytics, type LayoutSelectionSource } from './analytics/runtime';
import {
  setDockviewApi,
  getDockviewApi,
  addPresetPanels,
  applyWorkspacePreset,
  saveLayout,
  clearSavedLayout,
  MOBILE_LAYOUT_MEDIA_QUERY,
  openPanel,
} from './stores/layoutStore';
import { useRenderOrchestrator } from './hooks/useRenderOrchestrator';
import { useAiAgent } from './hooks/useAiAgent';
import { useHistory } from './hooks/useHistory';
import { useMobileLayout } from './hooks/useMobileLayout';
import { getPlatform, eventBus, type ExportFormat } from './platform';
import { isExportValidationError } from './services/exportErrors';
import {
  notifyDesktopMcpRenderStarted,
  notifyDesktopMcpRenderSettled,
  syncDesktopMcpConfig,
  syncDesktopMcpWindowContext,
} from './services/desktopMcp';
import { getRenderService } from './services/renderService';
import { getPreviewSceneStyle } from './services/previewSceneConfig';
import { isShareEnabled } from './services/shareService';
import { openFileInWindow, openWorkspaceFolderInWindow } from './services/windowOpenService';
import { useSettings, loadSettings, updateSetting } from './stores/settingsStore';
import { getApiKey, getProviderFromModel } from './stores/apiKeyStore';
import {
  selectActiveRender,
  selectActiveTab,
  selectActiveTabId,
  selectShowWelcome,
  selectTabs,
} from './stores/workspaceSelectors';
import { useWorkspaceStore, getWorkspaceState } from './stores/workspaceStore';
import { getProjectStore, useProjectStore, getRenderTargetContent } from './stores/projectStore';
import { requestRender } from './stores/renderRequestStore';
import {
  createSourceHash,
  getRenderArtifactState,
  useRenderArtifactStore,
} from './stores/renderArtifactStore';
import { DEFAULT_TAB_NAME } from './stores/workspaceFactories';
import { formatOpenScadCode } from './utils/formatter';
import { addRecentFile, removeRecentFile } from './utils/recentFiles';
import { captureCurrentPreview, MAIN_PREVIEW_VIEWER_ID } from './utils/capturePreview';
import { normalizeAppError, notifyError, notifySuccess } from './utils/notifications';
import { exportProjectZip } from './utils/projectZip';
import { getRelativeProjectPath } from './utils/projectFilePaths';
import { generateRandomProjectName } from './utils/projectNaming';
import { resolveFolderImport } from './utils/folderImport';
import { useShareEntry } from './hooks/useShareEntry';
import { TbBrandGithub, TbSettings, TbDownload, TbShare3 } from 'react-icons/tb';
import { Toaster } from 'sonner';
import type { AiDraft } from './types/aiChat';
import type { WorkspaceTab as WorkspaceDocumentTab } from './stores/workspaceTypes';
import {
  OPENSCAD_PROJECT_FILE_EXTENSIONS,
  isOpenScadProjectFilePath,
} from '../../../packages/shared/src/openscadProjectFiles';

const RELEASE_BASE = 'https://github.com/zacharyfmarion/openscad-studio/releases/latest/download';
const REPOSITORY_URL = 'https://github.com/zacharyfmarion/openscad-studio';
const HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY = '(max-width: 900px)';

const RELEASE_ASSETS: Record<MacArch, string> = {
  aarch64: 'OpenSCAD.Studio_latest_aarch64.dmg',
  x64: 'OpenSCAD.Studio_latest_x64.dmg',
};

type MacArch = 'aarch64' | 'x64';

const OPENSCAD_FILE_FILTERS = [
  { name: 'OpenSCAD Files', extensions: [...OPENSCAD_PROJECT_FILE_EXTENSIONS] },
];
/** Prompt the user to pick a folder and return its project files, or null if cancelled. */
function pickFolder(): Promise<{ files: Record<string, string>; renderTargetPath: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.onchange = async () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        resolve(null);
        return;
      }

      const files: Record<string, string> = {};
      let workspaceName: string | null = null;
      for (const file of Array.from(fileList)) {
        // webkitRelativePath gives "folderName/path/to/file.scad"
        const relativePath = file.webkitRelativePath;
        if (!isOpenScadProjectFilePath(relativePath)) continue;
        // Strip the top-level folder name
        const parts = relativePath.split('/');
        workspaceName ??= parts[0] || null;
        const pathWithoutRoot = parts.slice(1).join('/');
        if (pathWithoutRoot) {
          files[pathWithoutRoot] = await file.text();
        }
      }

      resolve(
        resolveFolderImport(files, {
          workspaceName,
          createIfEmpty: true,
        })
      );
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function isIgnorableError(reason: unknown): boolean {
  // Raw DOM Events (e.g. from img.onerror = reject) carry no meaningful error
  // message and should not be forwarded to Sentry.
  if (typeof Event !== 'undefined' && reason instanceof Event) {
    return true;
  }

  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : typeof reason === 'object' &&
            reason !== null &&
            'message' in reason &&
            typeof (reason as { message?: unknown }).message === 'string'
          ? (reason as { message: string }).message
          : '';

  const normalized = message.trim().toLowerCase();
  return (
    normalized === 'canceled' ||
    normalized === 'cancelled' ||
    normalized === 'render cancelled' ||
    normalized === 'render canceled' ||
    normalized.includes('aborterror') ||
    normalized.includes('aborted') ||
    // drei/three.js asset loader errors (e.g. HDR environment map fetch failures)
    // are handled locally by EnvironmentWithFallback and should not surface as toasts.
    normalized.startsWith('could not load ')
  );
}

function revokeBlobUrl(url: string | null | undefined) {
  if (!url || !url.startsWith('blob:')) {
    return;
  }

  URL.revokeObjectURL(url);
}

function useMacDownloadUrl() {
  const [arch, setArch] = useState<MacArch>('aarch64');

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('intel') || platform.includes('x86_64')) {
      setArch('x64');
    }

    const uaData = (
      navigator as unknown as {
        userAgentData?: {
          getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
        };
      }
    ).userAgentData;

    if (uaData?.getHighEntropyValues) {
      void uaData.getHighEntropyValues(['architecture']).then((values) => {
        if (values.architecture === 'x86') {
          setArch('x64');
        }
      });
    }
  }, []);

  return `${RELEASE_BASE}/${RELEASE_ASSETS[arch]}`;
}

interface HeaderIconLinkProps {
  href: string;
  title: string;
  ariaLabel: string;
  children: ReactNode;
  openInNewTab?: boolean;
}

function HeaderIconLink({
  href,
  title,
  ariaLabel,
  children,
  openInNewTab = false,
}: HeaderIconLinkProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          aria-label={ariaLabel}
          title={title}
          target={openInNewTab ? '_blank' : undefined}
          rel={openInNewTab ? 'noreferrer' : undefined}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
        >
          {children}
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Returns a path that does not conflict with any path in `existing`.
 * Appends _1, _2, … to the filename stem until a free slot is found.
 */
function resolvePathConflict(candidatePath: string, existing: Set<string>): string {
  if (!existing.has(candidatePath)) return candidatePath;
  const lastSlash = candidatePath.lastIndexOf('/');
  const lastDot = candidatePath.lastIndexOf('.');
  const hasExt = lastDot > lastSlash + 1;
  const stem = hasExt ? candidatePath.slice(0, lastDot) : candidatePath;
  const ext = hasExt ? candidatePath.slice(lastDot) : '';
  let i = 1;
  while (existing.has(`${stem}_${i}${ext}`)) i++;
  return `${stem}_${i}${ext}`;
}

function App() {
  const { isMobile } = useMobileLayout();
  const [isHeaderWorkspaceSwitcherHidden, setIsHeaderWorkspaceSwitcherHidden] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY).matches
  );
  const [showNux, setShowNux] = useState(() => !loadSettings().ui.hasCompletedNux);
  const tabs = useWorkspaceStore(selectTabs);
  const activeTabId = useWorkspaceStore(selectActiveTabId) ?? '';
  const showWelcome = useWorkspaceStore(selectShowWelcome);
  const activeTab = useWorkspaceStore(selectActiveTab) ?? tabs[0];
  const activeRender = useWorkspaceStore(selectActiveRender) ?? activeTab?.render;
  // The render target tab holds the preview — use its render state regardless of
  // which tab is currently active in the editor.
  const renderTargetPath = useProjectStore((s) => s.renderTargetPath);
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const renderTargetTab = tabs.find((t) => t.projectPath === renderTargetPath);
  const renderTargetRender = renderTargetTab?.render ?? activeRender;
  const activeRenderArtifact = useRenderArtifactStore((state) =>
    renderTargetPath ? (state.artifactsByTarget[renderTargetPath] ?? null) : null
  );
  const createTab = useWorkspaceStore((state) => state.createTab);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const markTabSaved = useWorkspaceStore((state) => state.markTabSaved);
  const renameTab = useWorkspaceStore((state) => state.renameTab);
  const closeTabLocal = useWorkspaceStore((state) => state.closeTabLocal);
  const openSharedDocument = useWorkspaceStore((state) => state.openSharedDocument);
  const reorderWorkspaceTabs = useWorkspaceStore((state) => state.reorderTabs);
  const beginTabRender = useWorkspaceStore((state) => state.beginTabRender);
  const commitTabRenderResult = useWorkspaceStore((state) => state.commitTabRenderResult);
  const commitTabRenderError = useWorkspaceStore((state) => state.commitTabRenderError);
  const showWelcomeScreen = useWorkspaceStore((state) => state.showWelcomeScreen);
  const hideWelcomeScreen = useWorkspaceStore((state) => state.hideWelcomeScreen);

  if (!activeTab) {
    throw new Error('Workspace store must always provide an active tab');
  }

  const activeTabRef = useRef<WorkspaceDocumentTab>(activeTab);
  const tabsRef = useRef<WorkspaceDocumentTab[]>(tabs);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsSection | undefined>(
    undefined
  );
  const [settings] = useSettings();
  const { theme } = useTheme();
  const previewSceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const { capabilities } = getPlatform();
  const macDownloadUrl = useMacDownloadUrl();
  const { undo, redo } = useHistory();
  const [resolvedProjectDir, setResolvedProjectDir] = useState<string | null>(null);
  /** Pre-generated project name shown on welcome screen (not yet created on disk) */
  const [pendingProjectName, setPendingProjectName] = useState<string>(() =>
    generateRandomProjectName()
  );
  const initialShareContext = useMemo(
    () => (typeof window === 'undefined' ? null : (window.__SHARE_CONTEXT ?? null)),
    []
  );

  // Resolve the effective default project directory from settings or platform default
  useEffect(() => {
    if (!capabilities.hasFileSystem) return;
    const configured = settings.project.defaultProjectDirectory;
    if (configured) {
      setResolvedProjectDir(configured);
    } else {
      void getPlatform()
        .getDefaultProjectsDirectory()
        .then((dir) => {
          if (dir) setResolvedProjectDir(dir);
        });
    }
  }, [capabilities.hasFileSystem, settings.project.defaultProjectDirectory]);

  useEffect(() => {
    if (!capabilities.hasFileSystem) return;

    let disposed = false;
    void syncDesktopMcpConfig({
      enabled: settings.mcp.enabled,
      port: settings.mcp.port,
    }).catch((error) => {
      if (!disposed) {
        console.error('[App] Failed to sync MCP config:', error);
      }
    });

    return () => {
      disposed = true;
    };
  }, [capabilities.hasFileSystem, settings.mcp.enabled, settings.mcp.port]);

  useEffect(() => {
    const mq = window.matchMedia(HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsHeaderWorkspaceSwitcherHidden(event.matches);
    };

    setIsHeaderWorkspaceSwitcherHidden(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const renderTargetContent = useProjectStore((s) =>
    s.renderTargetPath ? (s.files[s.renderTargetPath]?.content ?? '') : ''
  );
  const contentVersion = useProjectStore((s) => s.contentVersion);
  const hasMultipleFiles = useProjectStore((s) => Object.keys(s.files).length > 1);

  const {
    previewKind,
    diagnostics,
    isRendering,
    error,
    ready,
    manualRender,
    renderCode: renderCodeDirect,
  } = useRenderOrchestrator({
    source: renderTargetContent,
    contentVersion,
    suppressInitialRender: Boolean(initialShareContext) || showWelcome,
    workingDir: projectRoot,
    autoRenderOnIdle: settings.editor.autoRenderOnIdle,
    autoRenderDelayMs: settings.editor.autoRenderDelayMs,
    library: settings.library,
    createRenderOwner: () => {
      // Always render into the render target tab, not the active editor tab
      const rtPath = getProjectStore().getState().renderTargetPath;
      const rtTab = rtPath ? getWorkspaceState().tabs.find((t) => t.projectPath === rtPath) : null;
      const tabId = rtTab?.id ?? activeTabRef.current?.id;
      if (!tabId) {
        return null;
      }

      const tab = rtTab ?? activeTabRef.current;
      const requestId = beginTabRender(tabId, {
        preferredDimension: tab?.render.dimensionMode,
      });
      const targetPath = rtPath ?? tab?.projectPath ?? activeTabRef.current.projectPath;
      const currentProjectRoot = getProjectStore().getState().projectRoot;

      getRenderArtifactState().setActiveRenderTarget(targetPath, currentProjectRoot);
      notifyDesktopMcpRenderStarted({
        renderTargetPath: targetPath,
        requestId,
      });

      return {
        tabId,
        requestId,
      };
    },
    onRenderSettled: ({ owner, code, snapshot }) => {
      const settledRenderTargetPath =
        getProjectStore().getState().renderTargetPath ??
        (owner
          ? (getWorkspaceState().tabs.find((tab) => tab.id === owner.tabId)?.projectPath ?? null)
          : null);
      if (owner && settledRenderTargetPath) {
        getRenderArtifactState().publishSettledArtifact({
          requestId: owner.requestId,
          renderTargetPath: settledRenderTargetPath,
          workspaceRoot: getProjectStore().getState().projectRoot,
          sourceHash: createSourceHash(code),
          previewKind: snapshot.previewKind,
          previewSrc: snapshot.previewSrc,
          diagnostics: snapshot.diagnostics,
          error: snapshot.error,
          dimensionMode: snapshot.dimensionMode,
          sceneStyle: previewSceneStyle,
          useModelColors: settings.viewer.showModelColors,
          createdAt: Date.now(),
        });
      }
      notifyDesktopMcpRenderSettled(owner?.requestId ?? null);

      if (!owner) {
        return;
      }

      const currentTab = getWorkspaceState().tabs.find((tab) => tab.id === owner.tabId);
      const previousPreviewSrc = currentTab?.render.previewSrc ?? '';

      if (snapshot.error) {
        commitTabRenderError(owner.tabId, {
          requestId: owner.requestId,
          error: snapshot.error,
          diagnostics: snapshot.diagnostics,
          lastRenderedContent: code,
        });
        return;
      }

      if (previousPreviewSrc && previousPreviewSrc !== snapshot.previewSrc) {
        revokeBlobUrl(previousPreviewSrc);
      }

      commitTabRenderResult(owner.tabId, {
        requestId: owner.requestId,
        previewSrc: snapshot.previewSrc,
        previewKind: snapshot.previewKind,
        diagnostics: snapshot.diagnostics,
        dimensionMode: snapshot.dimensionMode,
        lastRenderedContent: code,
      });
    },
  });
  const activePreviewSrc = activeRenderArtifact?.previewSrc ?? renderTargetRender?.previewSrc ?? '';
  const activePreviewKind =
    activeRenderArtifact?.previewKind ?? renderTargetRender?.previewKind ?? previewKind;
  const activeDiagnostics =
    activeRenderArtifact?.diagnostics ?? renderTargetRender?.diagnostics ?? diagnostics;
  const activeError = activeRenderArtifact?.error ?? renderTargetRender?.error ?? error;

  const handleOpenFallbackEditor = useCallback(() => {
    setShowNux(false);
    hideWelcomeScreen();
    window.history.replaceState({}, document.title, '/');

    if (!renderTargetRender?.lastRenderedContent && ready) {
      requestRender('initial', { immediate: true });
    }
  }, [renderTargetRender?.lastRenderedContent, hideWelcomeScreen, ready]);

  useEffect(() => {
    getRenderArtifactState().setActiveRenderTarget(renderTargetPath ?? null, projectRoot);
  }, [projectRoot, renderTargetPath]);

  const initializeProject = useCallback(
    async (filePath: string | null, fileName: string, content: string) => {
      if (!filePath) {
        const name = fileName || DEFAULT_TAB_NAME;
        getProjectStore()
          .getState()
          .openProject(null, { [name]: content }, name);
        return;
      }

      await openFileInWindow(
        {
          path: filePath,
          name: fileName || DEFAULT_TAB_NAME,
          content,
        },
        {
          trackRecent: true,
        }
      );
    },
    []
  );

  const handleOpenSharedDocument = useCallback(
    (share: {
      title: string;
      code: string;
      files?: Record<string, string>;
      renderTarget?: string;
    }) => {
      setShowNux(false);
      if (share.files && share.renderTarget) {
        const store = getProjectStore();
        store.getState().openProject(null, share.files, share.renderTarget);
        return openSharedDocument({
          name: share.title,
          projectPath: share.renderTarget,
        });
      }
      void initializeProject(null, share.title, share.code);
      return openSharedDocument({
        name: share.title,
        projectPath: share.title,
      });
    },
    [initializeProject, openSharedDocument]
  );

  const handleRenderSharedDocument = useCallback(
    ({ code }: { tabId: string; code: string }) => {
      // projectStore is already populated by handleOpenSharedDocument — just render.
      // Returns RenderSnapshot for the share entry loading flow.
      return renderCodeDirect(code, 'file_open');
    },
    [renderCodeDirect]
  );

  const {
    context: shareContext,
    origin: shareOrigin,
    error: shareLoadError,
    phase: sharePhase,
    shouldBlockUi: shouldBlockShareUi,
    shouldShowError: shouldShowShareError,
    isActive: isShareEntry,
    retry: retryShareLoad,
    skip: skipShareEntry,
    dismissBanner: dismissShareBanner,
    markVisualReady: markSharePreviewReady,
    isBannerDismissed: isShareBannerDismissed,
  } = useShareEntry({
    renderReady: ready,
    openSharedDocument: handleOpenSharedDocument,
    renderSharedDocument: handleRenderSharedDocument,
    openFallbackEditor: handleOpenFallbackEditor,
  });

  const handleUndo = useCallback(async () => {
    const checkpoint = await undo();
    if (checkpoint) {
      const store = getProjectStore().getState();
      const projectPath = activeTab.projectPath;
      store.updateFileContent(projectPath, checkpoint.code);
      store.setCustomizerBase(projectPath, checkpoint.code);
      requestRender('history_restore', { immediate: true, code: checkpoint.code });
    }
  }, [activeTab.projectPath, undo]);

  const handleRedo = useCallback(async () => {
    const checkpoint = await redo();
    if (checkpoint) {
      const store = getProjectStore().getState();
      const projectPath = activeTab.projectPath;
      store.updateFileContent(projectPath, checkpoint.code);
      store.setCustomizerBase(projectPath, checkpoint.code);
      requestRender('history_restore', { immediate: true, code: checkpoint.code });
    }
  }, [activeTab.projectPath, redo]);

  const aiPromptPanelRef = useRef<AiPromptPanelRef>(null);
  const analytics = useAnalytics();

  // AI Agent state
  const {
    isStreaming,
    streamingResponse,
    proposedDiff,
    error: aiError,
    errorObject: aiErrorObject,
    isApplyingDiff,
    messages,
    draft,
    attachments,
    draftErrors,
    draftVisionBlockMessage,
    draftVisionWarningMessage,
    canSubmitDraft,
    isProcessingAttachments,
    currentToolCalls,
    currentModel,
    currentModelVisionSupport,
    availableProviders,
    submitDraft,
    setDraft,
    setDraftText,
    addDraftFiles,
    removeDraftAttachment,
    cancelStream,
    acceptDiff,
    rejectDiff,
    clearError: clearAiError,
    newConversation,
    setCurrentModel,
    handleRestoreCheckpoint,
    updateCapturePreview,
    update3dPreviewUrl,
    updatePreviewSceneStyle,
    updateUseModelColors,
    loadModelAndProviders,
  } = useAiAgent();

  // Tab management functions
  const createNewTab = useCallback(
    (filePath?: string | null, content?: string, name?: string): string => {
      const projectPath = name ?? DEFAULT_TAB_NAME;
      const defaultContent = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';

      // Ensure the file exists in projectStore
      const store = getProjectStore().getState();
      if (!store.files[projectPath]) {
        store.addFile(projectPath, content ?? defaultContent);
      }

      const newId = createTab({
        filePath: filePath || null,
        name,
        projectPath,
      });
      return newId;
    },
    [createTab]
  );

  const switchingRef = useRef(false);
  const [editorFocusRequestKey, setEditorFocusRequestKey] = useState(0);

  const focusEditorPanel = useCallback(() => {
    openPanel('editor', 'editor', 'Editor');
    setEditorFocusRequestKey((current) => current + 1);
  }, []);

  const switchTab = useCallback(
    async (id: string) => {
      if (id === activeTabId || switchingRef.current) return;
      switchingRef.current = true;

      setActiveTab(id);
      // Editor handles model switching via multi-model; no need to updateSource.
      // source only tracks the render target content for the render pipeline.

      switchingRef.current = false;
    },
    [activeTabId, setActiveTab]
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;

      const isDirty = getProjectStore().getState().files[tab.projectPath]?.isDirty ?? false;
      if (isDirty && capabilities.hasFileSystem) {
        const platform = getPlatform();
        const wantsToSave = await platform.ask(`Save changes to ${tab.name}?`, {
          title: 'Unsaved Changes',
          kind: 'warning',
          okLabel: 'Save',
          cancelLabel: "Don't Save",
        });

        if (wantsToSave) {
          return;
        } else {
          const confirmDiscard = await platform.confirm(
            'Are you sure you want to discard your changes?',
            {
              title: 'Discard Changes',
              kind: 'warning',
              okLabel: 'Discard',
              cancelLabel: 'Cancel',
            }
          );
          if (!confirmDiscard) return;
        }

        // Revert file content to saved state so the file tree dirty indicator clears
        getProjectStore().getState().revertFile(tab.projectPath);
      }

      revokeBlobUrl(tab.render.previewSrc);
      closeTabLocal(id);
      analytics.track('tab closed', { had_unsaved_changes: isDirty });

      // If closing this tab caused workspace to reset to welcome, also reset project
      const wsState = getWorkspaceState();
      if (wsState.showWelcome && wsState.tabs.length === 1 && !wsState.tabs[0].filePath) {
        getProjectStore().getState().resetToUntitledProject();
      }
    },
    [analytics, closeTabLocal, tabs, capabilities.hasFileSystem]
  );

  const reorderTabs = useCallback(
    (newTabs: WorkspaceDocumentTab[]) => {
      reorderWorkspaceTabs(newTabs.map((tab) => tab.id));
    },
    [reorderWorkspaceTabs]
  );

  // File tree handlers
  const handleFileTreeClick = useCallback(
    (filePath: string) => {
      focusEditorPanel();

      // Find existing tab for this file (by projectPath)
      const existingTab = tabs.find((t) => t.projectPath === filePath);
      if (existingTab) {
        switchTab(existingTab.id);
        return;
      }

      // Open the file in a new tab — content lives in projectStore
      const store = getProjectStore().getState();
      const projectFile = store.files[filePath];
      if (projectFile) {
        // Resolve absolute disk path so Cmd+S can save without a dialog
        const absolutePath = store.projectRoot ? `${store.projectRoot}/${filePath}` : null;
        createNewTab(absolutePath, undefined, filePath);
      }
    },
    [tabs, switchTab, createNewTab, focusEditorPanel]
  );

  // Editor onChange: single write to projectStore. The render pipeline reacts
  // automatically via the source prop (render target content) and contentVersion.
  const handleEditorChange = useCallback((content: string) => {
    const projectPath = activeTabRef.current.projectPath;
    getProjectStore().getState().updateFileContent(projectPath, content);
  }, []);

  const handleToggleFileTree = useCallback(() => {
    updateSetting('ui', { fileTreeVisible: !settings.ui.fileTreeVisible });
  }, [settings.ui.fileTreeVisible]);

  const handleCreateFile = useCallback(
    async (parentDir: string): Promise<string> => {
      let baseName = 'new_file.scad';
      const store = getProjectStore().getState();
      const prefix = parentDir ? `${parentDir}/` : '';

      // Find a unique name
      let counter = 1;
      let path = `${prefix}${baseName}`;
      while (path in store.files) {
        baseName = `new_file_${counter}.scad`;
        path = `${prefix}${baseName}`;
        counter++;
      }

      const content = '';
      store.addFile(path, content, { isVirtual: store.projectRoot === null });

      // Write to disk on desktop
      if (store.projectRoot) {
        const platform = getPlatform();
        const absolutePath = `${store.projectRoot}/${path}`;
        await platform.writeTextFile(absolutePath, content);
        // Mark as saved since we just wrote it
        store.markFileSaved(path, content);
      }

      // Open in a new tab
      const absolutePath = store.projectRoot ? `${store.projectRoot}/${path}` : null;
      createNewTab(absolutePath, content, path);
      analytics.track('file created', { in_subfolder: parentDir !== '' });

      return path;
    },
    [analytics, createNewTab]
  );

  const handleCreateFolder = useCallback(
    async (parentDir: string, folderName: string): Promise<void> => {
      const store = getProjectStore().getState();
      const folderPath = parentDir ? `${parentDir}/${folderName}` : folderName;
      if (store.projectRoot) {
        await getPlatform().createDirectory(`${store.projectRoot}/${folderPath}`);
      }
      store.addFolder(folderPath);
      analytics.track('folder created', { in_subfolder: parentDir !== '' });
    },
    [analytics]
  );

  const handleRenameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const store = getProjectStore().getState();
      const parentDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
      const newPath = parentDir ? `${parentDir}/${newName}` : newName;

      if (newPath === oldPath) return;
      if (newPath in store.files) return; // Name already taken

      store.renameFile(oldPath, newPath);

      // Rename on disk
      if (store.projectRoot) {
        const platform = getPlatform();
        await platform.renameFile(
          `${store.projectRoot}/${oldPath}`,
          `${store.projectRoot}/${newPath}`
        );
      }

      // Update any open tab that references this file
      const tab = tabs.find((t) => t.projectPath === oldPath);
      if (tab) {
        const absolutePath = store.projectRoot ? `${store.projectRoot}/${newPath}` : null;
        markTabSaved(tab.id, { filePath: absolutePath, name: newName });
        renameTab(tab.id, newName, newPath);
      }
      analytics.track('file renamed');
    },
    [analytics, tabs, markTabSaved, renameTab]
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      const platform = getPlatform();
      const fileName = filePath.split('/').pop() || filePath;

      const confirmed = await platform.confirm(`Are you sure you want to delete "${fileName}"?`, {
        title: 'Delete File',
        kind: 'warning',
        okLabel: 'Delete',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;

      const store = getProjectStore().getState();

      // Delete from disk first
      if (store.projectRoot) {
        await platform.deleteFile(`${store.projectRoot}/${filePath}`);
      }

      // Close any open tab for this file
      const tab = tabs.find((t) => t.projectPath === filePath);
      if (tab) {
        revokeBlobUrl(tab.render.previewSrc);
        closeTabLocal(tab.id);
      }

      store.removeFile(filePath);
      analytics.track('file deleted', { had_open_tab: Boolean(tab) });

      // If we deleted everything, reset to a fresh untitled project
      const remaining = Object.keys(store.files);
      if (remaining.length === 0) {
        store.resetToUntitledProject();
        createNewTab(null, undefined, DEFAULT_TAB_NAME);
      }
    },
    [analytics, tabs, closeTabLocal, createNewTab]
  );

  const handleDeleteFolder = useCallback(
    async (folderPath: string) => {
      const platform = getPlatform();
      const store = getProjectStore().getState();
      const prefix = folderPath + '/';
      const affected = Object.keys(store.files).filter((p) => p.startsWith(prefix));
      const folderName = folderPath.split('/').pop() || folderPath;

      const message =
        affected.length > 0
          ? `Delete "${folderName}" and its ${affected.length} file${affected.length === 1 ? '' : 's'}?`
          : `Delete empty folder "${folderName}"?`;

      const confirmed = await platform.confirm(message, {
        title: 'Delete Folder',
        kind: 'warning',
        okLabel: 'Delete',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;

      // Disk delete first (atomic recursive remove)
      if (store.projectRoot) {
        try {
          await platform.removeDirectory(`${store.projectRoot}/${folderPath}`);
        } catch (error) {
          notifyError({ operation: 'delete-folder', error });
          return;
        }
      }

      // Close tabs for affected files
      for (const fp of affected) {
        const tab = tabs.find((t) => t.projectPath === fp);
        if (tab) {
          revokeBlobUrl(tab.render.previewSrc);
          closeTabLocal(tab.id);
        }
      }

      store.removeFolder(folderPath);
      analytics.track('folder deleted', { file_count: affected.length });

      // If we deleted everything, reset to a fresh untitled project
      if (Object.keys(store.files).length === 0) {
        store.resetToUntitledProject();
        createNewTab(null, undefined, DEFAULT_TAB_NAME);
      }
    },
    [analytics, tabs, closeTabLocal, createNewTab]
  );

  const handleSetRenderTarget = useCallback(
    (filePath: string) => {
      getProjectStore().getState().setRenderTarget(filePath);
      analytics.track('render target changed');
    },
    [analytics]
  );

  const handleMoveItem = useCallback(
    async (sourcePath: string, destFolderPath: string, isFolder: boolean) => {
      const store = getProjectStore().getState();
      if (!isValidDrop(sourcePath, isFolder, destFolderPath)) return;
      try {
        const platform = getPlatform();
        if (isFolder) {
          const folderName = sourcePath.split('/').pop()!;
          const newFolderPath = destFolderPath ? `${destFolderPath}/${folderName}` : folderName;
          if (store.projectRoot) {
            const affected = Object.keys(store.files).filter(
              (p) => p.startsWith(sourcePath + '/') || p === sourcePath
            );
            // Ensure destination parent directories exist before moving
            const destDirs = new Set(
              affected
                .map((p) => {
                  const newRel = newFolderPath + p.slice(sourcePath.length);
                  const parent = newRel.includes('/')
                    ? newRel.substring(0, newRel.lastIndexOf('/'))
                    : '';
                  return parent ? `${store.projectRoot}/${parent}` : null;
                })
                .filter((d): d is string => d !== null)
            );
            for (const dir of destDirs) {
              await platform.createDirectory(dir);
            }
            for (const oldRel of affected) {
              const newRel = newFolderPath + oldRel.slice(sourcePath.length);
              await platform.renameFile(
                `${store.projectRoot}/${oldRel}`,
                `${store.projectRoot}/${newRel}`
              );
            }
          }
          store.moveFolder(sourcePath, newFolderPath);
          // Update any open tabs whose paths were under the moved folder
          for (const tab of tabs) {
            if (!tab.projectPath) continue;
            if (tab.projectPath.startsWith(sourcePath + '/') || tab.projectPath === sourcePath) {
              const newRel = newFolderPath + tab.projectPath.slice(sourcePath.length);
              const absPath = store.projectRoot ? `${store.projectRoot}/${newRel}` : null;
              markTabSaved(tab.id, { filePath: absPath, name: newRel.split('/').pop()! });
              renameTab(tab.id, newRel.split('/').pop()!, newRel);
            }
          }
        } else {
          const fileName = sourcePath.split('/').pop()!;
          const rawDest = destFolderPath ? `${destFolderPath}/${fileName}` : fileName;
          const existingPaths = new Set(Object.keys(store.files));
          existingPaths.delete(sourcePath);
          const newPath = resolvePathConflict(rawDest, existingPaths);
          if (store.projectRoot) {
            const parentDir = newPath.includes('/')
              ? newPath.substring(0, newPath.lastIndexOf('/'))
              : '';
            if (parentDir) await platform.createDirectory(`${store.projectRoot}/${parentDir}`);
            await platform.renameFile(
              `${store.projectRoot}/${sourcePath}`,
              `${store.projectRoot}/${newPath}`
            );
          }
          store.renameFile(sourcePath, newPath);
          const tab = tabs.find((t) => t.projectPath === sourcePath);
          if (tab) {
            const absPath = store.projectRoot ? `${store.projectRoot}/${newPath}` : null;
            markTabSaved(tab.id, { filePath: absPath, name: newPath.split('/').pop()! });
            renameTab(tab.id, newPath.split('/').pop()!, newPath);
          }
        }
        analytics.track('item moved', { kind: isFolder ? 'folder' : 'file' });
      } catch (err) {
        notifyError({ operation: 'Move failed', error: err });
      }
    },
    [analytics, tabs, markTabSaved, renameTab]
  );

  const handleAddExternalFiles = useCallback(
    async (files: Record<string, string>, targetFolderPath: string) => {
      const store = getProjectStore().getState();
      const existing = new Set(Object.keys(store.files));
      try {
        const platform = getPlatform();
        for (const [relName, content] of Object.entries(files)) {
          const rawPath = targetFolderPath ? `${targetFolderPath}/${relName}` : relName;
          const finalPath = resolvePathConflict(rawPath, existing);
          existing.add(finalPath);
          store.addFile(finalPath, content, { isVirtual: store.projectRoot === null });
          if (store.projectRoot) {
            const parentDir = finalPath.includes('/')
              ? finalPath.substring(0, finalPath.lastIndexOf('/'))
              : '';
            if (parentDir) await platform.createDirectory(`${store.projectRoot}/${parentDir}`);
            await platform.writeTextFile(`${store.projectRoot}/${finalPath}`, content);
            store.markFileSaved(finalPath, content);
          }
        }
      } catch (err) {
        notifyError({ operation: 'Add external files', error: err });
      }
    },
    []
  );

  // Note: Tree-sitter formatter is initialized in main.tsx for optimal performance

  // Initialize project store with the default untitled file on mount
  useEffect(() => {
    const state = getProjectStore().getState();
    // Only initialize if the project store is empty (no files loaded yet)
    if (Object.keys(state.files).length === 0) {
      const tab = activeTabRef.current;
      const defaultContent = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';
      // Seed the untitled web project without hydrating workspace state.
      // Explicit file/folder opens should transition out of welcome, but the
      // initial empty project should stay behind the welcome screen.
      state.openProject(null, { [tab.name]: defaultContent }, tab.name);
    }
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    update3dPreviewUrl(activePreviewKind === 'mesh' && activePreviewSrc ? activePreviewSrc : null);
  }, [activePreviewKind, activePreviewSrc, update3dPreviewUrl]);
  useEffect(() => {
    updateCapturePreview(() =>
      captureCurrentPreview({
        viewerId: MAIN_PREVIEW_VIEWER_ID,
        svgSourceUrl: activePreviewKind === 'svg' ? activePreviewSrc : null,
        targetWidth: 1200,
        targetHeight: 630,
      })
    );
    return () => updateCapturePreview(null);
  }, [activePreviewKind, activePreviewSrc, updateCapturePreview]);

  useEffect(() => {
    updatePreviewSceneStyle(previewSceneStyle);
  }, [previewSceneStyle, updatePreviewSceneStyle]);

  useEffect(() => {
    updateUseModelColors(settings.viewer.showModelColors);
  }, [settings.viewer.showModelColors, updateUseModelColors]);

  useEffect(() => {
    if (isShareEntry) {
      setShowNux(false);
    }
  }, [isShareEntry]);

  // Tab switches no longer trigger renders — the render pipeline only renders
  // the pinned render target. Editing any file that the render target includes
  // will trigger a re-render via the project store dependency chain.

  // Source-to-tab and project store sync is handled by handleEditorChange.
  // No separate sync effects needed.

  // Helper function to save file to current path or prompt for new path
  const saveProjectToDirectory = useCallback(async (): Promise<boolean> => {
    try {
      const platform = getPlatform();
      const dirPath = await platform.pickDirectory();
      if (!dirPath) return false;

      const store = getProjectStore().getState();
      const currentSettings = loadSettings();

      // Write all files to the selected directory
      for (const [relativePath, file] of Object.entries(store.files)) {
        let content = file.content;

        if (currentSettings.editor.formatOnSave) {
          try {
            content = await formatOpenScadCode(content, {
              indentSize: currentSettings.editor.indentSize,
              useTabs: currentSettings.editor.useTabs,
            });
            if (content !== file.content) {
              getProjectStore().getState().updateFileContent(relativePath, content);
              getProjectStore().getState().setCustomizerBase(relativePath, content);
            }
          } catch {
            // Continue with unformatted content
          }
        }

        const absolutePath = `${dirPath}/${relativePath}`;
        await platform.writeTextFile(absolutePath, content);
      }

      // Transition project from virtual to disk-backed
      const updatedStore = getProjectStore().getState();
      updatedStore.openProject(
        dirPath,
        Object.fromEntries(
          Object.entries(updatedStore.files).map(([path, file]) => [path, file.content])
        ),
        updatedStore.renderTargetPath ?? DEFAULT_TAB_NAME
      );

      // Update workspace tabs with their new disk paths
      for (const tab of tabsRef.current) {
        const absolutePath = `${dirPath}/${tab.projectPath}`;
        markTabSaved(tab.id, { filePath: absolutePath, name: tab.name });
      }

      requestRender('save', { immediate: true });

      notifySuccess('Project saved to folder', { toastId: 'save-project-dir-success' });
      return true;
    } catch (err) {
      notifyError({
        operation: 'save-project-to-directory',
        error: err,
        fallbackMessage: 'Failed to save project to folder',
        toastId: 'save-project-dir-error',
        logLabel: 'Save project to directory failed',
      });
      return false;
    }
  }, [markTabSaved]);

  const saveFile = useCallback(
    async (promptForPath: boolean = false): Promise<boolean> => {
      try {
        const currentTab = activeTabRef.current;
        const platform = getPlatform();
        const filters = OPENSCAD_FILE_FILTERS;

        const store = getProjectStore().getState();

        // Virtual multi-file project on desktop: redirect to folder save
        if (
          !promptForPath &&
          store.projectRoot === null &&
          Object.keys(store.files).length > 1 &&
          platform.capabilities.hasFileSystem
        ) {
          return saveProjectToDirectory();
        }

        let currentSource = store.files[currentTab.projectPath]?.content ?? '';

        const currentSettings = loadSettings();
        if (currentSettings.editor.formatOnSave) {
          try {
            const formatted = await formatOpenScadCode(currentSource, {
              indentSize: currentSettings.editor.indentSize,
              useTabs: currentSettings.editor.useTabs,
            });
            if (formatted !== currentSource) {
              currentSource = formatted;
              store.updateFileContent(currentTab.projectPath, formatted);
              store.setCustomizerBase(currentTab.projectPath, formatted);
            }
          } catch (err) {
            console.error('[saveFile] Failed to format code:', err);
          }
        }

        let savePath: string | null;
        const suggestedName = currentTab.name || 'untitled';
        if (promptForPath) {
          savePath = await platform.fileSaveAs(currentSource, filters, suggestedName);
        } else {
          savePath = await platform.fileSave(
            currentSource,
            currentTab.filePath,
            filters,
            suggestedName
          );
        }

        if (!savePath) return false;

        const shouldNotifySaveSuccess = promptForPath || !currentTab.filePath;
        const projectRoot = getProjectStore().getState().projectRoot;
        const relativePath = getRelativeProjectPath(projectRoot, savePath);
        const fileName = relativePath || savePath.split('/').pop() || savePath;

        // If the file was renamed (e.g., "Untitled" → "lamp.scad"), update projectStore
        if (fileName !== currentTab.projectPath) {
          getProjectStore().getState().renameFile(currentTab.projectPath, fileName);
          renameTab(currentTab.id, fileName, fileName);
        }

        markTabSaved(currentTab.id, {
          filePath: savePath,
          name: fileName,
        });
        getProjectStore().getState().markFileSaved(fileName, currentSource);

        const dockPanel = getDockviewApi()?.getPanel(currentTab.id);
        if (dockPanel) {
          dockPanel.api.setTitle(savePath.split('/').pop() || fileName);
        }

        addRecentFile(savePath);

        requestRender('save', { immediate: true });

        analytics.track('file saved', {
          source: promptForPath ? 'save_as' : 'save',
          had_existing_path: Boolean(currentTab.filePath),
          format_on_save: currentSettings.editor.formatOnSave,
          render_after_save: true,
        });

        if (shouldNotifySaveSuccess) {
          notifySuccess('File saved successfully', {
            toastId: 'save-success',
          });
        }

        return true;
      } catch (err) {
        notifyError({
          operation: 'save-file',
          error: err,
          fallbackMessage: 'Failed to save file',
          toastId: 'save-file-error',
          logLabel: '[saveFile] Save failed',
        });
        return false;
      }
    },
    [analytics, markTabSaved, renameTab, saveProjectToDirectory]
  );

  const saveAllFiles = useCallback(async () => {
    const store = getProjectStore().getState();
    const platform = getPlatform();
    const currentSettings = loadSettings();
    const filters = OPENSCAD_FILE_FILTERS;
    let savedCount = 0;

    for (const [relativePath, file] of Object.entries(store.files)) {
      if (!file.isDirty) continue;

      let content = file.content;

      // Auto-format on save if enabled
      if (currentSettings.editor.formatOnSave) {
        try {
          const formatted = await formatOpenScadCode(content, {
            indentSize: currentSettings.editor.indentSize,
            useTabs: currentSettings.editor.useTabs,
          });
          if (formatted !== content) {
            content = formatted;
            getProjectStore().getState().updateFileContent(relativePath, formatted);
            getProjectStore().getState().setCustomizerBase(relativePath, formatted);
          }
        } catch {
          // Continue with unformatted content
        }
      }

      // Build absolute path for desktop projects
      const absolutePath = store.projectRoot ? `${store.projectRoot}/${relativePath}` : null;

      const savePath = await platform.fileSave(content, absolutePath, filters, relativePath);
      if (savePath) {
        getProjectStore().getState().markFileSaved(relativePath, content);

        // Update matching workspace tab if one exists
        const tab = tabsRef.current.find((t) => t.projectPath === relativePath);
        if (tab) {
          markTabSaved(tab.id, { filePath: savePath, name: tab.name });
        }
        savedCount++;
      }
    }

    if (savedCount > 0) {
      requestRender('save', { immediate: true });
      notifySuccess(`Saved ${savedCount} file${savedCount > 1 ? 's' : ''}`, {
        toastId: 'save-all-success',
      });
    }
  }, [markTabSaved]);

  // Track whether the user explicitly chose a directory (persisted setting
  // or ephemeral welcome-screen pick). When true, we use the directory
  // directly instead of creating a random-named subdirectory.
  const [hasEphemeralProjectDir, setHasEphemeralProjectDir] = useState(false);
  const hasCustomProjectDir = !!settings.project.defaultProjectDirectory || hasEphemeralProjectDir;
  const displayProjectDir = resolvedProjectDir
    ? hasCustomProjectDir
      ? resolvedProjectDir
      : `${resolvedProjectDir}/${pendingProjectName}`
    : null;

  /**
   * On desktop, create a project directory on disk and transition the project
   * from virtual to disk-backed. Returns the created directory path, or null
   * if on web or if directory creation failed.
   */
  const initProjectDirectory = useCallback(async (): Promise<string | null> => {
    if (!capabilities.hasFileSystem || !resolvedProjectDir) return null;

    const platform = getPlatform();
    let dirPath: string | null;

    if (hasCustomProjectDir) {
      dirPath = resolvedProjectDir;
    } else {
      // Default base dir — create a random-named subdirectory
      dirPath = await platform.createProjectDirectory(resolvedProjectDir, pendingProjectName);
      // Generate a fresh name for the next project
      setPendingProjectName(generateRandomProjectName());

      if (!dirPath) return null;
    }
    if (!dirPath) return null;

    await openWorkspaceFolderInWindow(dirPath, {
      createIfEmpty: true,
    });

    return dirPath;
  }, [capabilities.hasFileSystem, resolvedProjectDir, pendingProjectName, hasCustomProjectDir]);

  const handleStartWithDraft = useCallback(
    (draftOverride?: AiDraft) => {
      if (draftOverride) {
        setDraft(draftOverride);
      }
      hideWelcomeScreen();

      // Create project directory before submitting AI draft
      void initProjectDirectory().then(() => {
        void submitDraft(draftOverride);
      });
    },
    [hideWelcomeScreen, setDraft, submitDraft, initProjectDirectory]
  );

  const handleStartManually = useCallback(() => {
    hideWelcomeScreen();
    void initProjectDirectory();
  }, [hideWelcomeScreen, initProjectDirectory]);

  const handleChangeProjectDirectory = useCallback(async () => {
    const platform = getPlatform();
    const picked = await platform.pickDirectory();
    if (picked) {
      setResolvedProjectDir(picked);
      setHasEphemeralProjectDir(true);
    }
  }, []);

  const openWorkspaceFolderInCurrentWindow = useCallback(
    async (
      dirPath: string,
      options: {
        createIfEmpty?: boolean;
        source?: 'recent' | 'menu_open';
      } = {}
    ) => {
      setIsProjectLoading(true);
      try {
        const result = await openWorkspaceFolderInWindow(dirPath, {
          createIfEmpty: options.createIfEmpty,
        });

        if (options.source) {
          analytics.track('folder opened', {
            source: options.source,
            file_count: result.fileCount,
            created_default_file: result.createdDefaultFile,
          });
        }

        return result;
      } finally {
        setIsProjectLoading(false);
      }
    },
    [analytics]
  );

  const openFileInCurrentWindow = useCallback(
    async (
      result: { path: string | null; name: string; content: string },
      options: {
        source?: 'open' | 'menu_open' | 'recent';
      } = {}
    ) => {
      setIsProjectLoading(true);
      try {
        const openResult = await openFileInWindow(result);

        if (options.source) {
          analytics.track('file opened', {
            source: options.source,
            has_disk_path: Boolean(result.path),
            reused_existing_tab: openResult.reusedExistingTab,
            replaced_welcome_tab: !openResult.reusedExistingTab,
          });
        }

        return openResult;
      } finally {
        setIsProjectLoading(false);
      }
    },
    [analytics]
  );

  const handleNuxSelect = useCallback(
    (preset: 'default' | 'ai-first' | 'customizer-first') => {
      updateSetting('ui', { hasCompletedNux: true, defaultLayoutPreset: preset });
      setShowNux(false);
      analytics.track('workspace layout selected', {
        preset,
        source: 'nux' satisfies LayoutSelectionSource,
        is_first_run: true,
      });

      const api = getDockviewApi();
      if (api) {
        api.clear();
        addPresetPanels(api, preset);
        saveLayout();
      }
    },
    [analytics]
  );

  const handleHeaderLayoutSelect = useCallback(
    (preset: HeaderLayoutPreset) => {
      const changed = settings.ui.defaultLayoutPreset !== preset;

      updateSetting('ui', {
        hasCompletedNux: true,
        defaultLayoutPreset: preset,
      });

      if (changed) {
        analytics.track('workspace layout selected', {
          preset,
          source: 'header' satisfies LayoutSelectionSource,
          is_first_run: false,
        });
      }

      applyWorkspacePreset(preset);
    },
    [analytics, settings.ui.defaultLayoutPreset]
  );

  const handleOpenCustomizerAiRefine = useCallback(() => {
    openPanel('ai-chat', 'ai-chat', 'AI');
    window.setTimeout(() => {
      aiPromptPanelRef.current?.focusPrompt();
    }, 0);
  }, []);

  const hasCurrentModelApiKey = Boolean(getApiKey(getProviderFromModel(currentModel)));
  const canAttachViewerAnnotation = !isStreaming && !isProcessingAttachments;

  const attachViewerAnnotationFile = useCallback<WorkspaceState['attachViewerAnnotationFile']>(
    async (file) => {
      openPanel('ai-chat', 'ai-chat', 'AI');

      if (!hasCurrentModelApiKey) {
        setSettingsInitialTab('ai');
        setShowSettingsDialog(true);
        return { status: 'missing-api-key' };
      }

      if (!canAttachViewerAnnotation) {
        return { status: 'busy' };
      }

      const result = await addDraftFiles([file], 'viewer_annotation');
      if (!result || result.readyCount < 1) {
        return {
          status: 'failed',
          errors: result?.errors ?? ['Failed to add the annotation image.'],
        };
      }

      window.setTimeout(() => {
        aiPromptPanelRef.current?.focusPrompt();
      }, 0);

      return { status: 'attached' };
    },
    [addDraftFiles, canAttachViewerAnnotation, hasCurrentModelApiKey]
  );

  const handleOpenEditorPanel = useCallback(() => {
    focusEditorPanel();
  }, [focusEditorPanel]);

  const handleOpenExportDialog = useCallback(() => {
    setShowExportDialog(true);
  }, []);

  const handleOpenShareDialog = useCallback(() => {
    if (!isShareEnabled()) {
      return;
    }
    setShowShareDialog(true);
  }, []);

  const handleOpenRecent = useCallback(
    async (path: string, type?: 'file' | 'folder') => {
      try {
        // Handle recent folders by opening the directory
        // Also detect legacy entries without type field by checking extension
        if (type === 'folder' || !isOpenScadProjectFilePath(path)) {
          const platform = getPlatform();
          if (!platform.capabilities.hasFileSystem) return 'cancelled' as const;
          await openWorkspaceFolderInCurrentWindow(path, { source: 'recent' });
          return 'opened' as const;
        }

        const existingTab = tabs.find((t) => t.filePath === path);
        if (existingTab) {
          await switchTab(existingTab.id);
          hideWelcomeScreen();
          analytics.track('file opened', {
            source: 'recent',
            has_disk_path: true,
            reused_existing_tab: true,
            replaced_welcome_tab: false,
          });
          return 'opened' as const;
        }

        // On web, recent files won't have real paths — this is a Tauri-only feature
        // but we keep the interface for compatibility
        const platform = getPlatform();
        if (!platform.capabilities.hasFileSystem) {
          notifyError({
            operation: 'open-recent-file',
            fallbackMessage: 'Cannot open recent files in web mode',
            toastId: 'open-recent-file-error',
          });
          return 'cancelled' as const;
        }

        const result = await platform.fileRead(path);
        if (!result) return 'cancelled' as const;

        await openFileInCurrentWindow(result, { source: 'recent' });
        return 'opened' as const;
      } catch (err) {
        removeRecentFile(path);
        const normalized = normalizeAppError(err, 'Failed to open file');
        const isMissingFile =
          normalized.message.toLowerCase().includes('no such file') ||
          normalized.message.toLowerCase().includes('not found');

        notifyError({
          operation: 'open-recent-file',
          error: err,
          fallbackMessage: isMissingFile
            ? 'File no longer exists. Removed from Recent Files.'
            : 'Failed to open file',
          toastId: 'open-recent-file-error',
          logLabel: 'Failed to open recent file',
        });
        return 'removed' as const;
      }
    },
    [
      analytics,
      hideWelcomeScreen,
      openWorkspaceFolderInCurrentWindow,
      openFileInCurrentWindow,
      switchTab,
      tabs,
    ]
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const result = await getPlatform().fileOpen(OPENSCAD_FILE_FILTERS);
      if (!result) return;
      await openFileInCurrentWindow(result, { source: 'open' });
    } catch (err) {
      notifyError({
        operation: 'open-file',
        error: err,
        fallbackMessage: 'Failed to open file',
        toastId: 'open-file-error',
        logLabel: 'Failed to open file',
      });
    }
  }, [openFileInCurrentWindow]);

  // Helper function to check for unsaved changes before destructive operations
  // Returns: true if ok to proceed, false if user wants to cancel
  const checkUnsavedChangesRef = useRef<() => Promise<boolean>>();

  checkUnsavedChangesRef.current = async (): Promise<boolean> => {
    const file = getProjectStore().getState().files[activeTabRef.current.projectPath];
    // Compare content directly rather than relying on isDirty — virtual files
    // (web) keep isDirty false to suppress UI indicators, but we still want to
    // warn before discarding in-memory edits.
    const hasUnsavedEdits = file ? file.content !== file.savedContent : false;
    if (!hasUnsavedEdits) return true;

    const platform = getPlatform();

    const wantsToSave = await platform.ask('Do you want to save the changes you made?', {
      title: 'Unsaved Changes',
      kind: 'warning',
      okLabel: 'Save',
      cancelLabel: "Don't Save",
    });

    if (wantsToSave) {
      return await saveFile(false);
    } else {
      const confirmDiscard = await platform.confirm(
        'Are you sure you want to discard your changes?',
        {
          title: 'Discard Changes',
          kind: 'warning',
          okLabel: 'Discard',
          cancelLabel: 'Cancel',
        }
      );
      return confirmDiscard;
    }
  };

  useEffect(() => {
    const unlistenFns: Array<() => void> = [];

    unlistenFns.push(
      eventBus.on('menu:file:new', async () => {
        const canProceed = checkUnsavedChangesRef.current
          ? await checkUnsavedChangesRef.current()
          : true;
        if (!canProceed) return;

        getProjectStore().getState().resetToUntitledProject();
        createNewTab();
        showWelcomeScreen();
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:open', async () => {
        try {
          const result = await getPlatform().fileOpen(OPENSCAD_FILE_FILTERS);
          if (!result) return;
          await openFileInCurrentWindow(result, { source: 'menu_open' });
        } catch (err) {
          notifyError({
            operation: 'open-file',
            error: err,
            fallbackMessage: 'Failed to open file',
            toastId: 'open-file-error',
            logLabel: 'Open failed',
          });
        }
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:open_folder', async () => {
        try {
          const canProceed = checkUnsavedChangesRef.current
            ? await checkUnsavedChangesRef.current()
            : true;
          if (!canProceed) return;

          const platform = getPlatform();
          const dirPath = await platform.pickDirectory();
          if (!dirPath) return;
          await openWorkspaceFolderInCurrentWindow(dirPath, { source: 'menu_open' });
        } catch (err) {
          notifyError({
            operation: 'open-folder',
            error: err,
            fallbackMessage: 'Failed to open folder',
            toastId: 'open-folder-error',
            logLabel: 'Open folder failed',
          });
        }
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:save', async () => {
        await saveFile(false);
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:save_as', async () => {
        await saveFile(true);
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:save_all', async () => {
        await saveAllFiles();
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:export', async (format: ExportFormat) => {
        try {
          const formatLabels: Record<ExportFormat, { label: string; ext: string }> = {
            stl: { label: 'STL (3D Model)', ext: 'stl' },
            obj: { label: 'OBJ (3D Model)', ext: 'obj' },
            amf: { label: 'AMF (3D Model)', ext: 'amf' },
            '3mf': { label: '3MF (3D Model)', ext: '3mf' },
            png: { label: 'PNG (Image)', ext: 'png' },
            svg: { label: 'SVG (2D Vector)', ext: 'svg' },
            dxf: { label: 'DXF (2D CAD)', ext: 'dxf' },
          };
          const formatInfo = formatLabels[format];
          const rtContent = getRenderTargetContent(getProjectStore().getState()) ?? '';
          const exportBytes = await getRenderService().exportModel(
            rtContent,
            format as 'stl' | 'obj' | 'amf' | '3mf' | 'svg' | 'dxf'
          );
          await getPlatform().fileExport(exportBytes, `export.${formatInfo.ext}`, [
            { name: formatInfo.label, extensions: [formatInfo.ext] },
          ]);
          analytics.track('file exported', {
            format,
          });
          notifySuccess('Exported successfully', { toastId: 'export-success' });
        } catch (err) {
          notifyError({
            operation: 'export-file',
            error: err,
            capture: !isExportValidationError(err),
            fallbackMessage: 'Export failed',
            toastId: 'export-error',
            logLabel: 'Export failed',
          });
        }
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:save_project', async () => {
        try {
          const state = getProjectStore().getState();
          if (!state.renderTargetPath) return;
          const files: Record<string, string> = {};
          for (const [path, file] of Object.entries(state.files)) {
            files[path] = file.content;
          }
          const blob = exportProjectZip({
            files,
            renderTargetPath: state.renderTargetPath,
          });
          const data = new Uint8Array(await blob.arrayBuffer());
          await getPlatform().fileExport(data, 'project.zip', [
            { name: 'ZIP Archive', extensions: ['zip'] },
          ]);
          analytics.track('project exported', { file_count: Object.keys(files).length });
          notifySuccess('Project saved', { toastId: 'save-project-success' });
        } catch (err) {
          notifyError({
            operation: 'save-project',
            error: err,
            fallbackMessage: 'Failed to save project',
            toastId: 'save-project-error',
            logLabel: 'Save project failed',
          });
        }
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:open_project', async () => {
        try {
          const canProceed = checkUnsavedChangesRef.current
            ? await checkUnsavedChangesRef.current()
            : true;
          if (!canProceed) return;

          const result = await pickFolder();
          if (!result) return;

          getProjectStore().getState().openProject(null, result.files, result.renderTargetPath);
          createNewTab(null, result.files[result.renderTargetPath], result.renderTargetPath);
          hideWelcomeScreen();
          analytics.track('project imported', { file_count: Object.keys(result.files).length });
          notifySuccess(`Opened project with ${Object.keys(result.files).length} files`, {
            toastId: 'open-project-success',
          });

          requestRender('file_open', { immediate: true });
        } catch (err) {
          notifyError({
            operation: 'open-project',
            error: err,
            fallbackMessage: 'Failed to open project',
            toastId: 'open-project-error',
            logLabel: 'Open project failed',
          });
        }
      })
    );

    return () => {
      unlistenFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analytics,
    createNewTab,
    hideWelcomeScreen,
    openFileInCurrentWindow,
    openWorkspaceFolderInCurrentWindow,
    saveAllFiles,
    showWelcomeScreen,
  ]);

  useEffect(() => {
    const platform = getPlatform();
    const unlisten = platform.onCloseRequested(async () => {
      const projectFiles = getProjectStore().getState().files;
      const anyDirty = Object.values(projectFiles).some((f) => f.isDirty);
      if (!anyDirty) return true;
      return checkUnsavedChangesRef.current ? await checkUnsavedChangesRef.current() : true;
    });

    return () => {
      unlisten();
    };
  }, []);

  const activeFileDirty = useProjectStore((s) => s.files[activeTab.projectPath]?.isDirty ?? false);
  const anyFileDirty = useProjectStore((s) => Object.values(s.files).some((f) => f.isDirty));

  useEffect(() => {
    const workspaceName = projectRoot
      ? (projectRoot.split('/').filter(Boolean).pop() ?? activeTab.name)
      : activeTab.filePath
        ? activeTab.name
        : 'Untitled Project';
    const dirtyIndicator = activeFileDirty ? '\u2022 ' : '';
    const title = `${dirtyIndicator}${workspaceName} - OpenSCAD Studio`;
    getPlatform().setWindowTitle(title);

    if (capabilities.hasFileSystem) {
      void syncDesktopMcpWindowContext({
        title,
        workspaceRoot: projectRoot,
        renderTargetPath,
        showWelcome,
        mode: showWelcome ? 'welcome' : 'ready',
      }).catch((error) => {
        console.error('[App] Failed to sync MCP window context:', error);
      });
    }
  }, [
    activeFileDirty,
    activeTab.filePath,
    activeTab.name,
    capabilities.hasFileSystem,
    projectRoot,
    renderTargetPath,
    showWelcome,
  ]);

  useEffect(() => {
    const platform = getPlatform();
    if ('setDirtyState' in platform) {
      (platform as { setDirtyState: (d: boolean) => void }).setDirtyState(anyFileDirty);
    }
  }, [anyFileDirty]);

  // Watch project directory for external file changes (desktop only)
  useEffect(() => {
    if (!projectRoot) return;
    const platform = getPlatform();
    if (!platform.capabilities.hasFileSystem) return;

    let unwatchFn: (() => void) | null = null;

    platform
      .watchDirectory(projectRoot, (relativePath, content) => {
        const store = getProjectStore().getState();
        if (content === null) {
          // File was deleted externally — only remove if it exists and isn't dirty
          if (relativePath in store.files && !store.files[relativePath].isDirty) {
            store.removeFile(relativePath);
          }
          return;
        }
        // File was created or modified externally
        if (relativePath in store.files) {
          // Only update if the file isn't dirty (don't overwrite unsaved user edits)
          if (!store.files[relativePath].isDirty && store.files[relativePath].content !== content) {
            store.updateFileContent(relativePath, content);
            store.markFileSaved(relativePath, content);
          }
        } else {
          store.addFile(relativePath, content);
          store.markFileSaved(relativePath, content);
        }
      })
      .then((fn) => {
        unwatchFn = fn;
      });

    return () => {
      unwatchFn?.();
    };
  }, [projectRoot]);

  useEffect(() => {
    const unlisten = eventBus.on('render-requested', () => {
      requestRender('manual', { immediate: true });
    });
    return unlisten;
  }, []);

  useEffect(() => {
    const unlisten = eventBus.on('code-updated', ({ code, source: eventSource }) => {
      const store = getProjectStore().getState();
      // Customizer changes target the render target file, not the active editor
      // tab — the user may be viewing a different file while the customizer
      // operates on the render target.
      const projectPath =
        eventSource === 'customizer'
          ? (store.renderTargetPath ?? activeTabRef.current.projectPath)
          : activeTabRef.current.projectPath;
      store.updateFileContent(projectPath, code);
      if (eventSource !== 'customizer') {
        store.setCustomizerBase(projectPath, code);
      }
      requestRender(eventSource === 'history' ? 'history_restore' : 'code_update', {
        immediate: true,
      });
    });
    return unlisten;
  }, []);

  const previousSettingsDialogRef = useRef(false);
  useEffect(() => {
    if (showSettingsDialog && !previousSettingsDialogRef.current) {
      analytics.track('settings opened', {
        section: settingsInitialTab ?? 'appearance',
      });
    }
    previousSettingsDialogRef.current = showSettingsDialog;
  }, [analytics, settingsInitialTab, showSettingsDialog]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to focus AI prompt
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setTimeout(() => {
          aiPromptPanelRef.current?.focusPrompt();
        }, 0);
      }
      // ⌘, or Ctrl+, to open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettingsDialog(true);
      }
      // ⌘T or Ctrl+T for new tab
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        createNewTab();
      }
      // ⌘W or Ctrl+W to close tab
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        closeTab(activeTabId);
      }
      // ⌘⌥S or Ctrl+Alt+S to save all
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 's') {
        e.preventDefault();
        eventBus.emit('menu:file:save_all');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createNewTab, closeTab, activeTabId]);

  useEffect(() => {
    if (aiError) {
      notifyError({
        operation: 'ai-stream',
        error: aiErrorObject ?? aiError,
        displayMessage: aiError,
        fallbackMessage: 'AI request failed',
        toastId: 'ai-stream-error',
      });
      clearAiError();
    }
  }, [aiError, aiErrorObject, clearAiError]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      if (isIgnorableError(event.error ?? event.message)) {
        return;
      }
      notifyError({
        operation: 'unexpected-runtime-error',
        error: event.error ?? event.message,
        fallbackMessage: 'Something went wrong in the app',
        toastId: 'unexpected-runtime-error',
        logLabel: '[App] Unhandled window error',
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isIgnorableError(event.reason)) {
        return;
      }

      notifyError({
        operation: 'unexpected-runtime-error',
        error: event.reason,
        fallbackMessage: 'An unexpected error interrupted the current action',
        toastId: 'unexpected-runtime-error',
        logLabel: '[App] Unhandled promise rejection',
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const onDockviewReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      setDockviewApi(api);

      const savedPreset = loadSettings().ui.defaultLayoutPreset;
      const layoutMode =
        typeof window !== 'undefined' && window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches
          ? 'mobile'
          : 'desktop';
      const sharePreset = isShareEntry && shareContext ? shareContext.mode : null;

      if (!sharePreset) {
        clearSavedLayout();
      }

      addPresetPanels(api, sharePreset ?? savedPreset, layoutMode);

      let timer: ReturnType<typeof setTimeout> | null = null;
      if (!sharePreset) {
        api.onDidLayoutChange(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            saveLayout();
          }, 300);
        });
      }
    },
    [isShareEntry, shareContext]
  );

  const workspaceState: WorkspaceState = useMemo(
    () => ({
      source: renderTargetContent,
      updateSource: handleEditorChange,
      diagnostics: activeDiagnostics,
      onManualRender: manualRender,
      settings,
      editorFocusRequestKey,
      tabs,
      activeTabId,
      onTabClick: switchTab,
      onTabClose: closeTab,
      onNewTab: () => createNewTab(),
      onReorderTabs: reorderTabs,
      previewSrc: activePreviewSrc,
      previewKind: activePreviewKind,
      isRendering: isRendering || isProjectLoading,
      error: activeError,
      renderReady: ready,
      onPreviewVisualReady: isShareEntry ? markSharePreviewReady : undefined,
      isStreaming,
      streamingResponse,
      proposedDiff,
      aiError,
      isApplyingDiff,
      messages,
      draft,
      attachments,
      draftErrors,
      draftVisionBlockMessage,
      draftVisionWarningMessage,
      canSubmitDraft,
      isProcessingAttachments,
      currentToolCalls,
      currentModel,
      currentModelVisionSupport,
      availableProviders,
      submitDraft,
      setDraftText,
      addDraftFiles,
      removeDraftAttachment,
      hasCurrentModelApiKey,
      canAttachViewerAnnotation,
      attachViewerAnnotationFile,
      cancelStream,
      acceptDiff,
      rejectDiff,
      clearAiError,
      newConversation,
      setCurrentModel,
      handleRestoreCheckpoint,
      aiPromptPanelRef,
      onAcceptDiff: acceptDiff,
      onRejectDiff: rejectDiff,
      onOpenAiSettings: () => {
        setSettingsInitialTab('ai');
        setShowSettingsDialog(true);
      },
      onOpenCustomizerAiRefine: handleOpenCustomizerAiRefine,
      onOpenEditorPanel: handleOpenEditorPanel,
      onOpenExportDialog: handleOpenExportDialog,
    }),
    [
      renderTargetContent,
      handleEditorChange,
      activeDiagnostics,
      manualRender,
      settings,
      editorFocusRequestKey,
      tabs,
      activeTabId,
      switchTab,
      closeTab,
      createNewTab,
      reorderTabs,
      activePreviewSrc,
      activePreviewKind,
      isRendering,
      isProjectLoading,
      activeError,
      ready,
      isShareEntry,
      markSharePreviewReady,
      isStreaming,
      streamingResponse,
      proposedDiff,
      aiError,
      isApplyingDiff,
      messages,
      draft,
      attachments,
      draftErrors,
      draftVisionBlockMessage,
      draftVisionWarningMessage,
      canSubmitDraft,
      isProcessingAttachments,
      currentToolCalls,
      currentModel,
      currentModelVisionSupport,
      availableProviders,
      submitDraft,
      setDraftText,
      addDraftFiles,
      removeDraftAttachment,
      hasCurrentModelApiKey,
      canAttachViewerAnnotation,
      attachViewerAnnotationFile,
      cancelStream,
      acceptDiff,
      rejectDiff,
      clearAiError,
      newConversation,
      setCurrentModel,
      handleRestoreCheckpoint,
      handleOpenCustomizerAiRefine,
      handleOpenEditorPanel,
      handleOpenExportDialog,
    ]
  );

  const shouldShowWelcome = showWelcome && !isShareEntry;
  const canUseShare = !capabilities.hasNativeMenu && isShareEnabled();
  const shouldShowShareBanner = Boolean(
    shareOrigin && sharePhase === 'ready' && !isShareBannerDismissed
  );

  const shareBlockingOverlay = shouldBlockShareUi ? (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      data-testid="share-loading-screen"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div
        className="flex w-full max-w-md flex-col items-center text-center rounded-2xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          gap: 'var(--space-helper-gap)',
          padding: `var(--space-dialog-padding-y) var(--space-dialog-padding-x)`,
        }}
      >
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{
            borderColor: 'var(--border-primary)',
            borderTopColor: 'var(--accent-primary)',
          }}
        />
        <div className="text-lg font-semibold">Opening shared design...</div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading the shared model, preview, and layout.
        </div>
      </div>
    </div>
  ) : null;

  const content = shouldShowShareError ? (
    <div
      className="flex h-screen items-center justify-center"
      data-testid="share-error-screen"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-2xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          gap: 'var(--space-section-gap)',
          padding: `var(--space-dialog-padding-y) var(--space-dialog-padding-x)`,
        }}
      >
        <div className="text-lg font-semibold">Couldn&apos;t open this shared design</div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {shareLoadError}
        </div>
        <div
          className="flex items-center justify-end"
          style={{ gap: 'var(--space-dialog-footer-gap)' }}
        >
          <Button variant="secondary" onClick={skipShareEntry}>
            Go to Editor
          </Button>
          <Button variant="primary" onClick={retryShareLoad}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  ) : shouldShowWelcome ? (
    <div
      className="h-screen"
      data-testid="welcome-container"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <WelcomeScreen
        draft={draft}
        attachments={attachments}
        draftErrors={draftErrors}
        draftVisionBlockMessage={draftVisionBlockMessage}
        draftVisionWarningMessage={draftVisionWarningMessage}
        canSubmitDraft={canSubmitDraft}
        isProcessingAttachments={isProcessingAttachments}
        onDraftTextChange={setDraftText}
        onDraftFilesSelected={(files) => {
          void addDraftFiles(files);
        }}
        onDraftRemoveAttachment={removeDraftAttachment}
        onStartWithDraft={handleStartWithDraft}
        onStartManually={handleStartManually}
        onOpenRecent={handleOpenRecent}
        onOpenFile={handleOpenFile}
        onOpenFolder={() => {
          eventBus.emit(
            capabilities.hasFileSystem ? 'menu:file:open_folder' : 'menu:file:open_project'
          );
        }}
        showRecentFiles={capabilities.hasFileSystem}
        currentModel={currentModel}
        availableProviders={availableProviders}
        onModelChange={setCurrentModel}
        onOpenSettings={() => {
          setSettingsInitialTab('ai');
          setShowSettingsDialog(true);
        }}
        projectDirectory={displayProjectDir}
        onChangeProjectDirectory={handleChangeProjectDirectory}
        hasCustomProjectDirectory={hasCustomProjectDir}
      />
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => {
          setShowSettingsDialog(false);
          setSettingsInitialTab(undefined);
          loadModelAndProviders();
        }}
        initialTab={settingsInitialTab}
      />
      <NuxLayoutPicker isOpen={showNux && !isMobile} onSelect={handleNuxSelect} />
    </div>
  ) : (
    <div
      className="h-screen flex flex-col"
      data-testid="app-container"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <header
        className="relative flex items-center gap-1.5 shrink-0 py-1"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {!capabilities.hasNativeMenu && (
          <WebMenuBar
            onExport={() => setShowExportDialog(true)}
            onShare={canUseShare ? handleOpenShareDialog : undefined}
            onSettings={() => setShowSettingsDialog(true)}
            onUndo={handleUndo}
            onRedo={handleRedo}
            hasMultipleFiles={hasMultipleFiles}
          />
        )}

        <div className="flex-1" />

        {!isMobile && !isHeaderWorkspaceSwitcherHidden && (
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <HeaderWorkspaceControls
              layoutPreset={settings.ui.defaultLayoutPreset}
              onLayoutPresetChange={handleHeaderLayoutSelect}
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
          {(isRendering || isProjectLoading) && (
            <div
              data-testid="render-spinner"
              className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              <div
                className="animate-spin h-2.5 w-2.5 border-2 rounded-full"
                style={{
                  borderColor: 'var(--border-primary)',
                  borderTopColor: 'var(--accent-primary)',
                }}
              />
              <span>Rendering</span>
            </div>
          )}

          {!isMobile && (
            <>
              <Button
                data-testid="render-button"
                variant="primary"
                onClick={manualRender}
                disabled={isRendering || !ready}
                size="sm"
                className="text-xs px-2 py-1"
              >
                Render (⌘↵)
              </Button>
            </>
          )}

          <Button
            data-testid="export-button"
            variant="secondary"
            onClick={() => setShowExportDialog(true)}
            size="sm"
            disabled={isRendering || !ready}
            className="text-xs px-2 py-1"
          >
            <span className="inline-flex items-center gap-1.5">
              <TbDownload size={14} />
              <span>Export</span>
            </span>
          </Button>
          {canUseShare && (
            <Button
              data-testid="share-button"
              variant="secondary"
              onClick={handleOpenShareDialog}
              size="sm"
              disabled={isRendering || !ready}
              className="text-xs px-2 py-1"
            >
              <span className="inline-flex items-center gap-1.5">
                <TbShare3 size={14} />
                <span>Share</span>
              </span>
            </Button>
          )}

          <div
            style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-secondary)' }}
          />

          {!capabilities.hasNativeMenu && !isMobile && (
            <>
              <HeaderIconLink
                href={REPOSITORY_URL}
                title="View GitHub Repository"
                ariaLabel="View GitHub Repository"
                openInNewTab
              >
                <TbBrandGithub size={15} />
              </HeaderIconLink>
              <HeaderIconLink
                href={macDownloadUrl}
                title="Download for Mac"
                ariaLabel="Download for Mac"
              >
                <TbDownload size={15} />
              </HeaderIconLink>
            </>
          )}

          <IconButton
            data-testid="settings-button"
            onClick={() => setShowSettingsDialog(true)}
            size="sm"
            title="Settings (⌘,)"
            aria-label="Settings"
          >
            <TbSettings size={16} />
          </IconButton>
        </div>
      </header>

      {shouldShowShareBanner && shareOrigin && (
        <ShareBanner
          origin={shareOrigin}
          onShareRemix={handleOpenShareDialog}
          onDismiss={dismissShareBanner}
        />
      )}

      <div className="flex-1 overflow-hidden flex">
        {!isMobile && (
          <FileTreePanel
            activeFilePath={activeTab.projectPath}
            onFileClick={handleFileTreeClick}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            onDeleteFolder={handleDeleteFolder}
            onSetRenderTarget={handleSetRenderTarget}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onMoveItem={handleMoveItem}
            onAddExternalFiles={handleAddExternalFiles}
            collapsed={!settings.ui.fileTreeVisible}
            onToggleCollapse={handleToggleFileTree}
            width={settings.ui.fileTreeWidth}
          />
        )}
        <div className="flex-1 overflow-hidden">
          <WorkspaceProvider value={workspaceState}>
            <DockviewReact
              components={panelComponents}
              tabComponents={tabComponents}
              defaultTabComponent={WorkspaceTab}
              onReady={onDockviewReady}
              className="dockview-theme-openscad"
              disableFloatingGroups={true}
            />
          </WorkspaceProvider>
        </div>
      </div>

      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        source={renderTargetContent}
        workingDir={projectRoot}
        previewKind={activePreviewKind}
      />
      <ShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        source={renderTargetContent}
        tabName={activeTab.name}
        forkedFrom={shareOrigin?.shareId ?? null}
        capturePreview={() =>
          captureCurrentPreview({
            viewerId: MAIN_PREVIEW_VIEWER_ID,
            svgSourceUrl: activePreviewKind === 'svg' ? activePreviewSrc : null,
            targetWidth: 1200,
            targetHeight: 630,
          })
        }
        preview3dUrl={activePreviewKind === 'mesh' ? activePreviewSrc : null}
        previewKind={activePreviewKind}
        useModelColors={settings.viewer.showModelColors}
      />

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => {
          setShowSettingsDialog(false);
          setSettingsInitialTab(undefined);
          loadModelAndProviders();
        }}
        initialTab={settingsInitialTab}
      />
    </div>
  );

  return (
    <TooltipProvider>
      {content}
      {shareBlockingOverlay}
      <Toaster
        richColors
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          },
        }}
      />
    </TooltipProvider>
  );
}

export default App;
