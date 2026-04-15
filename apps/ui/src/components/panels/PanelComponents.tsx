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
import { PanelErrorBoundary } from '../ErrorBoundary';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useProjectStore } from '../../stores/projectStore';
import { isExportValidationError } from '../../services/exportErrors';
import { exportModelWithContext } from '../../services/exportService';
import { getPlatform } from '../../platform';
import { notifyError } from '../../utils/notifications';
import { MAIN_PREVIEW_VIEWER_ID } from '../../utils/capturePreview';
import { useAnalytics } from '../../analytics/runtime';

const EditorPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    updateSource,
    diagnostics,
    onManualRender,
    settings,
    editorFocusRequestKey,
    tabs,
    activeTabId,
    onTabClick,
    onTabClose,
  } = useWorkspace();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const editorContent = useProjectStore((s) =>
    activeTab?.projectPath ? (s.files[activeTab.projectPath]?.content ?? '') : ''
  );
  const projectFiles = useProjectStore((s) => s.files);
  return (
    <PanelErrorBoundary panelId="editor" panelName="Editor">
      <Editor
        value={editorContent}
        onChange={updateSource}
        activeFileId={activeTabId}
        openTabs={tabs.map((t) => ({
          id: t.id,
          name: t.name,
          isDirty: projectFiles[t.projectPath]?.isDirty ?? false,
        }))}
        onTabClick={onTabClick}
        onTabClose={onTabClose}
        diagnostics={diagnostics.filter((d) => !d.message.match(/^ECHO:/i))}
        onManualRender={onManualRender}
        settings={settings}
        focusRequestKey={editorFocusRequestKey}
      />
    </PanelErrorBoundary>
  );
};

const PreviewPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    previewSrc,
    previewKind,
    isRendering,
    error,
    onPreviewVisualReady,
    hasCurrentModelApiKey,
    canAttachViewerAnnotation,
    attachViewerAnnotationFile,
  } = useWorkspace();
  return (
    <PanelErrorBoundary panelId="preview" panelName="Preview">
      <Preview
        src={previewSrc}
        kind={previewKind}
        isRendering={isRendering}
        error={error}
        viewerId={MAIN_PREVIEW_VIEWER_ID}
        onVisualReady={onPreviewVisualReady}
        hasCurrentModelApiKey={hasCurrentModelApiKey}
        canAttachViewerAnnotation={canAttachViewerAnnotation}
        onAttachViewerAnnotationFile={attachViewerAnnotationFile}
      />
    </PanelErrorBoundary>
  );
};

const AiChatPanel: React.FC<IDockviewPanelProps> = () => {
  const ws = useWorkspace();
  return (
    <PanelErrorBoundary panelId="ai-chat" panelName="AI Chat">
      <AiPromptPanel
        ref={ws.aiPromptPanelRef as React.Ref<AiPromptPanelRef>}
        onSubmit={ws.submitDraft}
        onTextChange={ws.setDraftText}
        onFilesSelected={(files) => {
          void ws.addDraftFiles(files, 'ai_panel');
        }}
        onRemoveAttachment={(attachmentId) => ws.removeDraftAttachment(attachmentId, 'ai_panel')}
        draft={ws.draft}
        attachments={ws.attachments}
        draftErrors={ws.draftErrors}
        draftVisionBlockMessage={ws.draftVisionBlockMessage}
        draftVisionWarningMessage={ws.draftVisionWarningMessage}
        canSubmitDraft={ws.canSubmitDraft}
        isProcessingAttachments={ws.isProcessingAttachments}
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
        onOpenSettings={ws.onOpenAiSettings}
      />
    </PanelErrorBoundary>
  );
};

const ConsolePanel: React.FC<IDockviewPanelProps> = () => {
  const { diagnostics } = useWorkspace();
  return (
    <PanelErrorBoundary panelId="console" panelName="Console">
      <DiagnosticsPanel diagnostics={diagnostics} />
    </PanelErrorBoundary>
  );
};

const DiffViewerPanel: React.FC<IDockviewPanelProps> = () => {
  const { source, acceptDiff, rejectDiff, isApplyingDiff } = useWorkspace();
  return (
    <PanelErrorBoundary panelId="diff-viewer" panelName="Diff Viewer">
      <DiffViewer
        oldCode={source}
        newCode={source}
        onAccept={acceptDiff}
        onReject={rejectDiff}
        isApplying={isApplyingDiff}
      />
    </PanelErrorBoundary>
  );
};

