import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { ExportDialog } from './components/ExportDialog';
import type { AiPromptPanelRef } from './components/AiPromptPanel';
import { SettingsDialog, type SettingsSection } from './components/SettingsDialog';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NuxLayoutPicker } from './components/NuxLayoutPicker';
import { TabBar } from './components/TabBar';
import { WebMenuBar } from './components/WebMenuBar';
import { EditableFileName } from './components/EditableFileName';
import { Button, IconButton } from './components/ui';
import { panelComponents, tabComponents, WorkspaceTab } from './components/panels/PanelComponents';
import { useTheme } from './contexts/ThemeContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import type { WorkspaceState } from './contexts/WorkspaceContext';
import { useAnalytics } from './analytics/runtime';
import {
  setDockviewApi,
  getDockviewApi,
  addPresetPanels,
  saveLayout,
  clearSavedLayout,
} from './stores/layoutStore';
import { useOpenScad } from './hooks/useOpenScad';
import { useAiAgent } from './hooks/useAiAgent';
import { useHistory } from './hooks/useHistory';
import { getPlatform, eventBus, type ExportFormat } from './platform';
import { RenderService } from './services/renderService';
import { getPreviewSceneStyle } from './services/previewSceneConfig';
import { useSettings, loadSettings, updateSetting } from './stores/settingsStore';
import {
  selectActiveRender,
  selectActiveTab,
  selectActiveTabId,
  selectShowWelcome,
  selectTabs,
  selectWorkingDirectory,
} from './stores/workspaceSelectors';
import { useWorkspaceStore, getWorkspaceState } from './stores/workspaceStore';
import { formatOpenScadCode } from './utils/formatter';
import { addRecentFile, removeRecentFile } from './utils/recentFiles';
import { normalizeAppError, notifyError, notifySuccess } from './utils/notifications';
import { TbSettings, TbBox, TbRuler2, TbDownload } from 'react-icons/tb';
import { Toaster } from 'sonner';
import type { AiDraft } from './types/aiChat';
import type { WorkspaceTab as WorkspaceDocumentTab } from './stores/workspaceTypes';

const RELEASE_VERSION = '0.9.0';
const RELEASE_BASE = `https://github.com/zacharyfmarion/openscad-studio/releases/download/v${RELEASE_VERSION}`;

type MacArch = 'aarch64' | 'x64';

function isIgnorableRejection(reason: unknown): boolean {
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
    normalized.includes('aborted')
  );
}

function revokeBlobUrl(url: string | null | undefined) {
  if (!url || !url.startsWith('blob:')) {
    return;
  }

  URL.revokeObjectURL(url);
}

function DownloadForMacLink() {
  const [arch, setArch] = useState<MacArch>('aarch64');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const uaData = (
      navigator as unknown as {
        userAgentData?: {
          getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
        };
      }
    ).userAgentData;

    if (uaData?.getHighEntropyValues) {
      uaData.getHighEntropyValues(['architecture']).then((values) => {
        if (values.architecture === 'x86') setArch('x64');
      });
    }
  }, []);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showDropdown]);

  const label = arch === 'aarch64' ? 'Apple Silicon' : 'Intel';
  const otherArch: MacArch = arch === 'aarch64' ? 'x64' : 'aarch64';
  const otherLabel = arch === 'aarch64' ? 'Intel' : 'Apple Silicon';

  const dmgUrl = `${RELEASE_BASE}/OpenSCAD.Studio_${RELEASE_VERSION}_${arch}.dmg`;
  const otherDmgUrl = `${RELEASE_BASE}/OpenSCAD.Studio_${RELEASE_VERSION}_${otherArch}.dmg`;

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <div className="flex items-center">
        <a
          href={dmgUrl}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-l transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          title={`Download for macOS (${label})`}
        >
          <TbDownload size={13} />
          <span>Download for Mac</span>
        </a>
        <button
          type="button"
          onClick={() => setShowDropdown((v) => !v)}
          className="text-xs px-1 py-1 rounded-r transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
          title="Other architectures"
        >
          ▾
        </button>
      </div>
      {showDropdown && (
        <div
          className="absolute right-0 top-full mt-1 rounded-md shadow-lg border text-xs z-50 min-w-[160px]"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-secondary)',
          }}
        >
          <a
            href={dmgUrl}
            className="block px-3 py-2 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => setShowDropdown(false)}
          >
            macOS ({label}) ✓
          </a>
          <a
            href={otherDmgUrl}
            className="block px-3 py-2 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setShowDropdown(false)}
          >
            macOS ({otherLabel})
          </a>
        </div>
      )}
    </div>
  );
}

