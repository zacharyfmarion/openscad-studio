import { useMemo } from 'react';
import type { Diagnostic } from '../platform/historyService';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  const { echoMessages, otherDiagnostics } = useMemo(() => {
    const echo: Diagnostic[] = [];
    const other: Diagnostic[] = [];
    for (const d of diagnostics) {
      if (/^ECHO:/i.test(d.message)) {
        echo.push(d);
      } else {
        other.push(d);
      }
    }
    return { echoMessages: echo, otherDiagnostics: other };
  }, [diagnostics]);

  if (diagnostics.length === 0) {
    return (
      <div
        data-testid="diagnostics-panel"
        className="h-full px-4 py-3 text-sm ph-no-capture"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
      >
        No messages
      </div>
    );
  }

  return (
    <div
      data-testid="diagnostics-panel"
      className="h-full overflow-y-auto ph-no-capture"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Output (ECHO) section */}
      {echoMessages.length > 0 && (
        <>
          <div
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide sticky top-0 z-10"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-tertiary)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            Output
          </div>
          {echoMessages.map((diag, idx) => (
            <div
              key={`echo-${idx}`}
              className="px-4 py-2"
              style={{
                borderBottom:
                  idx < echoMessages.length - 1 || otherDiagnostics.length > 0
                    ? '1px solid var(--border-subtle)'
                    : 'none',
                backgroundColor: 'transparent',
              }}
            >
              <div className="flex items-start gap-2">
                <span
                  className="flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded"
                  style={{
                    backgroundColor: 'rgba(38, 139, 210, 0.2)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  echo
                </span>
                <p
                  className="text-sm flex-1 min-w-0 font-mono"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {diag.message.replace(/^ECHO:\s*/i, '')}
                </p>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Diagnostics (errors/warnings) section */}
      {otherDiagnostics.length > 0 && (
        <>
          {echoMessages.length > 0 && (
            <div
              className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide sticky z-10"
              style={{
                top: echoMessages.length > 0 ? '29px' : '0',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-tertiary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              Diagnostics
            </div>
          )}
          {otherDiagnostics.map((diag, idx) => (
            <div
              key={`diag-${idx}`}
              className="px-4 py-2 cursor-pointer"
              style={{
                borderBottom:
                  idx < otherDiagnostics.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                backgroundColor: 'transparent',
              }}
            >
              <div className="flex items-start gap-2">
                <span
                  className="flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded"
                  style={{
                    backgroundColor:
                      diag.severity === 'error'
                        ? 'rgba(220, 50, 47, 0.2)'
                        : diag.severity === 'warning'
                          ? 'rgba(181, 137, 0, 0.2)'
                          : 'rgba(38, 139, 210, 0.2)',
                    color:
                      diag.severity === 'error'
                        ? 'var(--color-error)'
                        : diag.severity === 'warning'
                          ? 'var(--color-warning)'
                          : 'var(--accent-primary)',
                  }}
                >
                  {diag.severity}
                </span>
                {diag.line && (
                  <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Line {diag.line}:
                  </span>
                )}
                <p className="text-sm flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                  {diag.message}
                </p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
