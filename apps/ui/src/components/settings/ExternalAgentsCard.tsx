import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Text, Toggle } from '../ui';
import type { Settings } from '../../stores/settingsStore';
import { updateSetting } from '../../stores/settingsStore';
import {
  buildClaudeMcpCommand,
  buildCodexMcpCommand,
  buildCursorMcpConfig,
  buildOpenCodeMcpConfig,
  getDesktopMcpStatus,
  syncDesktopMcpConfig,
  type McpServerStatus,
} from '../../services/desktopMcp';
import { notifyError, notifySuccess } from '../../utils/notifications';
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardSection,
  SettingsControlRow,
  SettingsSupportBlock,
} from './SettingsPrimitives';

interface ExternalAgentsCardProps {
  settings: Settings;
  isOpen: boolean;
}

const STATUS_LABELS: Record<McpServerStatus['status'], string> = {
  starting: 'Starting',
  running: 'Running',
  disabled: 'Disabled',
  port_conflict: 'Port conflict',
  error: 'Error',
};

function getStatusPillStyle(status: McpServerStatus['status']) {
  switch (status) {
    case 'running':
      return {
        backgroundColor: 'rgba(133, 153, 0, 0.15)',
        color: 'var(--color-success)',
      };
    case 'starting':
      return {
        backgroundColor: 'rgba(181, 137, 0, 0.14)',
        color: 'var(--color-warning)',
      };
    case 'port_conflict':
    case 'error':
      return {
        backgroundColor: 'rgba(220, 50, 47, 0.14)',
        color: 'var(--color-error)',
      };
    default:
      return {
        backgroundColor: 'rgba(128, 128, 128, 0.1)',
        color: 'var(--text-tertiary)',
      };
  }
}

