export type SupportedModelProvider = 'anthropic' | 'openai' | 'openai-compatible';

export interface KnownModelDefinition {
  id: string;
  display_name: string;
  provider: SupportedModelProvider;
}

export const DEFAULT_MODEL_IDS: Record<SupportedModelProvider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-6.1-sol',
  'openai-compatible': 'gemma4:12b',
};

// Provider-scoped, exact-ID replacements. Add lifecycle changes here rather than
// adding family-specific migration code. Active choices and custom/proxy IDs stay intact.
// Sources: https://platform.claude.com/docs/en/about-claude/model-deprecations
//          https://developers.openai.com/api/docs/deprecations
export const MODEL_REPLACEMENTS: Readonly<
  Record<SupportedModelProvider, Readonly<Record<string, string>>>
> = {
  anthropic: {
    'claude-sonnet-4-5': DEFAULT_MODEL_IDS.anthropic,
    'claude-sonnet-4-5-20250929': DEFAULT_MODEL_IDS.anthropic,
    'claude-sonnet-4-0': DEFAULT_MODEL_IDS.anthropic,
    'claude-sonnet-4-20250514': DEFAULT_MODEL_IDS.anthropic,
    'claude-3-7-sonnet-latest': DEFAULT_MODEL_IDS.anthropic,
    'claude-3-7-sonnet-20250219': DEFAULT_MODEL_IDS.anthropic,
    'claude-3-5-sonnet-latest': DEFAULT_MODEL_IDS.anthropic,
    'claude-3-5-sonnet-20241022': DEFAULT_MODEL_IDS.anthropic,
    'claude-3-5-sonnet-20240620': DEFAULT_MODEL_IDS.anthropic,
    'claude-opus-4': 'claude-opus-4-8',
    'claude-opus-4-0': 'claude-opus-4-8',
    'claude-opus-4-20250514': 'claude-opus-4-8',
    'claude-opus-4-1': 'claude-opus-4-8',
    'claude-opus-4-1-20250805': 'claude-opus-4-8',
    'claude-haiku-3-5': 'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-latest': 'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001',
    'claude-3-haiku-20240307': 'claude-haiku-4-5-20251001',
  },
  openai: {
    'o3-mini': DEFAULT_MODEL_IDS.openai,
    'o3-mini-2025-01-31': DEFAULT_MODEL_IDS.openai,
  },
  'openai-compatible': {},
};

export function getModelReplacement(
  provider: SupportedModelProvider,
  modelId: string
): string | undefined {
  const replacements = MODEL_REPLACEMENTS[provider];
  return Object.prototype.hasOwnProperty.call(replacements, modelId)
    ? replacements[modelId]
    : undefined;
}

export const KNOWN_DISPLAY_NAMES: Record<string, string> = {
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-opus-4': 'Claude Opus 4',
  'claude-haiku-3-5': 'Claude Haiku 3.5',
  'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5 (Sep 2025)',
  'claude-opus-4-1-20250805': 'Claude Opus 4.1 (Aug 2025)',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet (Oct 2024)',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku (Oct 2024)',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5': 'GPT-5',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  o1: 'o1',
  'o1-mini': 'o1 Mini',
  'o3-mini': 'o3 Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
};

export const DEFAULT_MODEL_CATALOG: KnownModelDefinition[] = [
  {
    id: DEFAULT_MODEL_IDS.anthropic,
    display_name: KNOWN_DISPLAY_NAMES[DEFAULT_MODEL_IDS.anthropic],
    provider: 'anthropic',
  },
  {
    id: 'claude-opus-4-8',
    display_name: KNOWN_DISPLAY_NAMES['claude-opus-4-8'],
    provider: 'anthropic',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    display_name: KNOWN_DISPLAY_NAMES['claude-haiku-4-5-20251001'],
    provider: 'anthropic',
  },
  {
    id: DEFAULT_MODEL_IDS.openai,
    display_name: KNOWN_DISPLAY_NAMES[DEFAULT_MODEL_IDS.openai],
    provider: 'openai',
  },
  {
    id: 'gpt-5',
    display_name: KNOWN_DISPLAY_NAMES['gpt-5'],
    provider: 'openai',
  },
  {
    id: 'gpt-4o',
    display_name: KNOWN_DISPLAY_NAMES['gpt-4o'],
    provider: 'openai',
  },
];

