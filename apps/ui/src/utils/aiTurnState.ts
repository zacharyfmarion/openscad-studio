import type { TextStreamPart, ToolSet } from 'ai';
import type {
  AssistantMessage,
  AssistantMessageState,
  AttachmentStore,
  Message,
  ToolCall,
  ToolCallMessage,
} from '../types/aiChat';

type StreamChunk = TextStreamPart<ToolSet>;

interface ActiveTextPart {
  id: string;
  text: string;
}

interface PendingToolCall extends ToolCall {
  inputText: string;
}

export type ActiveTurnStatus = 'streaming' | 'completed' | 'cancelled' | 'error';

export interface ActiveTurnState {
  turnId: string;
  userMessageId: string;
  stepIndex: number;
  activeTextPartsById: Record<string, ActiveTextPart>;
  activeTextPartOrder: string[];
  pendingToolCallsById: Record<string, PendingToolCall>;
  pendingToolCallOrder: string[];
  completedToolCalls: ToolCallMessage[];
  persistedAssistantSegments: AssistantMessage[];
  persistedMessages: Array<AssistantMessage | ToolCallMessage>;
  status: ActiveTurnStatus;
}

export interface TurnChunkResult {
  state: ActiveTurnState;
  warnings: string[];
}

export interface FinalizeActiveTurnOptions {
  reason: 'complete' | 'cancelled' | 'error';
  errorText?: string | null;
}

export interface FinalizeConversationTurnParams {
  baseMessages: Message[];
  attachments: AttachmentStore;
  activeTurn: ActiveTurnState;
  submittedAttachmentIds: string[];
  submittedReadyIds: string[];
  checkpointId?: string | null;
}

export interface FinalizeConversationTurnResult {
  messages: Message[];
  attachments: AttachmentStore;
}

function createAssistantMessage(
  turnId: string,
  content: string,
  state: AssistantMessageState
): AssistantMessage | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  return {
    type: 'assistant',
    id: crypto.randomUUID(),
    turnId,
    content: trimmed,
    state,
    timestamp: Date.now(),
  };
}

function createToolMessage(toolCall: ToolCall, toolName?: string): ToolCallMessage {
  return {
    type: 'tool-call',
    id: crypto.randomUUID(),
    toolCallId: toolCall.toolCallId,
    toolName: toolName ?? toolCall.name,
    args: toolCall.args,
    state: toolCall.state,
    result: toolCall.result,
    errorText: toolCall.errorText,
    timestamp: Date.now(),
  };
}

function upsertPendingToolCall(
  pendingToolCallsById: Record<string, PendingToolCall>,
  pendingToolCallOrder: string[],
  toolCall: PendingToolCall
) {
  const nextById = { ...pendingToolCallsById, [toolCall.toolCallId]: toolCall };
  const nextOrder = pendingToolCallOrder.includes(toolCall.toolCallId)
    ? pendingToolCallOrder
    : [...pendingToolCallOrder, toolCall.toolCallId];

  return { pendingToolCallsById: nextById, pendingToolCallOrder: nextOrder };
}

function removePendingToolCall(
  pendingToolCallsById: Record<string, PendingToolCall>,
  pendingToolCallOrder: string[],
  toolCallId: string
) {
  const nextById = { ...pendingToolCallsById };
  delete nextById[toolCallId];

  return {
    pendingToolCallsById: nextById,
    pendingToolCallOrder: pendingToolCallOrder.filter((id) => id !== toolCallId),
  };
}

function persistAssistantPart(
  state: ActiveTurnState,
  textPartId: string,
  assistantState: AssistantMessageState
): TurnChunkResult {
  const textPart = state.activeTextPartsById[textPartId];
  if (!textPart) {
    return {
      state,
      warnings: [`Received text-end for missing text part "${textPartId}".`],
    };
  }

  const nextActiveTextPartsById = { ...state.activeTextPartsById };
  delete nextActiveTextPartsById[textPartId];

  const assistantMessage = createAssistantMessage(state.turnId, textPart.text, assistantState);
  if (!assistantMessage) {
    return {
      state: {
        ...state,
        activeTextPartsById: nextActiveTextPartsById,
        activeTextPartOrder: state.activeTextPartOrder.filter((id) => id !== textPartId),
      },
      warnings: [],
    };
  }

  return {
    state: {
      ...state,
      activeTextPartsById: nextActiveTextPartsById,
      activeTextPartOrder: state.activeTextPartOrder.filter((id) => id !== textPartId),
      persistedAssistantSegments: [...state.persistedAssistantSegments, assistantMessage],
      persistedMessages: [...state.persistedMessages, assistantMessage],
    },
    warnings: [],
  };
}