const CustomizerPanelWrapper: React.FC<IDockviewPanelProps> = () => {
  const {
    source,
    previewKind,
    previewSrc,
    isRendering,
    error,
    diagnostics,
    settings,
    renderReady,
    onOpenCustomizerAiRefine,
    onOpenEditorPanel,
  } = useWorkspace();

  const renderTargetBaselineCode = useProjectStore((s) =>
    s.renderTargetPath ? (s.files[s.renderTargetPath]?.customizerBaseContent ?? source) : source
  );
  const analytics = useAnalytics();
  const [isDownloadingStl, setIsDownloadingStl] = useState(false);
  const [isDownloadingSvg, setIsDownloadingSvg] = useState(false);

  const handleDownloadStl = useCallback(async () => {
    if (isDownloadingStl) return;
    setIsDownloadingStl(true);
    try {
      const exportBytes = await exportModelWithContext({
        format: 'stl',
        source,
        library: settings.library,
      });
      await getPlatform().fileExport(exportBytes, 'export.stl', [
        { name: 'STL Files', extensions: ['stl'] },
      ]);
      analytics.track('file exported', { format: 'stl' });
    } catch (err) {
      notifyError({
        operation: 'export-file',
        error: err,
        capture: !isExportValidationError(err),
        fallbackMessage: 'STL export failed',
        toastId: 'export-error',
        logLabel: 'STL export failed',
      });
    } finally {
      setIsDownloadingStl(false);
    }
  }, [isDownloadingStl, source, analytics, settings.library]);

  const handleDownloadSvg = useCallback(async () => {
    if (isDownloadingSvg) return;
    setIsDownloadingSvg(true);
    try {
      const exportBytes = await exportModelWithContext({
        format: 'svg',
        source,
        library: settings.library,
      });
      await getPlatform().fileExport(exportBytes, 'export.svg', [
        { name: 'SVG Files', extensions: ['svg'] },
      ]);
      analytics.track('file exported', { format: 'svg' });
    } catch (err) {
      notifyError({
        operation: 'export-file',
        error: err,
        capture: !isExportValidationError(err),
        fallbackMessage: 'SVG export failed',
        toastId: 'export-error',
        logLabel: 'SVG export failed',
      });
    } finally {
      setIsDownloadingSvg(false);
    }
  }, [isDownloadingSvg, source, analytics, settings.library]);

  return (
    <PanelErrorBoundary panelId="customizer" panelName="Customizer">
      <div className="h-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <CustomizerPanel
          code={source}
          baselineCode={renderTargetBaselineCode}
          isCustomizerFirstMode={settings.ui.defaultLayoutPreset === 'customizer-first'}
          previewKind={previewKind}
          previewAvailable={Boolean(previewSrc)}
          isRendering={isRendering}
          hasRenderErrors={
            Boolean(error) || diagnostics.some((entry) => entry.severity === 'error')
          }
          renderReady={renderReady}
          onRefineWithAi={onOpenCustomizerAiRefine}
          onEditCode={onOpenEditorPanel}
          onDownloadStl={handleDownloadStl}
          isDownloadingStl={isDownloadingStl}
          onDownloadSvg={handleDownloadSvg}
          isDownloadingSvg={isDownloadingSvg}
        />
      </div>
    </PanelErrorBoundary>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const panelComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  editor: EditorPanel,
  preview: PreviewPanel,
  'ai-chat': AiChatPanel,
  console: ConsolePanel,
  'diff-viewer': DiffViewerPanel,
  customizer: CustomizerPanelWrapper,
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
  const currentType =
    PANEL_TYPES.find((t) => t.id === panelId) ?? PANEL_TYPES.find((t) => panelId.startsWith(t.id));
  const Icon = currentType?.icon;

  const { previewKind } = useWorkspace();
  const isPreviewPanel = currentType?.id === 'preview';
  const dimensionLabel = isPreviewPanel ? (previewKind === 'svg' ? '2D' : '3D') : null;

  const handleTypeChange = useCallback(
    (newTypeId: string) => {
      setMenuOpen(false);
      const newType = PANEL_TYPES.find((t) => t.id === newTypeId);
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
    },
    [props.api, props.containerApi]
  );

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
      {/* eslint-disable-next-line no-restricted-syntax -- panel-type icon trigger is a 14px icon button embedded in a dockview tab header (height: 100%); <IconButton>'s h-7 or h-8 sizes are larger than the tab strip allows */}
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
        {dimensionLabel && (
          <span style={{ color: 'var(--text-tertiary)', marginLeft: '4px' }}>
            ({dimensionLabel})
          </span>
        )}
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
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            minWidth: '160px',
            padding: '4px 0',
          }}
        >
          {/* eslint-disable no-restricted-syntax -- panel-type menu items use imperative inline style overrides on hover and match the dockview dropdown container's raw styling; migrating to <Button> would fight the dropdown's compact padding */}
          {PANEL_TYPES.map((type) => (
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
                color:
                  type.id === currentType?.id ? 'var(--text-primary)' : 'var(--text-secondary)',
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
              <span
                style={{
                  width: '16px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <type.icon size={14} />
              </span>
              <span>{type.label}</span>
            </button>
          ))}
          {/* eslint-enable no-restricted-syntax */}
        </div>
      )}
    </div>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const tabComponents: Record<string, React.FC<IDockviewPanelHeaderProps>> = {
  'workspace-tab': WorkspaceTab,
};
