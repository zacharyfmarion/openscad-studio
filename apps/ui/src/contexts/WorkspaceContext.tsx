import { createContext, useContext } from 'react';
import type { Diagnostic, RenderKind } from '../api/tauri';
import type { Message, ToolCall } from '../hooks/useAiAgent';
import type { AiMode, AiPromptPanelRef } from '../components/AiPromptPanel';
import type { Settings } from '../stores/settingsStore';
import type { Tab } from '../components/TabBar';

export interface WorkspaceState {
  // Editor
  source: string;
  updateSource: (code: string) => void;
  diagnostics: Diagnostic[];
  onManualRender: (() => void) | undefined;
  settings: Settings;

  // Tabs
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
  onReorderTabs: (tabs: Tab[]) => void;

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
  currentToolCalls: ToolCall[];
  currentModel: string;
  availableProviders: string[];
  submitPrompt: (prompt: string, mode: AiMode) => void;
  cancelStream: () => void;
  acceptDiff: () => void;
  rejectDiff: () => void;
  clearAiError: () => void;
  newConversation: () => void;
  setCurrentModel: (model: string) => void;
  handleRestoreCheckpoint: (checkpointId: string, truncatedMessages: Message[]) => void;
  aiPromptPanelRef: React.RefObject<AiPromptPanelRef | null>;

  onAcceptDiff: () => void;
  onRejectDiff: () => void;
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
