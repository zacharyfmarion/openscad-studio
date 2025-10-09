import { useState, useEffect, useCallback } from 'react';
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
    manualRender,
  } = useOpenScad();

  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savedContent, setSavedContent] = useState('// Type your OpenSCAD code here\ncube([10, 10, 10]);');

  // Track if content has changed
  useEffect(() => {
    setIsDirty(source !== savedContent);
  }, [source, savedContent]);

  // Helper function to save file to current path or prompt for new path
  const saveFile = useCallback(async (promptForPath: boolean = false): Promise<boolean> => {
    try {
      let savePath = currentFilePath;

      if (promptForPath || !savePath) {
        savePath = await save({
          filters: [{ name: 'OpenSCAD Files', extensions: ['scad'] }],
          defaultPath: savePath || undefined,
        });
        if (!savePath) return false; // User cancelled save dialog
      }

      await writeTextFile(savePath, source);
      setCurrentFilePath(savePath);
      setSavedContent(source);
      setIsDirty(false);
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Failed to save file: ${err}`);
      return false;
    }
  }, [currentFilePath, source]);

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
    const unlistenNew = listen('menu:file:new', async () => {
      const canProceed = await checkUnsavedChanges();
      if (!canProceed) return;

      updateSource('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
      setCurrentFilePath(null);
      setSavedContent('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
      setIsDirty(false);
    });

    const unlistenOpen = listen('menu:file:open', async () => {
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
        updateSource(contents);
        setCurrentFilePath(filePath);
        setSavedContent(contents);
        setIsDirty(false);
      } catch (err) {
        console.error('Open failed:', err);
        alert(`Failed to open file: ${err}`);
      }
    });

    const unlistenSave = listen('menu:file:save', async () => {
      await saveFile(false); // Save to current path, or prompt if no path
    });

    const unlistenSaveAs = listen('menu:file:save_as', async () => {
      await saveFile(true); // Always prompt for new path
    });

    const unlistenExport = listen<ExportFormat>('menu:file:export', async (event) => {
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
        await renderExact(openscadPath, { source, format, out_path: savePath });
        alert(`Exported successfully to ${savePath}`);
      } catch (err) {
        console.error('Export failed:', err);
        alert(`Export failed: ${err}`);
      }
    });

    return () => {
      unlistenNew.then(f => f());
      unlistenOpen.then(f => f());
      unlistenSave.then(f => f());
      unlistenSaveAs.then(f => f());
      unlistenExport.then(f => f());
    };
  }, [updateSource, openscadPath, checkUnsavedChanges, saveFile]);

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
            onClick={toggleViewMode}
            disabled={isRendering || !openscadPath}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
            title={viewMode === 'fast' ? 'Switch to Interactive 3D' : 'Switch to Fast Preview'}
          >
            {viewMode === 'fast' ? '🖼️ Fast' : '🎮 3D'}
          </button>
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor - left half */}
        <div className="w-1/2 border-r border-gray-700">
          <Editor
            value={source}
            onChange={updateSource}
            diagnostics={diagnostics}
          />
        </div>

        {/* Preview - right half */}
        <div className="w-1/2">
          <Preview src={previewSrc} kind={previewKind} isRendering={isRendering} error={error} />
        </div>
      </div>

      {/* Diagnostics panel - bottom */}
      <div className="h-32 border-t border-gray-700">
        <DiagnosticsPanel diagnostics={diagnostics} />
      </div>

      {/* Export dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        source={source}
        openscadPath={openscadPath}
      />
    </div>
  );
}

export default App;
