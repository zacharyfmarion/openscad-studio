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
import { useOpenScad } from './hooks/useOpenScad';
import { useAiAgent } from './hooks/useAiAgent';
import { useHistory } from './hooks/useHistory';
import { useMobileLayout } from './hooks/useMobileLayout';
import { getPlatform, eventBus, type ExportFormat } from './platform';
import { isExportValidationError } from './services/exportErrors';
import { RenderService } from './services/renderService';
import { getPreviewSceneStyle } from './services/previewSceneConfig';
import { isShareEnabled } from './services/shareService';
import { useSettings, loadSettings, updateSetting } from './stores/settingsStore';
import { getApiKey, getProviderFromModel } from './stores/apiKeyStore';
import {
  selectActiveRender,
  selectActiveTab,
  selectActiveTabId,
  selectShowWelcome,
  selectTabs,
  selectWorkingDirectory,
} from './stores/workspaceSelectors';
import { useWorkspaceStore, getWorkspaceState } from './stores/workspaceStore';
import { getProjectStore, useProjectStore, getRenderTargetContent } from './stores/projectStore';
import { formatOpenScadCode } from './utils/formatter';
import { addRecentFile, removeRecentFile } from './utils/recentFiles';
import { captureCurrentPreview } from './utils/capturePreview';
import { normalizeAppError, notifyError, notifySuccess } from './utils/notifications';
import { useShareEntry } from './hooks/useShareEntry';
import { TbBrandGithub, TbSettings, TbDownload, TbShare3 } from 'react-icons/tb';
import { Toaster } from 'sonner';
import type { AiDraft } from './types/aiChat';
import type { WorkspaceTab as WorkspaceDocumentTab } from './stores/workspaceTypes';

const RELEASE_BASE = 'https://github.com/zacharyfmarion/openscad-studio/releases/latest/download';
const REPOSITORY_URL = 'https://github.com/zacharyfmarion/openscad-studio';
const HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY = '(max-width: 900px)';

const RELEASE_ASSETS: Record<MacArch, string> = {
  aarch64: 'OpenSCAD.Studio_latest_aarch64.dmg',
  x64: 'OpenSCAD.Studio_latest_x64.dmg',
};

