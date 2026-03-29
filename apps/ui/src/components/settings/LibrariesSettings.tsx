import { TbFolderOpen, TbPlus, TbTrash } from 'react-icons/tb';
import { Button, IconButton } from '../ui';
import type { Settings } from '../../stores/settingsStore';
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardSection,
  SettingsControlRow,
  SettingsSubsectionLabel,
  SettingsSupportBlock,
} from './SettingsPrimitives';
import { Toggle } from '../ui';

interface LibrariesSettingsProps {
  settings: Settings;
  autoDiscoveredPaths: string[];
  onLibraryChange: <K extends keyof Settings['library']>(
    key: K,
    value: Settings['library'][K]
  ) => void;
  onAddPath: () => void;
  onRemovePath: (path: string) => void;
}

export function LibrariesSettings({
  settings,
  autoDiscoveredPaths,
  onLibraryChange,
  onAddPath,
  onRemovePath,
}: LibrariesSettingsProps) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
      <SettingsCard>
        <SettingsControlRow
          label="Auto-discover System Libraries"
          description="Automatically find OpenSCAD libraries in standard system locations"
          control={
            <Toggle
              checked={settings.library.autoDiscoverSystem}
              onChange={(v) => onLibraryChange('autoDiscoverSystem', v)}
            />
          }
        />

        {settings.library.autoDiscoverSystem && (
          <SettingsCardSection
            divided
            className="flex flex-col"
            style={{ gap: 'var(--space-label-gap)' }}
          >
            <SettingsSubsectionLabel>System Paths</SettingsSubsectionLabel>
            {autoDiscoveredPaths.length === 0 ? (
              <SettingsSupportBlock
                className="text-sm italic"
                style={{ color: 'var(--text-tertiary)' }}
              >
                No system libraries found
              </SettingsSupportBlock>
            ) : (
              <div className="flex flex-col" style={{ gap: 'var(--space-control-gap)' }}>
                {autoDiscoveredPaths.map((path) => (
                  <SettingsSupportBlock
                    key={path}
                    className="flex items-center text-sm"
                    style={{ gap: 'var(--space-control-gap)', opacity: 0.8 }}
                  >
                    <span style={{ color: 'var(--color-success)' }}>✓</span>
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {path}
                    </span>
                  </SettingsSupportBlock>
                ))}
              </div>
            )}
          </SettingsCardSection>
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader
          title="Custom Paths"
          description="Manage additional OpenSCAD library folders."
          action={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onAddPath}
              className="flex items-center"
              style={{
                color: 'var(--accent-primary)',
                border: '1px solid var(--border-primary)',
                gap: 'var(--space-1)',
              }}
            >
              <TbPlus size={14} /> Add Path
            </Button>
          }
        />

        <SettingsCardSection>
          {settings.library.customPaths.length === 0 ? (
            <SettingsSupportBlock
              className="text-sm italic text-center border border-dashed"
              style={{
                color: 'var(--text-tertiary)',
                borderColor: 'var(--border-primary)',
                backgroundColor: 'transparent',
              }}
            >
              No custom library paths added
            </SettingsSupportBlock>
          ) : (
            <div className="flex flex-col" style={{ gap: 'var(--space-control-gap)' }}>
              {settings.library.customPaths.map((path) => (
                <SettingsSupportBlock
                  key={path}
                  className="flex items-center justify-between group"
                  style={{
                    gap: 'var(--space-control-gap)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <div
                    className="flex items-center min-w-0"
                    style={{ gap: 'var(--space-control-gap)' }}
                  >
                    <TbFolderOpen size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {path}
                    </span>
                  </div>
                  <IconButton
                    size="sm"
                    onClick={() => onRemovePath(path)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Remove path"
                  >
                    <TbTrash size={14} />
                  </IconButton>
                </SettingsSupportBlock>
              ))}
            </div>
          )}
        </SettingsCardSection>
      </SettingsCard>
    </div>
  );
}
