/** @jest-environment jsdom */
import { act } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { ModelMessage } from 'ai';
import { useAiAgent } from '../useAiAgent';
import { createHookHarness, createStreamResult, type StreamChunk } from './test-utils';
import {
  invalidateApiKeyStatus,
  setStoredModelSelection,
  storeApiKey,
} from '../../stores/apiKeyStore';

const signedResponse: ModelMessage[] = [
  {
    role: 'assistant',
    content: [
      {
        type: 'reasoning',
        text: '',
        providerOptions: { anthropic: { signature: 'signed-empty-thinking' } },
      },
      {
        type: 'tool-call',
        toolCallId: 'read-1',
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
        toolCallId: 'read-1',
        toolName: 'read_file',
        output: { type: 'text', value: 'cube(1);' },
      },
    ],
  },
  { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
];
const completeChunks: StreamChunk[] = [
  { type: 'text-start', id: 'answer' },
  { type: 'text-delta', id: 'answer', text: 'Done' },
  { type: 'text-end', id: 'answer' },
  { type: 'finish', finishReason: 'stop', rawFinishReason: 'stop', totalUsage: {} as never },
];

function harness() {
  const startAiStream = jest.fn(async () => ({
    ...createStreamResult(completeChunks),
    response: Promise.resolve({ messages: signedResponse }),
  }));
  const options: Parameters<typeof useAiAgent>[0] = {
    testOverrides: {
      availableProviders: ['anthropic', 'openai'],
      createModel: (() => ({})) as never,
      buildTools: (() => ({})) as never,
      startAiStream: startAiStream as never,
    },
  };
  const hook = createHookHarness(() => useAiAgent(options));
  const submit = async (text: string) => {
    await act(async () => {
      await hook.current().submitPrompt(text);
    });
  };
  const request = (index: number) =>
    (
      startAiStream.mock.calls[index] as unknown as [
        { messages: ModelMessage[]; providerOptions?: unknown },
      ]
    )[0];
  return { hook, startAiStream, submit, request };
}

describe('completed model response history', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateApiKeyStatus();
    storeApiKey('anthropic', 'test-anthropic');
    storeApiKey('openai', 'test-openai');
    setStoredModelSelection({ provider: 'anthropic', modelId: 'claude-sonnet-5-5' });
  });
  afterEach(() => jest.restoreAllMocks());

  it('preserves signed empty thinking and exact tool grouping over repeated user turns', async () => {
    const { submit, request } = harness();
    await submit('First');
    await submit('Second');
    await submit('Third');
    expect(request(1).messages.slice(1, 4)).toEqual(signedResponse);
    expect(request(2).messages.slice(1, 4)).toEqual(signedResponse);
    expect(request(2).messages.slice(5, 8)).toEqual(signedResponse);
    expect(request(2).messages).toHaveLength(9);
    expect(request(0).providerOptions).toEqual({
      anthropic: { thinking: { type: 'adaptive' }, effort: 'medium' },
    });
  });

  it('does not replay signed history after changing provider and switching back', async () => {
    const { hook, submit, request, startAiStream } = harness();
    await submit('First');
    act(() => hook.current().setCurrentModel('gpt-6.1-sol', 'unknown', 'openai'));
    startAiStream.mockImplementationOnce(async () => ({
      ...createStreamResult(completeChunks),
      response: Promise.resolve({ messages: [] }),
    }));
    await submit('Second');
    expect(JSON.stringify(request(1).messages)).not.toContain('signed-empty-thinking');
    expect(request(1).providerOptions).toEqual({
      openai: { forceReasoning: true, reasoningEffort: 'low' },
    });
    act(() => hook.current().setCurrentModel('claude-sonnet-5-5', 'unknown', 'anthropic'));
    await submit('Third');
    expect(JSON.stringify(request(2).messages)).not.toContain('signed-empty-thinking');
  });

  it('invalidates signatures when the API account changes', async () => {
    const { submit, request } = harness();
    await submit('First');
    act(() => storeApiKey('anthropic', 'different-account'));
    await submit('Second');
    expect(JSON.stringify(request(1).messages)).not.toContain('signed-empty-thinking');
  });

  it('invalidates signatures on a new conversation', async () => {
    const { hook, submit, request } = harness();
    await submit('First');
    act(() => hook.current().newConversation());
    await submit('Second');
    expect(request(1).messages).toHaveLength(1);
  });

  it('does not preserve an errored response for the next user turn', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { submit, request, startAiStream } = harness();
    await submit('First');
    startAiStream.mockImplementationOnce(async () => ({
      ...createStreamResult([{ type: 'error', error: new Error('failed stream') }]),
      response: Promise.resolve({ messages: signedResponse }),
    }));
    await submit('Second');
    await submit('Third');
    expect(JSON.stringify(request(2).messages)).not.toContain('signed-empty-thinking');
  });

  it('does not revive history if cancelled while response metadata is pending', async () => {
    const { hook, submit, request, startAiStream } = harness();
    await submit('First');
    let release!: (value: { messages: ModelMessage[] }) => void;
    startAiStream.mockImplementationOnce(async () => ({
      ...createStreamResult(completeChunks),
      response: new Promise((resolve) => {
        release = resolve;
      }),
    }));
    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.current().submitPrompt('Second');
    });
    act(() => hook.current().cancelStream());
    await act(async () => {
      release({ messages: signedResponse });
      await pending;
    });
    await submit('Third');
    expect(JSON.stringify(request(2).messages)).not.toContain('signed-empty-thinking');
  });
});
