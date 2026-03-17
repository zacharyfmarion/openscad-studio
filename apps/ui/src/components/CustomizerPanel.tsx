/**
 * OpenSCAD Customizer Panel
 *
 * Displays interactive controls for OpenSCAD customizer parameters
 * and updates the source code when values change.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import type { RenderKind } from '../hooks/useOpenScad';
import { parseCustomizerParams } from '../utils/customizer/parser';
import { isParserReady, onParserReady } from '../utils/formatter/parser';
import type { CustomizerParam, ParameterProminence } from '../utils/customizer/types';
import { ParameterControl } from './customizer/ParameterControl';
import { Button, Toggle } from './ui';
import { TbAdjustmentsHorizontal, TbRefresh, TbSparkles, TbCode, TbDownload } from 'react-icons/tb';
import { eventBus } from '../platform';

interface CustomizerPanelProps {
  code: string;
  onChange: (newCode: string) => void;
  isCustomizerFirstMode?: boolean;
  previewKind?: RenderKind;
  previewAvailable?: boolean;
  isRendering?: boolean;
  hasRenderErrors?: boolean;
  renderReady?: boolean;
  onRefineWithAi?: (suggestion: string) => void;
  onEditCode?: () => void;
  onDownloadStl?: () => void;
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

const NO_PARAMS_SUGGESTION =
  'Make this model customizable with top-level parameters, slider ranges, and user-friendly labels.';
const IMPROVE_PARAMS_SUGGESTION =
  'Improve this customizer by adding better ranges, labels, groups, and print-safe defaults.';

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

function buildParameterIdentity(tabs: ReturnType<typeof parseCustomizerParams>): string {
  return tabs
    .flatMap((tab) => tab.params.map((param) => `${tab.name}:${param.line}:${param.name}`))
    .join('|');
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
  previewKind,
}: {
  renderReady: boolean;
  isRendering: boolean;
  previewAvailable: boolean;
  hasRenderErrors: boolean;
  previewKind: RenderKind | undefined;
}): string | null {
  if (!renderReady) return 'Renderer is still starting up.';
  if (isRendering) return 'Rendering...';
  if (hasRenderErrors) return 'Fix the current render errors before downloading.';
  if (!previewAvailable) return 'Render the model to enable STL download.';
  if (previewKind !== 'mesh') return 'STL download is only available for 3D previews.';
  return null;
}

function LoadingState() {
  return (
    <div className="p-4 space-y-3" aria-label="Loading customizer">
      {[0, 1, 2].map((block) => (
        <div
          key={block}
          className="rounded-xl border p-4 space-y-3 animate-pulse"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
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
}: CustomizerPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const defaultsRef = useRef<Map<string, string>>(new Map());
  const defaultsSignatureRef = useRef<string>('');
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

  const parameterIdentity = useMemo(() => buildParameterIdentity(tabs), [tabs]);

  useEffect(() => {
    if (!tabs.length) {
      defaultsRef.current = new Map();
      defaultsSignatureRef.current = '';
      return;
    }

    if (defaultsSignatureRef.current === parameterIdentity) {
      return;
    }

    const defaults = new Map<string, string>();
    for (const tab of tabs) {
      for (const param of tab.params) {
        defaults.set(getParamKey(param), param.rawValue);
      }
    }

    defaultsRef.current = defaults;
    defaultsSignatureRef.current = parameterIdentity;
  }, [parameterIdentity, tabs]);

  const totalParams = useMemo(
    () => tabs.reduce((count, tab) => count + tab.params.length, 0),
    [tabs]
  );
  const advancedParamCount = useMemo(
    () =>
      tabs.reduce(
        (count, tab) => count + tab.params.filter((param) => param.prominence === 'advanced').length,
        0
      ),
    [tabs]
  );
  const richMetadataCount = useMemo(
    () =>
      tabs.reduce(
        (count, tab) =>
          count +
          tab.params.filter(
            (param) => Boolean(param.label || param.description || param.unit || param.group)
          ).length,
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
    const defaults = defaultsRef.current;
    if (!defaults.size) return false;

    for (const tab of tabs) {
      for (const param of tab.params) {
        const defaultValue = defaults.get(getParamKey(param));
        if (defaultValue !== undefined && param.rawValue !== defaultValue) {
          return true;
        }
      }
    }

    return false;
  }, [tabs]);

  const handleResetDefaults = useCallback(() => {
    const defaults = defaultsRef.current;
    if (!defaults.size) return;

    let newCode = code;
    for (const tab of tabs) {
      for (const param of tab.params) {
        const defaultValue = defaults.get(getParamKey(param));
        if (defaultValue === undefined || param.rawValue === defaultValue) continue;
        newCode = replaceParamValue(newCode, param, defaultValue);
      }
    }

    if (newCode !== code) {
      onChange(newCode);
      eventBus.emit('code-updated', { code: newCode });
    }
  }, [code, onChange, tabs]);

  const handleResetParameter = useCallback(
    (param: CustomizerParam) => {
      const defaultValue = defaultsRef.current.get(getParamKey(param));
      if (defaultValue === undefined || param.rawValue === defaultValue) {
        return;
      }

      const newCode = replaceParamValue(code, param, defaultValue);
      if (newCode !== code) {
        onChange(newCode);
        eventBus.emit('code-updated', { code: newCode });
      }
    },
    [code, onChange]
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
        eventBus.emit('code-updated', { code: newCode });
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
    previewKind,
  });

  const refineSuggestion =
    totalParams === 0 || richMetadataCount === 0 ? NO_PARAMS_SUGGESTION : IMPROVE_PARAMS_SUGGESTION;

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
        className="h-full overflow-y-auto p-4"
        style={{ backgroundColor: 'var(--bg-primary)' }}
        data-testid="customizer-empty-state"
      >
        <div
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-primary)' }}
            >
              <TbAdjustmentsHorizontal size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                This model is not customizable yet
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Ask the AI to expose top-level parameters with slider ranges and friendly labels.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="primary"
              onClick={() => onRefineWithAi?.(NO_PARAMS_SUGGESTION)}
              className="inline-flex items-center gap-1.5 text-xs"
              data-testid="customizer-refine-button"
            >
              <TbSparkles size={14} />
              Refine with AI
            </Button>
            {onEditCode && (
              <Button
                type="button"
                variant="secondary"
                onClick={onEditCode}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <TbCode size={14} />
                Edit Code
              </Button>
            )}
          </div>

          <div
            className="mt-4 rounded-xl border p-3"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-secondary)',
            }}
          >
            <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Manual syntax example
            </p>
            <pre
              className="text-xs whitespace-pre-wrap"
              style={{
                color: 'var(--text-secondary)',
                fontSize: '11px',
              }}
            >
              {`/* [Dimensions] */
