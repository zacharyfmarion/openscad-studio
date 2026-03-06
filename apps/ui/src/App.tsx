import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { ExportDialog } from './components/ExportDialog';
import type { AiPromptPanelRef } from './components/AiPromptPanel';
import { SettingsDialog, type SettingsSection } from './components/SettingsDialog';
import { WelcomeScreen, addToRecentFiles } from './components/WelcomeScreen';
import { NuxLayoutPicker } from './components/NuxLayoutPicker';
import { TabBar, type Tab } from './components/TabBar';
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
import { useOpenScad } from './hooks/useOpenScad';
import { useAiAgent } from './hooks/useAiAgent';
import { useHistory } from './hooks/useHistory';
import { getPlatform, eventBus, type ExportFormat } from './platform';
import { RenderService } from './services/renderService';
import { useSettings, loadSettings, updateSetting } from './stores/settingsStore';
import { formatOpenScadCode } from './utils/formatter';
import { TbSettings, TbBox, TbRuler2, TbDownload } from 'react-icons/tb';
import { Toaster, toast } from 'sonner';

// Helper to generate unique IDs for tabs
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Helper to generate unique untitled names
function generateUntitledName(): string {
  return `Untitled`;
}

const RELEASE_VERSION = '0.8.0';
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
  // Tab state
  const initialTab: Tab = {
    id: generateId(),
    filePath: null,
    name: generateUntitledName(),
    content: '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
    savedContent: '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
    isDirty: false,
  };
  const [tabs, setTabs] = useState<Tab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showNux, setShowNux] = useState(() => !loadSettings().ui.hasCompletedNux);

  // Computed active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Get working directory from active tab's file path (for resolving relative imports)
  const workingDir =
    activeTab?.filePath && typeof activeTab.filePath === 'string'
      ? activeTab.filePath.substring(0, activeTab.filePath.lastIndexOf('/'))
      : null;

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsSection | undefined>(
    undefined
  );
  const [settings] = useSettings();
  const { capabilities } = getPlatform();
  const { undo, redo } = useHistory();

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
    autoRenderOnIdle: settings.editor.autoRenderOnIdle,
    autoRenderDelayMs: settings.editor.autoRenderDelayMs,
    library: settings.library,
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

  // Tab management functions
  const createNewTab = useCallback(
    (filePath?: string | null, content?: string, name?: string): string => {
      const newId = generateId();
      const defaultContent = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';
      const tabContent = content || defaultContent;
      const tabName = name || generateUntitledName();
      const newTab: Tab = {
        id: newId,
        filePath: filePath || null,
        name: tabName,
        content: tabContent,
        savedContent: tabContent,
        isDirty: false,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);

      updateSource(tabContent);

      return newId;
    },
    [updateSource]
  );

  const switchingRef = useRef(false);

  const switchTab = useCallback(
    async (id: string) => {
      if (id === activeTabId || switchingRef.current) return;
      switchingRef.current = true;

      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId
            ? { ...tab, previewSrc, previewKind, diagnostics, dimensionMode, content: source }
            : tab
        )
      );

      setActiveTabId(id);
      const newTab = tabs.find((t) => t.id === id);
      if (newTab) {
        updateSource(newTab.content);
      }

      switchingRef.current = false;
    },
    [activeTabId, tabs, previewSrc, previewKind, diagnostics, dimensionMode, source, updateSource]
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

      const filtered = tabs.filter((t) => t.id !== id);

      if (filtered.length === 0) {
        setShowWelcome(true);
        const newId = generateId();
        const tabName = generateUntitledName();
        const newTab: Tab = {
          id: newId,
          filePath: null,
          name: tabName,
          content: '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
          savedContent: '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
          isDirty: false,
        };
        setTabs([newTab]);
        setActiveTabId(newId);
        updateSource(newTab.content);
        return;
      }

      if (id === activeTabId) {
        const idx = tabs.findIndex((t) => t.id === id);
        const newActiveTab = filtered[Math.max(0, idx - 1)];
        setTabs(filtered);
        setActiveTabId(newActiveTab.id);
        updateSource(newActiveTab.content);
      } else {
        setTabs(filtered);
      }
    },
    [tabs, activeTabId, updateSource]
  );

  const updateTabContent = useCallback((id: string, content: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, content, isDirty: content !== tab.savedContent } : tab
      )
    );
  }, []);

  const reorderTabs = useCallback((newTabs: Tab[]) => {
    setTabs(newTabs);
  }, []);

  // Note: Tree-sitter formatter is initialized in main.tsx for optimal performance

  // Use refs to avoid stale closures in event listeners
  const activeTabRef = useRef<Tab>(activeTab);
  const tabsRef = useRef<Tab[]>(tabs);
  const sourceRef = useRef<string>(source);
  const workingDirRef = useRef<string | null>(workingDir);
  const renderOnSaveRef = useRef(renderOnSave);
  const manualRenderRef = useRef(manualRender);
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
    updateStlBlobUrl(previewKind === 'mesh' && previewSrc ? previewSrc : null);
  }, [previewSrc, previewKind, updateStlBlobUrl]);
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
    updateAuxiliaryFiles(auxiliaryFiles);
  }, [auxiliaryFiles, updateAuxiliaryFiles]);

  useEffect(() => {
    renderOnSaveRef.current = renderOnSave;
  }, [renderOnSave]);

  useEffect(() => {
    manualRenderRef.current = manualRender;
  }, [manualRender]);

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
        if (manualRenderRef.current) {
          const currentTab = tabs.find((t) => t.id === activeTabId);
          if (import.meta.env.DEV)
            console.log('[App] Auto-rendering after tab change to:', currentTab?.name);
          manualRenderRef.current();
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

        const fileName = savePath.split('/').pop() || savePath;
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === currentTab.id
              ? {
                  ...tab,
                  filePath: savePath,
                  name: fileName,
                  savedContent: currentSource,
                  isDirty: false,
                }
              : tab
          )
        );

        const dockPanel = getDockviewApi()?.getPanel(currentTab.id);
        if (dockPanel) {
          dockPanel.api.setTitle(fileName);
        }

        addToRecentFiles(savePath);

        // Trigger render on save (only if OpenSCAD is available)
        if (renderOnSaveRef.current) {
          renderOnSaveRef.current();
        }

        return true;
      } catch (err) {
        console.error('[saveFile] Save failed:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to save file: ${errorMsg}`);
        return false;
      }
    },
    [updateSource]
  );

  // Handle starting with AI prompt from welcome screen
  const handleStartWithPrompt = useCallback(
    (prompt: string) => {
      setShowWelcome(false);
      // Submit prompt after a small delay to ensure UI is ready
      setTimeout(() => {
        submitPrompt(prompt);
      }, 100);
    },
    [submitPrompt]
  );

  const handleStartManually = useCallback(() => {
    setShowWelcome(false);
  }, []);

  const handleNuxSelect = useCallback((preset: 'default' | 'ai-first') => {
    updateSetting('ui', { hasCompletedNux: true, defaultLayoutPreset: preset });
    setShowNux(false);

    const api = getDockviewApi();
    if (api) {
      api.clear();
      addPresetPanels(api, preset);
      saveLayout();
    }
  }, []);

  const handleOpenRecent = useCallback(
    async (path: string) => {
      try {
        const existingTab = tabs.find((t) => t.filePath === path);
        if (existingTab) {
          await switchTab(existingTab.id);
          setShowWelcome(false);
          return;
        }

        // On web, recent files won't have real paths — this is a Tauri-only feature
        // but we keep the interface for compatibility
        const platform = getPlatform();
        if (!platform.capabilities.hasFileSystem) {
          toast.error('Cannot open recent files in web mode');
          return;
        }

        const result = await platform.fileRead(path);
        if (!result) return;

        const firstTab = tabs[0];
        const shouldReplaceFirstTab =
          showWelcome && tabs.length === 1 && !firstTab.filePath && !firstTab.isDirty;

        if (shouldReplaceFirstTab) {
          setTabs([
            {
              ...firstTab,
              filePath: result.path,
              name: result.name,
              content: result.content,
              savedContent: result.content,
              isDirty: false,
            },
          ]);
          updateSource(result.content);
        } else {
          createNewTab(result.path, result.content, result.name);
        }

        setShowWelcome(false);
        if (result.path) addToRecentFiles(result.path);

        if (manualRenderRef.current) {
          setTimeout(() => {
            if (manualRenderRef.current) {
              manualRenderRef.current();
            }
          }, 100);
        }
      } catch (err) {
        console.error('Failed to open recent file:', err);
        toast.error(`Failed to open file: ${err}`);
      }
    },
    [tabs, showWelcome, switchTab, createNewTab, updateSource]
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
          setShowWelcome(false);
          return;
        }
      }

      const firstTab = tabs[0];
      const shouldReplaceFirstTab =
        showWelcome && tabs.length === 1 && !firstTab.filePath && !firstTab.isDirty;

      if (shouldReplaceFirstTab) {
        setTabs([
          {
            ...firstTab,
            filePath: result.path,
            name: result.name,
            content: result.content,
            savedContent: result.content,
            isDirty: false,
          },
        ]);
        updateSource(result.content);
      } else {
        createNewTab(result.path, result.content, result.name);
      }

      setShowWelcome(false);
      if (result.path) addToRecentFiles(result.path);

      if (manualRenderRef.current) {
        setTimeout(() => {
          if (manualRenderRef.current) {
            manualRenderRef.current();
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      toast.error(`Failed to open file: ${err}`);
    }
  }, [tabs, showWelcome, switchTab, createNewTab, updateSource]);

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
        setShowWelcome(true);
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
              setShowWelcome(false);
              return;
            }
          }

          createNewTab(result.path, result.content, result.name);
          setShowWelcome(false);

          if (result.path) addToRecentFiles(result.path);

          if (manualRenderRef.current) {
            setTimeout(() => {
              if (manualRenderRef.current) {
                manualRenderRef.current();
              }
            }, 100);
          }
        } catch (err) {
          console.error('Open failed:', err);
          toast.error(`Failed to open file: ${err}`);
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
          toast.success('Exported successfully');
        } catch (err) {
          console.error('Export failed:', err);
          toast.error(`Export failed: ${err}`);
        }
      })
    );

    return () => {
      unlistenFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      updateSourceAndRenderRef.current(code);
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId
            ? { ...tab, content: code, isDirty: code !== tab.savedContent }
            : tab
        )
      );
    });
    return unlisten;
  }, [activeTabId]);

  useEffect(() => {
    const unlisten = eventBus.on('code-updated', ({ code }) => {
      updateSourceAndRenderRef.current(code);
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId
            ? { ...tab, content: code, isDirty: code !== tab.savedContent }
            : tab
        )
      );
    });
    return unlisten;
  }, [activeTabId]);

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
      onNewTab: () => createNewTab(),
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
        setSettingsInitialTab('ai');
        setShowSettingsDialog(true);
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
      createNewTab,
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
      <div
        className="h-screen"
        data-testid="welcome-container"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <WelcomeScreen
          onStartWithPrompt={handleStartWithPrompt}
          onStartManually={handleStartManually}
          onOpenRecent={handleOpenRecent}
          onOpenFile={handleOpenFile}
          showRecentFiles={capabilities.hasFileSystem}
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
    );
  }

  return (
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
        {/* Web menu bar (web only — no native menu) */}
        {!capabilities.hasNativeMenu && (
          <WebMenuBar
            onExport={() => setShowExportDialog(true)}
            onSettings={() => setShowSettingsDialog(true)}
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
              onNewTab={() => createNewTab()}
              onReorderTabs={reorderTabs}
            />
          ) : (
            <EditableFileName
              name={activeTab.name}
              isDirty={activeTab.isDirty}
              onRename={(newName) => {
                setTabs((prev) =>
                  prev.map((tab) => (tab.id === activeTabId ? { ...tab, name: newName } : tab))
                );
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

          <button
            data-testid="settings-button"
            type="button"
            onClick={() => setShowSettingsDialog(true)}
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
        onClose={() => setShowExportDialog(false)}
        source={source}
        workingDir={workingDir}
      />

      {/* Settings dialog */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => {
          setShowSettingsDialog(false);
          setSettingsInitialTab(undefined);
          loadModelAndProviders();
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
