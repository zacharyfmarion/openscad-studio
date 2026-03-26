import { Label, Select } from '../ui';
import type { Settings, MeasurementUnit } from '../../stores/settingsStore';
import { SettingsCard, SettingsCardHeader, SettingsCardSection } from './SettingsPrimitives';

interface ProjectSettingsProps {
  settings: Settings;
  onViewerChange: <K extends keyof Settings['viewer']>(
    key: K,
    value: Settings['viewer'][K]
  ) => void;
}

export function ProjectSettings({ settings, onViewerChange }: ProjectSettingsProps) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
      <SettingsCard>
        <SettingsCardHeader
          title="Measurements"
          description="Configure how measurements are displayed across all viewers."
        />
        <SettingsCardSection className="flex flex-col" style={{ gap: 'var(--space-label-gap)' }}>
          <Label htmlFor="project-measurement-unit">Measurement Unit</Label>
          <Select
            id="project-measurement-unit"
            value={settings.viewer.measurementUnit}
            onChange={(e) => onViewerChange('measurementUnit', e.target.value as MeasurementUnit)}
          >
            <option value="mm">mm (millimeters)</option>
            <option value="cm">cm (centimeters)</option>
            <option value="in">in (inches)</option>
            <option value="units">units (dimensionless)</option>
          </Select>
        </SettingsCardSection>
      </SettingsCard>
    </div>
  );
}
