import { useState } from 'react';
import type { IconType } from 'react-icons';
import { TbSparkles, TbCode, TbAdjustmentsHorizontal } from 'react-icons/tb';
import { Button, Text } from './ui';
import type { WorkspacePreset } from '../stores/layoutStore';

interface NuxLayoutPickerProps {
  isOpen: boolean;
  onSelect: (preset: Extract<WorkspacePreset, 'default' | 'ai-first' | 'customizer-first'>) => void;
}
type LayoutPreset = Extract<WorkspacePreset, 'default' | 'ai-first' | 'customizer-first'>;

function RadioIndicator({ selected }: { selected: boolean }) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: `2px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.15s ease',
        flexShrink: 0,
      }}
    >
      {selected && (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-primary)',
          }}
        />
      )}
    </div>
  );
}

export function NuxLayoutPicker({ isOpen, onSelect }: NuxLayoutPickerProps) {
  const [selected, setSelected] = useState<LayoutPreset>('ai-first');

  if (!isOpen) return null;

  const cards: {
    preset: LayoutPreset;
    title: string;
    description: string;
    Icon: IconType;
  }[] = [
    {
      preset: 'ai-first',
      title: 'AI First',
      Icon: TbSparkles,
      description: 'Let AI take the lead',
    },
    {
      preset: 'default',
      title: 'Editor First',
      Icon: TbCode,
      description: 'Hands-on coding',
    },
    {
      preset: 'customizer-first',
      title: 'Customizer First',
      Icon: TbAdjustmentsHorizontal,
      description: 'Preview and tweak dimensions fast',
    },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          animation: 'nux-fade-in 0.2s ease-out',
        }}
      >
        <div className="px-8 pt-8 pb-2 text-center">
          <Text variant="panel-title" className="mb-1 text-xl">
            Choose your workspace layout
          </Text>
          <Text variant="body" color="tertiary">
            You can change this anytime in Settings
          </Text>
        </div>

        <div className="px-8 py-6 grid gap-4 md:grid-cols-3">
          {/* eslint-disable no-restricted-syntax -- large card-buttons with imperative onMouseEnter/Leave hover-lift (translateY + boxShadow); <Button> doesn't support these style mutations */}
          {cards.map(({ preset, title, description, Icon }) => {
            const isSelected = selected === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setSelected(preset)}
                className="flex-1 rounded-lg transition-all duration-150"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: isSelected
                    ? '2px solid var(--accent-primary)'
                    : '1px solid var(--border-primary)',
                  padding: isSelected ? 'calc(1.25rem - 1px)' : '1.25rem',
                  boxShadow: isSelected
                    ? '0 0 0 1px var(--accent-primary), 0 4px 12px rgba(0,0,0,0.15)'
                    : 'none',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                <div
                  className="mx-auto mb-4 flex items-center justify-center rounded-xl"
                  style={{
                    width: 64,
                    height: 64,
                    backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isSelected ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                  }}
                >
                  <Icon size={32} />
                </div>
                <div
                  className="text-sm font-semibold mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {title}
                </div>
                <div className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  {description}
                </div>
                <div className="flex justify-center">
                  <RadioIndicator selected={isSelected} />
                </div>
              </button>
            );
          })}
          {/* eslint-enable no-restricted-syntax */}
        </div>

        <div
          className="flex justify-end px-8 py-4"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <Button variant="primary" onClick={() => onSelect(selected)}>
            Continue
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes nux-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
