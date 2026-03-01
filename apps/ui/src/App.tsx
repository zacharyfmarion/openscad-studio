import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { ExportDialog } from './components/ExportDialog';
import type { AiPromptPanelRef } from './components/AiPromptPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NuxLayoutPicker } from './components/NuxLayoutPicker';
import { TabBar } from './components/TabBar';
import { WebMenuBar } from './components/WebMenuBar';
import { EditableFileName } from './components/EditableFileName';
import { Button } from './components/ui';
import { panelComponents, tabComponents, WorkspaceTab } from './components/panels/PanelComponents';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import type { WorkspaceState } from './contexts/WorkspaceContext';
import {
  setDockviewApi,
  getDockviewApi,
  addPresetPanels,
  saveLayout,
  clearSavedLayout,
} from './stores/layoutStore';
import { useTabStore } from './stores/tabStore';
import { useEditorStore } from './stores/editorStore';
import { useUiStore } from './stores/uiStore';
import { useOpenScad } from './hooks/useOpenScad';
import { useLibraryFiles } from './hooks/useLibraryFiles';
import { useAiAgent } from './hooks/useAiAgent';
import { useHistory } from './hooks/useHistory';
import { useFileManager } from './hooks/useFileManager';
import { useMenuListeners } from './hooks/useMenuListeners';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { getPlatform } from './platform';
import { useSettings, loadSettings, updateSetting } from './stores/settingsStore';
import { TbSettings, TbBox, TbRuler2, TbDownload } from 'react-icons/tb';
import { Toaster, toast } from 'sonner';

const RELEASE_VERSION = '0.7.1';
const RELEASE_BASE = `https://github.com/zacharyfmarion/openscad-studio/releases/download/v${RELEASE_VERSION}`;