type MacArch = 'aarch64' | 'x64';

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
  const renderTargetTab = tabs.find((t) => t.projectPath === renderTargetPath);
  const renderTargetRender = renderTargetTab?.render ?? activeRender;
  const workingDir = useWorkspaceStore(selectWorkingDirectory);
  const createTab = useWorkspaceStore((state) => state.createTab);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const markTabSaved = useWorkspaceStore((state) => state.markTabSaved);
  const renameTab = useWorkspaceStore((state) => state.renameTab);
  const closeTabLocal = useWorkspaceStore((state) => state.closeTabLocal);
  const replaceWelcomeTab = useWorkspaceStore((state) => state.replaceWelcomeTab);
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
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsSection | undefined>(
    undefined
  );
  const [settings] = useSettings();
  const { theme } = useTheme();
  const previewSceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const { capabilities } = getPlatform();
  const macDownloadUrl = useMacDownloadUrl();
  const { undo, redo } = useHistory();
  const initialShareContext = useMemo(
    () => (typeof window === 'undefined' ? null : (window.__SHARE_CONTEXT ?? null)),
    []
  );

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

  const {
    previewKind,
    diagnostics,
    isRendering,
    error,
    ready,
    manualRender,
    renderOnSave,
    renderWithTrigger,
    renderCode,
    auxiliaryFiles,
  } = useOpenScad({
    source: renderTargetContent,
    contentVersion,
    suppressInitialRender: Boolean(initialShareContext),
    workingDir,
    autoRenderOnIdle: settings.editor.autoRenderOnIdle,
    autoRenderDelayMs: settings.editor.autoRenderDelayMs,
    library: settings.library,
    createRenderOwner: () => {
      // Always render into the render target tab, not the active editor tab
      const rtPath = getProjectStore().getState().renderTargetPath;
      const rtTab = rtPath
        ? getWorkspaceState().tabs.find((t) => t.projectPath === rtPath)
        : null;
      const tabId = rtTab?.id ?? activeTabRef.current?.id;
      if (!tabId) {
        return null;
      }

      const tab = rtTab ?? activeTabRef.current;
      return {
        tabId,
        requestId: beginTabRender(tabId, {
          preferredDimension: tab?.render.dimensionMode,
        }),
      };
    },
    onRenderSettled: ({ owner, code, snapshot }) => {
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
  const activePreviewSrc = renderTargetRender?.previewSrc ?? '';
  const activePreviewKind = renderTargetRender?.previewKind ?? previewKind;
  const activeDiagnostics = renderTargetRender?.diagnostics ?? diagnostics;
  const activeError = renderTargetRender?.error ?? error;

  const handleOpenFallbackEditor = useCallback(() => {
    setShowNux(false);
    hideWelcomeScreen();
    window.history.replaceState({}, document.title, '/');

    if (!renderTargetRender?.lastRenderedContent && ready) {
      void renderWithTrigger('initial');
    }
  }, [renderTargetRender?.lastRenderedContent, hideWelcomeScreen, ready, renderWithTrigger]);

  // Project initialization helper
  // Populates the projectStore when a file is opened on either platform.
  const initializeProject = useCallback(
    async (filePath: string | null, fileName: string, content: string) => {
      const store = getProjectStore();
      const platform = getPlatform();

      if (filePath) {
        // Desktop: derive project root from file path and scan for siblings
        const separatorIndex = filePath.lastIndexOf('/');
        const projectRoot = separatorIndex > 0 ? filePath.substring(0, separatorIndex) : null;
        const relativeName = filePath.substring(separatorIndex + 1);

        const files: Record<string, string> = { [relativeName]: content };

        if (projectRoot && platform.capabilities.hasFileSystem) {
          try {
            const siblings = await platform.readDirectoryFiles(projectRoot, ['scad'], true);
            for (const [relPath, siblingContent] of Object.entries(siblings)) {
              // Don't overwrite the primary file (we have the freshest content)
              if (relPath !== relativeName) {
                files[relPath] = siblingContent;
              }
            }
          } catch (err) {
            console.warn('[App] Failed to scan sibling files:', err);
          }
        }

        store.getState().openProject(projectRoot, files, relativeName);
      } else {
        // Web: single file project with no disk root
        const name = fileName || 'Untitled.scad';
        store.getState().openProject(null, { [name]: content }, name);
      }
    },
    []
  );

  const handleOpenSharedDocument = useCallback(
    (share: { title: string; code: string }) => {
      setShowNux(false);
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
      return renderCode(code, 'file_open');
    },
    [renderCode]
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
      void renderCode(checkpoint.code, 'history_restore');
    }
  }, [activeTab.projectPath, undo, renderCode]);

  const handleRedo = useCallback(async () => {
    const checkpoint = await redo();
    if (checkpoint) {
      const store = getProjectStore().getState();
      const projectPath = activeTab.projectPath;
      store.updateFileContent(projectPath, checkpoint.code);
      store.setCustomizerBase(projectPath, checkpoint.code);
      void renderCode(checkpoint.code, 'history_restore');
    }
  }, [activeTab.projectPath, redo, renderCode]);

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
    updateStlBlobUrl,
    updateWorkingDir,
    updateCurrentFilePath,
    updateAuxiliaryFiles,
    updatePreviewSceneStyle,
    loadModelAndProviders,
  } = useAiAgent();

  // Tab management functions
  const createNewTab = useCallback(
    (filePath?: string | null, content?: string, name?: string): string => {
      const projectPath = name ?? 'Untitled';
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
      if (isDirty) {
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
    },
    [closeTabLocal, tabs]
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
        const absolutePath = store.projectRoot
          ? `${store.projectRoot}/${filePath}`
          : null;
        createNewTab(absolutePath, undefined, filePath);
      }
    },
    [tabs, switchTab, createNewTab]
  );

  // Editor onChange: single write to projectStore. The render pipeline reacts
  // automatically via the source prop (render target content) and contentVersion.
  const handleEditorChange = useCallback(
    (content: string) => {
      const projectPath = activeTabRef.current.projectPath;
      getProjectStore().getState().updateFileContent(projectPath, content);
    },
    []
  );

  const handleToggleFileTree = useCallback(() => {
    updateSetting('ui', { fileTreeVisible: !settings.ui.fileTreeVisible });
  }, [settings.ui.fileTreeVisible]);

  const handleCreateFile = useCallback(
    async (parentDir: string) => {
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
    },
    [createNewTab]
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
    },
    [tabs, markTabSaved, renameTab]
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      const platform = getPlatform();
      const fileName = filePath.split('/').pop() || filePath;

      const confirmed = await platform.confirm(
        `Are you sure you want to delete "${fileName}"?`,
        { title: 'Delete File', kind: 'warning', okLabel: 'Delete', cancelLabel: 'Cancel' }
      );
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

      // If we deleted everything, create a new untitled file
      const remaining = Object.keys(store.files);
      if (remaining.length === 0) {
        const defaultContent = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';
        store.addFile('Untitled', defaultContent);
        store.setRenderTarget('Untitled');
        createNewTab(null, defaultContent, 'Untitled');
      }
    },
    [tabs, closeTabLocal, createNewTab]
  );

  const handleSetRenderTarget = useCallback((filePath: string) => {
    getProjectStore().getState().setRenderTarget(filePath);
  }, []);

  // Note: Tree-sitter formatter is initialized in main.tsx for optimal performance

  // Use refs to avoid stale closures in event listeners
  const workingDirRef = useRef<string | null>(workingDir);
  const renderOnSaveRef = useRef(renderOnSave);
  const manualRenderRef = useRef(manualRender);
  const renderWithTriggerRef = useRef(renderWithTrigger);
  const renderCodeRef = useRef(renderCode);

  // Initialize project store with the default untitled file on mount
  useEffect(() => {
    const state = getProjectStore().getState();
    // Only initialize if the project store is empty (no files loaded yet)
    if (Object.keys(state.files).length === 0) {
      const tab = activeTabRef.current;
      const defaultContent = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';
      void initializeProject(tab.filePath, tab.name, defaultContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    updateStlBlobUrl(activePreviewKind === 'mesh' && activePreviewSrc ? activePreviewSrc : null);
  }, [activePreviewKind, activePreviewSrc, updateStlBlobUrl]);
  useEffect(() => {
    updateCapturePreview(() =>
      captureCurrentPreview({
        svgSourceUrl: activePreviewKind === 'svg' ? activePreviewSrc : null,
        targetWidth: 1200,
        targetHeight: 630,
      })
    );
    return () => updateCapturePreview(null);
  }, [activePreviewKind, activePreviewSrc, updateCapturePreview]);

  useEffect(() => {
    workingDirRef.current = workingDir;
    updateWorkingDir(workingDir);
  }, [workingDir, updateWorkingDir]);

  useEffect(() => {
    updateCurrentFilePath(activeTab?.filePath ?? null);
  }, [activeTab?.filePath, updateCurrentFilePath]);

  useEffect(() => {
    updateAuxiliaryFiles(auxiliaryFiles);
  }, [auxiliaryFiles, updateAuxiliaryFiles]);

  useEffect(() => {
    updatePreviewSceneStyle(previewSceneStyle);
  }, [previewSceneStyle, updatePreviewSceneStyle]);

  useEffect(() => {
    renderOnSaveRef.current = renderOnSave;
  }, [renderOnSave]);

  useEffect(() => {
    manualRenderRef.current = manualRender;
  }, [manualRender]);

  useEffect(() => {
    renderWithTriggerRef.current = renderWithTrigger;
  }, [renderWithTrigger]);

  useEffect(() => {
    renderCodeRef.current = renderCode;
  }, [renderCode]);

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
  const saveFile = useCallback(
    async (promptForPath: boolean = false): Promise<boolean> => {
      try {
        const currentTab = activeTabRef.current;
        const platform = getPlatform();
        const filters = [{ name: 'OpenSCAD Files', extensions: ['scad'] }];

        const store = getProjectStore().getState();
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
        const fileName = savePath.split('/').pop() || savePath;
        markTabSaved(currentTab.id, {
          filePath: savePath,
          name: fileName,
        });
        store.markFileSaved(currentTab.projectPath, currentSource);

        const dockPanel = getDockviewApi()?.getPanel(currentTab.id);
        if (dockPanel) {
          dockPanel.api.setTitle(fileName);
        }

        addRecentFile(savePath);

        // Trigger render on save (only if OpenSCAD is available)
        if (renderOnSaveRef.current) {
          renderOnSaveRef.current();
        }

        analytics.track('file saved', {
          source: promptForPath ? 'save_as' : 'save',
          had_existing_path: Boolean(currentTab.filePath),
          format_on_save: currentSettings.editor.formatOnSave,
          render_after_save: Boolean(renderOnSaveRef.current),
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
    [analytics, markTabSaved]
  );

  const handleStartWithDraft = useCallback(
    (draftOverride?: AiDraft) => {
      if (draftOverride) {
        setDraft(draftOverride);
      }
      hideWelcomeScreen();
      void submitDraft(draftOverride);
    },
    [hideWelcomeScreen, setDraft, submitDraft]
  );

  const handleStartManually = useCallback(() => {
    hideWelcomeScreen();
  }, [hideWelcomeScreen]);

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
    openPanel('editor', 'editor', 'Editor');
  }, []);

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
    async (path: string) => {
      try {
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

        // Initialize project store first so content is available
        void initializeProject(result.path, result.name, result.content);

        const firstTab = tabs[0];
        const shouldReplaceFirstTab =
          showWelcome && tabs.length === 1 && !firstTab.filePath;

        if (shouldReplaceFirstTab) {
          revokeBlobUrl(firstTab.render.previewSrc);
          replaceWelcomeTab({
            filePath: result.path,
            name: result.name,
            projectPath: result.name,
          });
        } else {
          createNewTab(result.path, result.content, result.name);
        }

        hideWelcomeScreen();
        if (result.path) addRecentFile(result.path);
        analytics.track('file opened', {
          source: 'recent',
          has_disk_path: Boolean(result.path),
          reused_existing_tab: false,
          replaced_welcome_tab: shouldReplaceFirstTab,
        });

        if (renderWithTriggerRef.current) {
          setTimeout(() => {
            if (renderWithTriggerRef.current) {
              renderWithTriggerRef.current('file_open');
            }
          }, 100);
        }
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
      createNewTab,
      hideWelcomeScreen,
      initializeProject,
      replaceWelcomeTab,
      showWelcome,
      switchTab,
      tabs,
    ]
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const result = await getPlatform().fileOpen([
        { name: 'OpenSCAD Files', extensions: ['scad'] },
      ]);
      if (!result) return;

      if (result.path) {
        const existingTab = tabs.find((t) => t.filePath === result.path);
        if (existingTab) {
          await switchTab(existingTab.id);
          hideWelcomeScreen();
          analytics.track('file opened', {
            source: 'open',
            has_disk_path: true,
            reused_existing_tab: true,
            replaced_welcome_tab: false,
          });
          return;
        }
      }

      // Initialize project store first so content is available
      void initializeProject(result.path, result.name, result.content);

      const firstTab = tabs[0];
      const shouldReplaceFirstTab =
        showWelcome && tabs.length === 1 && !firstTab.filePath;

      if (shouldReplaceFirstTab) {
        revokeBlobUrl(firstTab.render.previewSrc);
        replaceWelcomeTab({
          filePath: result.path,
          name: result.name,
          projectPath: result.name,
        });
      } else {
        createNewTab(result.path, result.content, result.name);
      }

      hideWelcomeScreen();
      if (result.path) addRecentFile(result.path);
      analytics.track('file opened', {
        source: 'open',
        has_disk_path: Boolean(result.path),
        reused_existing_tab: false,
        replaced_welcome_tab: shouldReplaceFirstTab,
      });

      if (renderWithTriggerRef.current) {
        setTimeout(() => {
          if (renderWithTriggerRef.current) {
            renderWithTriggerRef.current('file_open');
          }
        }, 100);
      }
    } catch (err) {
      notifyError({
        operation: 'open-file',
        error: err,
        fallbackMessage: 'Failed to open file',
        toastId: 'open-file-error',
        logLabel: 'Failed to open file',
      });
    }
  }, [
    analytics,
    createNewTab,
    hideWelcomeScreen,
    initializeProject,
    replaceWelcomeTab,
    showWelcome,
    switchTab,
    tabs,
  ]);

  // Helper function to check for unsaved changes before destructive operations
  // Returns: true if ok to proceed, false if user wants to cancel
  const checkUnsavedChangesRef = useRef<() => Promise<boolean>>();

  checkUnsavedChangesRef.current = async (): Promise<boolean> => {
    const isDirty = getProjectStore().getState().files[activeTabRef.current.projectPath]?.isDirty ?? false;
    if (!isDirty) return true;

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

        createNewTab();
        showWelcomeScreen();
      })
    );

    unlistenFns.push(
      eventBus.on('menu:file:open', async () => {
        try {
          const result = await getPlatform().fileOpen([
            { name: 'OpenSCAD Files', extensions: ['scad'] },
          ]);
          if (!result) return;

          if (result.path) {
            const existingTab = tabsRef.current.find((t) => t.filePath === result.path);
            if (existingTab) {
              await switchTab(existingTab.id);
              hideWelcomeScreen();
              analytics.track('file opened', {
                source: 'menu_open',
                has_disk_path: true,
                reused_existing_tab: true,
                replaced_welcome_tab: false,
              });
              return;
            }
          }

          // Initialize project store first so content is available
          void initializeProject(result.path, result.name, result.content);
          createNewTab(result.path, result.content, result.name);
          hideWelcomeScreen();

          if (result.path) addRecentFile(result.path);
          analytics.track('file opened', {
            source: 'menu_open',
            has_disk_path: Boolean(result.path),
            reused_existing_tab: false,
            replaced_welcome_tab: false,
          });

          if (renderWithTriggerRef.current) {
            setTimeout(() => {
              if (renderWithTriggerRef.current) {
                renderWithTriggerRef.current('file_open');
              }
            }, 100);
          }
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
          const exportBytes = await RenderService.getInstance().exportModel(
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

    return () => {
      unlistenFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, createNewTab, hideWelcomeScreen, initializeProject, showWelcome, showWelcomeScreen, switchTab]);

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

  const activeFileDirty = useProjectStore(
    (s) => s.files[activeTab.projectPath]?.isDirty ?? false
  );
  const anyFileDirty = useProjectStore(
    (s) => Object.values(s.files).some((f) => f.isDirty)
  );

  useEffect(() => {
    const fileName = activeTab.name;
    const dirtyIndicator = activeFileDirty ? '\u2022 ' : '';
    getPlatform().setWindowTitle(`${dirtyIndicator}${fileName} - OpenSCAD Studio`);
  }, [activeTab.name, activeFileDirty]);

  useEffect(() => {
    const platform = getPlatform();
    if ('setDirtyState' in platform) {
      (platform as { setDirtyState: (d: boolean) => void }).setDirtyState(anyFileDirty);
    }
  }, [anyFileDirty]);

  useEffect(() => {
    const unlisten = eventBus.on('render-requested', () => {
      if (manualRenderRef.current) {
        manualRenderRef.current();
      }
    });
    return unlisten;
  }, []);

  useEffect(() => {
    const unlisten = eventBus.on('code-updated', ({ code, source: eventSource }) => {
      const store = getProjectStore().getState();
      const projectPath = activeTabRef.current.projectPath;
      store.updateFileContent(projectPath, code);
      if (eventSource !== 'customizer') {
        store.setCustomizerBase(projectPath, code);
      }
      // Render immediately — don't wait for debounce. Use render target content
      // which may be the same as `code` (if this file is the target) or unchanged.
      const renderContent = store.files[store.renderTargetPath ?? '']?.content ?? code;
      renderCodeRef.current(renderContent, eventSource === 'history' ? 'history_restore' : 'code_update');
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
      tabs,
      activeTabId,
      onTabClick: switchTab,
      onTabClose: closeTab,
      onNewTab: () => createNewTab(),
      onReorderTabs: reorderTabs,
      previewSrc: activePreviewSrc,
      previewKind: activePreviewKind,
      isRendering,
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
      tabs,
      activeTabId,
      switchTab,
      closeTab,
      createNewTab,
      reorderTabs,
      activePreviewSrc,
      activePreviewKind,
      isRendering,
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
        showRecentFiles={capabilities.hasFileSystem}
        currentModel={currentModel}
        availableProviders={availableProviders}
        onModelChange={setCurrentModel}
        onOpenSettings={() => {
          setSettingsInitialTab('ai');
          setShowSettingsDialog(true);
        }}
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
          {isRendering && (
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
            onSetRenderTarget={handleSetRenderTarget}
            onCreateFile={handleCreateFile}
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
        workingDir={workingDir}
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
            svgSourceUrl: activePreviewKind === 'svg' ? activePreviewSrc : null,
            targetWidth: 1200,
            targetHeight: 630,
          })
        }
        stlBlobUrl={activePreviewKind === 'mesh' ? activePreviewSrc : null}
        previewKind={activePreviewKind}
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