// @studio {"label":"Width","unit":"mm"}
width = 60; // [40:1:120]`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="sticky top-0 z-10 border-b px-3 py-2.5 backdrop-blur"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
          borderColor: 'var(--border-primary)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Customize
              </h2>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleResetDefaults}
            disabled={!hasChanges}
            className="inline-flex items-center gap-1.5 text-xs"
          >
            <TbRefresh size={14} />
            Reset all
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
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

          {isCustomizerFirstMode && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={onDownloadStl}
                disabled={Boolean(downloadDisabledReason)}
                className="inline-flex items-center gap-1.5 text-xs"
                data-testid="customizer-download-button"
              >
                <TbDownload size={14} />
                Download STL
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onRefineWithAi?.(refineSuggestion)}
                className="inline-flex items-center gap-1.5 text-xs"
                data-testid="customizer-refine-button"
              >
                <TbSparkles size={14} />
                Refine with AI
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onEditCode}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <TbCode size={14} />
                Edit Code
              </Button>
            </div>
          )}
        </div>

        {isCustomizerFirstMode && downloadDisabledReason && (
          <p
            className="mt-2 text-xs"
            style={{
              color: hasRenderErrors ? 'var(--color-error)' : 'var(--text-tertiary)',
            }}
            data-testid="customizer-download-hint"
          >
            {downloadDisabledReason}
          </p>
        )}
      </div>

      <div className="p-3 space-y-3">
        {groupedTabs.map((tab) => (
          <section key={tab.name} className="space-y-3">
            {showTabHeaders && (
              <div className="flex items-center justify-between">
                <div>
                  <h3
                    className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {tab.name}
                  </h3>
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
                        const defaultValue = defaultsRef.current.get(getParamKey(param));
                        const isDirty = defaultValue !== undefined && param.rawValue !== defaultValue;

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
                    className="rounded-xl border p-3"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                    }}
                  >
                    {group.name && !isRedundantGroupName(tab.name, group.name) && (
                      <div className="mb-2">
                        <h4
                          className="text-xs font-medium uppercase tracking-[0.08em]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {group.name}
                        </h4>
                      </div>
                    )}

                    <div className="space-y-2">
                      {group.params.map((param) => {
                        const defaultValue = defaultsRef.current.get(getParamKey(param));
                        const isDirty = defaultValue !== undefined && param.rawValue !== defaultValue;

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