type MacArch = 'aarch64' | 'x64';

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
  const { tabs, activeTabId, createTab, switchTab, closeTab, reorderTabs } = useTabStore();
  const activeTab = useTabStore((s) => s.getActiveTab());

  const { showWelcome, showNux, showExportDialog, showSettingsDialog, settingsInitialTab } =
    useUiStore();
  const { setShowNux, openExportDialog, closeExportDialog, openSettings, closeSettings } =
    useUiStore();

  const workingDir =
    activeTab?.filePath && typeof activeTab.filePath === 'string'
      ? activeTab.filePath.substring(0, activeTab.filePath.lastIndexOf('/'))
      : null;

  const [settings] = useSettings();
  const { capabilities } = getPlatform();
  const { undo, redo } = useHistory();

  const {
    libraryFiles,
    libraryFilesRef,
    reloadLibraryFiles,
  } = useLibraryFiles();

  const {
    source,
    updateSource,
    updateSourceAndRender,
    previewSrc,
    previewKind,
    diagnostics,
    isRendering,
    error,
    ready,
    dimensionMode,
    manualRender,
    renderOnSave,
    auxiliaryFiles,
  } = useOpenScad({
    workingDir,
    libraryFiles,
    autoRenderOnIdle: settings.editor.autoRenderOnIdle,
    autoRenderDelayMs: settings.editor.autoRenderDelayMs,
  });

  const handleUndo = useCallback(async () => {
    const checkpoint = await undo();
    if (checkpoint) updateSource(checkpoint.code);
  }, [undo, updateSource]);

  const handleRedo = useCallback(async () => {
    const checkpoint = await redo();
    if (checkpoint) updateSource(checkpoint.code);
  }, [redo, updateSource]);

  const aiPromptPanelRef = useRef<AiPromptPanelRef>(null);

  // AI Agent state
  const {
    isStreaming,
    streamingResponse,
    proposedDiff,
    error: aiError,
    isApplyingDiff,
    messages,
    currentToolCalls,
    currentModel,
    availableProviders,
    submitPrompt,
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
    updateAuxiliaryFiles,
    loadModelAndProviders,
  } = useAiAgent();

  const {
    saveFile,
    handleOpenFile,
    handleOpenRecent,
    handleStartWithPrompt,
    handleStartManually,
    checkUnsavedChanges,
  } = useFileManager();

  const getMergedAuxiliaryFiles = useCallback(() => {
    const workingDirFiles = auxiliaryFiles || {};
    const libFiles = libraryFilesRef.current || {};
    if (Object.keys(workingDirFiles).length === 0 && Object.keys(libFiles).length === 0) {
      return undefined;
    }
    // Working dir files override library files
    return { ...libFiles, ...workingDirFiles };
  }, [auxiliaryFiles, libraryFilesRef]);

  useMenuListeners({ checkUnsavedChanges, saveFile, getAuxiliaryFiles: getMergedAuxiliaryFiles });
  useKeyboardShortcuts({ aiPromptPanelRef });

  useEffect(() => {
    useEditorStore.getState().syncFromOpenScad({
      source,
      previewSrc,
      previewKind,
      diagnostics,
      isRendering,
      error,
      ready,
      dimensionMode,
      auxiliaryFiles,
    });
  }, [
    source,
    previewSrc,
    previewKind,
    diagnostics,
    isRendering,
    error,
    ready,
    dimensionMode,
    auxiliaryFiles,
  ]);

  useEffect(() => {
    useEditorStore.getState().setRenderCallbacks({
      manualRender,
      renderOnSave,
      updateSource,
      updateSourceAndRender,
    });
  }, [manualRender, renderOnSave, updateSource, updateSourceAndRender]);

  useEffect(() => {
    useUiStore.getState().setShowNux(!loadSettings().ui.hasCompletedNux);
  }, []);

  useEffect(() => {
    updateSourceRef(source);
  }, [source, updateSourceRef]);

  useEffect(() => {
    updateStlBlobUrl(previewKind === 'mesh' && previewSrc ? previewSrc : null);
  }, [previewSrc, previewKind, updateStlBlobUrl]);

  useEffect(() => {
    updateCapturePreview(async () => {
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
    updateWorkingDir(workingDir);
  }, [workingDir, updateWorkingDir]);

  useEffect(() => {
    updateAuxiliaryFiles(auxiliaryFiles);
  }, [auxiliaryFiles, updateAuxiliaryFiles]);

  const prevActiveTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevActiveTabIdRef.current === null) {
      prevActiveTabIdRef.current = activeTabId;
      return;
    }
    if (prevActiveTabIdRef.current !== activeTabId) {
      prevActiveTabIdRef.current = activeTabId;
      const newTab = useTabStore.getState().getActiveTab();
      if (newTab) {
        updateSourceAndRender(newTab.content);
      }
      if (!showWelcome) {
        const timer = window.setTimeout(() => {
          manualRender();
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [activeTabId, showWelcome, manualRender, updateSourceAndRender]);

  useEffect(() => {
    if (tabs.length === 0) {
      useUiStore.getState().setShowWelcome(true);
      useTabStore.getState().resetToDefault();
    }
  }, [tabs.length]);

  const prevSourceRef = useRef(source);
  useEffect(() => {
    if (source !== prevSourceRef.current) {
      prevSourceRef.current = source;
      useTabStore.getState().updateTabContent(activeTabId, source);
    }
  }, [source, activeTabId]);

  const handleNuxSelect = useCallback(
    (preset: 'default' | 'ai-first') => {
      updateSetting('ui', { hasCompletedNux: true, defaultLayoutPreset: preset });
      setShowNux(false);

      const api = getDockviewApi();
      if (api) {
        api.clear();
        addPresetPanels(api, preset);
        saveLayout();
      }
    },
    [setShowNux]
  );

  useEffect(() => {
    if (aiError) {
      toast.error(aiError, { duration: Infinity, dismissible: true });
      clearAiError();
    }
  }, [aiError, clearAiError]);

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
      diagnostics,
      onManualRender: manualRender,
      settings,
      tabs,
      activeTabId,
      onTabClick: switchTab,
      onTabClose: closeTab,
      onNewTab: () => createTab(),
      onReorderTabs: reorderTabs,
      previewSrc,
      previewKind,
      isRendering,
      error,
      isStreaming,
      streamingResponse,
      proposedDiff,
      aiError,
      isApplyingDiff,
      messages,
      currentToolCalls,
      currentModel,
      availableProviders,
      submitPrompt,
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
        useUiStore.getState().openSettings('ai');
      },
    }),
    [
      source,
      updateSource,
      diagnostics,
      manualRender,
      settings,
      tabs,
      activeTabId,
      switchTab,
      closeTab,
      createTab,
      reorderTabs,
      previewSrc,
      previewKind,
      isRendering,
      error,
      isStreaming,
      streamingResponse,
      proposedDiff,
      aiError,
      isApplyingDiff,
      messages,
      currentToolCalls,
      currentModel,
      availableProviders,
      submitPrompt,
      cancelStream,
      acceptDiff,
      rejectDiff,
      clearAiError,
      newConversation,
      setCurrentModel,
      handleRestoreCheckpoint,
    ]
  );

  // Show welcome screen if no file is open and welcome hasn't been dismissed
  if (showWelcome) {
    return (
      <div className="h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <WelcomeScreen
          onStartWithPrompt={(prompt) => handleStartWithPrompt(prompt, submitPrompt)}
          onStartManually={handleStartManually}
          onOpenRecent={handleOpenRecent}
          onOpenFile={handleOpenFile}
          showRecentFiles={capabilities.hasFileSystem}
          onOpenSettings={() => {
            openSettings('ai');
          }}
        />
        <SettingsDialog
          isOpen={showSettingsDialog}
          onClose={() => {
            closeSettings();
            loadModelAndProviders();
            reloadLibraryFiles();
          }}
          initialTab={settingsInitialTab}
        />
        <NuxLayoutPicker isOpen={showNux} onSelect={handleNuxSelect} />
      </div>
    );
  }

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <header
        className={`flex items-center gap-1.5 shrink-0 ${capabilities.multiFile ? '' : 'py-1'}`}
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Web menu bar (web only — no native menu) */}
        {!capabilities.hasNativeMenu && (
          <WebMenuBar
            onExport={openExportDialog}
            onSettings={openSettings}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        )}

        {/* Tab bar (multi-file / Tauri) or filename label (single-file / web) */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {capabilities.multiFile ? (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={switchTab}
              onTabClose={closeTab}
              onNewTab={() => createTab()}
              onReorderTabs={reorderTabs}
            />
          ) : (
            <EditableFileName
              name={activeTab.name}
              isDirty={activeTab.isDirty}
              onRename={(newName) => {
                useTabStore.getState().renameTab(activeTabId, newName);
              }}
            />
          )}
        </div>

        {!capabilities.hasNativeMenu && <DownloadForMacLink />}

        <div className="flex items-center gap-1.5 px-3 shrink-0">
          {isRendering && (
            <div
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
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-secondary)',
            }}
          >
            {dimensionMode === '2d' ? (
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
            variant="primary"
            onClick={manualRender}
            disabled={isRendering || !ready}
            className="text-xs px-2 py-1"
          >
            Render (⌘↵)
          </Button>
          <Button
            variant="secondary"
            onClick={openExportDialog}
            disabled={isRendering || !ready}
            className="text-xs px-2 py-1"
          >
            Export
          </Button>

          <div
            style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-secondary)' }}
          />

          <button
            type="button"
            onClick={() => openSettings()}
            className="p-1 rounded-md transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
            }}
            title="Settings (⌘,)"
          >
            <TbSettings size={16} />
          </button>
        </div>
      </header>

      {/* Main content with dockview */}
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

      {/* Export dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={closeExportDialog}
        source={source}
        workingDir={workingDir}
        auxiliaryFiles={getMergedAuxiliaryFiles()}
      />

      {/* Settings dialog */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => {
          closeSettings();
          loadModelAndProviders();
          reloadLibraryFiles();
        }}
        initialTab={settingsInitialTab}
      />

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
    </div>
  );
}

export default App;
