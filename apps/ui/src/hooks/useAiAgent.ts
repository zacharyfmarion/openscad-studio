import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { type ToolSet, stepCountIs } from 'ai';
import { historyService, eventBus, getPlatform } from '../platform';
import {
  createModel,
  SYSTEM_PROMPT,
  buildTools,
  type AiToolCallbacks,
} from '../services/aiService';
import {
  getApiKey,
  getAvailableProviders,
  getProviderFromModel,
  getStoredModel,
  setStoredModel,
} from '../stores/apiKeyStore';
import type {
  AiDraft,
  AttachmentStore,
  Conversation,
  Message,
  ToolCall,
  UserImagePart,
  UserMessage,
  UserTextPart,
  VisionSupport,
} from '../types/aiChat';
import {
  getDraftCanSubmit,
  getDraftHasPendingAttachments,
  getReadyAttachmentIds,
  processAttachmentFiles,
} from '../utils/aiAttachments';
import { getVisionSupportForModelId, messagesToModelMessages } from '../utils/aiMessages';
import {
  createActiveTurnState,
  deriveCurrentToolCalls,
  deriveStreamingResponse,
  finalizeActiveTurn,
  finalizeConversationTurn,
  getUnreferencedAttachmentIds,
  reduceActiveTurnChunk,
  type ActiveTurnState,
} from '../utils/aiTurnState';
import { startAiStream } from '../services/aiStream';
import {
  FALLBACK_PREVIEW_SCENE_STYLE,
  type PreviewSceneStyle,
} from '../services/previewSceneConfig';
import {
  getRelativeProjectPath,
  normalizeProjectRelativePath,
} from '../utils/projectFilePaths';

const EMPTY_DRAFT: AiDraft = {
  text: '',
  attachmentIds: [],
};

// Coding turns regularly need a few extra steps after the last tool call
// to produce a visible final summary for the user.
const MAX_AGENT_STEPS = 20;

