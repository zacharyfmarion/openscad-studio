/**
 * Individual Parameter Control Components for OpenSCAD Customizer
 */

import { Children, type ChangeEvent, useState, useEffect, useRef } from 'react';
import type { CustomizerParam } from '../../utils/customizer/types';
import { IconButton, RangeSlider, Select, Toggle } from '../ui';
import { TbRefresh } from 'react-icons/tb';

interface ParameterControlProps {
  param: CustomizerParam;
  onChange: (newValue: string | number | boolean | number[]) => void;
  isDirty?: boolean;
  onReset?: () => void;
}

const VECTOR_AXIS_LABELS = ['X', 'Y', 'Z', 'W'];

function titleCaseName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function getDisplayLabel(param: CustomizerParam): string {
  return param.label?.trim() || titleCaseName(param.name);
}

function ControlShell({
  param,
  children,
  inlineMeta,
  isDirty = false,
  onReset,
}: {
  param: CustomizerParam;
  children: React.ReactNode;
  inlineMeta?: React.ReactNode;
  isDirty?: boolean;
  onReset?: () => void;
}) {
  const displayLabel = getDisplayLabel(param);
  const hasChildren = Children.count(children) > 0;

  return (
    <div
      className="rounded-xl border p-2.5"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: isDirty ? 'var(--accent-primary)' : 'var(--border-primary)',
        boxShadow: isDirty ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 35%, transparent)' : undefined,
      }}
      data-testid={`customizer-control-${param.name}`}
    >
      <div className={`flex items-start justify-between gap-3 ${hasChildren ? 'mb-2' : ''}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor={`param-${param.name}`}
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {displayLabel}
            </label>
            {isDirty && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                  color: 'var(--accent-primary)',
                }}
              >
                Edited
              </span>
            )}
          </div>

          {param.description && (
            <p
              className="mt-0.5 text-xs"
              style={{
                color: 'var(--text-secondary)',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
              }}
              title={param.description}
            >
              {param.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {inlineMeta}
          {isDirty && onReset && (
            <IconButton
              size="sm"
              onClick={onReset}
              aria-label={`Reset ${displayLabel}`}
              title={`Reset ${displayLabel}`}
            >
              <TbRefresh size={14} />
            </IconButton>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

function ValueWithUnit({
  value,
  unit,
  className,
}: {
  value: React.ReactNode;
  unit?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center overflow-hidden rounded-lg border${className ? ` ${className}` : ''}`}
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <div className="flex-1">{value}</div>
      {unit && (
        <span
          className="px-2 text-xs"
          style={{
            color: 'var(--text-tertiary)',
            borderLeft: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          {unit}
        </span>
      )}
    </div>
  );
}

export function ParameterControl({ param, onChange, isDirty = false, onReset }: ParameterControlProps) {
  switch (param.type) {
    case 'boolean':
      return <BooleanControl param={param} onChange={onChange} isDirty={isDirty} onReset={onReset} />;
    case 'slider':
      return <SliderControl param={param} onChange={onChange} isDirty={isDirty} onReset={onReset} />;
    case 'dropdown':
      return <DropdownControl param={param} onChange={onChange} isDirty={isDirty} onReset={onReset} />;
    case 'vector':
      return <VectorControl param={param} onChange={onChange} isDirty={isDirty} onReset={onReset} />;
    case 'string':
      return <StringControl param={param} onChange={onChange} isDirty={isDirty} onReset={onReset} />;
    case 'number':
    default:
      return <NumberControl param={param} onChange={onChange} isDirty={isDirty} onReset={onReset} />;
  }
}

function BooleanControl({ param, onChange, isDirty, onReset }: ParameterControlProps) {
  const checked = Boolean(param.value);
  const displayLabel = getDisplayLabel(param);

  return (
    <ControlShell
      param={param}
      isDirty={isDirty}
      onReset={onReset}
      inlineMeta={
        <Toggle
          id={`param-${param.name}`}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={displayLabel}
          className="shrink-0"
        />
      }
    />
  );
}

function SliderControl({ param, onChange, isDirty, onReset }: ParameterControlProps) {
  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const step = param.step ?? 1;
  const [localValue, setLocalValue] = useState(Number(param.value));
  const debounceTimerRef = useRef<number | null>(null);
  const fillPercent = max > min ? ((localValue - min) / (max - min)) * 100 : 0;

  useEffect(() => {
    setLocalValue(Number(param.value));
  }, [param.value]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSliderChange = (newValue: number) => {
    setLocalValue(newValue);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      onChange(newValue);
    }, 120);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLocalValue(Number(event.target.value));
  };

  const handleCommit = () => {
    const numericValue = Number(localValue);
    if (Number.isNaN(numericValue)) {
      setLocalValue(Number(param.value));
      return;
    }

    const clampedValue = Math.min(max, Math.max(min, numericValue));
    setLocalValue(clampedValue);
    if (clampedValue !== param.value) {
      onChange(clampedValue);
    }
  };

  const inlineValueInput = (
    <div
      className="flex items-center rounded-lg border overflow-hidden"
      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-elevated)' }}
    >
      <input
        type="number"
        id={`param-${param.name}`}
        value={localValue}
        onChange={handleInputChange}
        onBlur={handleCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            handleCommit();
            event.currentTarget.blur();
          }
        }}
        min={min}
        max={max}
        step={step}
        className="customizer-number-input bg-transparent text-sm text-right outline-none"
        style={{ color: 'var(--text-primary)', width: '52px', padding: '2px 6px' }}
      />
      {param.unit && (
        <span
          className="px-1.5 text-xs shrink-0"
          style={{
            color: 'var(--text-tertiary)',
            borderLeft: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            padding: '3px 6px',
          }}
        >
          {param.unit}
        </span>
      )}
    </div>
  );

  return (
    <ControlShell param={param} isDirty={isDirty} onReset={onReset} inlineMeta={inlineValueInput}>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {min}
        </span>
        <RangeSlider
          id={`param-${param.name}-slider`}
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={handleSliderChange}
          aria-label={`${getDisplayLabel(param)} slider`}
          className="flex-1"
        />
        <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {max}
        </span>
      </div>
    </ControlShell>
  );
}

