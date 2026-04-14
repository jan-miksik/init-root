export type ModelTier = 'free' | 'paid' | 'tester';

export type ModelCatalogItem = {
  id: string;
  label: string;
  ctx: string;
  price: string;
  tier: ModelTier;
  desc?: string;
};

export const DEFAULT_FREE_AGENT_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free' as const;

export const FREE_MODEL_ITEMS: readonly ModelCatalogItem[] = [
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 120B Super',
    ctx: '262K',
    price: '$0/$0',
    tier: 'free',
    desc: 'default free',
  },
  {
    id: 'qwen/qwen3-coder:free',
    label: 'Qwen3 Coder 480B',
    ctx: '262K',
    price: '$0/$0',
    tier: 'free',
    desc: 'strong reasoning',
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    label: 'Nemotron 9B',
    ctx: '128K',
    price: '$0/$0',
    tier: 'free',
  },
  {
    id: 'arcee-ai/trinity-large-preview:free',
    label: 'Trinity-Large',
    ctx: '131K',
    price: '$0/$0',
    tier: 'free',
  },
] as const;

export const AGENT_PAID_MODEL_ITEMS: readonly ModelCatalogItem[] = [
  { id: 'minimax/minimax-m2.5', label: 'MiniMax M2.5', ctx: '196K', price: '$0.20/$1.20', tier: 'paid' },
  { id: 'mistralai/mistral-small-2603', label: 'Mistral Small 2603', ctx: '262K', price: '$0.15/$0.60', tier: 'paid' },
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite',
    ctx: '1M',
    price: '$0.25/$1.50',
    tier: 'paid',
  },
  { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', ctx: '164K', price: '$0.26/$0.38', tier: 'paid' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', ctx: '1M', price: '$3/$15', tier: 'paid' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', ctx: '2M', price: '$2/$12', tier: 'paid' },
  { id: 'openai/gpt-5.4', label: 'GPT-5.4', ctx: '1M', price: '$2.50/$15', tier: 'paid' },
  { id: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6', ctx: '200K', price: '$5/$25', tier: 'paid' },
] as const;

export const MANAGER_CHEAP_PAID_MODEL_IDS = [
  'google/gemini-3.1-flash-lite-preview',
  'deepseek/deepseek-v3.2',
  'minimax/minimax-m2.5',
  'mistralai/mistral-small-2603',
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
