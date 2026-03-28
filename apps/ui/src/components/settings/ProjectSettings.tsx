import { Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui';
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
            value={settings.viewer.measurementUnit}
            onValueChange={(v) => onViewerChange('measurementUnit', v as MeasurementUnit)}
          >
            <SelectTrigger id="project-measurement-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mm">mm (millimeters)</SelectItem>
              <SelectItem value="cm">cm (centimeters)</SelectItem>
              <SelectItem value="in">in (inches)</SelectItem>
              <SelectItem value="units">units (dimensionless)</SelectItem>
            </SelectContent>
          </Select>
        </SettingsCardSection>
      </SettingsCard>
    </div>
  );
}
