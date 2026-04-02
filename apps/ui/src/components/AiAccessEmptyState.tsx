import { useCallback, useMemo, useState } from 'react';
import { TbChevronDown, TbChevronRight, TbCopy } from 'react-icons/tb';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  IconButton,
  Text,
} from './ui';
import { useSettings } from '../stores/settingsStore';
import {
  buildClaudeMcpCommand,
  buildCodexMcpCommand,
  buildCursorMcpConfig,
  buildOpenCodeMcpConfig,
} from '../services/desktopMcp';
import { notifyError, notifySuccess } from '../utils/notifications';

interface AiAccessEmptyStateProps {
  onOpenSettings?: () => void;
  variant?: 'panel' | 'inline';
}

interface AgentSetupItem {
  id: string;
  label: string;
  command: string;
  codeLabel: 'Shell' | 'JSON';
  instruction: string;
  instructionDetail?: string;
}

function SetupCodeBlock({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-tertiary) 75%, var(--bg-primary))',
        borderColor: 'var(--border-primary)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-primary))',
        }}
      >
        <Text variant="caption" weight="medium">
          {label}
        </Text>
        <IconButton
          size="sm"
          variant="default"
          aria-label="Copy setup"
          title="Copy setup"
          onClick={onCopy}
        >
          <TbCopy size={16} />
        </IconButton>
      </div>
      <pre
        className="m-0 overflow-x-auto px-4 py-3 text-xs leading-7"
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

export function AiAccessEmptyState({ onOpenSettings, variant = 'panel' }: AiAccessEmptyStateProps) {
  const [settings] = useSettings();
  const [openItem, setOpenItem] = useState('claude');
  const port = settings.mcp.port;
  const commands = useMemo<AgentSetupItem[]>(
    () => [
      {
        id: 'claude',
        label: 'Claude Code',
        command: buildClaudeMcpCommand(port),
        codeLabel: 'Shell',
        instruction:
          'Run this command in your terminal to register OpenSCAD Studio as an MCP server, then call select_workspace with your repo root before using render tools.',
      },
      {
        id: 'cursor',
        label: 'Cursor',
        command: buildCursorMcpConfig(port),
        codeLabel: 'JSON',
        instruction:
          'Go to Cursor -> Settings -> Cursor Settings -> MCP and add the OpenSCAD Studio MCP server. Then call select_workspace with your repo root before using render tools.',
        instructionDetail: 'You can also edit your mcp.json directly:',
      },
      {
        id: 'codex',
        label: 'Codex',
        command: buildCodexMcpCommand(port),
        codeLabel: 'Shell',
        instruction:
          'Run this command in your terminal to add the OpenSCAD Studio MCP endpoint, then call select_workspace with your repo root before using render tools.',
      },
      {
        id: 'opencode',
        label: 'OpenCode',
        command: buildOpenCodeMcpConfig(port),
        codeLabel: 'JSON',
        instruction:
          'Open OpenCode MCP settings and add the OpenSCAD Studio MCP server. Then call select_workspace with your repo root before using render tools.',
        instructionDetail: 'You can also edit ~/.config/opencode/opencode.json directly:',
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
        operation: 'copy-ai-access-setup',
        error,
        fallbackMessage: `Failed to copy ${label.toLowerCase()}`,
      });
    }
  }, []);

  const isPanel = variant === 'panel';

  return (
    <div
      data-testid={`ai-access-empty-state-${variant}`}
      className={`rounded-xl border ${isPanel ? 'max-w-xl p-6' : 'p-4'} mx-auto`}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-secondary)',
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="space-y-2 text-left">
          <Text variant={isPanel ? 'section-heading' : 'body'} weight="medium">
            Use built-in AI or Studio MCP
          </Text>
          <Text variant="caption" color="secondary">
            Add an Anthropic or OpenAI API key in Settings, or connect a desktop agent to Studio
            over MCP.
          </Text>
        </div>

        <div className="flex justify-start gap-2">
          <Button type="button" variant="primary" onClick={() => onOpenSettings?.()}>
            Add API Key
          </Button>
        </div>

        <div className="w-full space-y-2 text-left">
          <Text variant="caption" weight="semibold" color="secondary">
            Desktop agent setup
          </Text>

          <Accordion
            type="single"
            collapsible
            value={openItem}
            onValueChange={(value) => setOpenItem(value)}
            className="space-y-2"
          >
            {commands.map((item) => {
              const isOpen = openItem === item.id;
              const ToggleIcon = isOpen ? TbChevronDown : TbChevronRight;

              return (
                <AccordionItem
                  key={item.id}
                  value={item.id}
                  className="rounded-lg border overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <AccordionTrigger
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span className="flex items-center gap-2">
                      <ToggleIcon size={14} style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {isOpen ? 'Hide command' : 'Show command'}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent
                    className="space-y-3 px-3 pb-3 pt-3"
                    style={{ borderTop: '1px solid var(--border-secondary)' }}
                  >
                    <div className="space-y-2">
                      <Text variant="caption">{item.instruction}</Text>
                      {item.instructionDetail ? (
                        <Text variant="caption" color="secondary">
                          {item.instructionDetail}
                        </Text>
                      ) : null}
                    </div>
                    <SetupCodeBlock
                      label={item.codeLabel}
                      value={item.command}
                      onCopy={() => void copyText(`${item.label} MCP command`, item.command)}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <Text variant="caption" color="secondary">
            Desktop only. Studio stays open while your external agent uses MCP, and each MCP session
            must select a workspace before render tools will run.
          </Text>
        </div>
      </div>
    </div>
  );
}
