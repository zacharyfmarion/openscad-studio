import type { ModelMessage } from 'ai';
import type {
  AttachmentStore,
  Message,
  ToolCallMessage,
  UserMessage,
  UserMessagePart,
  VisionSupport,
} from '../types/aiChat';

export function toolResultToOutput(result: unknown) {
  if (typeof result === 'object' && result !== null && 'image_data_url' in result) {
    const dataUrl = (result as { image_data_url: string }).image_data_url;
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    return {
      type: 'content' as const,
      value: [
        { type: 'image-data' as const, data: base64, mediaType: 'image/png' as const },
        { type: 'text' as const, text: 'Screenshot captured successfully.' },
      ],
    };
  }
  return {
    type: 'text' as const,
    value: typeof result === 'string' ? result : JSON.stringify(result),
  };
}

export function messagesToModelMessages(
  messages: Message[],
  attachments: AttachmentStore
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  let pendingToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }> = [];
  let pendingToolResults: Array<{ toolCallId: string; toolName: string; result: unknown }> = [];

  const flushPendingToolMessages = () => {
    if (pendingToolCalls.length === 0) return;

    modelMessages.push({
      role: 'assistant' as const,
      content: pendingToolCalls.map((tc) => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
      })),
    });
    modelMessages.push({
      role: 'tool' as const,
      content: pendingToolResults.map((tr) => ({
        type: 'tool-result' as const,
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: toolResultToOutput(tr.result),
      })),
    });
    pendingToolCalls = [];
    pendingToolResults = [];
  };

  for (const msg of messages) {
    if (msg.type === 'user') {
      flushPendingToolMessages();
      modelMessages.push({
        role: 'user' as const,
        content: userMessagePartsToModelContent(msg, attachments),
      });
    } else if (msg.type === 'assistant') {
      flushPendingToolMessages();
      modelMessages.push({
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: msg.content }],
      });
    } else if (msg.type === 'tool-call' && msg.state === 'completed') {
      const toolCall = msg as ToolCallMessage;
      pendingToolCalls.push({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.args || {},
      });
      pendingToolResults.push({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: toolCall.result,
      });
    }
  }

  flushPendingToolMessages();

  return modelMessages;
}

function userMessagePartsToModelContent(message: UserMessage, attachments: AttachmentStore) {
  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mediaType?: string }
  > = [];

  for (const part of message.parts) {
    if (part.type === 'text') {
      if (part.text.trim()) {
        parts.push({ type: 'text', text: part.text });
      }
      continue;
    }

    const attachment = attachments[part.attachmentId];
    if (!attachment?.normalizedData || attachment.status !== 'ready') {
      continue;
    }

    parts.push({
      type: 'image',
      image: attachment.normalizedData,
      mediaType: attachment.normalizedMimeType,
    });
  }

  if (parts.length === 0) {
    return [{ type: 'text' as const, text: '' }];
  }

  return parts;
}

export function getVisionSupportForModelId(modelId: string): VisionSupport {
  const normalized = modelId.toLowerCase();

  if (normalized.startsWith('claude')) {
    return 'yes';
  }

  if (
    normalized.startsWith('gpt-4o') ||
    normalized.startsWith('gpt-5') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3')
  ) {
    return 'yes';
  }

  if (normalized.includes('text-only') || normalized.includes('completion')) {
    return 'no';
  }

  return 'unknown';
}

export function hasVisionParts(parts: UserMessagePart[]): boolean {
  return parts.some((part) => part.type === 'image');
}
