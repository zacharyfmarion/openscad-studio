import React, { useCallback, useRef, useState } from 'react';
import type { IDockviewPanelProps, IDockviewPanelHeaderProps } from 'dockview';
import { TbCode, TbEye, TbSparkles, TbTerminal2 } from 'react-icons/tb';
import type { IconType } from 'react-icons';
import { Editor } from '../Editor';
import { Preview } from '../Preview';
import { AiPromptPanel, type AiPromptPanelRef } from '../AiPromptPanel';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { DiffViewer } from '../DiffViewer';
import { CustomizerPanel } from '../CustomizerPanel';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const EditorPanel: React.FC<IDockviewPanelProps> = () => {
  const { source, updateSource, diagnostics, onManualRender, settings } = useWorkspace();
  return (
    <Editor
      value={source}
      onChange={updateSource}
      diagnostics={diagnostics.filter(d => !d.message.match(/^ECHO:/i))}
      onManualRender={onManualRender}
      settings={settings}
    />
  );
};

const PreviewPanel: React.FC<IDockviewPanelProps> = () => {
  const { previewSrc, previewKind, isRendering, error } = useWorkspace();
  return (
    <Preview
      src={previewSrc}
      kind={previewKind}
      isRendering={isRendering}
      error={error}
    />
  );
};

const AiChatPanel: React.FC<IDockviewPanelProps> = () => {
  const ws = useWorkspace();
  return (
    <AiPromptPanel
      ref={ws.aiPromptPanelRef as React.Ref<AiPromptPanelRef>}
      onSubmit={ws.submitPrompt}
      isStreaming={ws.isStreaming}
      streamingResponse={ws.streamingResponse}
      onCancel={ws.cancelStream}
      messages={ws.messages}
      onNewConversation={ws.newConversation}
      currentToolCalls={ws.currentToolCalls}
      currentModel={ws.currentModel}
      availableProviders={ws.availableProviders}
      onModelChange={ws.setCurrentModel}
      onRestoreCheckpoint={ws.handleRestoreCheckpoint}
    />
  );
};

const ConsolePanel: React.FC<IDockviewPanelProps> = () => {
  const { diagnostics } = useWorkspace();
  return <DiagnosticsPanel diagnostics={diagnostics} />;
};

const DiffViewerPanel: React.FC<IDockviewPanelProps> = () => {
  const { source, acceptDiff, rejectDiff, isApplyingDiff } = useWorkspace();
  return (
    <DiffViewer
      oldCode={source}
      newCode={source}
      onAccept={acceptDiff}
      onReject={rejectDiff}
      isApplying={isApplyingDiff}
    />
  );
};

const CustomizerPanelWrapper: React.FC<IDockviewPanelProps> = () => {
  const { source, updateSource } = useWorkspace();
  return (
    <div className="h-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <CustomizerPanel code={source} onChange={updateSource} />
    </div>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const panelComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  'editor': EditorPanel,
  'preview': PreviewPanel,
  'ai-chat': AiChatPanel,
  'console': ConsolePanel,
  'diff-viewer': DiffViewerPanel,
  'customizer': CustomizerPanelWrapper,
};

export interface PanelTypeInfo {
  id: string;
  label: string;
  icon: IconType;
}

// eslint-disable-next-line react-refresh/only-export-components
export const PANEL_TYPES: PanelTypeInfo[] = [
  { id: 'editor', label: 'Editor', icon: TbCode },
  { id: 'preview', label: 'Preview', icon: TbEye },
  { id: 'ai-chat', label: 'AI', icon: TbSparkles },
  { id: 'console', label: 'Console', icon: TbTerminal2 },
];

export const WorkspaceTab: React.FC<IDockviewPanelHeaderProps> = (props) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const panelId = props.api.id;
  const currentType = PANEL_TYPES.find(t => t.id === panelId)
    ?? PANEL_TYPES.find(t => panelId.startsWith(t.id));
  const Icon = currentType?.icon;

  const handleTypeChange = useCallback((newTypeId: string) => {
    setMenuOpen(false);
    const newType = PANEL_TYPES.find(t => t.id === newTypeId);
    if (!newType) return;

    const containerApi = props.containerApi;
    const groupId = props.api.group.api.id;
    const oldId = props.api.id;

    const panel = containerApi.getPanel(oldId);
    if (!panel) return;

    containerApi.removePanel(panel);
    containerApi.addPanel({
      id: `${newTypeId}-${Date.now()}`,
      component: newTypeId,
      title: newType.label,
      position: { referenceGroup: groupId },
    });
  }, [props.api, props.containerApi]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 8px',
        height: '100%',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        position: 'relative',
        userSelect: 'none',
        cursor: 'pointer',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          fontSize: '0.8rem',
          lineHeight: 1,
          color: 'var(--text-tertiary)',
          display: 'flex',
          alignItems: 'center',
        }}
        title="Change panel type"
      >
        {Icon && <Icon size={14} />}
      </button>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {props.api.title}
      </span>

      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            minWidth: '160px',
            padding: '4px 0',
          }}
        >
          {PANEL_TYPES.map(type => (
            <button
              key={type.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTypeChange(type.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 12px',
                background: type.id === currentType?.id ? 'var(--bg-tertiary)' : 'transparent',
                border: 'none',
                color: type.id === currentType?.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                if (type.id !== currentType?.id) {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                if (type.id !== currentType?.id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ width: '16px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><type.icon size={14} /></span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const tabComponents: Record<string, React.FC<IDockviewPanelHeaderProps>> = {
  'workspace-tab': WorkspaceTab,
};
