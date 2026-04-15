import { TbRefresh } from 'react-icons/tb';
import { Button, Label, SegmentedControl, Text } from '../ui';
import { getAvailableThemes } from '../../themes';
import { useAnalytics, type LayoutSelectionSource } from '../../analytics/runtime';
import { applyWorkspacePreset } from '../../stores/layoutStore';
import type { Settings } from '../../stores/settingsStore';
import { SettingsCard, SettingsCardHeader, SettingsCardSection } from './SettingsPrimitives';
import { ThemePicker } from './ThemePicker';

const DEFAULT_LAYOUT_OPTIONS = [
  { value: 'default' as const, label: 'Editor First' },
  { value: 'ai-first' as const, label: 'AI First' },
  { value: 'customizer-first' as const, label: 'Customizer First' },
];

interface AppearanceSettingsProps {
  settings: Settings;
  onAppearanceChange: <K extends keyof Settings['appearance']>(
    key: K,
    value: Settings['appearance'][K]
  ) => void;
  onDefaultLayoutChange: (preset: Settings['ui']['defaultLayoutPreset']) => void;
}

export function AppearanceSettings({
  settings,
  onAppearanceChange,
  onDefaultLayoutChange,
}: AppearanceSettingsProps) {
  const analytics = useAnalytics();
  const availableThemes = getAvailableThemes();

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
      <SettingsCard>
        <SettingsCardHeader
          title="Layout"
          description="Choose which panel arrangement to use as your default workspace."
        />
        <SettingsCardSection
          className="flex flex-row justify-between items-center"
          style={{ gap: 'var(--space-label-gap)' }}
        >
          <Label>Default Layout</Label>
          <SegmentedControl
            size="sm"
            aria-label="Default workspace layout"
            options={DEFAULT_LAYOUT_OPTIONS}
            value={settings.ui.defaultLayoutPreset}
            onChange={onDefaultLayoutChange}
          />
        </SettingsCardSection>
        <SettingsCardSection
          divided
          className="flex items-center justify-between"
          style={{ gap: 'var(--space-control-gap)' }}
        >
          <Text variant="caption" color="tertiary">
            Restore the current workspace to its default panel arrangement
          </Text>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              analytics.track('workspace layout selected', {
                layout: settings.ui.defaultLayoutPreset,
                source: 'layout_reset' satisfies LayoutSelectionSource,
                is_first_run: false,
              });
              applyWorkspacePreset(settings.ui.defaultLayoutPreset);
            }}
            className="shrink-0 inline-flex items-center text-xs"
            style={{ gap: 'var(--space-1)' }}
          >
            <TbRefresh size={14} />
            Reset layout
          </Button>
        </SettingsCardSection>
      </SettingsCard>

      <SettingsCard data-testid="settings-theme-picker">
        <SettingsCardHeader
          title="Theme"
          description="Choose a color theme for the entire application."
        />
        <SettingsCardSection className="flex flex-col" style={{ gap: 'var(--space-field-gap)' }}>
          <ThemePicker
            themes={availableThemes}
            value={settings.appearance.theme}
            onChange={(themeId) => onAppearanceChange('theme', themeId)}
          />
        </SettingsCardSection>
      </SettingsCard>
    </div>
  );
}
