import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Text } from './ui';
import type { Diagnostic } from '../platform/historyService';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

type Row =
  | {
      id: string;
      kind: 'header';
      label: 'Output' | 'Diagnostics';
      stickyTop: number;
      estimatedHeight: number;
    }
  | {
      id: string;
      kind: 'echo';
      diagnostic: Diagnostic;
      showBorder: boolean;
      estimatedHeight: number;
    }
  | {
      id: string;
      kind: 'diagnostic';
      diagnostic: Diagnostic;
      showBorder: boolean;
      estimatedHeight: number;
    };

interface RowMetric {
  row: Row;
  top: number;
  height: number;
}

type HeaderMetric = RowMetric & {
  row: Extract<Row, { kind: 'header' }>;
};

const HEADER_HEIGHT = 29;
const ITEM_ESTIMATED_HEIGHT = 44;
const OVERSCAN_PX = 240;

function getDefaultViewportHeight(): number {
  if (typeof window === 'undefined') {
    return 320;
  }

  return Math.max(320, window.innerHeight);
}

function findStartIndex(metrics: RowMetric[], offset: number): number {
  let low = 0;
  let high = metrics.length - 1;
  let candidate = metrics.length;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metric = metrics[mid];

    if (metric.top + metric.height >= offset) {
      candidate = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return candidate === metrics.length ? Math.max(0, metrics.length - 1) : candidate;
}

function findEndIndex(metrics: RowMetric[], offset: number): number {
  let low = 0;
  let high = metrics.length - 1;
  let candidate = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metric = metrics[mid];

    if (metric.top <= offset) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return candidate;
}

function isHeaderMetric(metric: RowMetric | undefined): metric is HeaderMetric {
  return metric?.row.kind === 'header';
}

function HeaderRow({
  label,
  stickyTop,
  hidden,
}: {
  label: 'Output' | 'Diagnostics';
  stickyTop?: number;
  hidden?: boolean;
}) {
  return (
    <div
      className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide z-10"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-tertiary)',
        borderBottom: '1px solid var(--border-subtle)',
        position: stickyTop === undefined ? 'relative' : 'sticky',
        top: stickyTop,
        visibility: hidden ? 'hidden' : 'visible',
      }}
    >
      {label}
    </div>
  );
}

function MeasuredRow({
  rowId,
  top,
  onHeightChange,
  children,
}: {
  rowId: string;
  top: number;
  onHeightChange: (rowId: string, height: number) => void;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) {
      return;
    }

    let frameId: number | null = null;

    const measure = (nextHeight?: number) => {
      const resolvedHeight = Math.ceil(nextHeight ?? node.getBoundingClientRect().height);
      if (resolvedHeight > 0) {
        onHeightChange(rowId, resolvedHeight);
      }
    };

    const scheduleMeasure = (nextHeight?: number) => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        measure(nextHeight);
      });
    };

    scheduleMeasure();

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
        }
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      scheduleMeasure(entry?.contentRect.height);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [onHeightChange, rowId]);

  return (
    <div ref={rowRef} className="absolute left-0 right-0" style={{ top }}>
      {children}
    </div>
  );
}