function DropdownControl({ param, onChange, isDirty, onReset }: ParameterControlProps) {
  const value = String(param.value);

  return (
    <ControlShell param={param} isDirty={isDirty} onReset={onReset}>
      <Select
        id={`param-${param.name}`}
        value={value}
        onChange={(event) => {
          const option = param.options?.find((candidate) => String(candidate.value) === event.target.value);
          if (option) {
            onChange(option.value);
          }
        }}
        size="sm"
      >
        {param.options?.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </Select>
    </ControlShell>
  );
}

function NumberControl({ param, onChange, isDirty, onReset }: ParameterControlProps) {
  const [localValue, setLocalValue] = useState(String(param.value));

  useEffect(() => {
    setLocalValue(String(param.value));
  }, [param.value]);

  const handleCommit = () => {
    const numericValue = Number(localValue);
    if (Number.isNaN(numericValue)) {
      setLocalValue(String(param.value));
      return;
    }
    if (numericValue !== param.value) {
      onChange(numericValue);
    }
  };

  return (
    <ControlShell param={param} isDirty={isDirty} onReset={onReset}>
      <ValueWithUnit
        unit={param.unit}
        className="w-36"
        value={
          <input
            type="number"
            id={`param-${param.name}`}
            value={localValue}
            onChange={(event) => setLocalValue(event.target.value)}
            onBlur={handleCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleCommit();
                event.currentTarget.blur();
              }
            }}
            className="customizer-number-input w-full bg-transparent px-3 py-2 text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        }
      />
    </ControlShell>
  );
}

function StringControl({ param, onChange, isDirty, onReset }: ParameterControlProps) {
  const [localValue, setLocalValue] = useState(String(param.value));

  useEffect(() => {
    setLocalValue(String(param.value));
  }, [param.value]);

  const handleCommit = () => {
    if (localValue !== param.value) {
      onChange(localValue);
    }
  };

  return (
    <ControlShell param={param} isDirty={isDirty} onReset={onReset}>
      <ValueWithUnit
        unit={param.unit}
        value={
          <input
            type="text"
            id={`param-${param.name}`}
            value={localValue}
            onChange={(event) => setLocalValue(event.target.value)}
            onBlur={handleCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleCommit();
                event.currentTarget.blur();
              }
            }}
            className="w-full bg-transparent px-3 py-2 text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        }
      />
    </ControlShell>
  );
}

function VectorControl({ param, onChange, isDirty, onReset }: ParameterControlProps) {
  const values = Array.isArray(param.value) ? param.value : [];
  const [localValues, setLocalValues] = useState(values.map(String));

  useEffect(() => {
    setLocalValues(values.map(String));
  }, [param.value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCommit = (index: number) => {
    const numericValue = Number(localValues[index]);
    if (Number.isNaN(numericValue)) {
      setLocalValues(values.map(String));
      return;
    }

    if (numericValue !== values[index]) {
      const nextValues = [...values];
      nextValues[index] = numericValue;
      onChange(nextValues);
    }
  };

  const handleLocalChange = (index: number, nextValue: string) => {
    const nextValues = [...localValues];
    nextValues[index] = nextValue;
    setLocalValues(nextValues);
  };

  return (
    <ControlShell param={param} isDirty={isDirty} onReset={onReset}>
      <div className="grid gap-2 sm:grid-cols-2">
        {values.map((_value, index) => {
          const axisLabel = VECTOR_AXIS_LABELS[index] ?? `[${index}]`;
          return (
            <div key={index}>
              <label
                htmlFor={`param-${param.name}-${index}`}
                className="mb-1 block text-[11px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {axisLabel}
              </label>
              <ValueWithUnit
                unit={param.unit}
                value={
                  <input
                    type="number"
                    id={`param-${param.name}-${index}`}
                    value={localValues[index]}
                    onChange={(event) => handleLocalChange(index, event.target.value)}
                    onBlur={() => handleCommit(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleCommit(index);
                        event.currentTarget.blur();
                      }
                    }}
                    className="customizer-number-input w-full bg-transparent px-3 py-2 text-sm outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                }
              />
            </div>
          );
        })}
      </div>
    </ControlShell>
  );
}
