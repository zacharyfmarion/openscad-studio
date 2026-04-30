import { useEffect, useRef } from 'react';
import { TbDownload } from 'react-icons/tb';
import { Button, Text } from './ui';
import { useAnalytics } from '../analytics/runtime';
import { useMacDownloadUrl } from '../hooks/useMacDownloadUrl';
import { getPlatform } from '../platform';
import { useSettings } from '../stores/settingsStore';
import { AgentSetupTabs } from './mcp/AgentSetupTabs';

interface AiAccessEmptyStateProps {
  onOpenSettings?: () => void;
  variant?: 'panel' | 'inline';
  panelLayout?: 'stacked' | 'split';
  showMacAppUpsell?: boolean;
}

function MacAppDownloadLink({
  downloadUrl,
  onDownloadClick,
}: {
  downloadUrl: string;
  onDownloadClick: () => void;
}) {
  return (
    <a
      href={downloadUrl}
      onClick={onDownloadClick}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        color: 'var(--text-primary)',
        textDecoration: 'none',
      }}
    >
      <TbDownload size={14} />
      <span>Download Mac app</span>
    </a>
  );
}

export function AiAccessEmptyState({
  onOpenSettings,
  variant = 'panel',
  panelLayout = 'stacked',
  showMacAppUpsell = false,
}: AiAccessEmptyStateProps) {
  const [settings] = useSettings();
  const analytics = useAnalytics();
  const macDownloadUrl = useMacDownloadUrl();
  const port = settings.mcp.port;
  const isPanel = variant === 'panel';
  const useLandscapeLayout = isPanel && panelLayout === 'split';
  const shouldShowMacAppUpsell =
    showMacAppUpsell && isPanel && !getPlatform().capabilities.hasFileSystem;
  const hasTrackedMacAppUpsellView = useRef(false);

  useEffect(() => {
    if (!shouldShowMacAppUpsell || hasTrackedMacAppUpsellView.current) return;

    hasTrackedMacAppUpsellView.current = true;
    analytics.track('ai setup nux viewed', {
      source_surface: 'ai_panel',
      options: ['built_in_api_key', 'mac_app_mcp'],
    });
    analytics.track('ai panel mac app upsell viewed', {
      source_surface: 'ai_panel',
      panel_layout: panelLayout,
    });
  }, [analytics, panelLayout, shouldShowMacAppUpsell]);

  const handleMacDownloadClick = () => {
    analytics.track('ai setup option clicked', {
      source_surface: 'ai_panel',
      option: 'mac_app_mcp',
      destination: 'mac_app_download',
    });
    analytics.track('ai panel mac app upsell clicked', {
      source_surface: 'ai_panel',
      panel_layout: panelLayout,
      destination: 'mac_app_download',
    });
  };

  const handleAddApiKeyClick = () => {
    analytics.track('ai setup option clicked', {
      source_surface: 'ai_panel',
      option: 'built_in_api_key',
    });
    onOpenSettings?.();
  };

  if (shouldShowMacAppUpsell) {
    return (
      <div
        data-testid={`ai-access-empty-state-${variant}`}
        className="mx-auto w-full max-w-2xl px-2 text-left"
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Text variant="overline" color="tertiary">
              AI setup
            </Text>
            <Text as="h2" variant="panel-title" weight="semibold">
              Connect an AI assistant
            </Text>
            <Text variant="body" color="secondary" className="max-w-xl">
              Choose how the app should handle AI requests.
            </Text>
          </div>

          <div
            className="border-y"
            style={{
              borderColor: 'var(--border-secondary)',
            }}
          >
            <div className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0 space-y-1.5">
                <Text as="h3" variant="section-heading" weight="semibold">
                  Use an API key
                </Text>
                <Text variant="caption" color="secondary" className="max-w-lg">
                  Use the in-app copilot with your Anthropic or OpenAI key.
                </Text>
              </div>

              <div className="flex justify-start sm:justify-end">
                <Button type="button" variant="primary" onClick={handleAddApiKeyClick}>
                  Add API Key
                </Button>
              </div>
            </div>

            <div
              className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              style={{
                borderTop: '1px solid var(--border-secondary)',
              }}
              data-testid="ai-mac-app-upsell"
            >
              <div className="min-w-0 space-y-1.5">
                <Text as="h3" variant="section-heading" weight="semibold">
                  Use a desktop agent
                </Text>
                <Text variant="caption" color="secondary" className="max-w-lg">
                  Already use Claude Code, Codex, Cursor, or another MCP agent? Use the Mac app.
                </Text>
              </div>

              <div className="flex justify-start sm:justify-end">
                <MacAppDownloadLink
                  downloadUrl={macDownloadUrl}
                  onDownloadClick={handleMacDownloadClick}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`ai-access-empty-state-${variant}`}
      className={`rounded-xl border ${isPanel ? (useLandscapeLayout ? 'w-full max-w-5xl p-5' : 'max-w-xl p-6') : 'p-4'} mx-auto`}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-secondary)',
      }}
    >
      {isPanel && useLandscapeLayout ? (
        <div className="grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-5">
          <div
            className="flex min-w-0 flex-col gap-4 pr-5 text-left"
            style={{ borderRight: '1px solid var(--border-secondary)' }}
          >
            <div className="space-y-2">
              <Text variant="section-heading" weight="medium">
                Built-in AI
              </Text>
              <Text variant="caption" color="secondary">
                Add an Anthropic or OpenAI API key in Settings to use the built-in AI assistant.
              </Text>
            </div>

            <div className="flex justify-start">
              <Button type="button" variant="primary" onClick={handleAddApiKeyClick}>
                Add API Key
              </Button>
            </div>
          </div>

          <div className="min-w-0 space-y-3 text-left">
            <Text variant="section-heading" weight="medium">
              Desktop agent setup
            </Text>

            <AgentSetupTabs port={port} surface="panel" layout="split" />

            <Text variant="caption" color="secondary">
              Desktop only. Keep the app open while your external agent uses MCP, and each MCP
              session must select a workspace before render tools will run.
            </Text>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="space-y-2 text-left">
            <Text variant={isPanel ? 'section-heading' : 'body'} weight="medium">
              Set up AI access
            </Text>
            <Text variant="caption" color="secondary">
              Add an Anthropic or OpenAI API key, or connect a desktop agent over MCP.
            </Text>
          </div>

          <div className="flex justify-start gap-2">
            <Button type="button" variant="primary" onClick={handleAddApiKeyClick}>
              Add API Key
            </Button>
          </div>

          <div className="w-full space-y-2 text-left">
            <Text variant="caption" weight="semibold" color="secondary">
              Desktop agent setup
            </Text>

            <AgentSetupTabs port={port} surface="panel" />

            <Text variant="caption" color="secondary">
              Desktop only. Keep the app open while your external agent uses MCP, and each MCP
              session must select a workspace before render tools will run.
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}