function flushActiveTextParts(
  state: ActiveTurnState,
  assistantState: AssistantMessageState
): TurnChunkResult {
  let nextState = state;
  const warnings: string[] = [];

  for (const textPartId of state.activeTextPartOrder) {
    const result = persistAssistantPart(nextState, textPartId, assistantState);
    nextState = result.state;
    warnings.push(...result.warnings);
  }

  return {
    state: nextState,
    warnings,
  };
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function finalizePendingToolCalls(
  state: ActiveTurnState,
  reason: FinalizeActiveTurnOptions['reason'],
  errorText?: string | null
): ActiveTurnState {
  let nextState = state;

  for (const toolCallId of state.pendingToolCallOrder) {
    const toolCall = nextState.pendingToolCallsById[toolCallId];
    if (!toolCall) continue;

    const finalizedTool: ToolCall = {
      ...toolCall,
      state:
        reason === 'cancelled'
          ? 'pending'
          : reason === 'error'
            ? 'error'
            : 'error',
      errorText:
        reason === 'cancelled'
          ? toolCall.errorText
          : errorText ?? toolCall.errorText ?? 'Tool call did not complete.',
    };
    const toolMessage = createToolMessage(finalizedTool);
    const removed = removePendingToolCall(
      nextState.pendingToolCallsById,
      nextState.pendingToolCallOrder,
      toolCallId
    );

    nextState = {
      ...nextState,
      pendingToolCallsById: removed.pendingToolCallsById,
      pendingToolCallOrder: removed.pendingToolCallOrder,
      completedToolCalls: [...nextState.completedToolCalls, toolMessage],
      persistedMessages: [...nextState.persistedMessages, toolMessage],
    };
  }

  return nextState;
}

export function createActiveTurnState(turnId: string, userMessageId: string): ActiveTurnState {
  return {
    turnId,
    userMessageId,
    stepIndex: 0,
    activeTextPartsById: {},
    activeTextPartOrder: [],
    pendingToolCallsById: {},
    pendingToolCallOrder: [],
    completedToolCalls: [],
    persistedAssistantSegments: [],
    persistedMessages: [],
    status: 'streaming',
  };
}

export function reduceActiveTurnChunk(
  state: ActiveTurnState,
  chunk: StreamChunk
): TurnChunkResult {
  switch (chunk.type) {
    case 'start':
      return { state, warnings: [] };

    case 'start-step':
      return {
        state: {
          ...state,
          stepIndex: state.stepIndex + 1,
        },
        warnings: [],
      };

    case 'finish-step': {
      const flushed = flushActiveTextParts(state, 'complete');
      return {
        state: flushed.state,
        warnings: flushed.warnings,
      };
    }

    case 'finish':
      return {
        state: {
          ...state,
          status: 'completed',
        },
        warnings: [],
      };

    case 'abort':
      return {
        state: {
          ...state,
          status: 'cancelled',
        },
        warnings: [],
      };

    case 'text-start':
      if (state.activeTextPartsById[chunk.id]) {
        return {
          state,
          warnings: [`Ignoring duplicate text-start for "${chunk.id}".`],
        };
      }

      return {
        state: {
          ...state,
          activeTextPartsById: {
            ...state.activeTextPartsById,
            [chunk.id]: {
              id: chunk.id,
              text: '',
            },
          },
          activeTextPartOrder: [...state.activeTextPartOrder, chunk.id],
        },
        warnings: [],
      };

    case 'text-delta': {
      const currentTextPart = state.activeTextPartsById[chunk.id];
      if (!currentTextPart) {
        return {
          state,
          warnings: [`Ignoring text-delta for missing text part "${chunk.id}".`],
        };
      }

      return {
        state: {
          ...state,
          activeTextPartsById: {
            ...state.activeTextPartsById,
            [chunk.id]: {
              ...currentTextPart,
              text: currentTextPart.text + chunk.text,
            },
          },
        },
        warnings: [],
      };
    }

    case 'text-end':
      return persistAssistantPart(state, chunk.id, 'complete');

    case 'tool-input-start': {
      const existingToolCall = state.pendingToolCallsById[chunk.id];
      const nextToolCall: PendingToolCall = {
        toolCallId: chunk.id,
        name: existingToolCall?.name ?? chunk.toolName,
        args: existingToolCall?.args,
        state: existingToolCall?.state ?? 'pending',
        result: existingToolCall?.result,
        errorText: existingToolCall?.errorText,
        inputText: existingToolCall?.inputText ?? '',
      };

      const updated = upsertPendingToolCall(
        state.pendingToolCallsById,
        state.pendingToolCallOrder,
        nextToolCall
      );

      return {
        state: {
          ...state,
          pendingToolCallsById: updated.pendingToolCallsById,
          pendingToolCallOrder: updated.pendingToolCallOrder,
        },
        warnings: [],
      };
    }

    case 'tool-input-delta': {
      const existingToolCall = state.pendingToolCallsById[chunk.id];
      if (!existingToolCall) {
        return {
          state,
          warnings: [`Ignoring tool-input-delta for missing tool call "${chunk.id}".`],
        };
      }

      return {
        state: {
          ...state,
          pendingToolCallsById: {
            ...state.pendingToolCallsById,
            [chunk.id]: {
              ...existingToolCall,
              inputText: existingToolCall.inputText + chunk.delta,
            },
          },
        },
        warnings: [],
      };
    }

    case 'tool-input-end':
      if (!state.pendingToolCallsById[chunk.id]) {
        return {
          state,
          warnings: [`Ignoring tool-input-end for missing tool call "${chunk.id}".`],
        };
      }
      return { state, warnings: [] };

    case 'tool-call': {
      const existingToolCall = state.pendingToolCallsById[chunk.toolCallId];
      const nextToolCall: PendingToolCall = {
        toolCallId: chunk.toolCallId,
        name: chunk.toolName,
        args: chunk.input as Record<string, unknown>,
        state: 'pending',
        result: existingToolCall?.result,
        errorText: existingToolCall?.errorText,
        inputText: existingToolCall?.inputText ?? '',
      };
      const updated = upsertPendingToolCall(
        state.pendingToolCallsById,
        state.pendingToolCallOrder,
        nextToolCall
      );

      return {
        state: {
          ...state,
          pendingToolCallsById: updated.pendingToolCallsById,
          pendingToolCallOrder: updated.pendingToolCallOrder,
        },
        warnings: [],
      };
    }

    case 'tool-result': {
      const existingToolCall = state.pendingToolCallsById[chunk.toolCallId];
      if (!existingToolCall) {
        return {
          state,
          warnings: [`Ignoring tool-result for missing tool call "${chunk.toolCallId}".`],
        };
      }

      if (chunk.preliminary) {
        return {
          state: {
            ...state,
            pendingToolCallsById: {
              ...state.pendingToolCallsById,
              [chunk.toolCallId]: {
                ...existingToolCall,
                result: chunk.output,
              },
            },
          },
          warnings: [],
        };
      }

      const finalizedToolCall: ToolCall = {
        toolCallId: chunk.toolCallId,
        name: chunk.toolName,
        args:
          (chunk.input as Record<string, unknown>) ??
          existingToolCall.args ??
          undefined,
        state: 'completed',
        result: chunk.output,
      };
      const toolMessage = createToolMessage(finalizedToolCall, chunk.toolName);
      const removed = removePendingToolCall(
        state.pendingToolCallsById,
        state.pendingToolCallOrder,
        chunk.toolCallId
      );

      return {
        state: {
          ...state,
          pendingToolCallsById: removed.pendingToolCallsById,
          pendingToolCallOrder: removed.pendingToolCallOrder,
          completedToolCalls: [...state.completedToolCalls, toolMessage],
          persistedMessages: [...state.persistedMessages, toolMessage],
        },
        warnings: [],
      };
    }

    case 'tool-error': {
      const existingToolCall = state.pendingToolCallsById[chunk.toolCallId];
      if (!existingToolCall) {
        return {
          state,
          warnings: [`Ignoring tool-error for missing tool call "${chunk.toolCallId}".`],
        };
      }

      const finalizedToolCall: ToolCall = {
        toolCallId: chunk.toolCallId,
        name: chunk.toolName,
        args:
          (chunk.input as Record<string, unknown>) ??
          existingToolCall.args ??
          undefined,
        state: 'error',
        errorText: stringifyError(chunk.error),
      };
      const toolMessage = createToolMessage(finalizedToolCall, chunk.toolName);
      const removed = removePendingToolCall(
        state.pendingToolCallsById,
        state.pendingToolCallOrder,
        chunk.toolCallId
      );

      return {
        state: {
          ...state,
          pendingToolCallsById: removed.pendingToolCallsById,
          pendingToolCallOrder: removed.pendingToolCallOrder,
          completedToolCalls: [...state.completedToolCalls, toolMessage],
          persistedMessages: [...state.persistedMessages, toolMessage],
        },
        warnings: [],
      };
    }

    case 'tool-output-denied': {
      const existingToolCall = state.pendingToolCallsById[chunk.toolCallId];
      if (!existingToolCall) {
        return {
          state,
          warnings: [`Ignoring tool-output-denied for missing tool call "${chunk.toolCallId}".`],
        };
      }

      const finalizedToolCall: ToolCall = {
        toolCallId: chunk.toolCallId,
        name: chunk.toolName,
        args: existingToolCall.args,
        state: 'denied',
      };
      const toolMessage = createToolMessage(finalizedToolCall, chunk.toolName);
      const removed = removePendingToolCall(
        state.pendingToolCallsById,
        state.pendingToolCallOrder,
        chunk.toolCallId
      );

      return {
        state: {
          ...state,
          pendingToolCallsById: removed.pendingToolCallsById,
          pendingToolCallOrder: removed.pendingToolCallOrder,
          completedToolCalls: [...state.completedToolCalls, toolMessage],
          persistedMessages: [...state.persistedMessages, toolMessage],
        },
        warnings: [],
      };
    }

    case 'reasoning-start':
    case 'reasoning-delta':
    case 'reasoning-end':
    case 'source':
    case 'file':
    case 'raw':
    case 'tool-approval-request':
      return { state, warnings: [] };

    case 'error':
      return {
        state: {
          ...state,
          status: 'error',
        },
        warnings: [],
      };

    default:
      return {
        state,
        warnings: [`Ignoring unsupported chunk type "${(chunk as { type: string }).type}".`],
      };
  }
}

export function finalizeActiveTurn(
  state: ActiveTurnState,
  options: FinalizeActiveTurnOptions
): TurnChunkResult {
  const assistantState: AssistantMessageState =
    options.reason === 'complete'
      ? 'complete'
      : options.reason === 'cancelled'
        ? 'cancelled'
        : 'error';

  const flushed = flushActiveTextParts(state, assistantState);
  const finalizedPendingTools = finalizePendingToolCalls(
    flushed.state,
    options.reason,
    options.errorText
  );

  return {
    state: {
      ...finalizedPendingTools,
      status:
        options.reason === 'complete'
          ? finalizedPendingTools.status === 'error'
            ? 'error'
            : 'completed'
          : options.reason,
    },
    warnings:
      options.reason === 'complete' && state.pendingToolCallOrder.length > 0
        ? [
            ...flushed.warnings,
            'Stream finished with pending tool calls. Persisted them as errors.',
          ]
        : flushed.warnings,
  };
}

export function deriveStreamingResponse(state: ActiveTurnState): string | null {
  const text = state.activeTextPartOrder
    .map((id) => state.activeTextPartsById[id]?.text ?? '')
    .join('');

  return text.trim() ? text : null;
}

export function deriveCurrentToolCalls(state: ActiveTurnState): ToolCall[] {
  return state.pendingToolCallOrder
    .map((toolCallId) => state.pendingToolCallsById[toolCallId])
    .filter((toolCall): toolCall is PendingToolCall => Boolean(toolCall))
    .map(({ inputText: _inputText, ...toolCall }) => toolCall);
}

export function attachmentIsReferencedByMessages(id: string, messages: Message[]) {
  return messages.some((message) => {
    if (message.type !== 'user') return false;
    return message.parts.some((part) => part.type === 'image' && part.attachmentId === id);
  });
}

export function getUnreferencedAttachmentIds(ids: string[], messages: Message[]) {
  return ids.filter((id) => !attachmentIsReferencedByMessages(id, messages));
}

function applyCheckpointId(
  messages: Message[],
  userMessageId: string,
  checkpointId: string | null | undefined
) {
  if (!checkpointId) return messages;

  return messages.map((message) => {
    if (message.type !== 'user' || message.id !== userMessageId) {
      return message;
    }

    return {
      ...message,
      checkpointId,
    };
  });
}

export function finalizeConversationTurn({
  baseMessages,
  attachments,
  activeTurn,
  submittedAttachmentIds,
  submittedReadyIds,
  checkpointId,
}: FinalizeConversationTurnParams): FinalizeConversationTurnResult {
  const nextMessages = applyCheckpointId(
    [...baseMessages, ...activeTurn.persistedMessages],
    activeTurn.userMessageId,
    checkpointId
  );

  const readyIds = new Set(submittedReadyIds);
  const nextAttachments = { ...attachments };

  for (const id of submittedAttachmentIds) {
    if (readyIds.has(id)) continue;
    delete nextAttachments[id];
  }

  return {
    messages: nextMessages,
    attachments: nextAttachments,
  };
}
