import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { ExportDialog } from './components/ExportDialog';
import { useOpenScad } from './hooks/useOpenScad';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { renderExact, type ExportFormat } from './api/tauri';

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
    viewMode,
    toggleViewMode,
    dimensionMode,
    toggleDimensionMode,
    manualRender,
    renderOnSave,
    clearPreview,
  } = useOpenScad(workingDir);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savedContent, setSavedContent] = useState('// Type your OpenSCAD code here\ncube([10, 10, 10]);');

  // Use refs to avoid stale closures in event listeners
  const currentFilePathRef = useRef<string | null>(null);
  const sourceRef = useRef<string>(source);
  const openscadPathRef = useRef<string>(openscadPath);
  const workingDirRef = useRef<string | null>(workingDir);

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

      const currentSource = sourceRef.current;
      await writeTextFile(savePath, currentSource);
      setCurrentFilePath(savePath);
      setSavedContent(currentSource);
      setIsDirty(false);
      // Trigger render on save
      renderOnSave();
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Failed to save file: ${err}`);
      return false;
    }
  }, [renderOnSave]);

  // Helper function to check for unsaved changes before destructive operations
  // Returns: true if ok to proceed, false if user wants to cancel
  const checkUnsavedChanges = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;

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
  }, [isDirty, saveFile]);

  // Listen for menu events from native menu
  useEffect(() => {
    let unlistenFns: Array<() => void> = [];

    // Setup all listeners
    const setupListeners = async () => {
      unlistenFns.push(await listen('menu:file:new', async () => {
        const canProceed = await checkUnsavedChanges();
        if (!canProceed) return;

        clearPreview();
        updateSource('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
        setCurrentFilePath(null);
        setSavedContent('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
        setIsDirty(false);
      }));

      unlistenFns.push(await listen('menu:file:open', async () => {
        const canProceed = await checkUnsavedChanges();
        if (!canProceed) return;

        try {
          const selected = await open({
            filters: [{ name: 'OpenSCAD Files', extensions: ['scad'] }],
            multiple: false
          });
          if (!selected) return;
          const filePath = typeof selected === 'string' ? selected : selected.path;
          const contents = await readTextFile(filePath);
          clearPreview();
          updateSource(contents);
          setCurrentFilePath(filePath);
          setSavedContent(contents);
          setIsDirty(false);
        } catch (err) {
          console.error('Open failed:', err);
          alert(`Failed to open file: ${err}`);
        }
      }));

      unlistenFns.push(await listen('menu:file:save', async () => {
        await saveFile(false); // Save to current path, or prompt if no path
      }));

      unlistenFns.push(await listen('menu:file:save_as', async () => {
        await saveFile(true); // Always prompt for new path
      }));

      unlistenFns.push(await listen<ExportFormat>('menu:file:export', async (event) => {
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
          if (!savePath) return;
          await renderExact(openscadPathRef.current, {
            source: sourceRef.current,
            format,
            out_path: savePath,
            working_dir: workingDirRef.current || undefined
          });
          alert(`Exported successfully to ${savePath}`);
        } catch (err) {
          console.error('Export failed:', err);
          alert(`Export failed: ${err}`);
        }
      }));
    };

    setupListeners();

    return () => {
      unlistenFns.forEach(fn => fn());
    };
  }, [updateSource, checkUnsavedChanges, saveFile, clearPreview]);

  // Handle window close with unsaved changes
  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlistenCloseRequested = appWindow.onCloseRequested(async (event) => {
      if (isDirty) {
        event.preventDefault();
        const canClose = await checkUnsavedChanges();
        if (canClose) {
          await appWindow.close();
        }
      }
    });

    return () => {
      unlistenCloseRequested.then(f => f());
    };
  }, [isDirty, checkUnsavedChanges]);

  // Update window title with unsaved indicator
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const fileName = currentFilePath ? currentFilePath.split('/').pop() : 'Untitled';
    const dirtyIndicator = isDirty ? '• ' : '';
    appWindow.setTitle(`${dirtyIndicator}${fileName} - OpenSCAD Copilot`);
  }, [currentFilePath, isDirty]);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">OpenSCAD Copilot</h1>
          {isRendering && (
            <span className="text-xs bg-blue-900/40 text-blue-400 px-2 py-1 rounded">
              Rendering...
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleDimensionMode}
            disabled={isRendering || !openscadPath}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
            title={dimensionMode === '2d' ? 'Switch to 3D Mode' : 'Switch to 2D Mode'}
          >
            {dimensionMode === '2d' ? '📐 2D' : '📦 3D'}
          </button>
          {dimensionMode === '3d' && (
            <button
              onClick={toggleViewMode}
              disabled={isRendering || !openscadPath}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
              title={viewMode === 'fast' ? 'Switch to Interactive 3D' : 'Switch to Fast Preview'}
            >
              {viewMode === 'fast' ? '🖼️ Fast' : '🎮 Mesh'}
            </button>
          )}
          <button
            onClick={manualRender}
            disabled={isRendering || !openscadPath}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
          >
            Render (⌘↵)
          </button>
          <button
            onClick={() => setShowExportDialog(true)}
            disabled={isRendering || !openscadPath}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
          >
            Export...
          </button>
          <span className="text-xs text-gray-500">
            {openscadPath ? `OpenSCAD: ${openscadPath.split('/').pop()}` : 'OpenSCAD not found'}
          </span>
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
              />
            </Panel>
            <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-gray-600 transition-colors" />
            <Panel defaultSize={50} minSize={20}>
              <Preview src={previewSrc} kind={previewKind} isRendering={isRendering} error={error} />
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-gray-600 transition-colors" />
        <Panel defaultSize={25} minSize={10} maxSize={50}>
          <DiagnosticsPanel diagnostics={diagnostics} />
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
    </div>
  );
}

export default App;