function App() {
  const [showNux, setShowNux] = useState(() => !loadSettings().ui.hasCompletedNux);
  const tabs = useWorkspaceStore(selectTabs);
  const activeTabId = useWorkspaceStore(selectActiveTabId) ?? '';
  const showWelcome = useWorkspaceStore(selectShowWelcome);
  const activeTab = useWorkspaceStore(selectActiveTab) ?? tabs[0];
  const activeRender = useWorkspaceStore(selectActiveRender) ?? activeTab?.render;
  const workingDir = useWorkspaceStore(selectWorkingDirectory);
  const createTab = useWorkspaceStore((state) => state.createTab);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const updateWorkspaceTabContent = useWorkspaceStore((state) => state.updateTabContent);
  const renameTab = useWorkspaceStore((state) => state.renameTab);
  const markTabSaved = useWorkspaceStore((state) => state.markTabSaved);
  const closeTabLocal = useWorkspaceStore((state) => state.closeTabLocal);
  const replaceWelcomeTab = useWorkspaceStore((state) => state.replaceWelcomeTab);
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
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsSection | undefined>(
    undefined
  );
  const [settings] = useSettings();
  const { theme } = useTheme();
  const previewSceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const { capabilities } = getPlatform();
  const { undo, redo } = useHistory();

  const {
    source,
    updateSource,
    updateSourceAndRender,
    previewKind,
    diagnostics,
    isRendering,
    error,
    ready,
    dimensionMode,
    manualRender,
    renderOnSave,
    renderWithTrigger,
    auxiliaryFiles,
  } = useOpenScad({
    workingDir,
    autoRenderOnIdle: settings.editor.autoRenderOnIdle,
    autoRenderDelayMs: settings.editor.autoRenderDelayMs,
    library: settings.library,
    createRenderOwner: () => {
      const tabId = activeTabRef.current?.id;
      if (!tabId) {
        return null;
      }

      return {
        tabId,
        requestId: beginTabRender(tabId, {
          preferredDimension: activeTabRef.current.render.dimensionMode,
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
  const activePreviewSrc = activeRender?.previewSrc ?? '';
  const activePreviewKind = activeRender?.previewKind ?? previewKind;
  const activeDiagnostics = activeRender?.diagnostics ?? diagnostics;
  const activeError = activeRender?.error ?? error;
  const activeDimensionMode = activeRender?.dimensionMode ?? dimensionMode;

  const handleUndo = useCallback(async () => {
    const checkpoint = await undo();
    if (checkpoint) updateSource(checkpoint.code);
  }, [undo, updateSource]);

  const handleRedo = useCallback(async () => {
    const checkpoint = await redo();
    if (checkpoint) updateSource(checkpoint.code);
  }, [redo, updateSource]);

  const aiPromptPanelRef = useRef<AiPromptPanelRef>(null);
  const analytics = useAnalytics();

  // AI Agent state
  const {
    isStreaming,
    streamingResponse,
    proposedDiff,
    error: aiError,
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
    updateSourceRef,
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
      const defaultContent = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';
      const tabContent = content || defaultContent;
      const newId = createTab({
        filePath: filePath || null,
        name,
        content: tabContent,
      });

      updateSource(tabContent);

      return newId;
    },
    [createTab, updateSource]
  );

  const switchingRef = useRef(false);

  const switchTab = useCallback(
    async (id: string) => {
      if (id === activeTabId || switchingRef.current) return;
      switchingRef.current = true;

      setActiveTab(id);
      const newTab = tabs.find((t) => t.id === id);
      if (newTab) {
        updateSource(newTab.content);
      }

      switchingRef.current = false;
    },
    [activeTabId, setActiveTab, tabs, updateSource]
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;

      if (tab.isDirty) {
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
      }

      const wasActiveTab = id === activeTabId;
      revokeBlobUrl(tab.render.previewSrc);
      closeTabLocal(id);

      if (wasActiveTab) {
        const nextActiveTab = getWorkspaceState().tabs.find(
          (workspaceTab) => workspaceTab.id === getWorkspaceState().activeTabId
        );
        if (nextActiveTab) {
          updateSource(nextActiveTab.content);
        }
      }
    },
    [activeTabId, closeTabLocal, tabs, updateSource]
  );

  const updateTabContent = useCallback(
    (id: string, content: string) => {
      updateWorkspaceTabContent(id, content);
    },
    [updateWorkspaceTabContent]
  );

  const reorderTabs = useCallback(
    (newTabs: WorkspaceDocumentTab[]) => {
      reorderWorkspaceTabs(newTabs.map((tab) => tab.id));
    },
    [reorderWorkspaceTabs]
  );

  // Note: Tree-sitter formatter is initialized in main.tsx for optimal performance

  // Use refs to avoid stale closures in event listeners
  const sourceRef = useRef<string>(source);
  const workingDirRef = useRef<string | null>(workingDir);
  const renderOnSaveRef = useRef(renderOnSave);
  const manualRenderRef = useRef(manualRender);
  const renderWithTriggerRef = useRef(renderWithTrigger);
  const updateSourceAndRenderRef = useRef(updateSourceAndRender);

  // Keep refs in sync with state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    sourceRef.current = source;
    updateSourceRef(source);
  }, [source, updateSourceRef]);

  useEffect(() => {
    updateStlBlobUrl(activePreviewKind === 'mesh' && activePreviewSrc ? activePreviewSrc : null);
  }, [activePreviewKind, activePreviewSrc, updateStlBlobUrl]);
  useEffect(() => {
    updateCapturePreview(async () => {
      // Try to capture the Three.js WebGL canvas (3D preview)
      const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
      if (canvas) {
        try {
          return canvas.toDataURL('image/png');
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[App] Failed to capture 3D canvas:', e);
        }
      }

      const svgElement = document.querySelector('[data-preview-svg] svg') as SVGSVGElement | null;
      if (svgElement) {
        try {
          const serializer = new XMLSerializer();
          const svgString = serializer.serializeToString(svgElement);
          const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth || 800;
              c.height = img.naturalHeight || 600;
              const ctx = c.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
              } else {
                reject(new Error('Could not get 2d context'));
              }
            };
            img.onerror = reject;
            img.src = url;
          });
          URL.revokeObjectURL(url);
          return dataUrl;
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[App] Failed to capture SVG preview:', e);
        }
      }

      return null;
    });
    return () => updateCapturePreview(null);
  }, [updateCapturePreview]);

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
    updateSourceAndRenderRef.current = updateSourceAndRender;
  }, [updateSourceAndRender]);

  // Centralized render-on-tab-change effect
  // This ensures ANY tab switch triggers a render, regardless of how it happened
  const prevActiveTabIdRef = useRef<string | null>(null);
  const tabSwitchRenderTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip initial mount - only render on actual tab changes
    if (prevActiveTabIdRef.current === null) {
      prevActiveTabIdRef.current = activeTabId;
      return;
    }

    // Skip if switching to welcome screen
    if (showWelcome) {
      prevActiveTabIdRef.current = activeTabId;
      return;
    }

    // Only render if tab actually changed
    if (prevActiveTabIdRef.current !== activeTabId) {
      // Clear any pending render
      if (tabSwitchRenderTimerRef.current) {
        clearTimeout(tabSwitchRenderTimerRef.current);
      }

      // Debounced render - handles rapid tab switching gracefully
      tabSwitchRenderTimerRef.current = window.setTimeout(() => {
        if (renderWithTriggerRef.current) {
          const currentTab = tabs.find((t) => t.id === activeTabId);
          if (import.meta.env.DEV)
            console.log('[App] Auto-rendering after tab change to:', currentTab?.name);
          renderWithTriggerRef.current('tab_switch');
        }
        tabSwitchRenderTimerRef.current = null;
      }, 150);

      prevActiveTabIdRef.current = activeTabId;
    }

    // Cleanup timer on unmount or tab change
    return () => {
      if (tabSwitchRenderTimerRef.current) {
        clearTimeout(tabSwitchRenderTimerRef.current);
      }
    };
  }, [activeTabId, showWelcome, tabs]);

  // Sync active tab content with editor source
  useEffect(() => {
    if (activeTab && source !== activeTab.content) {
      updateTabContent(activeTabId, source);
    }
  }, [source, activeTab, activeTabId, updateTabContent]);

  // Helper function to save file to current path or prompt for new path
  const saveFile = useCallback(
    async (promptForPath: boolean = false): Promise<boolean> => {
      try {
        const currentTab = activeTabRef.current;
        const platform = getPlatform();
        const filters = [{ name: 'OpenSCAD Files', extensions: ['scad'] }];

        let currentSource = sourceRef.current;

        const currentSettings = loadSettings();
        if (currentSettings.editor.formatOnSave) {
          try {
            currentSource = await formatOpenScadCode(currentSource, {
              indentSize: currentSettings.editor.indentSize,
              useTabs: currentSettings.editor.useTabs,
            });
            updateSource(currentSource);
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
          savedContent: currentSource,
        });

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
    [analytics, markTabSaved, updateSource]
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
    (preset: 'default' | 'ai-first') => {
      updateSetting('ui', { hasCompletedNux: true, defaultLayoutPreset: preset });
      setShowNux(false);
      analytics.track('workspace layout selected', {
        preset,
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

        const firstTab = tabs[0];
        const shouldReplaceFirstTab =
          showWelcome && tabs.length === 1 && !firstTab.filePath && !firstTab.isDirty;

        if (shouldReplaceFirstTab) {
          revokeBlobUrl(firstTab.render.previewSrc);
          replaceWelcomeTab({
            filePath: result.path,
            name: result.name,
            content: result.content,
          });
          updateSource(result.content);
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
      replaceWelcomeTab,
      showWelcome,
      switchTab,
      tabs,
      updateSource,
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

      const firstTab = tabs[0];
      const shouldReplaceFirstTab =
        showWelcome && tabs.length === 1 && !firstTab.filePath && !firstTab.isDirty;

      if (shouldReplaceFirstTab) {
        revokeBlobUrl(firstTab.render.previewSrc);
        replaceWelcomeTab({
          filePath: result.path,
          name: result.name,
          content: result.content,
        });
        updateSource(result.content);
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
    replaceWelcomeTab,
    showWelcome,
    switchTab,
    tabs,
    updateSource,
  ]);

  // Helper function to check for unsaved changes before destructive operations
  // Returns: true if ok to proceed, false if user wants to cancel
  const checkUnsavedChangesRef = useRef<() => Promise<boolean>>();

  checkUnsavedChangesRef.current = async (): Promise<boolean> => {
    if (!activeTabRef.current.isDirty) return true;

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
          const exportBytes = await RenderService.getInstance().exportModel(
            sourceRef.current,
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
  }, [analytics, createNewTab, hideWelcomeScreen, showWelcome, showWelcomeScreen, switchTab]);

  useEffect(() => {
    const platform = getPlatform();
    const unlisten = platform.onCloseRequested(async () => {
      const anyDirty = tabsRef.current.some((t) => t.isDirty);
      if (!anyDirty) return true;
      return checkUnsavedChangesRef.current ? await checkUnsavedChangesRef.current() : true;
    });

    return () => {
      unlisten();
    };
  }, []);

  useEffect(() => {
    const fileName = activeTab.name;
    const dirtyIndicator = activeTab.isDirty ? '\u2022 ' : '';
    getPlatform().setWindowTitle(`${dirtyIndicator}${fileName} - OpenSCAD Studio`);
  }, [activeTab]);

  useEffect(() => {
    const platform = getPlatform();
    if ('setDirtyState' in platform) {
      (platform as { setDirtyState: (d: boolean) => void }).setDirtyState(
        tabs.some((t) => t.isDirty)
      );
    }
  }, [tabs]);

  useEffect(() => {
    const unlisten = eventBus.on('render-requested', () => {
      if (manualRenderRef.current) {
        manualRenderRef.current();
      }
    });
    return unlisten;
  }, []);

  useEffect(() => {
    const unlisten = eventBus.on('history:restore', ({ code }) => {
      updateSourceAndRenderRef.current(code, 'history_restore');
      updateWorkspaceTabContent(activeTabId, code);
    });
    return unlisten;
  }, [activeTabId, updateWorkspaceTabContent]);

  useEffect(() => {
    const unlisten = eventBus.on('code-updated', ({ code }) => {
      updateSourceAndRenderRef.current(code, 'code_update');
      updateWorkspaceTabContent(activeTabId, code);
    });
    return unlisten;
  }, [activeTabId, updateWorkspaceTabContent]);

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
        error: aiError,
        fallbackMessage: 'AI request failed',
        toastId: 'ai-stream-error',
      });
      clearAiError();
    }
  }, [aiError, clearAiError]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      notifyError({
        operation: 'unexpected-runtime-error',
        error: event.error ?? event.message,
        fallbackMessage: 'Something went wrong in the app',
        toastId: 'unexpected-runtime-error',
        logLabel: '[App] Unhandled window error',
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isIgnorableRejection(event.reason)) {
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

  const onDockviewReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;
    setDockviewApi(api);

    clearSavedLayout();
    const savedPreset = loadSettings().ui.defaultLayoutPreset;
    addPresetPanels(api, savedPreset);

    let timer: ReturnType<typeof setTimeout> | null = null;
    api.onDidLayoutChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveLayout();
      }, 300);
    });
  }, []);

  const workspaceState: WorkspaceState = useMemo(
    () => ({
      source,
      updateSource,
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
    }),
    [
      source,
      updateSource,
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
      cancelStream,
      acceptDiff,
      rejectDiff,
      clearAiError,
      newConversation,
      setCurrentModel,
      handleRestoreCheckpoint,
    ]
  );

  const content = showWelcome ? (
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
      <NuxLayoutPicker isOpen={showNux} onSelect={handleNuxSelect} />
    </div>
  ) : (
    <div
      className="h-screen flex flex-col"
      data-testid="app-container"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <header
        className={`flex items-center gap-1.5 shrink-0 ${capabilities.multiFile ? '' : 'py-1'}`}
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {!capabilities.hasNativeMenu && (
          <WebMenuBar
            onExport={() => setShowExportDialog(true)}
            onSettings={() => setShowSettingsDialog(true)}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        )}

        <div className="flex-1 min-w-0 overflow-hidden">
          {capabilities.multiFile ? (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={switchTab}
              onTabClose={closeTab}
              onNewTab={() => createNewTab()}
              onReorderTabs={reorderTabs}
            />
          ) : (
            <EditableFileName
              name={activeTab.name}
              isDirty={activeTab.isDirty}
              onRename={(newName) => {
                renameTab(activeTabId, newName);
              }}
            />
          )}
        </div>

        {!capabilities.hasNativeMenu && <DownloadForMacLink />}

        <div className="flex items-center gap-1.5 px-3 shrink-0">
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

          <div
            data-testid="dimension-mode"
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-secondary)',
            }}
          >
            {activeDimensionMode === '2d' ? (
              <>
                <TbRuler2 size={12} />
                <span className="font-medium">2D</span>
              </>
            ) : (
              <>
                <TbBox size={12} />
                <span className="font-medium">3D</span>
              </>
            )}
          </div>

          <div
            style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-secondary)' }}
          />

          <Button
            data-testid="render-button"
            variant="primary"
            onClick={manualRender}
            disabled={isRendering || !ready}
            className="text-xs px-2 py-1"
          >
            Render (⌘↵)
          </Button>
          <Button
            data-testid="export-button"
            variant="secondary"
            onClick={() => setShowExportDialog(true)}
            disabled={isRendering || !ready}
            className="text-xs px-2 py-1"
          >
            Export
          </Button>

          <div
            style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-secondary)' }}
          />

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

      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        source={source}
        workingDir={workingDir}
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
    <>
      {content}
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
    </>
  );
}

export default App;
