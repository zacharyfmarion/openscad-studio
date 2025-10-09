import { useState } from 'react';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { ExportDialog } from './components/ExportDialog';
import { useOpenScad } from './hooks/useOpenScad';

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

  const [showExportDialog, setShowExportDialog] = useState(false);

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
