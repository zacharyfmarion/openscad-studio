export type VisionSupport = 'yes' | 'no' | 'unknown';
export type AssistantMessageState = 'complete' | 'cancelled' | 'error';
export type ToolCallState = 'pending' | 'completed' | 'error' | 'denied';

export interface ToolCall {
  toolCallId: string;
  name: string;
  args?: Record<string, unknown>;
  state: ToolCallState;
  result?: unknown;
  errorText?: string;
}

export interface BaseMessage {
  id: string;
  timestamp: number;
}

export interface UserTextPart {
  type: 'text';
  text: string;
}

export interface UserImagePart {
  type: 'image';
  attachmentId: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
}

export type UserMessagePart = UserTextPart | UserImagePart;

export interface UserMessage extends BaseMessage {
  type: 'user';
  parts: UserMessagePart[];
  checkpointId?: string;
}

export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  turnId: string;
  content: string;
  state: AssistantMessageState;
}

export interface ToolCallMessage extends BaseMessage {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  state: ToolCallState;
  result?: unknown;
  errorText?: string;
}

export type Message = UserMessage | AssistantMessage | ToolCallMessage;

export interface Conversation {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

export interface AiDraft {
  text: string;
  attachmentIds: string[];
}

export type AttachmentStatus = 'pending' | 'ready' | 'error';

export interface AttachmentRecord {
  id: string;
  filename: string;
  sourceMimeType: string;
  normalizedMimeType?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  previewUrl?: string;
  normalizedData?: string;
  status: AttachmentStatus;
  errorMessage?: string;
  dedupeKey: string;
}

export type AttachmentStore = Record<string, AttachmentRecord>;

export function getUserMessageText(message: UserMessage): string {
  return message.parts
    .filter((part): part is UserTextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}
