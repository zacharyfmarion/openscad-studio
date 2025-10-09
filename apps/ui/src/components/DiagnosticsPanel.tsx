import type { Diagnostic } from '../api/tauri';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="h-full bg-gray-800 px-4 py-3 text-gray-400 text-sm">
        No issues detected ✓
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-800 overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-200">
          Problems ({diagnostics.length})
        </h3>
      </div>
      <div className="divide-y divide-gray-700">
        {diagnostics.map((diag, idx) => (
          <div
            key={idx}
            className="px-4 py-2 hover:bg-gray-700/50 cursor-pointer"
          >
            <div className="flex items-start gap-2">
              <span
                className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                  diag.severity === 'error'
                    ? 'bg-red-900/40 text-red-400'
                    : diag.severity === 'warning'
                    ? 'bg-yellow-900/40 text-yellow-400'
                    : 'bg-blue-900/40 text-blue-400'
                }`}
              >
                {diag.severity}
              </span>
              {diag.line && (
                <span className="text-xs text-gray-500">Line {diag.line}</span>
              )}
            </div>
            <p className="text-sm text-gray-300 mt-1">{diag.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
