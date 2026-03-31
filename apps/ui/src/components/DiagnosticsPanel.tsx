import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TbChevronDown, TbChevronRight } from 'react-icons/tb';
import { Button, Text } from './ui';
import type { Diagnostic } from '../platform/historyService';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

type SectionId = 'error' | 'warning' | 'info' | 'echo';

type Row =
  | {
      id: string;
      kind: 'header';
      label: string;
      sectionId: SectionId;
      itemCount: number;
      isCollapsed: boolean;
      stickyTop: number;
      estimatedHeight: number;
    }
  | {
      id: string;
      kind: 'echo';
      sectionId: SectionId;
      diagnostic: Diagnostic;
      showBorder: boolean;
      estimatedHeight: number;
    }
  | {
      id: string;
      kind: 'diagnostic';
      sectionId: SectionId;
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

interface SectionDescriptor {
  id: SectionId;
  label: string;
  items: Diagnostic[];
  rowKind: Extract<Row, { kind: 'echo' | 'diagnostic' }>['kind'];
}

function getRowId(
  rowKind: Extract<Row, { kind: 'echo' | 'diagnostic' }>['kind'],
  sectionId: SectionId,
  diagnostic: Diagnostic,
  index: number
): string {
  return `${rowKind}-${sectionId}-${index}-${diagnostic.line ?? 'na'}-${diagnostic.message}`;
}

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
  sectionId,
  itemCount,
  isCollapsed,
  onToggle,
  stickyTop,
  hidden,
}: {
  label: string;
  sectionId: SectionId;
  itemCount: number;
  isCollapsed: boolean;
  onToggle: (sectionId: SectionId) => void;
  stickyTop?: number;
  hidden?: boolean;
}) {
  const ToggleIcon = isCollapsed ? TbChevronRight : TbChevronDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid={`diagnostic-panel-section-${sectionId}`}
      className="w-full h-auto justify-between px-4 py-1.5 text-xs font-semibold uppercase tracking-wide z-10 rounded-none"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-tertiary)',
        borderBottom: '1px solid var(--border-subtle)',
        position: stickyTop === undefined ? 'relative' : 'sticky',
        top: stickyTop,
        visibility: hidden ? 'hidden' : 'visible',
        textAlign: 'left',
      }}
      aria-expanded={!isCollapsed}
      onClick={() => onToggle(sectionId)}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <ToggleIcon size={14} />
          <span>{label}</span>
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{itemCount}</span>
      </span>
    </Button>
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
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionId, boolean>>({
    error: false,
    warning: false,
    info: false,
    echo: false,
  });

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

  const errorDiagnostics = useMemo(
    () => otherDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [otherDiagnostics]
  );
  const warningDiagnostics = useMemo(
    () => otherDiagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
    [otherDiagnostics]
  );
  const infoDiagnostics = useMemo(
    () => otherDiagnostics.filter((diagnostic) => diagnostic.severity === 'info'),
    [otherDiagnostics]
  );

  const sectionDescriptors = useMemo<SectionDescriptor[]>(() => {
    const sections: SectionDescriptor[] = [];

    if (errorDiagnostics.length > 0) {
      sections.push({
        id: 'error',
        label: 'Errors',
        items: errorDiagnostics,
        rowKind: 'diagnostic',
      });
    }
    if (warningDiagnostics.length > 0) {
      sections.push({
        id: 'warning',
        label: 'Warnings',
        items: warningDiagnostics,
        rowKind: 'diagnostic',
      });
    }
    if (infoDiagnostics.length > 0) {
      sections.push({
        id: 'info',
        label: 'Info',
        items: infoDiagnostics,
        rowKind: 'diagnostic',
      });
    }
    if (echoMessages.length > 0) {
      sections.push({
        id: 'echo',
        label: 'Output',
        items: echoMessages,
        rowKind: 'echo',
      });
    }

    return sections;
  }, [echoMessages, errorDiagnostics, infoDiagnostics, warningDiagnostics]);

  const rows = useMemo<Row[]>(() => {
    const nextRows: Row[] = [];

    sectionDescriptors.forEach((section, sectionIndex) => {
      nextRows.push({
        id: `header-${section.id}`,
        kind: 'header',
        label: section.label,
        sectionId: section.id,
        itemCount: section.items.length,
        isCollapsed: collapsedSections[section.id],
        stickyTop: sectionIndex * HEADER_HEIGHT,
        estimatedHeight: HEADER_HEIGHT,
      });

      if (collapsedSections[section.id]) {
        return;
      }

      section.items.forEach((diagnostic, index) => {
        nextRows.push({
          id: getRowId(section.rowKind, section.id, diagnostic, index),
          kind: section.rowKind,
          sectionId: section.id,
          diagnostic,
          showBorder: index < section.items.length - 1,
          estimatedHeight: ITEM_ESTIMATED_HEIGHT,
        });
      });
    });

    return nextRows;
  }, [collapsedSections, sectionDescriptors]);

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

  const headerMetrics = metrics.metrics.filter((metric): metric is HeaderMetric =>
    isHeaderMetric(metric)
  );

  const toggleSection = useCallback(
    (sectionId: SectionId) => {
      const section = sectionDescriptors.find((descriptor) => descriptor.id === sectionId);
      const sectionHeaderMetric = headerMetrics.find(
        (metric) => metric.row.sectionId === sectionId
      );
      const node = scrollRef.current;

      if (!section || !sectionHeaderMetric || !node) {
        setCollapsedSections((current) => ({
          ...current,
          [sectionId]: !current[sectionId],
        }));
        return;
      }

      const isCurrentlyCollapsed = collapsedSections[sectionId];
      const itemHeightDelta = section.items.reduce((total, diagnostic, index) => {
        const rowId = getRowId(section.rowKind, section.id, diagnostic, index);
        return total + (measuredHeights[rowId] ?? ITEM_ESTIMATED_HEIGHT);
      }, 0);
      const shouldAnchorScroll = sectionHeaderMetric.top < scrollTop;
      const scrollDelta = isCurrentlyCollapsed ? itemHeightDelta : -itemHeightDelta;

      setCollapsedSections((current) => ({
        ...current,
        [sectionId]: !current[sectionId],
      }));

      if (!shouldAnchorScroll) {
        return;
      }

      requestAnimationFrame(() => {
        const nextScrollTop = Math.max(0, node.scrollTop + scrollDelta);
        node.scrollTop = nextScrollTop;
        setScrollTop(nextScrollTop);
      });
    },
    [collapsedSections, headerMetrics, measuredHeights, scrollTop, sectionDescriptors]
  );

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

  const stickyHeaderIds = new Set<string>();
  headerMetrics.forEach((metric) => {
    if (scrollTop > metric.top - metric.row.stickyTop) {
      stickyHeaderIds.add(metric.row.id);
    }
  });

  return (
    <div
      ref={scrollRef}
      data-testid="diagnostics-panel"
      className="h-full overflow-y-auto ph-no-capture"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      {headerMetrics
        .filter((metric) => stickyHeaderIds.has(metric.row.id))
        .map((metric) => (
          <HeaderRow
            key={`sticky-${metric.row.id}`}
            label={metric.row.label}
            sectionId={metric.row.sectionId}
            itemCount={metric.row.itemCount}
            isCollapsed={metric.row.isCollapsed}
            onToggle={toggleSection}
            stickyTop={metric.row.stickyTop}
          />
        ))}

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
                  sectionId={metric.row.sectionId}
                  itemCount={metric.row.itemCount}
                  isCollapsed={metric.row.isCollapsed}
                  onToggle={toggleSection}
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
