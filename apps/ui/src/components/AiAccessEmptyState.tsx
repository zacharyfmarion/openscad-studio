import { Button, Text } from './ui';
import { useSettings } from '../stores/settingsStore';
import { AgentSetupTabs } from './mcp/AgentSetupTabs';

interface AiAccessEmptyStateProps {
  onOpenSettings?: () => void;
  variant?: 'panel' | 'inline';
  panelLayout?: 'stacked' | 'split';
}

export function AiAccessEmptyState({
  onOpenSettings,
  variant = 'panel',
  panelLayout = 'stacked',
}: AiAccessEmptyStateProps) {
  const [settings] = useSettings();
  const port = settings.mcp.port;
  const isPanel = variant === 'panel';
  const useLandscapeLayout = isPanel && panelLayout === 'split';

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
                Configure Anthropic, OpenAI, or a local OpenAI-compatible provider in Settings to
                use Studio&apos;s built-in AI assistant.
              </Text>
            </div>

            <div className="flex justify-start">
              <Button type="button" variant="primary" onClick={() => onOpenSettings?.()}>
                Configure AI
              </Button>
            </div>
          </div>

          <div className="min-w-0 space-y-3 text-left">
            <Text variant="section-heading" weight="medium">
              Desktop agent setup
            </Text>

            <AgentSetupTabs port={port} surface="panel" layout="split" />

            <Text variant="caption" color="secondary">
              Desktop only. Studio stays open while your external agent uses MCP, and each MCP
              session must select a workspace before render tools will run.
            </Text>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="space-y-2 text-left">
            <Text variant={isPanel ? 'section-heading' : 'body'} weight="medium">
              Use built-in AI or Studio MCP
            </Text>
            <Text variant="caption" color="secondary">
              Configure Anthropic, OpenAI, or a local OpenAI-compatible provider in Settings, or
              connect a desktop agent to Studio over MCP.
            </Text>
          </div>

          <div className="flex justify-start gap-2">
            <Button type="button" variant="primary" onClick={() => onOpenSettings?.()}>
              Configure AI
            </Button>
          </div>

          <div className="w-full space-y-2 text-left">
            <Text variant="caption" weight="semibold" color="secondary">
              Desktop agent setup
            </Text>

            <AgentSetupTabs port={port} surface="panel" />

            <Text variant="caption" color="secondary">
              Desktop only. Studio stays open while your external agent uses MCP, and each MCP
              session must select a workspace before render tools will run.
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}
