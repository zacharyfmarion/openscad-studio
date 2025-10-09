import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { useOpenScad } from './hooks/useOpenScad';

function App() {
  const {
    source,
    updateSource,
    previewSrc,
    diagnostics,
    isRendering,
    error,
    openscadPath,
    manualRender,
  } = useOpenScad();

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
            onClick={manualRender}
            disabled={isRendering || !openscadPath}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
          >
            Render (⌘↵)
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
          <Preview src={previewSrc} isRendering={isRendering} error={error} />
        </div>
      </div>

      {/* Diagnostics panel - bottom */}
      <div className="h-32 border-t border-gray-700">
        <DiagnosticsPanel diagnostics={diagnostics} />
      </div>
    </div>
  );
}

export default App;
