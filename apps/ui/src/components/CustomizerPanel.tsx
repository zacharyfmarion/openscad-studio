/**
 * OpenSCAD Customizer Panel
 *
 * Displays interactive controls for OpenSCAD customizer parameters
 * and updates the source code when values change.
 */

import { useMemo, useCallback, useState } from 'react';
import { parseCustomizerParams } from '../utils/customizer/parser';
import type { CustomizerParam } from '../utils/customizer/types';
import { ParameterControl } from './customizer/ParameterControl';
import { TbChevronDown, TbChevronRight } from 'react-icons/tb';
import { emit } from '@tauri-apps/api/event';

interface CustomizerPanelProps {
  code: string;
  onChange: (newCode: string) => void;
}

export function CustomizerPanel({ code, onChange }: CustomizerPanelProps) {
  const [collapsedTabs, setCollapsedTabs] = useState<Set<string>>(new Set());

  // Parse parameters from code
  const tabs = useMemo(() => {
    try {
      return parseCustomizerParams(code);
    } catch (err) {
      console.error('[Customizer] Failed to parse parameters:', err);
      return [];
    }
  }, [code]);

  // Handle parameter value change
  const handleParameterChange = useCallback(
    async (param: CustomizerParam, newValue: string | number | boolean | number[]) => {
      // Format the new value as OpenSCAD code
      let formattedValue: string;

      if (typeof newValue === 'boolean') {
        formattedValue = String(newValue);
      } else if (Array.isArray(newValue)) {
        formattedValue = `[${newValue.join(', ')}]`;
      } else if (typeof newValue === 'string') {
        // Check if it was originally a string literal
        if (param.rawValue.startsWith('"') || param.rawValue.startsWith("'")) {
          formattedValue = `"${newValue}"`;
        } else {
          formattedValue = newValue;
        }
      } else {
        formattedValue = String(newValue);
      }

      // Find the assignment in the code and replace the value
      // Pattern: variableName = oldValue;
      let newCode = code;

      // Find the line with this parameter assignment
      // We'll use a more robust approach: find by variable name and replace the value
      const assignmentPattern = new RegExp(`^(\\s*${param.name}\\s*=\\s*)([^;]+)(;.*)$`, 'gm');

      newCode = code.replace(assignmentPattern, (_, prefix, __, suffix) => {
        // Preserve trailing comment if exists
        return prefix + formattedValue + suffix;
      });

      if (newCode !== code) {
        onChange(newCode);

        // Trigger a render after updating the code
        try {
          await emit('render-requested');
          console.log('[Customizer] Triggered render after parameter change:', param.name);
        } catch (err) {
          console.error('[Customizer] Failed to emit render-requested event:', err);
        }
      } else {
        console.warn('[Customizer] Failed to update parameter:', param.name);
      }
    },
    [code, onChange]
  );

  const toggleTab = useCallback((tabName: string) => {
    setCollapsedTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tabName)) {
        next.delete(tabName);
      } else {
        next.add(tabName);
      }
      return next;
    });
  }, []);

  // If no parameters found, show helpful message
  if (tabs.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center p-3"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="text-center">
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            No parameters found
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Add customizer comments:
          </p>
          <pre
            className="mt-2 text-left text-xs p-2 rounded"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              fontSize: '10px',
            }}
          >
            {`width = 10; // [0:100]`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="p-3">
        {tabs.map((tab) => {
          const isCollapsed = collapsedTabs.has(tab.name);

          return (
            <div key={tab.name} className="mb-3">
              {/* Tab header - more compact */}
              <button
                onClick={() => toggleTab(tab.name)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded transition-colors mb-1.5"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              >
                {isCollapsed ? <TbChevronRight size={14} /> : <TbChevronDown size={14} />}
                <span className="font-medium text-xs">{tab.name}</span>
                <span
                  className="text-xs ml-auto"
                  style={{ color: 'var(--text-secondary)', fontSize: '10px' }}
                >
                  {tab.params.length}
                </span>
              </button>

              {/* Tab content */}
              {!isCollapsed && (
                <div className="px-1 space-y-0.5">
                  {tab.params.map((param) => (
                    <ParameterControl
                      key={`${param.name}-${param.line}`}
                      param={param}
                      onChange={(newValue) => handleParameterChange(param, newValue)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
