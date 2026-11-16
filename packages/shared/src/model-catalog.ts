export type ModelTier = 'free' | 'paid' | 'tester';

export type ModelCatalogItem = {
  id: string;
  label: string;
  ctx: string;
  price: string;
  tier: ModelTier;
  desc?: string;
};

export const DEFAULT_FREE_AGENT_MODEL = 'nvidia/nemotron-3.5-super-vl:free' as const;

// OpenRouter catalog snapshot: 2026-11-16. Prices are USD per 1M input/output tokens.
// Provider, caching, time-of-day and long-context rates can differ from these base rates.
export const FREE_MODEL_ITEMS: readonly ModelCatalogItem[] = [
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL', ctx: '1M', price: '$0/$0', tier: 'free', desc: 'default free' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', ctx: '1M', price: '$0/$0', tier: 'free' },
  { id: 'inclusionai/ling-3.2-flash:free', label: 'Ling 3.2 Flash', ctx: '1M', price: '$0/$0', tier: 'free' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', ctx: '262K', price: '$0/$0', tier: 'free' },
] as const;

export const AGENT_PAID_MODEL_ITEMS: readonly ModelCatalogItem[] = [
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', ctx: '1M', price: '$0.0507/$0.2028', tier: 'paid' },
  { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', ctx: '1.05M', price: '$0.1/$0.5', tier: 'paid' },
  { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5', ctx: '1M', price: '$0.1/$0.5', tier: 'paid', desc: 'Higher rates above 100K input tokens' },
  { id: 'minimax/minimax-m3.1-flash', label: 'MiniMax M3.1 Flash', ctx: '1M', price: '$0.15/$0.6', tier: 'paid', desc: 'Rates vary by time of day' },
  { id: 'mistralai/mistral-large-4-0', label: 'Mistral Large 4', ctx: '1M', price: '$0.7/$2.1', tier: 'paid' },
  { id: 'openai/gpt-6.1-terra', label: 'GPT-6.1 Terra', ctx: '1.05M', price: '$1/$5', tier: 'paid', desc: 'Higher rates above 272K input tokens' },
  { id: 'qwen/qwen4-max', label: 'Qwen4 Max', ctx: '1M', price: '$1.5/$4.5', tier: 'paid' },
  { id: 'google/gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', ctx: '1M', price: '$1.5/$7.5', tier: 'paid' },
  { id: 'google/gemini-4-carbon', label: 'Gemini 4 Carbon', ctx: '1M', price: '$2/$10', tier: 'paid' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5', ctx: '1M', price: '$2/$10', tier: 'paid' },
  { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5', ctx: '1M', price: '$4/$20', tier: 'paid' },
] as const;

export const MANAGER_CHEAP_PAID_MODEL_IDS = [
  'deepseek/deepseek-v4.1-flash',
  'openai/gpt-6-luna',
  'anthropic/claude-haiku-5.5',
  'minimax/minimax-m3.1-flash',
] as const;

export const TESTER_DIRECT_MODEL_ITEMS: readonly ModelCatalogItem[] = [
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    ctx: '—',
    price: 'direct',
    tier: 'tester',
    desc: 'Anthropic direct',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    ctx: '—',
    price: 'direct',
    tier: 'tester',
    desc: 'Anthropic direct',
  },
] as const;

export const FREE_MODEL_IDS = FREE_MODEL_ITEMS.map((item) => item.id);
export const AGENT_PAID_MODEL_IDS = AGENT_PAID_MODEL_ITEMS.map((item) => item.id);

export function buildAgentModelCatalog(params: {
  hasOwnOpenRouterKey: boolean;
  isTester: boolean;
}): ModelCatalogItem[] {
  const paid = params.hasOwnOpenRouterKey ? AGENT_PAID_MODEL_ITEMS : [];
  const tester = params.isTester ? TESTER_DIRECT_MODEL_ITEMS : [];
  return [...FREE_MODEL_ITEMS, ...paid, ...tester];
}

export function getManagerAllowedAgentModelIds(hasUserOpenRouterKey: boolean): string[] {
  if (!hasUserOpenRouterKey) return [...FREE_MODEL_IDS];
  return [...FREE_MODEL_IDS, ...AGENT_PAID_MODEL_IDS];
}

export function buildManagerAllowedAgentModelSet(hasUserOpenRouterKey: boolean): Set<string> {
  return new Set(getManagerAllowedAgentModelIds(hasUserOpenRouterKey));
}