function revokePreviewUrlsForIds(ids: string[], attachments: AttachmentStore) {
  for (const id of ids) {
    const attachment = attachments[id];
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}

function draftToUserParts(draft: AiDraft, attachments: AttachmentStore) {
  const parts: Array<UserTextPart | UserImagePart> = [];
  const trimmedText = draft.text.trim();

  if (trimmedText) {
    parts.push({ type: 'text', text: trimmedText });
  }

  for (const attachmentId of getReadyAttachmentIds(draft, attachments)) {
    const attachment = attachments[attachmentId];
    if (!attachment || attachment.status !== 'ready') continue;

    parts.push({
      type: 'image',
      attachmentId,
      filename: attachment.filename,
      mimeType: attachment.normalizedMimeType || attachment.sourceMimeType,
      width: attachment.width ?? 0,
      height: attachment.height ?? 0,
    });
  }

  return parts;
}

function getVisionBlockMessage(
  draft: AiDraft,
  attachments: AttachmentStore,
  visionSupport: VisionSupport
): string | null {
  if (getReadyAttachmentIds(draft, attachments).length === 0) {
    return null;
  }

  if (visionSupport === 'no') {
    return 'The selected model does not support image inputs. Switch to a vision-capable model to send attachments.';
  }

  return null;
}

function getVisionWarningMessage(
  draft: AiDraft,
  attachments: AttachmentStore,
  visionSupport: VisionSupport
): string | null {
  if (getReadyAttachmentIds(draft, attachments).length === 0 || visionSupport !== 'unknown') {
    return null;
  }

  return 'This model may reject image inputs. If the request fails, switch to a vision-capable model and try again.';
}

export interface AiAgentState {
  isStreaming: boolean;
  streamingResponse: string | null;
  proposedDiff: {
    diff: string;
    rationale: string;
  } | null;
  error: string | null;
  isApplyingDiff: boolean;
  messages: Message[];
  conversations: Conversation[];
  currentConversationId: string | null;
  currentToolCalls: ToolCall[];
  currentModel: string;
  currentModelVisionSupport: VisionSupport;
  availableProviders: string[];
  draft: AiDraft;
  attachments: AttachmentStore;
  draftErrors: string[];
  isProcessingAttachments: boolean;
}

export function useAiAgent() {
  const [state, setState] = useState<AiAgentState>({
    isStreaming: false,
    streamingResponse: null,
    proposedDiff: null,
    error: null,
    isApplyingDiff: false,
    messages: [],
    conversations: [],
    currentConversationId: null,
    currentToolCalls: [],
    currentModel: getStoredModel(),
    currentModelVisionSupport: getVisionSupportForModelId(getStoredModel()),
    availableProviders: getAvailableProviders(),
    draft: EMPTY_DRAFT,
    attachments: {},
    draftErrors: [],
    isProcessingAttachments: false,
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const sourceRef = useRef<string>('');
  const capturePreviewRef = useRef<(() => Promise<string | null>) | null>(null);
  const stlBlobUrlRef = useRef<string | null>(null);
  const workingDirRef = useRef<string | null>(null);
  const currentFilePathRef = useRef<string | null>(null);
  const auxiliaryFilesRef = useRef<Record<string, string>>({});
  const previewSceneStyleRef = useRef<PreviewSceneStyle>(FALLBACK_PREVIEW_SCENE_STYLE);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<ActiveTurnState | null>(null);
  const committedMessagesRef = useRef<Message[]>(state.messages);
  const activeTurnDraftRef = useRef<{
    submittedDraft: AiDraft;
    submittedReadyIds: string[];
  } | null>(null);
  const pendingCheckpointIdRef = useRef<string | null>(null);
  const didReceiveResponseRef = useRef(false);

  useEffect(() => {
    if (!state.isStreaming) {
      committedMessagesRef.current = state.messages;
    }
  }, [state.isStreaming, state.messages]);

  const callbacks: AiToolCallbacks = useMemo(
    () => ({
      getCurrentCode: () => sourceRef.current,
      captureCurrentView: async () => {
        if (capturePreviewRef.current) {
          return capturePreviewRef.current();
        }
        return null;
      },
      getStlBlobUrl: () => stlBlobUrlRef.current,
      getPreviewSceneStyle: () => previewSceneStyleRef.current,
      hasProjectFileAccess: () => {
        try {
          return Boolean(workingDirRef.current) && getPlatform().capabilities.hasFileSystem;
        } catch {
          return false;
        }
      },
      getCurrentFileRelativePath: () =>
        getRelativeProjectPath(workingDirRef.current, currentFilePathRef.current),
      listProjectFiles: async () => {
        const workingDir = workingDirRef.current;
        if (!workingDir) {
          return null;
        }

        const platform = getPlatform();
        if (!platform.capabilities.hasFileSystem) {
          return null;
        }

        const files = await platform.readDirectoryFiles(workingDir, ['scad'], true);
        return Object.keys(files).sort((a, b) => a.localeCompare(b));
      },
      readProjectFile: async (path: string) => {
        const workingDir = workingDirRef.current;
        if (!workingDir) {
          return null;
        }

        const platform = getPlatform();
        if (!platform.capabilities.hasFileSystem) {
          return null;
        }

        const normalizedPath = normalizeProjectRelativePath(path);
        if (!normalizedPath) {
          return null;
        }

        const currentRelativePath = getRelativeProjectPath(
          workingDirRef.current,
          currentFilePathRef.current
        );
        if (currentRelativePath === normalizedPath) {
          return sourceRef.current;
        }

        return platform.readTextFile(`${workingDir}/${normalizedPath}`);
      },
    }),
    []
  );

  const tools: ToolSet = useMemo(() => buildTools(callbacks), [callbacks]);

  const updateSourceRef = useCallback((code: string) => {
    sourceRef.current = code;
  }, []);

  const updateCapturePreview = useCallback((fn: (() => Promise<string | null>) | null) => {
    capturePreviewRef.current = fn;
  }, []);

  const updateStlBlobUrl = useCallback((url: string | null) => {
    stlBlobUrlRef.current = url;
  }, []);

  const updateWorkingDir = useCallback((dir: string | null) => {
    workingDirRef.current = dir;
  }, []);

  const updateCurrentFilePath = useCallback((path: string | null) => {
    currentFilePathRef.current = path;
  }, []);

  const updateAuxiliaryFiles = useCallback((files: Record<string, string>) => {
    auxiliaryFilesRef.current = files;
  }, []);

  const updatePreviewSceneStyle = useCallback((sceneStyle: PreviewSceneStyle) => {
    previewSceneStyleRef.current = sceneStyle;
  }, []);

  const loadModelAndProviders = useCallback(() => {
    const model = getStoredModel();
    const providers = getAvailableProviders();
    setState((prev) => ({
      ...prev,
      currentModel: model,
      currentModelVisionSupport: getVisionSupportForModelId(model),
      availableProviders: providers,
    }));
    if (import.meta.env.DEV) {
      console.log('[useAiAgent] Loaded model:', model, 'Available providers:', providers);
    }
  }, []);

  useEffect(() => {
    loadModelAndProviders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logTurnWarnings = useCallback((warnings: string[]) => {
    if (!import.meta.env.DEV || warnings.length === 0) return;
    for (const warning of warnings) {
      console.warn('[useAiAgent]', warning);
    }
  }, []);

  const syncActiveTurnState = useCallback((activeTurn: ActiveTurnState | null) => {
    setState((prev) => ({
      ...prev,
      messages: activeTurn
        ? [...committedMessagesRef.current, ...activeTurn.persistedMessages]
        : committedMessagesRef.current,
      currentToolCalls: activeTurn ? deriveCurrentToolCalls(activeTurn) : [],
      streamingResponse: activeTurn ? deriveStreamingResponse(activeTurn) : null,
    }));
  }, []);

  const finalizeStreamTurn = useCallback(
    (
      activeTurn: ActiveTurnState,
      options: {
        reason: 'complete' | 'cancelled' | 'error';
        errorText?: string | null;
        restoreDraft?: boolean;
        completionNotice?: string | null;
      }
    ) => {
      const finalizedTurn = finalizeActiveTurn(activeTurn, {
        reason: options.reason,
        errorText: options.errorText,
      });
      logTurnWarnings(finalizedTurn.warnings);

      const submittedDraft = activeTurnDraftRef.current?.submittedDraft;
      const submittedReadyIds = activeTurnDraftRef.current?.submittedReadyIds ?? [];

      setState((prev) => {
        if (submittedDraft) {
          const transientIds = submittedDraft.attachmentIds.filter(
            (id) => !submittedReadyIds.includes(id)
          );
          revokePreviewUrlsForIds(transientIds, prev.attachments);
        }

        const nextConversation = finalizeConversationTurn({
          baseMessages: committedMessagesRef.current,
          attachments: prev.attachments,
          activeTurn: finalizedTurn.state,
          submittedAttachmentIds: submittedDraft?.attachmentIds ?? [],
          submittedReadyIds,
          checkpointId: pendingCheckpointIdRef.current,
        });
        const nextMessages = options.completionNotice
          ? [
              ...nextConversation.messages,
              {
                type: 'assistant' as const,
                id: crypto.randomUUID(),
                turnId: activeTurn.turnId,
                content: options.completionNotice,
                state: 'complete' as const,
                timestamp: Date.now(),
              },
            ]
          : nextConversation.messages;

        committedMessagesRef.current = nextMessages;
        activeTurnRef.current = null;
        activeTurnDraftRef.current = null;
        pendingCheckpointIdRef.current = null;

        return {
          ...prev,
          isStreaming: false,
          streamingResponse: null,
          currentToolCalls: [],
          error: options.errorText ? `Failed: ${options.errorText}` : null,
          messages: nextMessages,
          attachments: nextConversation.attachments,
          draft:
            options.restoreDraft && submittedDraft
              ? submittedDraft
              : prev.draft,
        };
      });
    },
    [logTurnWarnings]
  );

  useEffect(() => {
    return () => {
      revokePreviewUrlsForIds(Object.keys(stateRef.current.attachments), stateRef.current.attachments);
    };
  }, []);

  const setDraftText = useCallback((text: string) => {
    setState((prev) => ({
      ...prev,
      draft: {
        ...prev.draft,
        text,
      },
      draftErrors: [],
    }));
  }, []);

  const setDraft = useCallback((draft: AiDraft) => {
    setState((prev) => {
      const nextAttachments = { ...prev.attachments };
      const nextAttachmentIds = new Set(draft.attachmentIds);

      for (const id of getUnreferencedAttachmentIds(prev.draft.attachmentIds, prev.messages)) {
        if (nextAttachmentIds.has(id)) continue;
        const attachment = nextAttachments[id];
        if (attachment?.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
        delete nextAttachments[id];
      }

      return {
        ...prev,
        attachments: nextAttachments,
        draft,
        draftErrors: [],
      };
    });
  }, []);

  const addDraftFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const snapshot = stateRef.current;
    setState((prev) => ({
      ...prev,
      isProcessingAttachments: true,
      draftErrors: [],
    }));

    const result = await processAttachmentFiles(files, snapshot.draft, snapshot.attachments);

    setState((prev) => {
      const nextAttachments = { ...prev.attachments };
      const nextAttachmentIds = [...prev.draft.attachmentIds];

      for (const attachment of result.attachments) {
        nextAttachments[attachment.id] = attachment;
        nextAttachmentIds.push(attachment.id);
      }

      return {
        ...prev,
        isProcessingAttachments: false,
        attachments: nextAttachments,
        draft: {
          ...prev.draft,
          attachmentIds: nextAttachmentIds,
        },
        draftErrors: result.errors,
      };
    });
  }, []);

  const removeDraftAttachment = useCallback((attachmentId: string) => {
    setState((prev) => {
      const attachment = prev.attachments[attachmentId];
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }

      const nextAttachments = { ...prev.attachments };
      delete nextAttachments[attachmentId];

      return {
        ...prev,
        attachments: nextAttachments,
        draft: {
          ...prev.draft,
          attachmentIds: prev.draft.attachmentIds.filter((id) => id !== attachmentId),
        },
      };
    });
  }, []);

  const clearDraft = useCallback(() => {
    setState((prev) => {
      const removableIds = getUnreferencedAttachmentIds(prev.draft.attachmentIds, prev.messages);
      revokePreviewUrlsForIds(removableIds, prev.attachments);
      const nextAttachments = { ...prev.attachments };
      for (const id of removableIds) {
        delete nextAttachments[id];
      }

      return {
        ...prev,
        attachments: nextAttachments,
        draft: EMPTY_DRAFT,
        draftErrors: [],
        isProcessingAttachments: false,
      };
    });
  }, []);

  const submitDraft = useCallback(
    async (draftOverride?: AiDraft) => {
      const currentState = stateRef.current;
      const draft = draftOverride ?? currentState.draft;
      const draftParts = draftToUserParts(draft, currentState.attachments);

      if (!draftParts.length || getDraftHasPendingAttachments(draft, currentState.attachments)) {
        return;
      }

      const visionBlockMessage = getVisionBlockMessage(
        draft,
        currentState.attachments,
        currentState.currentModelVisionSupport
      );
      if (visionBlockMessage) {
        setState((prev) => ({
          ...prev,
          draftErrors: [visionBlockMessage],
        }));
        return;
      }

      const provider = getProviderFromModel(currentState.currentModel);
      const apiKey = getApiKey(provider);

      if (!apiKey) {
        setState((prev) => ({
          ...prev,
          error: 'Please set your API key in Settings first',
        }));
        return;
      }

      const userMessage: UserMessage = {
        type: 'user',
        id: crypto.randomUUID(),
        parts: draftParts,
        timestamp: Date.now(),
      };

      const updatedMessages = [...currentState.messages, userMessage];
      const submittedDraft = draft;
      const submittedReadyIds = getReadyAttachmentIds(draft, currentState.attachments);
      const turnId = crypto.randomUUID();
      const activeTurn = createActiveTurnState(turnId, userMessage.id);

      committedMessagesRef.current = updatedMessages;
      activeTurnRef.current = activeTurn;
      activeTurnDraftRef.current = {
        submittedDraft,
        submittedReadyIds,
      };
      setState((prev) => ({
        ...prev,
        isStreaming: true,
        streamingResponse: null,
        error: null,
        messages: updatedMessages,
        currentToolCalls: [],
        draft: EMPTY_DRAFT,
        draftErrors: [],
      }));
      pendingCheckpointIdRef.current = null;
      didReceiveResponseRef.current = false;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const model = createModel(provider, apiKey, currentState.currentModel);
        const modelMessages = messagesToModelMessages(updatedMessages, currentState.attachments);

        const result = await startAiStream({
          model,
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(MAX_AGENT_STEPS),
          abortSignal: abortController.signal,
        });

        let streamErrorText: string | null = null;
        let streamFinishReason: string | null = null;

        for await (const chunk of result.fullStream) {
          if (abortController.signal.aborted) break;

          if (import.meta.env.DEV) {
            console.log('[useAiAgent] Stream chunk:', chunk.type);
          }

          if (
            chunk.type === 'text-start' ||
            chunk.type === 'text-delta' ||
            chunk.type === 'text-end' ||
            chunk.type === 'tool-input-start' ||
            chunk.type === 'tool-call' ||
            chunk.type === 'tool-result' ||
            chunk.type === 'tool-error' ||
            chunk.type === 'tool-output-denied'
          ) {
            didReceiveResponseRef.current = true;
          }

          const currentActiveTurn = activeTurnRef.current;
          if (!currentActiveTurn) break;

          const turnUpdate = reduceActiveTurnChunk(currentActiveTurn, chunk);
          activeTurnRef.current = turnUpdate.state;
          logTurnWarnings(turnUpdate.warnings);

          if (chunk.type === 'tool-result' && chunk.toolName === 'apply_edit') {
            const checkpointMatch =
              typeof chunk.output === 'string'
                ? chunk.output.match(/\[CHECKPOINT:([\w-]+)\]/)
                : null;
            if (checkpointMatch) {
              pendingCheckpointIdRef.current = checkpointMatch[1];
            }
          }

          syncActiveTurnState(turnUpdate.state);

          if (chunk.type === 'error') {
            streamErrorText =
              chunk.error instanceof Error ? chunk.error.message : String(chunk.error);
            console.error('[useAiAgent] Stream error:', chunk.error);
            break;
          }

          if (chunk.type === 'finish') {
            streamFinishReason = chunk.finishReason;
          }
        }

        if (abortController.signal.aborted) {
          if (import.meta.env.DEV) console.log('[useAiAgent] Stream was cancelled');
          return;
        }

        if (activeTurnRef.current) {
          const completionNotice =
            !streamErrorText && streamFinishReason === 'tool-calls'
              ? `Stopped before the final AI summary because the tool step budget (${MAX_AGENT_STEPS}) was reached.`
              : null;
          finalizeStreamTurn(activeTurnRef.current, {
            reason: streamErrorText ? 'error' : 'complete',
            errorText: streamErrorText,
            restoreDraft: Boolean(streamErrorText) && !didReceiveResponseRef.current,
            completionNotice,
          });
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          if (import.meta.env.DEV) console.log('[useAiAgent] Stream was cancelled');
          return;
        }

        console.error('[useAiAgent] Error submitting prompt:', error);
        const errorText = error instanceof Error ? error.message : String(error);

        if (activeTurnRef.current) {
          finalizeStreamTurn(activeTurnRef.current, {
            reason: 'error',
            errorText,
            restoreDraft: !didReceiveResponseRef.current,
          });
        } else {
          setState((prev) => ({
            ...prev,
            error: `Failed: ${errorText}`,
            isStreaming: false,
            streamingResponse: null,
            currentToolCalls: [],
            draft: didReceiveResponseRef.current ? prev.draft : submittedDraft,
          }));
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [finalizeStreamTurn, logTurnWarnings, syncActiveTurnState, tools]
  );

  const submitPrompt = useCallback(
    async (prompt: string) => {
      await submitDraft({ text: prompt, attachmentIds: [] });
    },
    [submitDraft]
  );

  const cancelStream = useCallback(() => {
    if (import.meta.env.DEV) console.log('[useAiAgent] Cancelling stream...');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const activeTurn = activeTurnRef.current;
    if (activeTurn) {
      finalizeStreamTurn(activeTurn, { reason: 'cancelled' });
      return;
    }
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      streamingResponse: null,
      currentToolCalls: [],
    }));
    pendingCheckpointIdRef.current = null;
  }, [finalizeStreamTurn]);

  const acceptDiff = useCallback(() => {}, []);
  const rejectDiff = useCallback(() => {}, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const setCurrentModel = useCallback((model: string) => {
    if (import.meta.env.DEV) console.log('[useAiAgent] Setting current model to:', model);
    setState((prev) => ({
      ...prev,
      currentModel: model,
      currentModelVisionSupport: getVisionSupportForModelId(model),
    }));
    setStoredModel(model);
  }, []);

  const newConversation = useCallback(() => {
    activeTurnRef.current = null;
    activeTurnDraftRef.current = null;
    committedMessagesRef.current = [];
    pendingCheckpointIdRef.current = null;
    setState((prev) => {
      revokePreviewUrlsForIds(Object.keys(prev.attachments), prev.attachments);
      return {
        ...prev,
        messages: [],
        attachments: {},
        draft: EMPTY_DRAFT,
        draftErrors: [],
        streamingResponse: null,
        error: null,
        currentToolCalls: [],
      };
    });
  }, []);

  const handleRestoreCheckpoint = useCallback((checkpointId: string, truncatedMessages: Message[]) => {
    if (import.meta.env.DEV) console.log('[useAiAgent] Restoring checkpoint:', checkpointId);

    const checkpoint = historyService.restoreTo(checkpointId);
    if (checkpoint) {
      eventBus.emit('history:restore', { code: checkpoint.code });
    } else {
      console.error('[useAiAgent] Failed to restore checkpoint: not found', checkpointId);
    }

    committedMessagesRef.current = truncatedMessages;
    activeTurnRef.current = null;
    activeTurnDraftRef.current = null;

    setState((prev) => ({
      ...prev,
      messages: truncatedMessages,
    }));
  }, []);

  return {
    ...state,
    submitPrompt,
    submitDraft,
    cancelStream,
    acceptDiff,
    rejectDiff,
    clearError,
    newConversation,
    loadConversation: () => {},
    saveConversation: async () => {},
    setCurrentModel,
    loadModelAndProviders,
    handleRestoreCheckpoint,
    updateSourceRef,
    updateCapturePreview,
    updateStlBlobUrl,
    updateWorkingDir,
    updateCurrentFilePath,
    updateAuxiliaryFiles,
    updatePreviewSceneStyle,
    setDraftText,
    setDraft,
    clearDraft,
    addDraftFiles,
    removeDraftAttachment,
    canSubmitDraft: getDraftCanSubmit(state.draft, state.attachments),
    draftVisionBlockMessage: getVisionBlockMessage(
      state.draft,
      state.attachments,
      state.currentModelVisionSupport
    ),
    draftVisionWarningMessage: getVisionWarningMessage(
      state.draft,
      state.attachments,
      state.currentModelVisionSupport
    ),
  };
}
