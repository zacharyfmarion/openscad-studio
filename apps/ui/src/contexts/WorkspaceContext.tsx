import { createContext, useContext } from 'react';
import type { ModelSelectionSurface } from '../analytics/runtime';
import type { Diagnostic } from '../platform/historyService';
import type { RenderKind } from '../hooks/useOpenScad';
import type { AiPromptPanelRef } from '../components/AiPromptPanel';
import type { Settings } from '../stores/settingsStore';
import type { WorkspaceTab } from '../stores/workspaceTypes';
import type { AiDraft, AttachmentStore, Message, ToolCall, VisionSupport } from '../types/aiChat';

export interface WorkspaceState {
  // Editor
  source: string;
  updateSource: (code: string) => void;
  diagnostics: Diagnostic[];
  onManualRender: (() => void) | undefined;
  settings: Settings;

  // Tabs
  tabs: WorkspaceTab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
  onReorderTabs: (tabs: WorkspaceTab[]) => void;

  // Preview
  previewSrc: string;
  previewKind: RenderKind;
  isRendering: boolean;
  error: string | undefined;

  // AI
  isStreaming: boolean;
  streamingResponse: string | null;
  proposedDiff: unknown;
  aiError: string | null;
  isApplyingDiff: boolean;
  messages: Message[];
  draft: AiDraft;
  attachments: AttachmentStore;
  draftErrors: string[];
  draftVisionBlockMessage: string | null;
  draftVisionWarningMessage: string | null;
  canSubmitDraft: boolean;
  isProcessingAttachments: boolean;
  currentToolCalls: ToolCall[];
  currentModel: string;
  currentModelVisionSupport: VisionSupport;
  availableProviders: string[];
  submitDraft: () => void;
  setDraftText: (text: string) => void;
  addDraftFiles: (files: File[], sourceSurface?: ModelSelectionSurface) => Promise<void>;
  removeDraftAttachment: (attachmentId: string, sourceSurface?: ModelSelectionSurface) => void;
  cancelStream: () => void;
  acceptDiff: () => void;
  rejectDiff: () => void;
  clearAiError: () => void;
  newConversation: () => void;
  setCurrentModel: (model: string, sourceSurface?: ModelSelectionSurface) => void;
  handleRestoreCheckpoint: (checkpointId: string, truncatedMessages: Message[]) => void;
  aiPromptPanelRef: React.RefObject<AiPromptPanelRef | null>;

  onAcceptDiff: () => void;
  onRejectDiff: () => void;
  onOpenAiSettings: () => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
