/**
 * OpenSCAD Customizer Panel
 *
 * Displays interactive controls for OpenSCAD customizer parameters
 * and updates the source code when values change.
 */

import { useMemo, useCallback, useState, useEffect } from 'react';
import type { RenderKind } from '../hooks/useOpenScad';
import { parseCustomizerParams } from '../utils/customizer/parser';
import { isParserReady, onParserReady } from '../utils/formatter/parser';
import type { CustomizerParam, ParameterProminence } from '../utils/customizer/types';
import { ParameterControl } from './customizer/ParameterControl';
import { Button, Text, Toggle } from './ui';
import { TbAdjustmentsHorizontal, TbRefresh, TbSparkles, TbCode, TbDownload } from 'react-icons/tb';
import { eventBus } from '../platform';

interface CustomizerPanelProps {
  code: string;
  baselineCode: string;
  onChange: (newCode: string) => void;
  isCustomizerFirstMode?: boolean;
  previewKind?: RenderKind;
  previewAvailable?: boolean;
  isRendering?: boolean;
  hasRenderErrors?: boolean;
  renderReady?: boolean;
  onRefineWithAi?: () => void;
  onEditCode?: () => void;
  onDownloadStl?: () => void;
  isDownloadingStl?: boolean;
  onDownloadSvg?: () => void;
  isDownloadingSvg?: boolean;
}

interface GroupedParams {
  id: string;
  name: string | null;
  params: CustomizerParam[];
}

const PROMINENCE_ORDER: Record<ParameterProminence, number> = {
  primary: 0,
  secondary: 1,
  advanced: 2,
};


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getParamKey(param: CustomizerParam): string {
  return `${param.line}:${param.name}`;
}

function replaceParamValue(code: string, param: CustomizerParam, nextValue: string): string {
  const assignmentPattern = new RegExp(
    `^(\\s*${escapeRegExp(param.name)}\\s*=\\s*)([^;]+)(;.*)$`,
    'gm'
  );
  return code.replace(assignmentPattern, (_, prefix, __, suffix) => {
    return prefix + nextValue + suffix;
  });
}

function groupParams(params: CustomizerParam[], showAdvanced: boolean): GroupedParams[] {
  const groups = new Map<string, GroupedParams>();

  for (const param of params) {
    if (param.prominence === 'advanced' && !showAdvanced) {
      continue;
    }

    const key = param.group?.trim() || '__default__';
    const existing = groups.get(key);

    if (existing) {
      existing.params.push(param);
      continue;
    }

    groups.set(key, {
      id: key,
      name: key === '__default__' ? null : key,
      params: [param],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    params: [...group.params].sort((a, b) => {
      const aPriority = PROMINENCE_ORDER[a.prominence ?? 'secondary'];
      const bPriority = PROMINENCE_ORDER[b.prominence ?? 'secondary'];
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.line - b.line;
    }),
  }));
}

function isRedundantGroupName(tabName: string, groupName: string | null): boolean {
  if (!groupName) return true;
  return groupName.trim().toLowerCase() === tabName.trim().toLowerCase();
}

function getDownloadDisabledReason({
  renderReady,
  isRendering,
  previewAvailable,
  hasRenderErrors,
}: {
  renderReady: boolean;
  isRendering: boolean;
  previewAvailable: boolean;
  hasRenderErrors: boolean;
}): string | null {
  if (!renderReady) return 'Renderer is still starting up.';
  if (isRendering) return 'Rendering...';
  if (hasRenderErrors) return 'Fix the current render errors before downloading.';
  if (!previewAvailable) return 'Render the model to enable download.';
  return null;
}