export function ExternalAgentsCard({ settings, isOpen }: ExternalAgentsCardProps) {
  const [status, setStatus] = useState<McpServerStatus>({
    enabled: settings.mcp.enabled,
    port: settings.mcp.port,
    status: settings.mcp.enabled ? 'starting' : 'disabled',
    endpoint: settings.mcp.enabled ? `http://127.0.0.1:${settings.mcp.port}/mcp` : null,
    message: null,
  });
  const [draftPort, setDraftPort] = useState(String(settings.mcp.port));
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setDraftPort(String(settings.mcp.port));
  }, [settings.mcp.port]);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getDesktopMcpStatus());
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        enabled: settings.mcp.enabled,
        port: settings.mcp.port,
        endpoint: settings.mcp.enabled ? `http://127.0.0.1:${settings.mcp.port}/mcp` : null,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [settings.mcp.enabled, settings.mcp.port]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshStatus();
  }, [isOpen, refreshStatus]);

  const endpoint = status.endpoint ?? `http://127.0.0.1:${status.port}/mcp`;
  const claudeCommand = useMemo(() => buildClaudeMcpCommand(status.port), [status.port]);
  const cursorConfig = useMemo(() => buildCursorMcpConfig(status.port), [status.port]);
  const codexCommand = useMemo(() => buildCodexMcpCommand(status.port), [status.port]);
  const openCodeConfig = useMemo(() => buildOpenCodeMcpConfig(status.port), [status.port]);

  const copyText = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(`${label} copied`, {
        toastId: `copy-${label.toLowerCase().replace(/\s+/g, '-')}`,
      });
    } catch (error) {
      notifyError({
        operation: 'copy-external-agent-command',
        error,
        fallbackMessage: `Failed to copy ${label.toLowerCase()}`,
      });
    }
  }, []);

  const handleEnabledChange = useCallback(
    async (enabled: boolean) => {
      updateSetting('mcp', { enabled });
      setIsSyncing(true);
      setStatus((prev) => ({
        ...prev,
        enabled,
        status: enabled ? 'starting' : 'disabled',
        endpoint: enabled ? `http://127.0.0.1:${prev.port}/mcp` : null,
        message: null,
      }));

      try {
        setStatus(await syncDesktopMcpConfig({ enabled, port: settings.mcp.port }));
      } catch (error) {
        setStatus((prev) => ({
          ...prev,
          enabled,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        setIsSyncing(false);
      }
    },
    [settings.mcp.port]
  );

  const handleApplyPort = useCallback(async () => {
    const parsed = Number.parseInt(draftPort, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
      notifyError({
        operation: 'update-mcp-port',
        error: new Error(`Invalid MCP port: ${draftPort}`),
        fallbackMessage: 'Enter a port between 1 and 65535.',
      });
      return;
    }

    updateSetting('mcp', { port: parsed });
    setIsSyncing(true);
    setStatus((prev) => ({
      ...prev,
      port: parsed,
      endpoint: prev.enabled ? `http://127.0.0.1:${parsed}/mcp` : null,
      status: prev.enabled ? 'starting' : 'disabled',
      message: null,
    }));

    try {
      setStatus(await syncDesktopMcpConfig({ enabled: settings.mcp.enabled, port: parsed }));
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        port: parsed,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setIsSyncing(false);
    }
  }, [draftPort, settings.mcp.enabled]);

  return (
    <SettingsCard className="ph-no-capture">
      <SettingsCardHeader
        title="External Agents"
        description="Expose one local OpenSCAD Studio MCP server for render-target switching, diagnostics, renders, preview screenshots, and exports. Each external agent session binds to a specific Studio workspace window."
        action={
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={getStatusPillStyle(status.status)}
          >
            {STATUS_LABELS[status.status]}
          </span>
        }
      />

      <SettingsControlRow
        label="Enable local MCP server"
        description="Starts a loopback-only MCP endpoint while the desktop app is open."
        control={
          <Toggle
            checked={settings.mcp.enabled}
            onChange={handleEnabledChange}
            disabled={isSyncing}
          />
        }
      />

      <SettingsControlRow
        divided
        align="start"
        label="MCP port"
        description="Default endpoint: http://127.0.0.1:32123/mcp"
        control={
          <div className="flex items-center" style={{ gap: 'var(--space-control-gap)' }}>
            <Input
              type="number"
              value={draftPort}
              onChange={(event) => setDraftPort(event.target.value)}
              className="w-28 font-mono"
              min={1}
              max={65535}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleApplyPort}
              disabled={isSyncing}
            >
              Apply
            </Button>
          </div>
        }
      />

      <SettingsCardSection
        divided
        className="flex flex-col"
        style={{ gap: 'var(--space-field-gap)' }}
      >
        <Text variant="caption" color="tertiary">
          External agents should keep reading and editing files directly in your repo. OpenSCAD
          Studio MCP is for render-oriented tasks only, and each agent session should call
          <Text as="code" variant="caption" className="font-mono">
            {' '}
            get_or_create_workspace
          </Text>{' '}
          before using render tools.
        </Text>

        <SettingsSupportBlock className="flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
          <Text variant="caption" weight="semibold">
            Endpoint
          </Text>
          <div
            className="flex items-center justify-between"
            style={{ gap: 'var(--space-control-gap)' }}
          >
            <Text as="code" variant="caption" className="font-mono break-all">
              {endpoint}
            </Text>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyText('Endpoint', endpoint)}
            >
              Copy
            </Button>
          </div>
        </SettingsSupportBlock>

        <SettingsSupportBlock className="flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
          <Text variant="caption" weight="semibold">
            Claude Code
          </Text>
          <div
            className="flex items-start justify-between"
            style={{ gap: 'var(--space-control-gap)' }}
          >
            <Text as="code" variant="caption" className="font-mono break-all">
              {claudeCommand}
            </Text>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyText('Claude command', claudeCommand)}
            >
              Copy
            </Button>
          </div>
        </SettingsSupportBlock>

        <SettingsSupportBlock className="flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
          <Text variant="caption" weight="semibold">
            Cursor
          </Text>
          <Text variant="caption" color="tertiary">
            Add this to{' '}
            <Text as="code" variant="caption" className="font-mono">
              ~/.cursor/mcp.json
            </Text>
          </Text>
          <div
            className="flex items-start justify-between"
            style={{ gap: 'var(--space-control-gap)' }}
          >
            <Text as="code" variant="caption" className="font-mono break-all whitespace-pre-wrap">
              {cursorConfig}
            </Text>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyText('Cursor config', cursorConfig)}
            >
              Copy
            </Button>
          </div>
        </SettingsSupportBlock>

        <SettingsSupportBlock className="flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
          <Text variant="caption" weight="semibold">
            Codex
          </Text>
          <div
            className="flex items-start justify-between"
            style={{ gap: 'var(--space-control-gap)' }}
          >
            <Text as="code" variant="caption" className="font-mono break-all">
              {codexCommand}
            </Text>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyText('Codex command', codexCommand)}
            >
              Copy
            </Button>
          </div>
        </SettingsSupportBlock>

        <SettingsSupportBlock className="flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
          <Text variant="caption" weight="semibold">
            OpenCode
          </Text>
          <Text variant="caption" color="tertiary">
            Add this to{' '}
            <Text as="code" variant="caption" className="font-mono">
              ~/.config/opencode/opencode.json
            </Text>
          </Text>
          <div
            className="flex items-start justify-between"
            style={{ gap: 'var(--space-control-gap)' }}
          >
            <Text as="code" variant="caption" className="font-mono break-all whitespace-pre-wrap">
              {openCodeConfig}
            </Text>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyText('OpenCode config', openCodeConfig)}
            >
              Copy
            </Button>
          </div>
        </SettingsSupportBlock>

        {status.message ? (
          <SettingsSupportBlock
            className="text-sm"
            style={{
              backgroundColor: 'rgba(220, 50, 47, 0.1)',
              border: '1px solid rgba(220, 50, 47, 0.3)',
              color: 'var(--color-error)',
            }}
          >
            {status.message}
          </SettingsSupportBlock>
        ) : null}
      </SettingsCardSection>
    </SettingsCard>
  );
}
