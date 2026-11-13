/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { createModel, getModelRequestOptions } from '../aiService';

it.each([
  ['anthropic', 'claude-sonnet-5-5'],
  ['openai', 'gpt-6.1-sol'],
] as const)(
  'serializes a compatible %s request through the installed SDK',
  async (provider, modelId) => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('captured without network'));
    globalThis.fetch = fetchMock;
    try {
      const options = getModelRequestOptions(provider, modelId);
      const model = createModel(provider, 'fake-test-key', modelId);
      await expect(
        model.doGenerate({
          prompt: [
            { role: 'system', content: 'System' },
            ...(provider === 'anthropic'
              ? [
                  {
                    role: 'assistant' as const,
                    content: [
                      {
                        type: 'reasoning' as const,
                        text: '',
                        providerOptions: { anthropic: { signature: 'signed-empty-reasoning' } },
                      },
                    ],
                  },
                ]
              : []),
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          ...options,
        })
      ).rejects.toThrow('captured without network');
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body.model).toBe(modelId);
      expect(body.temperature).toBeUndefined();
      if (provider === 'anthropic') {
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'medium' });
        expect(body.max_tokens).toBe(16000);
        expect(body.messages[0].content[0]).toEqual({
          type: 'thinking',
          thinking: '',
          signature: 'signed-empty-reasoning',
        });
      } else {
        expect(body.reasoning).toEqual({ effort: 'low' });
        expect(body.input[0].role).toBe('developer');
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);

it('leaves custom endpoints and other model options unchanged', () => {
  expect(getModelRequestOptions('openai-compatible', 'gpt-6.1-sol')).toEqual({});
  expect(getModelRequestOptions('anthropic', 'claude-sonnet-4-6')).toEqual({});
});
