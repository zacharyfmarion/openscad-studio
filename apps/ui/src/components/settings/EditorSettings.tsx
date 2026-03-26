import { useRef } from 'react';
import { Editor as MonacoEditor } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { Button, Label, Select, Toggle, Text } from '../ui';
import { getTheme } from '../../themes';
import { getDefaultVimConfig } from '../../stores/settingsStore';
import { registerVimConfigLanguage } from '../../languages/vimConfigLanguage';
import type { Settings } from '../../stores/settingsStore';
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardSection,
  SettingsControlRow,
} from './SettingsPrimitives';

interface EditorSettingsProps {
  settings: Settings;
  onEditorChange: <K extends keyof Settings['editor']>(
    key: K,
    value: Settings['editor'][K]
  ) => void;
  localVimConfig: string;
  onLocalVimConfigChange: (val: string) => void;
}

export function EditorSettings({
  settings,
  onEditorChange,
  localVimConfig,
  onLocalVimConfigChange,
}: EditorSettingsProps) {
  const vimEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
      {/* General */}
      <SettingsCard>
        <SettingsControlRow
          data-testid="settings-format-on-save"
          label="Format on Save"
          description="Automatically format OpenSCAD code when saving files"
          control={
            <Toggle
              checked={settings.editor.formatOnSave}
              onChange={(e) => onEditorChange('formatOnSave', e.target.checked)}
            />
          }
        />

        <SettingsCardSection
          divided
          className="flex flex-col"
          style={{ gap: 'var(--space-label-gap)' }}
        >
          <Label>Indent Size</Label>
          <Select
            value={settings.editor.indentSize}
            onChange={(e) => onEditorChange('indentSize', Number(e.target.value))}
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
            <option value={8}>8 spaces</option>
          </Select>
        </SettingsCardSection>

        <SettingsControlRow
          divided
          label="Use Tabs"
          description="Use tab characters instead of spaces for indentation"
          control={
            <Toggle
              checked={settings.editor.useTabs}
              onChange={(e) => onEditorChange('useTabs', e.target.checked)}
            />
          }
        />

        <SettingsControlRow
          divided
          label="Auto-Render on Idle"
          description="Automatically render preview after you stop typing"
          control={
            <Toggle
              checked={settings.editor.autoRenderOnIdle}
              onChange={(e) => onEditorChange('autoRenderOnIdle', e.target.checked)}
            />
          }
        />

        {settings.editor.autoRenderOnIdle && (
          <SettingsCardSection
            divided
            className="flex flex-col"
            style={{ gap: 'var(--space-label-gap)' }}
          >
            <Label>Render Delay</Label>
            <Select
              value={settings.editor.autoRenderDelayMs}
              onChange={(e) => onEditorChange('autoRenderDelayMs', Number(e.target.value))}
            >
              <option value={300}>300ms (fast)</option>
              <option value={500}>500ms (default)</option>
              <option value={1000}>1 second</option>
              <option value={2000}>2 seconds</option>
            </Select>
          </SettingsCardSection>
        )}
      </SettingsCard>

      {/* Vim */}
      <SettingsCard>
        <SettingsControlRow
          label="Enable Vim Mode"
          description="Enable vim keybindings and modal editing in the editor"
          control={
            <Toggle
              checked={settings.editor.vimMode}
              onChange={(e) => onEditorChange('vimMode', e.target.checked)}
              data-testid="vim-mode-toggle"
            />
          }
        />
      </SettingsCard>

      {settings.editor.vimMode && (
        <SettingsCard>
          <SettingsCardHeader
            title="Vim Configuration"
            description="Customize vim keybindings using vim-style commands. Lines starting with # are comments."
            action={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onLocalVimConfigChange(getDefaultVimConfig())}
                style={{
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                Reset to Defaults
              </Button>
            }
          />
          <SettingsCardSection className="flex flex-col" style={{ gap: 'var(--space-field-gap)' }}>
            <div
              style={{
                height: '260px',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}
            >
              <MonacoEditor
                key={`vim-config-editor-${settings.editor.vimMode}`}
                height="100%"
                defaultLanguage="vimconfig"
                theme={getTheme(settings.appearance.theme).monaco}
                value={localVimConfig}
                onChange={(val) => onLocalVimConfigChange(val ?? '')}
                beforeMount={(monaco) => {
                  registerVimConfigLanguage(monaco);

                  const themeIds = [
                    'solarized-dark',
                    'solarized-light',
                    'monokai',
                    'dracula',
                    'one-dark-pro',
                    'github-dark',
                    'github-light',
                    'nord',
                    'tokyo-night',
                    'gruvbox-dark',
                    'gruvbox-light',
                  ];

                  themeIds.forEach((id) => {
                    const theme = getTheme(id);
                    if (theme.monacoTheme) {
                      try {
                        monaco.editor.defineTheme(id, theme.monacoTheme);
                      } catch {
                        // Theme might already be registered, ignore error
                      }
                    }
                  });
                }}
                onMount={(editor) => {
                  vimEditorRef.current = editor;
                  editor.updateOptions({ readOnly: false, domReadOnly: false });
                  editor.focus();
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                  tabSize: 2,
                  renderLineHighlight: 'line',
                  contextmenu: true,
                  quickSuggestions: false,
                  parameterHints: { enabled: false },
                }}
              />
            </div>
            <div
              className="flex items-center justify-between"
              style={{ gap: 'var(--space-control-gap)' }}
            >
              <Text variant="caption" color="tertiary">
                Supported: <code style={{ color: 'var(--text-primary)' }}>map</code>,{' '}
                <code style={{ color: 'var(--text-primary)' }}>imap</code>,{' '}
                <code style={{ color: 'var(--text-primary)' }}>nmap</code>,{' '}
                <code style={{ color: 'var(--text-primary)' }}>vmap</code>
                {' • '}
                Example:{' '}
                <code style={{ color: 'var(--text-primary)' }}>map kj &lt;Esc&gt; insert</code>
              </Text>
              <Button
                type="button"
                size="sm"
                variant={localVimConfig !== settings.editor.vimConfig ? 'primary' : 'ghost'}
                onClick={() => onEditorChange('vimConfig', localVimConfig)}
                disabled={localVimConfig === settings.editor.vimConfig}
                className="shrink-0"
              >
                Apply
              </Button>
            </div>
          </SettingsCardSection>
        </SettingsCard>
      )}
    </div>
  );
}
