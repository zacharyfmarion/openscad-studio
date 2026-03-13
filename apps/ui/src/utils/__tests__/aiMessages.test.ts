import { getVisionSupportForModelId, messagesToModelMessages } from '../aiMessages';
import type { AttachmentStore, Message } from '../../types/aiChat';

describe('aiMessages', () => {
  it('maps text and image user parts into multimodal model messages', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        timestamp: 1,
        type: 'user',
        parts: [
          { type: 'text', text: 'Describe this model.' },
          {
            type: 'image',
            attachmentId: 'image-1',
            filename: 'reference.png',
            mimeType: 'image/png',
            width: 640,
            height: 480,
          },
        ],
      },
    ];

    const attachments: AttachmentStore = {
      'image-1': {
        id: 'image-1',
        filename: 'reference.png',
        sourceMimeType: 'image/png',
        normalizedMimeType: 'image/png',
        sizeBytes: 2048,
        normalizedData: 'ZmFrZS1pbWFnZS1iYXNlNjQ=',
        status: 'ready',
        dedupeKey: 'reference.png:2048:1',
      },
    };

    expect(messagesToModelMessages(messages, attachments)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this model.' },
          {
            type: 'image',
            image: 'ZmFrZS1pbWFnZS1iYXNlNjQ=',
            mediaType: 'image/png',
          },
        ],
      },
    ]);
  });

  it('serializes completed tool calls before later assistant text using toolCallId', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        timestamp: 1,
        type: 'user',
        parts: [{ type: 'text', text: 'Inspect the file.' }],
      },
      {
        id: 'assistant-1',
        timestamp: 2,
        type: 'assistant',
        turnId: 'turn-1',
        content: 'Checking the file.',
        state: 'complete',
      },
      {
        id: 'tool-msg-1',
        timestamp: 3,
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        args: { path: 'main.scad' },
        state: 'completed',
        result: 'cube(10);',
      },
      {
        id: 'assistant-2',
        timestamp: 4,
        type: 'assistant',
        turnId: 'turn-1',
        content: 'Done.',
        state: 'complete',
      },
    ];

    expect(messagesToModelMessages(messages, {})).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Inspect the file.' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Checking the file.' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-1',
            toolName: 'read_file',
            input: { path: 'main.scad' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-1',
            toolName: 'read_file',
            output: { type: 'text', value: 'cube(10);' },
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
      },
    ]);
  });

  it('does not replay incomplete or failed tool calls as completed tool history', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        timestamp: 1,
        type: 'user',
        parts: [{ type: 'text', text: 'Inspect the file.' }],
      },
      {
        id: 'assistant-1',
        timestamp: 2,
        type: 'assistant',
        turnId: 'turn-1',
        content: 'Partial answer.',
        state: 'error',
      },
      {
        id: 'tool-msg-1',
        timestamp: 3,
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        args: { path: 'main.scad' },
        state: 'pending',
      },
      {
        id: 'tool-msg-2',
        timestamp: 4,
        type: 'tool-call',
        toolCallId: 'tool-2',
        toolName: 'apply_edit',
        args: { old_string: 'a', new_string: 'b' },
        state: 'error',
        errorText: 'Edit failed',
      },
    ];

    expect(messagesToModelMessages(messages, {})).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Inspect the file.' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Partial answer.' }],
      },
    ]);
  });

  it('reports known vision support for configured model families', () => {
    expect(getVisionSupportForModelId('claude-sonnet-4-5')).toBe('yes');
    expect(getVisionSupportForModelId('gpt-4o')).toBe('yes');
    expect(getVisionSupportForModelId('text-only-model')).toBe('no');
    expect(getVisionSupportForModelId('mystery-model')).toBe('unknown');
  });
});
