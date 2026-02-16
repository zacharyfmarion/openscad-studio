import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { ExportDialog } from './components/ExportDialog';
import type { AiPromptPanelRef } from './components/AiPromptPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { WelcomeScreen, addToRecentFiles } from './components/WelcomeScreen';
import { OpenScadSetupScreen } from './components/OpenScadSetupScreen';
import type { Tab } from './components/TabBar';
import { Button } from './components/ui';
import { panelComponents, tabComponents, WorkspaceTab } from './components/panels/PanelComponents';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import type { WorkspaceState } from './contexts/WorkspaceContext';
import {
  setDockviewApi, getDockviewApi, applyDefaultLayout, saveLayout, clearSavedLayout,
} from './stores/layoutStore';
import { useOpenScad } from './hooks/useOpenScad';
import { useAiAgent } from './hooks/useAiAgent';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { renderExact, type ExportFormat, updateEditorState, updateWorkingDir } from './api/tauri';
import { loadSettings, type Settings } from './stores/settingsStore';
import { formatOpenScadCode } from './utils/formatter';
import { TbSettings, TbBox, TbRuler2 } from 'react-icons/tb';

// Helper to generate unique IDs for tabs
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Helper to generate unique untitled names
function generateUntitledName(): string {
  return `Untitled`;
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
  const [showSetupScreen, setShowSetupScreen] = useState(false);
  const [setupScreenDismissed, setSetupScreenDismissed] = useState(false);

  // Computed active tab
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Get working directory from active tab's file path (for resolving relative imports)
  const workingDir = activeTab?.filePath && typeof activeTab.filePath === 'string'
    ? activeTab.filePath.substring(0, activeTab.filePath.lastIndexOf('/'))
    : null;

  const {
    source,
    updateSource,
    previewSrc,
    previewKind,
    diagnostics,
    isRendering,
    error,
    openscadPath,
    dimensionMode,
    manualRender,
    renderOnSave,
  } = useOpenScad(workingDir);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings());
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
  } = useAiAgent();


  // Tab management functions
  const createNewTab = useCallback((filePath?: string | null, content?: string, name?: string): string => {
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
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);

    updateSource(tabContent);

    updateEditorState(tabContent).catch(err => {
      console.error('Failed to update editor state:', err);
    });

    return newId;
  }, [updateSource]);

  const switchingRef = useRef(false);

  const switchTab = useCallback(async (id: string) => {
    if (id === activeTabId || switchingRef.current) return;
    switchingRef.current = true;

    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, previewSrc, previewKind, diagnostics, dimensionMode, content: source }
        : tab
    ));

    setActiveTabId(id);
    const newTab = tabs.find(t => t.id === id);
    if (newTab) {
      updateSource(newTab.content);

      try {
        await updateEditorState(newTab.content);
      } catch (err) {
        console.error('Failed to update editor state:', err);
      }
    }

    switchingRef.current = false;
  }, [activeTabId, tabs, previewSrc, previewKind, diagnostics, dimensionMode, source, updateSource]);

  const closeTab = useCallback(async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isDirty) {
      const { ask, confirm } = await import('@tauri-apps/plugin-dialog');
      const wantsToSave = await ask(
        `Save changes to ${tab.name}?`,
        {
          title: 'Unsaved Changes',
          kind: 'warning',
          okLabel: 'Save',
          cancelLabel: "Don't Save",
        }
      );

      if (wantsToSave) {
        return;
      } else {
        const confirmDiscard = await confirm(
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

    const filtered = tabs.filter(t => t.id !== id);

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
      const idx = tabs.findIndex(t => t.id === id);
      const newActiveTab = filtered[Math.max(0, idx - 1)];
      setTabs(filtered);
      setActiveTabId(newActiveTab.id);
      updateSource(newActiveTab.content);

      try {
        await updateEditorState(newActiveTab.content);
      } catch (err) {
        console.error('Failed to update editor state:', err);
      }
    } else {
      setTabs(filtered);
    }
  }, [tabs, activeTabId, updateSource]);

  const updateTabContent = useCallback((id: string, content: string) => {
    setTabs(prev => prev.map(tab =>
      tab.id === id
        ? { ...tab, content, isDirty: content !== tab.savedContent }
        : tab
    ));
  }, []);

  const reorderTabs = useCallback((newTabs: Tab[]) => {
    setTabs(newTabs);
  }, []);

  // Note: Tree-sitter formatter is initialized in main.tsx for optimal performance

  // Check for OpenSCAD on mount
  useEffect(() => {
    // If OpenSCAD is not detected and setup screen hasn't been dismissed
    if (!openscadPath && !setupScreenDismissed) {
      // Give it a moment to detect OpenSCAD
      const timer = setTimeout(() => {
        if (!openscadPath && !setupScreenDismissed) {
          setShowSetupScreen(true);
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else if (openscadPath) {
      // OpenSCAD found, hide setup screen if it was showing
      setShowSetupScreen(false);
    }
  }, [openscadPath, setupScreenDismissed]);

  // Use refs to avoid stale closures in event listeners
  const activeTabRef = useRef<Tab>(activeTab);
  const tabsRef = useRef<Tab[]>(tabs);
  const sourceRef = useRef<string>(source);
  const openscadPathRef = useRef<string>(openscadPath);
  const workingDirRef = useRef<string | null>(workingDir);
  const renderOnSaveRef = useRef(renderOnSave);
  const manualRenderRef = useRef(manualRender);

  // Keep refs in sync with state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    openscadPathRef.current = openscadPath;
  }, [openscadPath]);

  useEffect(() => {
    workingDirRef.current = workingDir;
    // Update backend with current working directory for AI tools
    updateWorkingDir(workingDir).catch((err) => {
      console.error('[App] Failed to update working dir:', err);
    });
  }, [workingDir]);

  useEffect(() => {
    renderOnSaveRef.current = renderOnSave;
  }, [renderOnSave]);

  useEffect(() => {
    manualRenderRef.current = manualRender;
  }, [manualRender]);

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
          const currentTab = tabs.find(t => t.id === activeTabId);
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
  const saveFile = useCallback(async (promptForPath: boolean = false): Promise<boolean> => {
    try {
      const currentTab = activeTabRef.current;
      let savePath: string | null = currentTab.filePath;

      if (promptForPath || !savePath) {
        const result = await save({
          filters: [{ name: 'OpenSCAD Files', extensions: ['scad'] }],
          defaultPath: savePath || undefined,
        });
        if (!result) return false; // User cancelled save dialog
        savePath = result;
      }

      // Ensure savePath is valid before proceeding
      if (!savePath) {
        console.error('[saveFile] Invalid save path');
        alert('Failed to save file: No path specified');
        return false;
      }

      let currentSource = sourceRef.current;

      // Format code before saving if enabled
      const currentSettings = loadSettings();
      if (currentSettings.editor.formatOnSave) {
        try {
          currentSource = await formatOpenScadCode(currentSource, {
            indentSize: currentSettings.editor.indentSize,
            useTabs: currentSettings.editor.useTabs,
          });
          // Update the editor with formatted code
          updateSource(currentSource);
        } catch (err) {
          console.error('[saveFile] Failed to format code:', err);
          // Continue with save even if formatting fails
        }
      }

      await writeTextFile(savePath, currentSource);

      const fileName = savePath.split('/').pop() || savePath;
      setTabs(prev => prev.map(tab =>
        tab.id === currentTab.id
          ? { ...tab, filePath: savePath, name: fileName, savedContent: currentSource, isDirty: false }
          : tab
      ));

      const dockPanel = getDockviewApi()?.getPanel(currentTab.id);
      if (dockPanel) {
        dockPanel.api.setTitle(fileName);
      }

      addToRecentFiles(savePath);

      // Trigger render on save (only if OpenSCAD is available)
      if (openscadPathRef.current && renderOnSaveRef.current) {
        renderOnSaveRef.current();
      }

      return true;
    } catch (err) {
      console.error('[saveFile] Save failed:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(`Failed to save file: ${errorMsg}`);
      return false;
    }
  }, [updateSource]);

  // Handle starting with AI prompt from welcome screen
  const handleStartWithPrompt = useCallback((prompt: string) => {
    setShowWelcome(false);
    // Submit prompt after a small delay to ensure UI is ready
    setTimeout(() => {
      submitPrompt(prompt, 'edit');
    }, 100);
  }, [submitPrompt]);

  // Handle starting manually from welcome screen
  const handleStartManually = useCallback(() => {
    setShowWelcome(false);
  }, []);

  // Handle opening recent file from welcome screen
  const handleOpenRecent = useCallback(async (path: string) => {
    try {
      // Check if file is already open in a tab
      const existingTab = tabs.find(t => t.filePath === path);
      if (existingTab) {
        // Switch to existing tab
        await switchTab(existingTab.id);
        setShowWelcome(false);
        return;
      }

      const contents = await readTextFile(path);
      const fileName = path.split('/').pop() || path;

      // Check if we should replace the first tab (if it's untitled and unmodified)
      const firstTab = tabs[0];
      const shouldReplaceFirstTab = showWelcome &&
                                    tabs.length === 1 &&
                                    !firstTab.filePath &&
                                    !firstTab.isDirty;

      if (shouldReplaceFirstTab) {
        // Replace the first tab instead of creating a new one
        setTabs([{
          ...firstTab,
          filePath: path,
          name: fileName,
          content: contents,
          savedContent: contents,
          isDirty: false,
        }]);
        updateSource(contents);

        // Update backend EditorState for AI agent
        updateEditorState(contents).catch(err => {
          console.error('Failed to update editor state:', err);
        });
      } else {
        // Create new tab as usual
        createNewTab(path, contents, fileName);
      }

      setShowWelcome(false);

      // Add to recent files
      addToRecentFiles(path);

      // Automatically render the opened file
      if (openscadPathRef.current && manualRenderRef.current) {
        setTimeout(() => {
          if (manualRenderRef.current) {
            manualRenderRef.current();
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to open recent file:', err);
      alert(`Failed to open file: ${err}`);
    }
  }, [tabs, showWelcome, switchTab, createNewTab, updateSource]);

  // Handle opening file dialog from welcome screen
  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: 'OpenSCAD Files', extensions: ['scad'] }],
        multiple: false
      });
      if (!selected) return; // User cancelled

      const filePath = typeof selected === 'string' ? selected : (selected as { path: string }).path;

      // Check if already open
      const existingTab = tabs.find(t => t.filePath === filePath);
      if (existingTab) {
        await switchTab(existingTab.id);
        setShowWelcome(false);
        return;
      }

      const contents = await readTextFile(filePath);
      const fileName = filePath.split('/').pop() || filePath;

      // Check if we should replace the first tab (if it's untitled and unmodified)
      const firstTab = tabs[0];
      const shouldReplaceFirstTab = showWelcome &&
                                    tabs.length === 1 &&
                                    !firstTab.filePath &&
                                    !firstTab.isDirty;

      if (shouldReplaceFirstTab) {
        // Replace the first tab instead of creating a new one
        setTabs([{
          ...firstTab,
          filePath,
          name: fileName,
          content: contents,
          savedContent: contents,
          isDirty: false,
        }]);
        updateSource(contents);

        // Update backend EditorState for AI agent
        updateEditorState(contents).catch(err => {
          console.error('Failed to update editor state:', err);
        });
      } else {
        // Create new tab as usual
        createNewTab(filePath, contents, fileName);
      }

      setShowWelcome(false);

      // Add to recent files
      addToRecentFiles(filePath);

      // Automatically render the opened file
      if (openscadPathRef.current && manualRenderRef.current) {
        setTimeout(() => {
          if (manualRenderRef.current) {
            manualRenderRef.current();
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      alert(`Failed to open file: ${err}`);
    }
  }, [tabs, showWelcome, switchTab, createNewTab, updateSource]);

  // Helper function to check for unsaved changes before destructive operations
  // Returns: true if ok to proceed, false if user wants to cancel
  const checkUnsavedChangesRef = useRef<() => Promise<boolean>>();

  checkUnsavedChangesRef.current = async (): Promise<boolean> => {
    if (!activeTabRef.current.isDirty) return true;

    const { ask, confirm } = await import('@tauri-apps/plugin-dialog');

    // First ask if they want to save
    const wantsToSave = await ask(
      'Do you want to save the changes you made?',
      {
        title: 'Unsaved Changes',
        kind: 'warning',
        okLabel: 'Save',
        cancelLabel: "Don't Save",
      }
    );

    if (wantsToSave) {
      // User wants to save - attempt save
      return await saveFile(false);
    } else {
      // User chose "Don't Save" - confirm they want to discard
      const confirmDiscard = await confirm(
        'Are you sure you want to discard your changes?',
        {
          title: 'Discard Changes',
          kind: 'warning',
          okLabel: 'Discard',
          cancelLabel: 'Cancel',
        }
      );
      return confirmDiscard; // true if they want to discard, false if they cancelled
    }
  };

  // Listen for menu events from native menu
  // This effect only runs once on mount to avoid re-registering listeners
  useEffect(() => {
    const unlistenFns: Array<() => void> = [];
    let isMounted = true;

    // Setup all listeners
    const setupListeners = async () => {
      // File > New
      const unlistenNew = await listen('menu:file:new', async () => {
        if (!isMounted) return;

        const canProceed = checkUnsavedChangesRef.current ? await checkUnsavedChangesRef.current() : true;
        if (!canProceed) return;

        createNewTab();
        setShowWelcome(true); // Show welcome screen for new project
      });
      if (isMounted) unlistenFns.push(unlistenNew);

      // File > Open
      const unlistenOpen = await listen('menu:file:open', async () => {
        if (!isMounted) return;

        try {
          const selected = await open({
            filters: [{ name: 'OpenSCAD Files', extensions: ['scad'] }],
            multiple: false
          });
          if (!selected) return; // User cancelled

          const filePath = typeof selected === 'string' ? selected : (selected as { path: string }).path;

          // Check if already open
          const existingTab = tabsRef.current.find(t => t.filePath === filePath);
          if (existingTab) {
            await switchTab(existingTab.id);
            setShowWelcome(false);
            return;
          }

          const contents = await readTextFile(filePath);
          if (!isMounted) return;

          const fileName = filePath.split('/').pop() || filePath;
          createNewTab(filePath, contents, fileName);
          setShowWelcome(false);

          // Add to recent files
          addToRecentFiles(filePath);

          // Automatically render the opened file
          if (openscadPathRef.current && manualRenderRef.current) {
            setTimeout(() => {
              if (manualRenderRef.current) {
                manualRenderRef.current();
              }
            }, 100);
          }
        } catch (err) {
          console.error('Open failed:', err);
          if (isMounted) {
            alert(`Failed to open file: ${err}`);
          }
        }
      });
      if (isMounted) unlistenFns.push(unlistenOpen);

      // File > Save
      const unlistenSave = await listen('menu:file:save', async () => {
        if (!isMounted) return;
        await saveFile(false); // Save to current path, or prompt if no path
      });
      if (isMounted) unlistenFns.push(unlistenSave);

      // File > Save As
      const unlistenSaveAs = await listen('menu:file:save_as', async () => {
        if (!isMounted) return;
        await saveFile(true); // Always prompt for new path
      });
      if (isMounted) unlistenFns.push(unlistenSaveAs);

      // File > Export
      const unlistenExport = await listen<ExportFormat>('menu:file:export', async (event) => {
        if (!isMounted) return;

        try {
          const format = event.payload;
          const formatLabels: Record<ExportFormat, { label: string; ext: string }> = {
            'stl': { label: 'STL (3D Model)', ext: 'stl' },
            'obj': { label: 'OBJ (3D Model)', ext: 'obj' },
            'amf': { label: 'AMF (3D Model)', ext: 'amf' },
            '3mf': { label: '3MF (3D Model)', ext: '3mf' },
            'png': { label: 'PNG (Image)', ext: 'png' },
            'svg': { label: 'SVG (2D Vector)', ext: 'svg' },
            'dxf': { label: 'DXF (2D CAD)', ext: 'dxf' },
          };
          const formatInfo = formatLabels[format];
          const savePath = await save({
            filters: [{ name: formatInfo.label, extensions: [formatInfo.ext] }]
          });
          if (!savePath) return; // User cancelled

          if (!isMounted) return;

          await renderExact(openscadPathRef.current, {
            source: sourceRef.current,
            format,
            out_path: savePath,
            working_dir: workingDirRef.current || undefined
          });

          if (isMounted) {
            alert(`Exported successfully to ${savePath}`);
          }
        } catch (err) {
          console.error('Export failed:', err);
          if (isMounted) {
            alert(`Export failed: ${err}`);
          }
        }
      });
      if (isMounted) unlistenFns.push(unlistenExport);
    };

    setupListeners();

    return () => {
      isMounted = false;
      unlistenFns.forEach(fn => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount, using refs for latest values

  // Handle window close with unsaved changes
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await appWindow.onCloseRequested(async (event) => {
        const anyDirty = tabsRef.current.some(t => t.isDirty);
        if (anyDirty) {
          event.preventDefault();
          const canClose = checkUnsavedChangesRef.current ? await checkUnsavedChangesRef.current() : true;
          if (canClose) {
            await appWindow.close();
          }
        }
      });
    };

    setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // Empty deps - only run once on mount

  // Update window title with unsaved indicator
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const fileName = activeTab.name;
    const dirtyIndicator = activeTab.isDirty ? '• ' : '';
    appWindow.setTitle(`${dirtyIndicator}${fileName} - OpenSCAD Studio`);
  }, [activeTab]);

  // Listen for render requests from AI agent
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      console.log('[App] Setting up render-requested listener');
      unlisten = await listen('render-requested', () => {
        console.log('[App] ✅ Received render-requested event from AI');
        console.log('[App] manualRenderRef.current exists:', !!manualRenderRef.current);
        if (manualRenderRef.current) {
          console.log('[App] Calling manualRenderRef.current()');
          manualRenderRef.current();
        } else {
          console.error('[App] ❌ manualRenderRef.current is not set!');
        }
      });
      console.log('[App] render-requested listener setup complete');
    };

    setupListener();

    return () => {
      if (unlisten) {
        console.log('[App] Cleaning up render-requested listener');
        unlisten();
      }
    };
  }, []);

  // Listen for checkpoint restore events (from AI chat)
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      console.log('[App] Setting up history:restore listener');
      unlisten = await listen<{ code: string }>('history:restore', (event) => {
        console.log('[App] ✅ Received history:restore event');
        const { code } = event.payload;

        // Update editor with restored code
        updateSource(code);

        // Update backend EditorState
        updateEditorState(code).catch(err => {
          console.error('Failed to update editor state:', err);
        });

        // Update active tab content
        setTabs(prev => prev.map(tab =>
          tab.id === activeTabId
            ? { ...tab, content: code, isDirty: code !== tab.savedContent }
            : tab
        ));
      });
      console.log('[App] history:restore listener setup complete');
    };

    setupListener();

    return () => {
      if (unlisten) {
        console.log('[App] Cleaning up history:restore listener');
        unlisten();
      }
    };
  }, [activeTabId, updateSource]);

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

  const onDockviewReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;
    setDockviewApi(api);

    clearSavedLayout();
    applyDefaultLayout(api);

    let timer: ReturnType<typeof setTimeout> | null = null;
    api.onDidLayoutChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveLayout();
      }, 300);
    });
  }, []);

  const workspaceState: WorkspaceState = useMemo(() => ({
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
  }), [
    source, updateSource, diagnostics, manualRender, settings,
    tabs, activeTabId, switchTab, closeTab, createNewTab, reorderTabs,
    previewSrc, previewKind, isRendering, error,
    isStreaming, streamingResponse, proposedDiff, aiError, isApplyingDiff,
    messages, currentToolCalls, currentModel, availableProviders,
    submitPrompt, cancelStream, acceptDiff, rejectDiff, clearAiError,
    newConversation, setCurrentModel, handleRestoreCheckpoint,
  ]);

  // Show setup screen if OpenSCAD not found
  if (showSetupScreen) {
    return (
      <div className="h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <OpenScadSetupScreen
          onRetry={() => {
            // Force re-check by reloading the page
            window.location.reload();
          }}
          onSkip={() => {
            setSetupScreenDismissed(true);
            setShowSetupScreen(false);
          }}
        />
      </div>
    );
  }

  // Show welcome screen if no file is open and welcome hasn't been dismissed
  if (showWelcome) {
    return (
      <div className="h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <WelcomeScreen
          onStartWithPrompt={handleStartWithPrompt}
          onStartManually={handleStartManually}
          onOpenRecent={handleOpenRecent}
          onOpenFile={handleOpenFile}
        />
        {/* Settings dialog still accessible from welcome screen via keyboard shortcut */}
        <SettingsDialog
          isOpen={showSettingsDialog}
          onClose={() => setShowSettingsDialog(false)}
          onSettingsChange={setSettings}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header className="flex items-center justify-end gap-1.5 px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
        {isRendering && (
          <div className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            <div className="animate-spin h-2.5 w-2.5 border-2 rounded-full" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-primary)' }} />
            <span>Rendering</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs px-2 py-1 rounded border" style={{
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-secondary)'
        }}>
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

        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-secondary)' }} />

        <Button
          variant="primary"
          onClick={manualRender}
          disabled={isRendering || !openscadPath}
          className="text-xs px-2 py-1"
        >
          Render (⌘↵)
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowExportDialog(true)}
          disabled={isRendering || !openscadPath}
          className="text-xs px-2 py-1"
        >
          Export
        </Button>

        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-secondary)' }} />

        <button
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
        openscadPath={openscadPath}
        workingDir={workingDir}
      />

      {/* Settings dialog */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        onSettingsChange={setSettings}
      />

      {/* AI Error notification */}
      {aiError && (
        <div className="fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg max-w-md z-50" style={{ backgroundColor: 'var(--color-error)', border: '1px solid var(--color-error)', color: 'var(--text-inverse)', opacity: 0.9 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold mb-1">AI Error</div>
              <div className="text-sm">{aiError}</div>
            </div>
            <button
              onClick={clearAiError}
              className="transition-colors"
              style={{ color: 'var(--text-inverse)', opacity: 0.7 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
