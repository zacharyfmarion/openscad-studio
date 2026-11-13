import {
  DEFAULT_MODEL_CATALOG,
  DEFAULT_MODEL_IDS,
  MODEL_REPLACEMENTS,
  compareModelsByFreshness,
  getModelReplacement,
  getPreferredDefaultModel,
  type SupportedModelProvider,
} from '../aiModels';

describe('model lifecycle registry', () => {
  it('uses latest Sonnet and Sol defaults', () => {
    expect(DEFAULT_MODEL_IDS.anthropic).toBe('claude-sonnet-5-5');
    expect(DEFAULT_MODEL_IDS.openai).toBe('gpt-6.1-sol');
    expect(getPreferredDefaultModel(['anthropic', 'openai'])).toBe('claude-sonnet-5-5');
    expect(getPreferredDefaultModel(['openai'])).toBe('gpt-6.1-sol');
  });

  it.each([
    ['anthropic', 'claude-sonnet-4-5', 'claude-sonnet-5-5'],
    ['anthropic', 'claude-opus-4', 'claude-opus-4-8'],
    ['anthropic', 'claude-3-5-haiku-20241022', 'claude-haiku-4-5-20251001'],
    ['openai', 'o3-mini', 'gpt-6.1-sol'],
  ] as const)('resolves %s / %s using the same mechanism', (provider, id, replacement) => {
    expect(getModelReplacement(provider, id)).toBe(replacement);
  });

  it.each([
    ['openai-compatible', 'claude-sonnet-4-5'],
    ['openai-compatible', 'o3-mini'],
    ['openai', 'claude-sonnet-4-5'],
    ['anthropic', 'claude-sonnet-4-6'],
    ['openai', 'gpt-5.4'],
    ['anthropic', 'claude-sonnet-4-5-custom'],
    ['openai', 'ft:gpt-4o:custom'],
    ['anthropic', 'toString'],
  ] as const)('preserves %s / %s', (provider, id) => {
    expect(getModelReplacement(provider, id)).toBeUndefined();
  });

  it('has direct replacements, not chains, cycles, or self references', () => {
    for (const [provider, replacements] of Object.entries(MODEL_REPLACEMENTS)) {
      for (const [id, target] of Object.entries(replacements)) {
        expect(target).not.toBe(id);
        expect(getModelReplacement(provider as SupportedModelProvider, target)).toBeUndefined();
      }
    }
  });

  it('never advertises a superseded model in the offline catalog', () => {
    for (const model of DEFAULT_MODEL_CATALOG) {
      expect(getModelReplacement(model.provider, model.id)).toBeUndefined();
    }
  });

  it.each([
    ['openai', 'gpt-5.4', 'gpt-6.1-sol'],
    ['anthropic', 'claude-sonnet-4-6', 'claude-sonnet-5-5'],
  ] as const)('ranks the latest %s default first', (provider, oldId, latestId) => {
    const models = [oldId, latestId].map((id) => ({ id, provider, display_name: id }));
    expect(models.sort(compareModelsByFreshness)[0].id).toBe(latestId);
  });
});
