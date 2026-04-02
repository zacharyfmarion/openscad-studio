import { useState, useEffect } from 'react';
import {
  Button,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Text,
} from '../ui';
import type { Settings, MeasurementUnit } from '../../stores/settingsStore';
import { SettingsCard, SettingsCardHeader, SettingsCardSection } from './SettingsPrimitives';
import { getPlatform } from '../../platform';
import { TbFolder } from 'react-icons/tb';

interface ProjectSettingsProps {
  settings: Settings;
  onViewerChange: <K extends keyof Settings['viewer']>(
    key: K,
    value: Settings['viewer'][K]
  ) => void;
  onProjectChange?: <K extends keyof Settings['project']>(
    key: K,
    value: Settings['project'][K]
  ) => void;
}

export function ProjectSettings({
  settings,
  onViewerChange,
  onProjectChange,
}: ProjectSettingsProps) {
  const { capabilities } = getPlatform();
  const [resolvedDefault, setResolvedDefault] = useState<string | null>(null);

  useEffect(() => {
    if (capabilities.hasFileSystem && !settings.project.defaultProjectDirectory) {
      void getPlatform()
        .getDefaultProjectsDirectory()
        .then((dir) => setResolvedDefault(dir));
    }
  }, [capabilities.hasFileSystem, settings.project.defaultProjectDirectory]);

  const displayPath = settings.project.defaultProjectDirectory || resolvedDefault || '';

  const handlePickDirectory = async () => {
    const platform = getPlatform();
    const picked = await platform.pickDirectory();
    if (picked) {
      onProjectChange?.('defaultProjectDirectory', picked);
    }
  };

  const handleResetDirectory = () => {
    onProjectChange?.('defaultProjectDirectory', '');
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
      {capabilities.hasFileSystem && (
        <SettingsCard>
          <SettingsCardHeader
            title="Default Project Directory"
            description="New projects will be created in this folder. Each project gets its own subdirectory."
          />
          <SettingsCardSection className="flex flex-col" style={{ gap: 'var(--space-label-gap)' }}>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 px-3 py-2 rounded text-sm truncate"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                }}
                title={displayPath}
              >
                <TbFolder className="inline mr-2 -mt-0.5" size={14} />
                {displayPath || 'Not set'}
              </div>
              <Button
                variant="secondary"
                onClick={handlePickDirectory}
                className="shrink-0 text-sm"
              >
                Browse
              </Button>
            </div>
            {settings.project.defaultProjectDirectory && (
              <Text variant="caption" color="tertiary">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleResetDirectory();
                  }}
                  className="underline hover:no-underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Reset to default
                </a>
              </Text>
            )}
          </SettingsCardSection>
        </SettingsCard>
      )}

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
