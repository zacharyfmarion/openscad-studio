import { useAnalytics } from '../../analytics/runtime';
import { Label, Toggle, Text } from '../ui';
import type { Settings } from '../../stores/settingsStore';

interface PrivacySettingsProps {
  settings: Settings;
  onPrivacyChange: <K extends keyof Settings['privacy']>(
    key: K,
    value: Settings['privacy'][K]
  ) => void;
}

export function PrivacySettings({ settings, onPrivacyChange }: PrivacySettingsProps) {
  const analytics = useAnalytics();

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        <div
          className="flex items-center justify-between gap-4 p-4"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="pr-4">
            <Label className="mb-0">Share anonymous product analytics</Label>
            <Text variant="caption" color="tertiary" className="mt-1">
              Anonymous product journeys help us understand how the app is used. Session recording
              stays disabled.
            </Text>
          </div>
          <Toggle
            checked={settings.privacy.analyticsEnabled}
            onChange={(event) => {
              const nextValue = event.target.checked;
              onPrivacyChange('analyticsEnabled', nextValue);
              analytics.setAnalyticsEnabled(nextValue, { capturePreferenceChange: true });
            }}
          />
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Text
              variant="caption"
              color="tertiary"
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              What we collect
            </Text>
            <Text variant="caption" className="mt-2 leading-5">
              OpenSCAD Studio uses a persistent anonymous identifier on this device/browser to
              understand product journeys over time. Product interactions may be autocaptured.
            </Text>
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Text
              variant="caption"
              color="tertiary"
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              What stays out
            </Text>
            <Text variant="caption" className="mt-2 leading-5">
              We do not intentionally send OpenSCAD code, AI prompt text, attachment contents, API
              keys, diagnostics text, stack traces, or absolute file paths.
            </Text>
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Text
              variant="caption"
              color="tertiary"
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              Turning it off
            </Text>
            <Text variant="caption" className="mt-2 leading-5">
              Turning this off stops future analytics capture on this device/browser immediately. It
              does not delete data already collected.
            </Text>
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <Text
              variant="caption"
              color="tertiary"
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              Where it applies
            </Text>
            <Text variant="caption" className="mt-2 leading-5">
              This preference is stored locally and does not sync across devices or accounts. On the
              web it applies per browser/profile. On desktop it applies per installed app
              profile/webview storage.
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
