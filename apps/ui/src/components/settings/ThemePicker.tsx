import { getTheme } from '../../themes';

interface ThemeSection {
  category: string;
  themes: Array<{ id: string; name: string }>;
}

interface ThemePickerProps {
  themes: ThemeSection[];
  value: string;
  onChange: (themeId: string) => void;
}

export function ThemePicker({ themes, value, onChange }: ThemePickerProps) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-field-gap)' }}>
      {themes.map((section) => (
        <div
          key={section.category}
          className="flex flex-col"
          style={{ gap: 'var(--space-label-gap)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {section.category}
          </div>
          {/* eslint-disable no-restricted-syntax -- theme picker cards need onMouseEnter/Leave hover-lift effect; <Button> doesn't support imperative hover style mutations */}
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-control-gap)' }}>
            {section.themes.map((t) => {
              const themeData = getTheme(t.id);
              const isSelected = value === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange(t.id)}
                  className="flex flex-col rounded-lg text-left transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: isSelected
                      ? '2px solid var(--accent-primary)'
                      : '1px solid var(--border-primary)',
                    gap: 'var(--space-label-gap)',
                    padding: isSelected ? 'calc(var(--space-3) - 1px)' : 'var(--space-3)',
                    boxShadow: isSelected ? '0 0 0 1px var(--accent-primary)' : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  <span
                    className="text-xs truncate w-full"
                    style={{
                      color: 'var(--text-primary)',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {t.name}
                  </span>
                  <div className="flex h-3 rounded-sm overflow-hidden w-full">
                    <div className="flex-1" style={{ background: themeData.colors.bg.primary }} />
                    <div
                      className="flex-1"
                      style={{ background: themeData.colors.accent.primary }}
                    />
                    <div className="flex-1" style={{ background: themeData.colors.text.primary }} />
                    <div className="flex-1" style={{ background: themeData.colors.bg.secondary }} />
                    <div
                      className="flex-1"
                      style={{ background: themeData.colors.semantic.error }}
                    />
                    <div
                      className="flex-1"
                      style={{ background: themeData.colors.semantic.success }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          {/* eslint-enable no-restricted-syntax */}
        </div>
      ))}
    </div>
  );
}
