import type { Diagnostic } from '../api/tauri';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="h-full px-4 py-3 text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
        No issues detected ✓
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Problems ({diagnostics.length})
        </h3>
      </div>
      <div style={{ borderTop: '1px solid var(--border-primary)' }}>
        {diagnostics.map((diag, idx) => (
          <div
            key={idx}
            className="px-4 py-2 cursor-pointer"
            style={{
              borderBottom: idx < diagnostics.length - 1 ? '1px solid var(--border-secondary)' : 'none',
              backgroundColor: 'transparent',
            }}
          >
            <div className="flex items-start gap-2">
              <span
                className="flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded"
                style={{
                  backgroundColor: diag.severity === 'error'
                    ? 'rgba(220, 50, 47, 0.2)'
                    : diag.severity === 'warning'
                    ? 'rgba(181, 137, 0, 0.2)'
                    : 'rgba(38, 139, 210, 0.2)',
                  color: diag.severity === 'error'
                    ? 'var(--color-error)'
                    : diag.severity === 'warning'
                    ? 'var(--color-warning)'
                    : 'var(--accent-primary)',
                }}
              >
                {diag.severity}
              </span>
              {diag.line && (
                <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>Line {diag.line}:</span>
              )}
              <p className="text-sm flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>{diag.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