function LoadingState() {
  return (
    <div className="p-4 space-y-3" aria-label="Loading customizer">
      {[0, 1, 2].map((block) => (
        <div
          key={block}
          className="rounded-xl p-4 space-y-3 animate-pulse"
          style={{
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <div
            className="h-3 w-24 rounded"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          />
          <div
            className="h-10 rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          />
          <div
            className="h-2 w-32 rounded"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          />
        </div>
      ))}
    </div>
  );
}

export function CustomizerPanel({
  code,
  baselineCode,
  onChange,
  isCustomizerFirstMode = false,
  previewKind,
  previewAvailable = false,
  isRendering = false,
  hasRenderErrors = false,
  renderReady = false,
  onRefineWithAi,
  onEditCode,
  onDownloadStl,
  isDownloadingStl = false,
  onDownloadSvg,
  isDownloadingSvg = false,
}: CustomizerPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [parserReady, setParserReady] = useState(isParserReady);

  useEffect(() => {
    if (parserReady) return;
    return onParserReady(() => setParserReady(true));
  }, [parserReady]);

  const tabs = useMemo(() => {
    if (!parserReady) return [];
    try {
      return parseCustomizerParams(code);
    } catch (err) {
      console.error('[Customizer] Failed to parse parameters:', err);
      return [];
    }
  }, [code, parserReady]);

  // Parse baseline parameters for dirty comparison and reset values.
  // This is purely derived from baselineCode — no refs or effects needed.
  const baselineParams = useMemo(() => {
    if (!parserReady) return new Map<string, string>();
    try {
      return new Map(
        parseCustomizerParams(baselineCode)
          .flatMap((tab) => tab.params)
          .map((p) => [getParamKey(p), p.rawValue])
      );
    } catch {
      return new Map<string, string>();
    }
  }, [baselineCode, parserReady]);

  const advancedParamCount = useMemo(
    () =>
      tabs.reduce(
        (count, tab) => count + tab.params.filter((param) => param.prominence === 'advanced').length,
        0
      ),
    [tabs]
  );
  const groupedTabs = useMemo(
    () =>
      tabs
        .map((tab) => ({
          ...tab,
          groups: groupParams(tab.params, showAdvanced),
        }))
        .filter((tab) => tab.groups.length > 0),
    [showAdvanced, tabs]
  );
  const showTabHeaders = groupedTabs.length > 1 || groupedTabs.some((tab) => tab.name !== 'Parameters');

  const hasChanges = useMemo(() => {
    if (!baselineParams.size) return false;
    for (const tab of tabs) {
      for (const param of tab.params) {
        const baseline = baselineParams.get(getParamKey(param));
        if (baseline !== undefined && param.rawValue !== baseline) {
          return true;
        }
      }
    }
    return false;
  }, [tabs, baselineParams]);

  const handleResetDefaults = useCallback(() => {
    if (!baselineParams.size) return;

    let newCode = code;
    for (const tab of tabs) {
      for (const param of tab.params) {
        const baseline = baselineParams.get(getParamKey(param));
        if (baseline === undefined || param.rawValue === baseline) continue;
        newCode = replaceParamValue(newCode, param, baseline);
      }
    }

    if (newCode !== code) {
      onChange(newCode);
      eventBus.emit('code-updated', { code: newCode, source: 'customizer' });
    }
  }, [code, onChange, tabs, baselineParams]);

  const handleResetParameter = useCallback(
    (param: CustomizerParam) => {
      const baseline = baselineParams.get(getParamKey(param));
      if (baseline === undefined || param.rawValue === baseline) {
        return;
      }

      const newCode = replaceParamValue(code, param, baseline);
      if (newCode !== code) {
        onChange(newCode);
        eventBus.emit('code-updated', { code: newCode, source: 'customizer' });
      }
    },
    [code, onChange, baselineParams]
  );

  const handleParameterChange = useCallback(
    (param: CustomizerParam, newValue: string | number | boolean | number[]) => {
      let formattedValue: string;

      if (typeof newValue === 'boolean') {
        formattedValue = String(newValue);
      } else if (Array.isArray(newValue)) {
        formattedValue = `[${newValue.join(', ')}]`;
      } else if (typeof newValue === 'string') {
        if (param.rawValue.startsWith('"') || param.rawValue.startsWith("'")) {
          formattedValue = `"${newValue}"`;
        } else {
          formattedValue = newValue;
        }
      } else {
        formattedValue = String(newValue);
      }

      const newCode = replaceParamValue(code, param, formattedValue);

      if (newCode !== code) {
        onChange(newCode);
        eventBus.emit('code-updated', { code: newCode, source: 'customizer' });
      } else {
        console.warn('[Customizer] Failed to update parameter:', param.name);
      }
    },
    [code, onChange]
  );

  const downloadDisabledReason = getDownloadDisabledReason({
    renderReady,
    isRendering,
    previewAvailable,
    hasRenderErrors,
  });

  if (!parserReady) {
    return (
      <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <LoadingState />
      </div>
    );
  }

  if (tabs.length === 0) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center p-6 gap-5"
        style={{ backgroundColor: 'var(--bg-primary)' }}
        data-testid="customizer-empty-state"
      >
        <div className="flex flex-col items-center gap-3 text-center max-w-[220px]">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--accent-primary)',
            }}
          >
            <TbAdjustmentsHorizontal size={22} />
          </div>
          <div className="space-y-1.5">
            <Text variant="section-heading" as="h2" className="leading-snug">
              No parameters yet
            </Text>
            <Text variant="caption" className="leading-relaxed">
              Ask the AI to add customizer parameters with sliders and labels.
            </Text>
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full max-w-[200px]">
          <Button
            type="button"
            variant="primary"
            onClick={() => onRefineWithAi?.()}
            className="inline-flex items-center justify-center gap-1.5 text-xs w-full"
            data-testid="customizer-refine-button"
          >
            <TbSparkles size={13} />
            Refine with AI
          </Button>
          {onEditCode && (
            <Button
              type="button"
              variant="secondary"
              onClick={onEditCode}
              className="inline-flex items-center justify-center gap-1.5 text-xs w-full"
            >
              <TbCode size={13} />
              Edit Code
            </Button>
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="sticky top-0 z-10 border-b border-l backdrop-blur"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
          borderColor: 'var(--border-primary)',
        }}
      >
        {isCustomizerFirstMode ? (
          <div className="px-4 py-2 space-y-1">
            <div className="flex items-center gap-2">
              <Text variant="section-heading" as="h2" className="flex-shrink-0">
                Customize
              </Text>
              {advancedParamCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <Toggle
                    checked={showAdvanced}
                    onChange={(event) => setShowAdvanced(event.target.checked)}
                    aria-label="Show advanced controls"
                  />
                  <span>Advanced</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onRefineWithAi?.()}
                  className="inline-flex items-center gap-1"
                  data-testid="customizer-refine-button"
                >
                  <TbSparkles size={12} />
                  Refine
                </Button>
                {previewKind === 'svg' ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onDownloadSvg}
                    disabled={Boolean(downloadDisabledReason) || isDownloadingSvg}
                    className="inline-flex items-center gap-1"
                    data-testid="customizer-download-button"
                  >
                    {isDownloadingSvg ? (
                      <svg
                        className="animate-spin"
                        style={{ width: 12, height: 12 }}
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <TbDownload size={12} />
                    )}
                    Download SVG
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onDownloadStl}
                    disabled={Boolean(downloadDisabledReason) || isDownloadingStl}
                    className="inline-flex items-center gap-1"
                    data-testid="customizer-download-button"
                  >
                    {isDownloadingStl ? (
                      <svg
                        className="animate-spin"
                        style={{ width: 12, height: 12 }}
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <TbDownload size={12} />
                    )}
                    Download STL
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleResetDefaults}
                  disabled={!hasChanges}
                  className="inline-flex items-center gap-1"
                >
                  <TbRefresh size={12} />
                  Reset
                </Button>
              </div>
            </div>
            {downloadDisabledReason && (
              <Text
                variant="caption"
                color={hasRenderErrors ? 'error' : 'tertiary'}
                data-testid="customizer-download-hint"
              >
                {downloadDisabledReason}
              </Text>
            )}
          </div>
        ) : (
          <div className="px-3 py-1.5 flex items-center justify-between gap-3">
            <Text variant="section-heading" as="h2">
              Customize
            </Text>
            <div className="flex items-center gap-2">
              {advancedParamCount > 0 && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <Toggle
                    checked={showAdvanced}
                    onChange={(event) => setShowAdvanced(event.target.checked)}
                    aria-label="Show advanced controls"
                  />
                  <span>Advanced</span>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetDefaults}
                disabled={!hasChanges}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <TbRefresh size={14} />
                Reset to defaults
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 space-y-3">
        {groupedTabs.map((tab) => (
          <section key={tab.name} className="space-y-3">
            {showTabHeaders && (
              <div className="flex items-center justify-between">
                <div>
                  <Text variant="overline">
                    {tab.name}
                  </Text>
                </div>
              </div>
            )}

            {tab.groups.map((group) => (
              (() => {
                const shouldFlattenGroup =
                  tab.groups.length === 1 && isRedundantGroupName(tab.name, group.name);

                if (shouldFlattenGroup) {
                  return (
                    <div key={`${tab.name}-${group.id}`} className="space-y-2">
                      {group.params.map((param) => {
                        const baseline = baselineParams.get(getParamKey(param));
                        const isDirty = baseline !== undefined && param.rawValue !== baseline;

                        return (
                          <ParameterControl
                            key={`${param.name}-${param.line}`}
                            param={param}
                            onChange={(newValue) => handleParameterChange(param, newValue)}
                            isDirty={isDirty}
                            onReset={isDirty ? () => handleResetParameter(param) : undefined}
                          />
                        );
                      })}
                    </div>
                  );
                }

                return (
                  <div
                    key={`${tab.name}-${group.id}`}
                    className="rounded-xl p-3"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  >
                    {group.name && !isRedundantGroupName(tab.name, group.name) && (
                      <div className="mb-2">
                        <Text variant="overline" weight="medium" className="tracking-[0.08em]">
                          {group.name}
                        </Text>
                      </div>
                    )}

                    <div className="space-y-2">
                      {group.params.map((param) => {
                        const baseline = baselineParams.get(getParamKey(param));
                        const isDirty = baseline !== undefined && param.rawValue !== baseline;

                        return (
                          <ParameterControl
                            key={`${param.name}-${param.line}`}
                            param={param}
                            onChange={(newValue) => handleParameterChange(param, newValue)}
                            isDirty={isDirty}
                            onReset={isDirty ? () => handleResetParameter(param) : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
