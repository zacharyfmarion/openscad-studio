import { useCallback, useMemo, useState } from 'react';
import { TbCopy } from 'react-icons/tb';
import { Button, IconButton, Tabs, TabsContent, TabsList, TabsTrigger, Text } from '../ui';
import {
  buildClaudeMcpCommand,
  buildCodexMcpCommand,
  buildCursorMcpConfig,
  buildOpenCodeMcpConfig,
} from '../../services/desktopMcp';
import { notifyError, notifySuccess } from '../../utils/notifications';

type AgentSetupId = 'claude' | 'cursor' | 'codex' | 'opencode';

interface AgentSetupItem {
  id: AgentSetupId;
  label: string;
  command: string;
  codeLabel: 'Shell' | 'JSON';
  locationLabel?: string;
  instruction: string;
  instructionDetail?: string;
}

interface AgentSetupTabsProps {
  port: number;
  surface?: 'panel' | 'settings';
  layout?: 'stacked' | 'split';
}

function SetupCodeBlock({
  label,
  locationLabel,
  value,
  onCopy,
  compact,
}: {
  label: string;
  locationLabel?: string;
  value: string;
  onCopy: () => void;
  compact: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-secondary)',
      }}
    >
      <div
        className={`flex items-center justify-between ${compact ? 'px-3 py-1.5' : 'px-3 py-2'}`}
        style={{
          borderBottom: '1px solid var(--border-secondary)',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Text
            as="span"
            variant="caption"
            weight="semibold"
            className="rounded-full px-2 py-0.5"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            {label}
          </Text>
          {locationLabel ? (
            <Text
              as="span"
              variant="caption"
              color="tertiary"
              className="truncate"
              style={{ maxWidth: compact ? '10rem' : '18rem' }}
              title={locationLabel}
            >
              {locationLabel}
            </Text>
          ) : null}
        </div>
        {compact ? (
          <IconButton
            size="sm"
            variant="default"
            aria-label="Copy setup"
            title="Copy setup"
            onClick={onCopy}
          >
            <TbCopy size={16} />
          </IconButton>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={onCopy}>
            Copy
          </Button>
        )}
      </div>
      <pre
        className={`m-0 overflow-x-auto ${compact ? 'px-3 py-3' : 'px-4 py-4'} text-xs leading-7`}
        style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </pre>
    </div>
  );
}

export function AgentSetupTabs({
  port,
  surface = 'settings',
  layout = 'stacked',
}: AgentSetupTabsProps) {
  const compact = surface === 'panel';
  const isSplit = layout === 'split';
  const [selectedAgent, setSelectedAgent] = useState<AgentSetupId>('claude');
  const commands = useMemo<AgentSetupItem[]>(
    () => [
      {
        id: 'claude',
        label: 'Claude Code',
        command: buildClaudeMcpCommand(port),
        codeLabel: 'Shell',
        instruction: 'Run this command in your terminal to register the app as an MCP server.',
      },
      {
        id: 'cursor',
        label: 'Cursor',
        command: buildCursorMcpConfig(port),
        codeLabel: 'JSON',
        locationLabel: '~/.cursor/mcp.json',
        instruction: 'Add this config in Cursor MCP settings or in ~/.cursor/mcp.json.',
      },
      {
        id: 'codex',
        label: 'Codex',
        command: buildCodexMcpCommand(port),
        codeLabel: 'Shell',
        instruction: 'Run this command in your terminal to add the MCP endpoint.',
      },
      {
        id: 'opencode',
        label: 'OpenCode',
        command: buildOpenCodeMcpConfig(port),
        codeLabel: 'JSON',
        locationLabel: '~/.config/opencode/opencode.json',
        instruction:
          'Add this config in OpenCode MCP settings or in ~/.config/opencode/opencode.json.',
      },
    ],
    [port]
  );

  const copyText = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(`${label} copied`, {
        toastId: `copy-${label.toLowerCase().replace(/\s+/g, '-')}`,
      });
    } catch (error) {
      notifyError({
        operation: 'copy-mcp-agent-setup',
        error,
        fallbackMessage: `Failed to copy ${label.toLowerCase()}`,
      });
    }
  }, []);

  return (
    <Tabs
      value={selectedAgent}
      onValueChange={(value) => setSelectedAgent(value as AgentSetupId)}
      orientation={isSplit ? 'vertical' : 'horizontal'}
      className={
        isSplit
          ? 'grid grid-cols-[10rem_minmax(0,1fr)] items-stretch overflow-hidden rounded-xl border'
          : 'overflow-hidden rounded-xl border'
      }
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-secondary)',
      }}
    >
      <div
        className={isSplit ? 'min-w-0 px-3 py-3' : 'overflow-x-auto px-2 py-2'}
        style={
          isSplit
            ? { borderRight: '1px solid var(--border-secondary)' }
            : {
                borderBottom: '1px solid var(--border-secondary)',
                backgroundColor: 'var(--bg-primary)',
              }
        }
      >
        <TabsList
          aria-label="Desktop agent setup"
          className={
            isSplit
              ? 'flex flex-col items-stretch gap-1'
              : 'inline-flex min-w-full items-stretch gap-1'
          }
        >
          {commands.map((item) => {
            const isActive = selectedAgent === item.id;
            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className={
                  isSplit
                    ? 'inline-flex w-full items-center justify-start whitespace-nowrap rounded-md px-2.5 py-2 text-left text-xs font-medium outline-none transition-colors'
                    : 'inline-flex min-w-[5.5rem] flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 py-1 text-center text-xs font-medium outline-none transition-colors'
                }
                style={{
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {item.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {commands.map((item) => (
        <TabsContent key={item.id} value={item.id} className="outline-none">
          <div
            className={`${isSplit ? 'min-w-0 px-3 py-3' : compact ? 'px-3 py-3' : 'px-4 py-4'} flex flex-col`}
            style={{ gap: 'var(--space-3)' }}
          >
            <div className="space-y-2">
              <Text variant="caption">{item.instruction}</Text>
              {item.instructionDetail ? (
                <Text variant="caption" color="tertiary">
                  {item.instructionDetail}
                </Text>
              ) : null}
            </div>

            <SetupCodeBlock
              label={item.codeLabel}
              locationLabel={item.locationLabel}
              value={item.command}
              compact={compact}
              onCopy={() => void copyText(`${item.label} MCP setup`, item.command)}
            />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