function readElementHeight(node: HTMLElement): number {
  const rectHeight = Math.ceil(node.getBoundingClientRect().height);
  if (rectHeight > 0) {
    return rectHeight;
  }

  return Math.ceil(node.clientHeight);
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(getDefaultViewportHeight);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});

  const handleHeightChange = useCallback((rowId: string, height: number) => {
    setMeasuredHeights((current) => {
      if (current[rowId] === height) {
        return current;
      }
      return { ...current, [rowId]: height };
    });
  }, []);

  const updateViewportHeight = useCallback((nextHeight: number) => {
    const resolvedHeight = Math.ceil(nextHeight);
    if (resolvedHeight <= 0) {
      return;
    }

    setViewportHeight((current) => (current === resolvedHeight ? current : resolvedHeight));
  }, []);

  const { echoMessages, otherDiagnostics } = useMemo(() => {
    const echo: Diagnostic[] = [];
    const other: Diagnostic[] = [];
    for (const diagnostic of diagnostics) {
      if (/^ECHO:/i.test(diagnostic.message)) {
        echo.push(diagnostic);
      } else {
        other.push(diagnostic);
      }
    }
    return { echoMessages: echo, otherDiagnostics: other };
  }, [diagnostics]);

  const rows = useMemo<Row[]>(() => {
    const nextRows: Row[] = [];

    if (echoMessages.length > 0) {
      nextRows.push({
        id: 'header-output',
        kind: 'header',
        label: 'Output',
        stickyTop: 0,
        estimatedHeight: HEADER_HEIGHT,
      });

      echoMessages.forEach((diagnostic, index) => {
        nextRows.push({
          id: `echo-${index}-${diagnostic.line ?? 'na'}-${diagnostic.message}`,
          kind: 'echo',
          diagnostic,
          showBorder: index < echoMessages.length - 1 || otherDiagnostics.length > 0,
          estimatedHeight: ITEM_ESTIMATED_HEIGHT,
        });
      });
    }

    if (otherDiagnostics.length > 0) {
      nextRows.push({
        id: 'header-diagnostics',
        kind: 'header',
        label: 'Diagnostics',
        stickyTop: echoMessages.length > 0 ? HEADER_HEIGHT : 0,
        estimatedHeight: HEADER_HEIGHT,
      });

      otherDiagnostics.forEach((diagnostic, index) => {
        nextRows.push({
          id: `diagnostic-${index}-${diagnostic.line ?? 'na'}-${diagnostic.message}`,
          kind: 'diagnostic',
          diagnostic,
          showBorder: index < otherDiagnostics.length - 1,
          estimatedHeight: ITEM_ESTIMATED_HEIGHT,
        });
      });
    }

    return nextRows;
  }, [echoMessages, otherDiagnostics]);

  const metrics = useMemo(() => {
    let offset = 0;
    const nextMetrics = rows.map((row) => {
      const height = measuredHeights[row.id] ?? row.estimatedHeight;
      const metric = { row, top: offset, height };
      offset += height;
      return metric;
    });

    return { metrics: nextMetrics, totalHeight: offset };
  }, [measuredHeights, rows]);

  const metricById = useMemo(() => {
    return new Map(metrics.metrics.map((metric) => [metric.row.id, metric]));
  }, [metrics.metrics]);

  useEffect(() => {
    setMeasuredHeights((current) => {
      const activeIds = new Set(rows.map((row) => row.id));
      let changed = false;
      const nextEntries = Object.entries(current).filter(([rowId]) => activeIds.has(rowId));
      if (nextEntries.length !== Object.keys(current).length) {
        changed = true;
      }

      if (!changed) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [rows]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    let frameId: number | null = null;

    const scheduleViewportUpdate = (nextHeight?: number) => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        updateViewportHeight(nextHeight ?? readElementHeight(node));
      });
    };

    scheduleViewportUpdate();

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
        }
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      scheduleViewportUpdate(entry?.contentRect.height);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [updateViewportHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleWindowResize = () => {
      setViewportHeight((current) => Math.max(current, getDefaultViewportHeight()));
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

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

  const renderStart = Math.max(0, scrollTop - OVERSCAN_PX);
  const renderEnd = scrollTop + viewportHeight + OVERSCAN_PX;
  const startIndex = findStartIndex(metrics.metrics, renderStart);
  const endIndex = findEndIndex(metrics.metrics, renderEnd);
  const visibleMetrics =
    endIndex >= startIndex ? metrics.metrics.slice(startIndex, endIndex + 1) : metrics.metrics;

  const outputHeaderMetric = metricById.get('header-output');
  const diagnosticsHeaderMetric = metricById.get('header-diagnostics');

  const stickyHeaderIds = new Set<string>();
  if (isHeaderMetric(outputHeaderMetric) && scrollTop > outputHeaderMetric.top) {
    stickyHeaderIds.add(outputHeaderMetric.row.id);
  }
  if (
    isHeaderMetric(diagnosticsHeaderMetric) &&
    scrollTop >= diagnosticsHeaderMetric.top - diagnosticsHeaderMetric.row.stickyTop
  ) {
    stickyHeaderIds.add(diagnosticsHeaderMetric.row.id);
  }

  return (
    <div
      ref={scrollRef}
      data-testid="diagnostics-panel"
      className="h-full overflow-y-auto ph-no-capture"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      {isHeaderMetric(outputHeaderMetric) && stickyHeaderIds.has(outputHeaderMetric.row.id) ? (
        <HeaderRow label="Output" stickyTop={0} />
      ) : null}
      {isHeaderMetric(diagnosticsHeaderMetric) &&
      stickyHeaderIds.has(diagnosticsHeaderMetric.row.id) ? (
        <HeaderRow
          label="Diagnostics"
          stickyTop={diagnosticsHeaderMetric.row.stickyTop}
          hidden={false}
        />
      ) : null}

      <div
        className="relative"
        style={{ height: metrics.totalHeight }}
        data-testid="diagnostics-panel-spacer"
      >
        {visibleMetrics.map((metric) => {
          if (metric.row.kind === 'header') {
            return (
              <MeasuredRow
                key={metric.row.id}
                rowId={metric.row.id}
                top={metric.top}
                onHeightChange={handleHeightChange}
              >
                <HeaderRow
                  label={metric.row.label}
                  hidden={stickyHeaderIds.has(metric.row.id)}
                  stickyTop={undefined}
                />
              </MeasuredRow>
            );
          }

          if (metric.row.kind === 'echo') {
            return (
              <MeasuredRow
                key={metric.row.id}
                rowId={metric.row.id}
                top={metric.top}
                onHeightChange={handleHeightChange}
              >
                <div
                  data-testid="diagnostic-panel-row-item"
                  className="px-4 py-2"
                  style={{
                    borderBottom: metric.row.showBorder ? '1px solid var(--border-subtle)' : 'none',
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
                    <Text variant="body" color="primary" className="flex-1 min-w-0 font-mono">
                      {metric.row.diagnostic.message.replace(/^ECHO:\s*/i, '')}
                    </Text>
                  </div>
                </div>
              </MeasuredRow>
            );
          }

          return (
            <MeasuredRow
              key={metric.row.id}
              rowId={metric.row.id}
              top={metric.top}
              onHeightChange={handleHeightChange}
            >
              <div
                data-testid="diagnostic-panel-row-item"
                className="px-4 py-2 cursor-pointer"
                style={{
                  borderBottom: metric.row.showBorder ? '1px solid var(--border-subtle)' : 'none',
                  backgroundColor: 'transparent',
                }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded"
                    style={{
                      backgroundColor:
                        metric.row.diagnostic.severity === 'error'
                          ? 'rgba(220, 50, 47, 0.2)'
                          : metric.row.diagnostic.severity === 'warning'
                            ? 'rgba(181, 137, 0, 0.2)'
                            : 'rgba(38, 139, 210, 0.2)',
                      color:
                        metric.row.diagnostic.severity === 'error'
                          ? 'var(--color-error)'
                          : metric.row.diagnostic.severity === 'warning'
                            ? 'var(--color-warning)'
                            : 'var(--accent-primary)',
                    }}
                  >
                    {metric.row.diagnostic.severity}
                  </span>
                  {metric.row.diagnostic.line ? (
                    <span
                      className="flex-shrink-0 text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Line {metric.row.diagnostic.line}:
                    </span>
                  ) : null}
                  <Text variant="body" color="primary" className="flex-1 min-w-0">
                    {metric.row.diagnostic.message}
                  </Text>
                </div>
              </div>
            </MeasuredRow>
          );
        })}
      </div>
    </div>
  );
}
