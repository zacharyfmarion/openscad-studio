import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { type ToolSet, stepCountIs } from 'ai';
import { bucketCount, useAnalytics, type ModelSelectionSurface } from '../analytics/runtime';
import { historyService, eventBus, getPlatform } from '../platform';
import {
  createModel,
  SYSTEM_PROMPT,
  buildTools,
  type AiToolCallbacks,
} from '../services/aiService';
import {
  getApiKey,
  getProviderFromModel,
  getStoredModel,
  setStoredModel,
  useAvailableProviders,
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
import { getPreferredDefaultModel } from '../utils/aiModels';
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
import { getAiErrorHandling } from '../utils/aiErrors';
import { startAiStream } from '../services/aiStream';
import {
  FALLBACK_PREVIEW_SCENE_STYLE,
  type PreviewSceneStyle,
} from '../services/previewSceneConfig';
import { getRelativeProjectPath, normalizeProjectRelativePath } from '../utils/projectFilePaths';
import { createRandomId } from '../utils/randomId';
import { updateSetting, loadSettings, type MeasurementUnit } from '../stores/settingsStore';

function extractErrorText(error: unknown): string {
  const visit = (value: unknown, depth: number, seen: WeakSet<object>): string | null => {
    if (depth <= 0) {
      return null;
    }

    if (value instanceof Error) {
      const cause = 'cause' in value ? (value as Error & { cause?: unknown }).cause : undefined;
      return value.message || visit(cause, depth - 1, seen) || value.name || null;
    }

    if (typeof value === 'string') {
      return value.trim() || null;
    }

    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return null;
      }

      seen.add(value);

      const candidates = [
        (value as Record<string, unknown>).message,
        (value as Record<string, unknown>).detail,
        (value as Record<string, unknown>).reason,
        (value as Record<string, unknown>).error,
        (value as Record<string, unknown>).cause,
        (value as Record<string, unknown>).data,
      ];

      for (const candidate of candidates) {
        const message = visit(candidate, depth - 1, seen);
        if (message) {
          return message;
        }
      }
    }

    return null;
  };

  const message = visit(error, 5, new WeakSet());
  if (message) {
    return message;
  }

  return String(error);
}

function humanizeStreamError(errorText: string): string {
  return getAiErrorHandling(errorText, 'AI request failed').displayMessage;
}

function extractApplyEditCheckpointId(output: unknown): string | null {
  if (typeof output !== 'string') return null;

  const checkpointMatch = output.match(/\[CHECKPOINT:([\w-]+)\]/);
  return checkpointMatch?.[1] ?? null;
}

const EMPTY_DRAFT: AiDraft = {
  text: '',
  attachmentIds: [],
};

// Coding turns regularly need a few extra steps after the last tool call
// to produce a visible final summary for the user.
const MAX_AGENT_STEPS = 30;
const IS_DEV =
  typeof window !== 'undefined' &&
  !window.navigator.userAgent.includes('jsdom') &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const VIEWER_ANNOTATION_GUIDANCE_TEXT =
  'The attached viewer screenshot includes intentional user annotations. Colored boxes, ovals, circles, and freehand marks highlight the area to focus on and are not part of the OpenSCAD geometry unless the user explicitly asks about the annotations.';

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
  const readyAttachmentIds = getReadyAttachmentIds(draft, attachments);
  const trimmedText = draft.text.trim();
  const hasViewerAnnotationAttachment = readyAttachmentIds.some(
    (attachmentId) => attachments[attachmentId]?.sourceSurface === 'viewer_annotation'
  );

  if (hasViewerAnnotationAttachment) {
    parts.push({ type: 'text', text: VIEWER_ANNOTATION_GUIDANCE_TEXT });
  }

  if (trimmedText) {
    parts.push({ type: 'text', text: trimmedText });
  }

  for (const attachmentId of readyAttachmentIds) {
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
  errorObject: Error | null;
  isApplyingDiff: boolean;
  messages: Message[];
  conversations: Conversation[];
  currentConversationId: string | null;
  currentToolCalls: ToolCall[];
  currentModel: string;
  currentModelVisionSupport: VisionSupport;
  draft: AiDraft;
  attachments: AttachmentStore;
  draftErrors: string[];
  isProcessingAttachments: boolean;
}

export interface AddDraftFilesResult {
  readyCount: number;
  errorCount: number;
  attachmentIds: string[];
  errors: string[];
}

