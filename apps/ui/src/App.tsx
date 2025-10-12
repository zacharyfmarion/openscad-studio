import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { ExportDialog } from './components/ExportDialog';
import { AiPromptPanel } from './components/AiPromptPanel';
import { DiffViewer } from './components/DiffViewer';
import { SettingsDialog } from './components/SettingsDialog';
import { Button } from './components/ui';
import { useOpenScad } from './hooks/useOpenScad';
import { useAiAgent } from './hooks/useAiAgent';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { renderExact, type ExportFormat } from './api/tauri';
import { loadSettings, type Settings } from './stores/settingsStore';
import { formatOpenScadCode } from './utils/openscadFormatter';
import { getTheme, applyTheme } from './themes';

function App() {
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  // Get working directory from current file path (for resolving relative imports)
  const workingDir = currentFilePath
    ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
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
    clearPreview,
  } = useOpenScad(workingDir);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [savedContent, setSavedContent] = useState('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
  const [settings, setSettings] = useState<Settings>(loadSettings());

  // Apply theme on mount and when settings change
  useEffect(() => {
    const theme = getTheme(settings.appearance.theme);
    applyTheme(theme);
  }, [settings.appearance.theme]);

  // AI Agent state
  const {
    isStreaming,
    streamingResponse,
    proposedDiff,
    error: aiError,
    isApplyingDiff,
    messages,
    currentToolCalls,
    submitPrompt,
    cancelStream,
    acceptDiff,
    rejectDiff,
    clearError: clearAiError,
    newConversation,
  } = useAiAgent();

  // Use refs to avoid stale closures in event listeners
  const currentFilePathRef = useRef<string | null>(null);
  const sourceRef = useRef<string>(source);
  const openscadPathRef = useRef<string>(openscadPath);
  const workingDirRef = useRef<string | null>(workingDir);
  const isDirtyRef = useRef<boolean>(isDirty);
  const savedContentRef = useRef<string>(savedContent);
  const renderOnSaveRef = useRef(renderOnSave);
  const manualRenderRef = useRef(manualRender);

  // Keep refs in sync with state
  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    openscadPathRef.current = openscadPath;
  }, [openscadPath]);

  useEffect(() => {
    workingDirRef.current = workingDir;
  }, [workingDir]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    savedContentRef.current = savedContent;
  }, [savedContent]);

  useEffect(() => {
    renderOnSaveRef.current = renderOnSave;
  }, [renderOnSave]);

  useEffect(() => {
    manualRenderRef.current = manualRender;
  }, [manualRender]);

  // Track if content has changed
  useEffect(() => {
    setIsDirty(source !== savedContent);
  }, [source, savedContent]);

  // Helper function to save file to current path or prompt for new path
  const saveFile = useCallback(async (promptForPath: boolean = false): Promise<boolean> => {
    try {
      let savePath = currentFilePathRef.current;

      if (promptForPath || !savePath) {
        savePath = await save({
          filters: [{ name: 'OpenSCAD Files', extensions: ['scad'] }],
          defaultPath: savePath || undefined,
        });
        if (!savePath) return false; // User cancelled save dialog
      }

      let currentSource = sourceRef.current;

      // Format code before saving if enabled
      const currentSettings = loadSettings();
      if (currentSettings.editor.formatOnSave) {
        try {
          currentSource = formatOpenScadCode(currentSource, {
            indentSize: currentSettings.editor.indentSize,
            useTabs: currentSettings.editor.useTabs,
          });
          // Update the editor with formatted code
          updateSource(currentSource);
        } catch (err) {
          console.error('Failed to format code:', err);
          // Continue with save even if formatting fails
        }
      }

      await writeTextFile(savePath, currentSource);
      setCurrentFilePath(savePath);
      setSavedContent(currentSource);
      setIsDirty(false);
      // Trigger render on save (only if OpenSCAD is available)
      if (openscadPathRef.current && renderOnSaveRef.current) {
        renderOnSaveRef.current();
      }
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Failed to save file: ${err}`);
      return false;
    }
  }, [updateSource]); // Add updateSource as dependency

  // Helper function to check for unsaved changes before destructive operations
  // Returns: true if ok to proceed, false if user wants to cancel
  const checkUnsavedChangesRef = useRef<() => Promise<boolean>>();

  checkUnsavedChangesRef.current = async (): Promise<boolean> => {
    if (!isDirtyRef.current) return true;

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

        clearPreview();
        updateSource('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
        setCurrentFilePath(null);
        setSavedContent('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
        setIsDirty(false);
      });
      if (isMounted) unlistenFns.push(unlistenNew);

      // File > Open
      const unlistenOpen = await listen('menu:file:open', async () => {
        if (!isMounted) return;

        const canProceed = checkUnsavedChangesRef.current ? await checkUnsavedChangesRef.current() : true;
        if (!canProceed) return;

        try {
          const selected = await open({
            filters: [{ name: 'OpenSCAD Files', extensions: ['scad'] }],
            multiple: false
          });
          if (!selected) return; // User cancelled

          const filePath = typeof selected === 'string' ? selected : (selected as { path: string }).path;
          const contents = await readTextFile(filePath);

          if (!isMounted) return;

          clearPreview();
          updateSource(contents);
          setCurrentFilePath(filePath);
          setSavedContent(contents);
          setIsDirty(false);

          // Automatically render the opened file
          if (openscadPathRef.current && manualRenderRef.current) {
            // Small delay to ensure state updates have propagated
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
  }, []); // Empty deps - only run once on mount

  // Handle window close with unsaved changes
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await appWindow.onCloseRequested(async (event) => {
        if (isDirtyRef.current) {
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
    const fileName = currentFilePath ? currentFilePath.split('/').pop() : 'Untitled';
    const dirtyIndicator = isDirty ? '• ' : '';
    appWindow.setTitle(`${dirtyIndicator}${fileName} - OpenSCAD Copilot`);
  }, [currentFilePath, isDirty]);

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

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to switch to Copilot tab
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowAiPanel(true);
      }
      // ⌘, or Ctrl+, to open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettingsDialog(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">OpenSCAD Copilot</h1>
          {isRendering && (
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-info)', color: 'var(--text-inverse)', opacity: 0.4 }}>
              Rendering...
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
            {dimensionMode === '2d' ? '📐 2D Mode' : '📦 3D Mode'}
          </span>
          <Button
            variant="primary"
            onClick={manualRender}
            disabled={isRendering || !openscadPath}
          >
            Render (⌘↵)
          </Button>
          <Button
            variant="success"
            onClick={() => setShowExportDialog(true)}
            disabled={isRendering || !openscadPath}
          >
            Export...
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowSettingsDialog(true)}
            title="Settings (⌘,)"
          >
            ⚙️
          </Button>
        </div>
      </header>

      {/* Main content with resizable panels */}
      <PanelGroup direction="vertical" className="flex-1">
        <Panel defaultSize={75} minSize={30}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={50} minSize={20}>
              <Editor
                value={source}
                onChange={updateSource}
                diagnostics={diagnostics}
                onManualRender={manualRender}
                settings={settings}
              />
            </Panel>
            <PanelResizeHandle className="w-1 transition-colors" style={{ backgroundColor: 'var(--border-primary)' }} />
            <Panel defaultSize={50} minSize={20}>
              {proposedDiff ? (
                <DiffViewer
                  oldCode={source}
                  newCode={source} // TODO: Apply diff to show new code
                  onAccept={acceptDiff}
                  onReject={rejectDiff}
                  isApplying={isApplyingDiff}
                />
              ) : (
                <Preview src={previewSrc} kind={previewKind} isRendering={isRendering} error={error} />
              )}
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="h-1 transition-colors" style={{ backgroundColor: 'var(--border-primary)' }} />
        <Panel defaultSize={25} minSize={10} maxSize={50}>
          <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {/* Tabs and Toolbar - Combined */}
            <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
              {/* Left: Tabs */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={showAiPanel ? 'ghost' : 'ghost'}
                  onClick={() => setShowAiPanel(true)}
                  className="px-2.5 py-1"
                  style={{
                    backgroundColor: showAiPanel ? 'var(--bg-tertiary)' : 'transparent',
                    color: showAiPanel ? 'var(--text-inverse)' : 'var(--text-secondary)'
                  }}
                >
                  Copilot
                </Button>
                <Button
                  size="sm"
                  variant={!showAiPanel ? 'ghost' : 'ghost'}
                  onClick={() => setShowAiPanel(false)}
                  className="px-2.5 py-1"
                  style={{
                    backgroundColor: !showAiPanel ? 'var(--bg-tertiary)' : 'transparent',
                    color: !showAiPanel ? 'var(--text-inverse)' : 'var(--text-secondary)'
                  }}
                >
                  Issues {diagnostics.length > 0 && `(${diagnostics.length})`}
                </Button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {showAiPanel ? (
                <AiPromptPanel
                  onSubmit={submitPrompt}
                  isStreaming={isStreaming}
                  streamingResponse={streamingResponse}
                  onCancel={cancelStream}
                  messages={messages}
                  onNewConversation={newConversation}
                  currentToolCalls={currentToolCalls}
                />
              ) : (
                <DiagnosticsPanel diagnostics={diagnostics} />
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

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