const PROVIDER_ORDER: SupportedModelProvider[] = ['anthropic', 'openai'];
const PROVIDER_ORDER_WITH_CUSTOM: SupportedModelProvider[] = [
  'anthropic',
  'openai',
  'openai-compatible',
];

export function normalizeProviders(providers: readonly string[]): SupportedModelProvider[] {
  return PROVIDER_ORDER_WITH_CUSTOM.filter((provider) => providers.includes(provider));
}

export function getPreferredDefaultModel(providers: readonly string[]): string {
  const normalizedProviders = PROVIDER_ORDER.filter((provider) => providers.includes(provider));
  if (normalizedProviders.includes('anthropic')) {
    return DEFAULT_MODEL_IDS.anthropic;
  }
  if (normalizedProviders.includes('openai')) {
    return DEFAULT_MODEL_IDS.openai;
  }
  if (providers.includes('openai-compatible')) {
    return DEFAULT_MODEL_IDS['openai-compatible'];
  }
  return DEFAULT_MODEL_IDS.anthropic;
}

export function isAliasModel(modelId: string): boolean {
  const parts = modelId.split('-');
  const last = parts[parts.length - 1];
  return !(last.length === 8 && /^\d{8}$/.test(last));
}

function getDateSuffix(modelId: string): number {
  const match = modelId.match(/(\d{8})$/);
  return match ? Number(match[1]) : 0;
}

function getModelFreshnessRank(modelId: string): number {
  const normalized = modelId.toLowerCase();

  if (normalized.startsWith('gpt-6.1-sol')) return 970;
  if (normalized.startsWith('gpt-6')) return 960;
  if (normalized.startsWith('gpt-5.4')) return 950;
  if (normalized.startsWith('gpt-5')) return 940;
  if (normalized.startsWith('o3')) return 930;
  if (normalized.startsWith('o1')) return 920;
  if (normalized.startsWith('gpt-4o')) return 910;
  if (normalized.startsWith('gpt-4-turbo')) return 900;
  if (normalized === 'claude-sonnet-5-5') return 880;
  if (normalized === 'claude-opus-4-8') return 870;
  if (normalized === 'claude-sonnet-4-6') return 860;
  if (normalized.startsWith('claude-sonnet-4-5')) return 850;
  if (normalized.startsWith('claude-opus-4-1')) return 840;
  if (normalized.startsWith('claude-opus-4')) return 830;
  if (normalized.startsWith('claude-sonnet-4')) return 820;
  if (normalized.startsWith('claude-haiku-3-5')) return 810;
  if (normalized.startsWith('claude-3-5-sonnet')) return 800;
  if (normalized.startsWith('claude-3-5-haiku')) return 790;
  if (normalized.startsWith('gpt-4')) return 700;

  return 0;
}

export function compareModelsByFreshness(
  a: { id: string; display_name: string; provider: string },
  b: { id: string; display_name: string; provider: string }
): number {
  if (a.provider !== b.provider) {
    return a.provider.localeCompare(b.provider);
  }

  const aIsAlias = isAliasModel(a.id);
  const bIsAlias = isAliasModel(b.id);
  if (aIsAlias !== bIsAlias) {
    return aIsAlias ? -1 : 1;
  }

  const freshnessDiff = getModelFreshnessRank(b.id) - getModelFreshnessRank(a.id);
  if (freshnessDiff !== 0) {
    return freshnessDiff;
  }

  const dateDiff = getDateSuffix(b.id) - getDateSuffix(a.id);
  if (dateDiff !== 0) {
    return dateDiff;
  }

  return a.display_name.localeCompare(b.display_name);
}