interface UseAiAgentOptions {
  testOverrides?: {
    analytics?: ReturnType<typeof useAnalytics>;
    availableProviders?: ReturnType<typeof useAvailableProviders>;
    getPlatform?: typeof getPlatform;
    createModel?: typeof createModel;
    buildTools?: typeof buildTools;
    startAiStream?: typeof startAiStream;
    processAttachmentFiles?: typeof processAttachmentFiles;
    getVisionSupportForModelId?: typeof getVisionSupportForModelId;
    messagesToModelMessages?: typeof messagesToModelMessages;
    getPreferredDefaultModel?: typeof getPreferredDefaultModel;
    historyService?: typeof historyService;
    eventBus?: typeof eventBus;
    updateSetting?: typeof updateSetting;
    loadSettings?: typeof loadSettings;
  };
}

export function useAiAgent(options: UseAiAgentOptions = {}) {
  const defaultAnalytics = useAnalytics();
  const defaultAvailableProviders = useAvailableProviders();
  const overrides = options.testOverrides;
  const analytics = overrides?.analytics ?? defaultAnalytics;
  const availableProviders = overrides?.availableProviders ?? defaultAvailableProviders;
  const getPlatformImpl = overrides?.getPlatform ?? getPlatform;
  const createModelImpl = overrides?.createModel ?? createModel;
  const buildToolsImpl = overrides?.buildTools ?? buildTools;
  const startAiStreamImpl = overrides?.startAiStream ?? startAiStream;
  const processAttachmentFilesImpl = overrides?.processAttachmentFiles ?? processAttachmentFiles;
  const getVisionSupportForModelIdImpl =
    overrides?.getVisionSupportForModelId ?? getVisionSupportForModelId;
  const messagesToModelMessagesImpl = overrides?.messagesToModelMessages ?? messagesToModelMessages;
  const getPreferredDefaultModelImpl =
    overrides?.getPreferredDefaultModel ?? getPreferredDefaultModel;
  const historyServiceImpl = overrides?.historyService ?? historyService;
  const eventBusImpl = overrides?.eventBus ?? eventBus;
  const updateSettingImpl = overrides?.updateSetting ?? updateSetting;
  const loadSettingsImpl = overrides?.loadSettings ?? loadSettings;
  const [state, setState] = useState<AiAgentState>({
    isStreaming: false,
    streamingResponse: null,
    proposedDiff: null,
    error: null,
    errorObject: null,
    isApplyingDiff: false,
    messages: [],
    conversations: [],
    currentConversationId: null,
    currentToolCalls: [],
    currentModel: getStoredModel(),
    currentModelVisionSupport: getVisionSupportForModelIdImpl(getStoredModel()),
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
  const measurementUnitRef = useRef<MeasurementUnit>(loadSettingsImpl().viewer.measurementUnit);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<ActiveTurnState | null>(null);
  const committedMessagesRef = useRef<Message[]>(state.messages);
  const activeTurnDraftRef = useRef<{
    submittedDraft: AiDraft;
    submittedReadyIds: string[];
  } | null>(null);
  const pendingCheckpointIdRef = useRef<string | null>(null);
  const didReceiveResponseRef = useRef(false);
  const requestStartedAtRef = useRef<number | null>(null);

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
          return Boolean(workingDirRef.current) && getPlatformImpl().capabilities.hasFileSystem;
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

        const platform = getPlatformImpl();
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

        const platform = getPlatformImpl();
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
      getMeasurementUnit: () => measurementUnitRef.current,
      setMeasurementUnit: (unit: MeasurementUnit) => {
        measurementUnitRef.current = unit;
        updateSettingImpl('viewer', { measurementUnit: unit });
      },
    }),
    [getPlatformImpl, updateSettingImpl]
  );

  const tools: ToolSet = useMemo(() => buildToolsImpl(callbacks), [buildToolsImpl, callbacks]);

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
    const storedModel = getStoredModel();
    const resolvedModel =
      availableProviders.length === 0 ||
      availableProviders.includes(getProviderFromModel(storedModel))
        ? storedModel
        : getPreferredDefaultModelImpl(availableProviders);

    if (resolvedModel !== storedModel) {
      setStoredModel(resolvedModel);
    }

    setState((prev) => ({
      ...prev,
      currentModel: resolvedModel,
      currentModelVisionSupport: getVisionSupportForModelIdImpl(resolvedModel),
    }));
    if (IS_DEV) {
      console.log(
        '[useAiAgent] Loaded model:',
        resolvedModel,
        'Available providers:',
        availableProviders
      );
    }
  }, [availableProviders, getPreferredDefaultModelImpl, getVisionSupportForModelIdImpl]);

  useEffect(() => {
    loadModelAndProviders();
  }, [loadModelAndProviders]);

  const logTurnWarnings = useCallback((warnings: string[]) => {
    if (!IS_DEV || warnings.length === 0) return;
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
        errorObject?: Error | null;
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
                id: createRandomId(),
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
          error: options.errorText ? humanizeStreamError(options.errorText) : null,
          errorObject: options.errorObject ?? null,
          messages: nextMessages,
          attachments: nextConversation.attachments,
          draft: options.restoreDraft && submittedDraft ? submittedDraft : prev.draft,
        };
      });

      const durationMs =
        requestStartedAtRef.current === null
          ? undefined
          : Math.round(performance.now() - requestStartedAtRef.current);
      requestStartedAtRef.current = null;

      const toolMessages = finalizedTurn.state.completedToolCalls;
      const toolNamesUsed = Array.from(new Set(toolMessages.map((tool) => tool.toolName))).sort();
      const appliedEditCount = toolMessages.filter((tool) => tool.toolName === 'apply_edit').length;
      const baseProperties = {
        provider: getProviderFromModel(stateRef.current.currentModel),
        model_id: stateRef.current.currentModel,
        duration_ms: durationMs,
        tool_call_count: toolMessages.length,
        tool_names_used: toolNamesUsed,
        applied_edit_count: appliedEditCount,
      };

      if (options.reason === 'cancelled') {
        analytics.track('ai request cancelled', baseProperties);
      } else {
        analytics.track('ai request completed', {
          ...baseProperties,
          finish_reason: options.completionNotice ? 'step-budget' : options.reason,
          had_error: options.reason === 'error',
        });
      }
    },
    [analytics, logTurnWarnings]
  );

  useEffect(() => {
    return () => {
      revokePreviewUrlsForIds(
        Object.keys(stateRef.current.attachments),
        stateRef.current.attachments
      );
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

  const addDraftFiles = useCallback(
    async (files: File[], sourceSurface: ModelSelectionSurface = 'unknown') => {
      if (files.length === 0) return;

      const snapshot = stateRef.current;
      setState((prev) => ({
        ...prev,
        isProcessingAttachments: true,
        draftErrors: [],
      }));

      const result = await processAttachmentFilesImpl(
        files,
        snapshot.draft,
        snapshot.attachments,
        sourceSurface
      );
      const readyCount = result.attachments.filter(
        (attachment) => attachment.status === 'ready'
      ).length;
      const errorCount = result.attachments.length - readyCount;

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

      analytics.track('attachment added', {
        source_surface: sourceSurface,
        selected_count: files.length,
        ready_count: readyCount,
        error_count: errorCount,
      });

      return {
        readyCount,
        errorCount,
        attachmentIds: result.attachments.map((attachment) => attachment.id),
        errors: [...result.errors],
      } satisfies AddDraftFilesResult;
    },
    [analytics, processAttachmentFilesImpl]
  );

  const removeDraftAttachment = useCallback(
    (attachmentId: string, sourceSurface: ModelSelectionSurface = 'unknown') => {
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

      analytics.track('attachment removed', {
        source_surface: sourceSurface,
      });
    },
    [analytics]
  );

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
        id: createRandomId(),
        parts: draftParts,
        timestamp: Date.now(),
      };

      const updatedMessages = [...currentState.messages, userMessage];
      const submittedDraft = draft;
      const submittedReadyIds = getReadyAttachmentIds(draft, currentState.attachments);
      const turnId = createRandomId();
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
      requestStartedAtRef.current = performance.now();
      analytics.track('ai request submitted', {
        provider,
        model_id: currentState.currentModel,
        attachment_count: submittedReadyIds.length,
        has_project_file_access: callbacks.hasProjectFileAccess(),
        prompt_length_bucket: bucketCount(draft.text.trim().length, [20, 80, 200, 500]),
        conversation_length_bucket: bucketCount(updatedMessages.length, [2, 5, 10, 20]),
      });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const model = createModelImpl(provider, apiKey, currentState.currentModel);
        const modelMessages = messagesToModelMessagesImpl(
          updatedMessages,
          currentState.attachments
        );

        const measurementUnit = callbacks.getMeasurementUnit();
        const unitLabels: Record<MeasurementUnit, string> = {
          mm: 'millimeters',
          cm: 'centimeters',
          in: 'inches',
          units: 'dimensionless',
        };
        const dynamicSystem = `${SYSTEM_PROMPT}\n\nCurrent measurement unit: ${measurementUnit} (${unitLabels[measurementUnit]}) — all displayed dimensions use this unit`;

        const result = await startAiStreamImpl({
          model,
          system: dynamicSystem,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(MAX_AGENT_STEPS),
          abortSignal: abortController.signal,
        });

        let streamErrorText: string | null = null;
        let streamErrorObject: Error | null = null;
        let streamFinishReason: string | null = null;

        for await (const chunk of result.fullStream) {
          if (abortController.signal.aborted) break;

          if (IS_DEV) {
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

          if (
            chunk.type === 'tool-result' &&
            chunk.toolName === 'apply_edit' &&
            pendingCheckpointIdRef.current === null
          ) {
            // The restore button is turn-scoped: it should return to the code
            // from before this user request, not before the last edit in the turn.
            const checkpointId = extractApplyEditCheckpointId(chunk.output);
            if (checkpointId) {
              pendingCheckpointIdRef.current = checkpointId;
            }
          }

          syncActiveTurnState(turnUpdate.state);

          if (chunk.type === 'error') {
            streamErrorText = extractErrorText(chunk.error);
            streamErrorObject =
              chunk.error instanceof Error ? chunk.error : new Error(streamErrorText);
            console.error('[useAiAgent] Stream error:', chunk.error);
            break;
          }

          if (chunk.type === 'finish') {
            streamFinishReason = chunk.finishReason;
          }
        }

        if (abortController.signal.aborted) {
          if (IS_DEV) console.log('[useAiAgent] Stream was cancelled');
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
            errorObject: streamErrorObject,
            restoreDraft: Boolean(streamErrorText) && !didReceiveResponseRef.current,
            completionNotice,
          });
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          if (IS_DEV) console.log('[useAiAgent] Stream was cancelled');
          return;
        }

        console.error('[useAiAgent] Error submitting prompt:', error);
        const errorText = extractErrorText(error);
        const errorObject = error instanceof Error ? error : new Error(errorText);

        if (activeTurnRef.current) {
          finalizeStreamTurn(activeTurnRef.current, {
            reason: 'error',
            errorText,
            errorObject,
            restoreDraft: !didReceiveResponseRef.current,
          });
        } else {
          setState((prev) => ({
            ...prev,
            error: humanizeStreamError(errorText),
            errorObject,
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
    [
      analytics,
      callbacks,
      createModelImpl,
      finalizeStreamTurn,
      logTurnWarnings,
      messagesToModelMessagesImpl,
      startAiStreamImpl,
      syncActiveTurnState,
      tools,
    ]
  );

  const submitPrompt = useCallback(
    async (prompt: string) => {
      await submitDraft({ text: prompt, attachmentIds: [] });
    },
    [submitDraft]
  );

  const cancelStream = useCallback(() => {
    if (IS_DEV) console.log('[useAiAgent] Cancelling stream...');
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
    setState((prev) => ({ ...prev, error: null, errorObject: null }));
  }, []);

  const setCurrentModel = useCallback(
    (model: string, sourceSurface: ModelSelectionSurface = 'unknown') => {
      if (IS_DEV) console.log('[useAiAgent] Setting current model to:', model);
      setState((prev) => ({
        ...prev,
        currentModel: model,
        currentModelVisionSupport: getVisionSupportForModelIdImpl(model),
      }));
      setStoredModel(model);
      analytics.track('model selected', {
        provider: getProviderFromModel(model),
        model_id: model,
        source_surface: sourceSurface,
      });
    },
    [analytics, getVisionSupportForModelIdImpl]
  );

  const newConversation = useCallback(() => {
    const currentState = stateRef.current;
    analytics.track('conversation started', {
      source_surface: 'ai_panel',
      had_messages: currentState.messages.length > 0,
      had_draft_text: currentState.draft.text.trim().length > 0,
      draft_attachment_count: currentState.draft.attachmentIds.length,
      previous_message_count_bucket: bucketCount(currentState.messages.length, [1, 3, 8, 20]),
    });
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
        errorObject: null,
        currentToolCalls: [],
      };
    });
  }, [analytics]);

  const handleRestoreCheckpoint = useCallback(
    (checkpointId: string, truncatedMessages: Message[]) => {
      if (IS_DEV) console.log('[useAiAgent] Restoring checkpoint:', checkpointId);

      const checkpoint = historyServiceImpl.restoreTo(checkpointId);
      if (checkpoint) {
        eventBusImpl.emit('code-updated', { code: checkpoint.code, source: 'history' });
        eventBusImpl.emit('history:restore', { code: checkpoint.code });
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
      analytics.track('checkpoint restored', {
        had_later_messages: stateRef.current.messages.length > truncatedMessages.length,
      });
    },
    [analytics, eventBusImpl, historyServiceImpl]
  );

  return {
    ...state,
    availableProviders,
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
