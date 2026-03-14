import type { TextStreamPart, ToolSet } from 'ai';
import {
  attachmentIsReferencedByMessages,
  createActiveTurnState,
  deriveCurrentToolCalls,
  deriveStreamingResponse,
  finalizeActiveTurn,
  finalizeConversationTurn,
  getUnreferencedAttachmentIds,
  reduceActiveTurnChunk,
} from '../aiTurnState';
import type { AttachmentStore, Message } from '../../types/aiChat';

type StreamChunk = TextStreamPart<ToolSet>;

function applyChunks(chunks: StreamChunk[]) {
  let state = createActiveTurnState('turn-1', 'user-1');
  const warnings: string[] = [];

  for (const chunk of chunks) {
    const next = reduceActiveTurnChunk(state, chunk);
    state = next.state;
    warnings.push(...next.warnings);
  }

  return { state, warnings };
}

describe('aiTurnState', () => {
  it('finds attachments that are still referenced by prior user messages', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        timestamp: 1,
        type: 'user',
        parts: [
          { type: 'text', text: 'Use this reference image.' },
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
      {
        id: 'assistant-1',
        timestamp: 2,
        type: 'assistant',
        turnId: 'turn-0',
        content: 'I will use that image.',
        state: 'complete',
      },
    ];

    expect(attachmentIsReferencedByMessages('image-1', messages)).toBe(true);
    expect(attachmentIsReferencedByMessages('missing', messages)).toBe(false);
    expect(getUnreferencedAttachmentIds(['image-1', 'missing'], messages)).toEqual(['missing']);
  });

  it('persists plain text responses on text-end and finish-step', () => {
    const { state, warnings } = applyChunks([
      { type: 'start-step', request: {} as never, warnings: [] },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'Hello' },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'finish-step',
        response: {} as never,
        usage: {} as never,
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: undefined,
      },
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        totalUsage: {} as never,
      },
    ]);

    const finalized = finalizeActiveTurn(state, { reason: 'complete' });

    expect(warnings).toEqual([]);
    expect(finalized.state.persistedAssistantSegments).toHaveLength(1);
    expect(finalized.state.persistedAssistantSegments[0]).toMatchObject({
      type: 'assistant',
      turnId: 'turn-1',
      content: 'Hello',
      state: 'complete',
    });
    expect(deriveStreamingResponse(finalized.state)).toBeNull();
  });

  it('persists text before a tool call, then the tool result, then later text', () => {
    const { state } = applyChunks([
      { type: 'start-step', request: {} as never, warnings: [] },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'Checking the file.' },
      {
        type: 'finish-step',
        response: {} as never,
        usage: {} as never,
        finishReason: 'tool-calls',
        rawFinishReason: 'tool-calls',
        providerMetadata: undefined,
      },
      { type: 'start-step', request: {} as never, warnings: [] },
      { type: 'tool-input-start', id: 'tool-1', toolName: 'get_current_code' },
      { type: 'tool-input-delta', id: 'tool-1', delta: '{}' },
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'get_current_code',
        input: {},
      } as StreamChunk,
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        toolName: 'get_current_code',
        input: {},
        output: 'cube(10);',
      } as StreamChunk,
      { type: 'text-start', id: 'text-2' },
      { type: 'text-delta', id: 'text-2', text: 'Done.' },
      {
        type: 'finish-step',
        response: {} as never,
        usage: {} as never,
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: undefined,
      },
    ]);

    const finalized = finalizeActiveTurn(state, { reason: 'complete' });

    expect(finalized.state.persistedMessages).toHaveLength(3);
    expect(finalized.state.persistedMessages[0]).toMatchObject({
      type: 'assistant',
      content: 'Checking the file.',
    });
    expect(finalized.state.persistedMessages[1]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      toolName: 'get_current_code',
      state: 'completed',
      result: 'cube(10);',
    });
    expect(finalized.state.persistedMessages[2]).toMatchObject({
      type: 'assistant',
      content: 'Done.',
    });
  });

  it('keeps repeated tool names distinct by toolCallId', () => {
    const { state } = applyChunks([
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'a.scad' },
      } as StreamChunk,
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'a.scad' },
        output: 'a',
      } as StreamChunk,
      {
        type: 'tool-call',
        toolCallId: 'tool-2',
        toolName: 'read_file',
        input: { path: 'b.scad' },
      } as StreamChunk,
      {
        type: 'tool-result',
        toolCallId: 'tool-2',
        toolName: 'read_file',
        input: { path: 'b.scad' },
        output: 'b',
      } as StreamChunk,
    ]);

    expect(state.completedToolCalls).toHaveLength(2);
    expect(state.completedToolCalls[0].toolCallId).toBe('tool-1');
    expect(state.completedToolCalls[1].toolCallId).toBe('tool-2');
  });

  it('ignores tool results without a matching tool call', () => {
    const { state, warnings } = applyChunks([
      {
        type: 'tool-result',
        toolCallId: 'missing',
        toolName: 'read_file',
        input: {},
        output: 'ignored',
      } as StreamChunk,
    ]);

    expect(state.persistedMessages).toEqual([]);
    expect(warnings).toContain('Ignoring tool-result for missing tool call "missing".');
  });

  it('preserves partial assistant text and pending tools on cancel', () => {
    const { state } = applyChunks([
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'Partial reply' },
      { type: 'tool-input-start', id: 'tool-1', toolName: 'read_file' },
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'main.scad' },
      } as StreamChunk,
    ]);

    const finalized = finalizeActiveTurn(state, { reason: 'cancelled' });

    expect(finalized.state.persistedMessages).toHaveLength(2);
    expect(finalized.state.persistedMessages[0]).toMatchObject({
      type: 'assistant',
      content: 'Partial reply',
      state: 'cancelled',
    });
    expect(finalized.state.persistedMessages[1]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      state: 'pending',
    });
  });

  it('preserves partial assistant text and marks pending tools as error on stream failure', () => {
    const { state } = applyChunks([
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'Partial reply' },
      { type: 'tool-input-start', id: 'tool-1', toolName: 'read_file' },
    ]);

    const finalized = finalizeActiveTurn(state, {
      reason: 'error',
      errorText: 'Network failure',
    });

    expect(finalized.state.persistedMessages).toHaveLength(2);
    expect(finalized.state.persistedMessages[0]).toMatchObject({
      type: 'assistant',
      content: 'Partial reply',
      state: 'error',
    });
    expect(finalized.state.persistedMessages[1]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      state: 'error',
      errorText: 'Network failure',
    });
  });

  it('persists tool errors and denied tool outputs', () => {
    const { state } = applyChunks([
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'missing.scad' },
      } as StreamChunk,
      {
        type: 'tool-error',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'missing.scad' },
        error: new Error('Missing file'),
      } as StreamChunk,
      {
        type: 'tool-call',
        toolCallId: 'tool-2',
        toolName: 'apply_edit',
        input: {},
      } as StreamChunk,
      {
        type: 'tool-output-denied',
        toolCallId: 'tool-2',
        toolName: 'apply_edit',
      } as StreamChunk,
    ]);

    expect(state.persistedMessages).toHaveLength(2);
    expect(state.persistedMessages[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      state: 'error',
      errorText: 'Missing file',
    });
    expect(state.persistedMessages[1]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-2',
      state: 'denied',
    });
  });

  it('derives current streaming text and pending tool calls from active turn state', () => {
    const { state } = applyChunks([
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'Thinking' },
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'get_current_code',
        input: {},
      } as StreamChunk,
    ]);

    expect(deriveStreamingResponse(state)).toBe('Thinking');
    expect(deriveCurrentToolCalls(state)).toEqual([
      {
        toolCallId: 'tool-1',
        name: 'get_current_code',
        args: {},
        state: 'pending',
        result: undefined,
        errorText: undefined,
      },
    ]);
  });

  it('ignores duplicate or out-of-order text chunks without corrupting state', () => {
    const { state, warnings } = applyChunks([
      { type: 'text-delta', id: 'missing', text: 'ignored' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'hello' },
      { type: 'text-end', id: 'missing' },
    ]);

    expect(warnings).toEqual([
      'Ignoring text-delta for missing text part "missing".',
      'Ignoring duplicate text-start for "text-1".',
      'Received text-end for missing text part "missing".',
    ]);
    expect(deriveStreamingResponse(state)).toBe('hello');
    expect(state.persistedMessages).toEqual([]);
  });

  it('finalizes conversation messages and attachment cleanup with a checkpoint', () => {
    const baseMessages: Message[] = [
      {
        id: 'user-1',
        timestamp: 1,
        type: 'user',
        parts: [{ type: 'text', text: 'Add fillets.' }],
      },
    ];
    const attachments: AttachmentStore = {
      ready: {
        id: 'ready',
        filename: 'ready.png',
        sourceMimeType: 'image/png',
        sizeBytes: 1024,
        status: 'ready',
        dedupeKey: 'ready',
      },
      pending: {
        id: 'pending',
        filename: 'pending.png',
        sourceMimeType: 'image/png',
        sizeBytes: 2048,
        status: 'pending',
        dedupeKey: 'pending',
      },
    };
    const activeTurn = finalizeActiveTurn(
      applyChunks([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', text: 'Done.' },
      ]).state,
      { reason: 'complete' }
    ).state;

    const result = finalizeConversationTurn({
      baseMessages,
      attachments,
      activeTurn,
      submittedAttachmentIds: ['ready', 'pending'],
      submittedReadyIds: ['ready'],
      checkpointId: 'checkpoint-123',
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      checkpointId: 'checkpoint-123',
    });
    expect(result.messages[1]).toMatchObject({
      type: 'assistant',
      content: 'Done.',
    });
    expect(result.attachments).toEqual({
      ready: attachments.ready,
    });
  });
});
