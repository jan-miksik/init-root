import { ref, reactive, computed, watch, onMounted } from 'vue';
import {
  AGENT_PAID_MODEL_ITEMS,
  AGENT_PROFILES,
  DEFAULT_FREE_AGENT_MODEL,
  ENTITY_NAME_MAX_CHARS,
  SUPPORTED_BASE_PAIRS,
  buildAgentModelCatalog,
  getManagerAllowedAgentModelIds,
  getManagerPersonaTemplate,
} from '@something-in-loop/shared';
import type { ProfileItem } from '~/composables/useProfiles';
import { useAuth } from '~/composables/useAuth';

export function useManagerConfigForm(props: {
  initial?: any;
  isEdit?: boolean;
}) {
  const { user } = useAuth();
  const hasOwnKey = computed(() => !!user.value?.openRouterKeySet);
  const modelCatalog = computed(() => {
    return buildAgentModelCatalog({
      hasOwnOpenRouterKey: hasOwnKey.value,
      isTester: false,
    }).filter((item) => item.tier !== 'tester');
  });

  const form = reactive({
    name: props.initial?.name ?? '',
    llmModel: props.initial?.llmModel ?? DEFAULT_FREE_AGENT_MODEL,
    temperature: props.initial?.temperature ?? 0.7,
    decisionInterval: props.initial?.decisionInterval ?? '1h',
    riskParams: {
      maxTotalDrawdown: props.initial?.riskParams?.maxTotalDrawdown ?? 0.2,
      maxAgents: props.initial?.riskParams?.maxAgents ?? 3,
      maxCorrelatedPositions: props.initial?.riskParams?.maxCorrelatedPositions ?? 3,
    },
  });

  const submitting = ref(false);
  const validationError = ref('');

  const finetuneOpen = ref(false);
  const managerConfigOpen = ref(false);

  const autoNamePrefKey = computed(() =>
    props.isEdit ? 'manager-config:auto-name-enabled:edit' : 'manager-config:auto-name-enabled:create'
  );
  const syncName = ref(true);
  const hasHydratedAutoNamePref = ref(false);

  const selectedProfileId = ref<string | null>(props.initial?.profileId ?? null);
  const selectedProfileName = ref('');
  const selectedProfileDescription = ref('');

  const behavior = ref<Record<string, unknown>>(props.initial?.behavior ?? {
    managementStyle: 'balanced',
    riskTolerance: 'moderate',
    diversificationPreference: 'balanced',
    performancePatience: 50,
    creationAggressiveness: 50,
    rebalanceFrequency: 'sometimes',
    philosophyBias: 'mixed',
  });

  const personaMd = ref(props.initial?.personaMd ?? '');
  const isPersonaCustomized = ref(!!props.initial?.personaMd);

  function buildBehaviorSummaryMd(b: Record<string, unknown>): string {
    const MGMT: Record<string, string> = { aggressive: 'Aggressive', balanced: 'Balanced', conservative: 'Conservative', passive: 'Passive' };
    const RISK: Record<string, string> = { low: 'Low risk', moderate: 'Moderate', high: 'High risk', extreme: 'Extreme' };
    const DIV: Record<string, string> = { concentrated: 'Concentrated', balanced: 'Balanced', diversified: 'Diversified', hyper_diversified: 'Hyper-diversified' };
    const REBAL: Record<string, string> = { rarely: 'Rarely', sometimes: 'Sometimes', often: 'Often', constantly: 'Constantly' };
    const PHILO: Record<string, string> = { momentum: 'Momentum', value: 'Value', mixed: 'Mixed', contrarian: 'Contrarian' };

    const rows: string[] = [];
    if (b.managementStyle) rows.push(`**Style:** ${MGMT[b.managementStyle as string] ?? b.managementStyle}`);
    if (b.riskTolerance) rows.push(`**Risk:** ${RISK[b.riskTolerance as string] ?? b.riskTolerance}`);
    if (b.diversificationPreference) rows.push(`**Diversification:** ${DIV[b.diversificationPreference as string] ?? b.diversificationPreference}`);
    if (b.rebalanceFrequency) rows.push(`**Rebalancing:** ${REBAL[b.rebalanceFrequency as string] ?? b.rebalanceFrequency}`);
    if (b.philosophyBias) rows.push(`**Philosophy:** ${PHILO[b.philosophyBias as string] ?? b.philosophyBias}`);
    if (typeof b.performancePatience === 'number') rows.push(`**Patience:** ${b.performancePatience}%`);
    if (typeof b.creationAggressiveness === 'number') rows.push(`**Creation aggression:** ${b.creationAggressiveness}%`);

    if (rows.length === 0) return '';
    return `\n\n---\n\n*Behavior summary:*\n\n${rows.join(' · ')}`;
  }

  function generatePersonaMd() {
    if (!selectedProfileId.value) return;
    const base = getManagerPersonaTemplate(selectedProfileId.value, form.name || 'Manager');
    personaMd.value = base + buildBehaviorSummaryMd(behavior.value);
  }

  watch(behavior, () => {
    if (!isPersonaCustomized.value && selectedProfileId.value) {
      generatePersonaMd();
    }
  }, { deep: true });

  function onProfileSelected(profile: ProfileItem) {
    selectedProfileId.value = profile.id;
    selectedProfileName.value = profile.name;
    selectedProfileDescription.value = profile.description;
    behavior.value = { ...profile.behaviorConfig };
    isPersonaCustomized.value = false;
    generatePersonaMd();
    if (syncName.value) form.name = generateName();
  }

  function onPersonaEdited() {
    isPersonaCustomized.value = true;
    if (syncName.value) form.name = generateName();
  }

  function restorePersona() {
    isPersonaCustomized.value = false;
    generatePersonaMd();
    if (syncName.value) form.name = generateName();
  }

  function shortModelName(modelId: string): string {
    const PAID_MODEL_NAMES = Object.fromEntries(AGENT_PAID_MODEL_ITEMS.map((p) => [p.id, p.label]));
    const names: Record<string, string> = {
      [DEFAULT_FREE_AGENT_MODEL]: 'Nemotron-120B',
      'qwen/qwen3-coder:free': 'Qwen3-Coder',
      'nvidia/nemotron-nano-9b-v2:free': 'Nemotron-9B',
      'arcee-ai/trinity-large-preview:free': 'Trinity-Large',
      'minimax/minimax-m2.5': 'MiniMax M2.5',
      'mistralai/mistral-small-2603': 'Mistral Small',
      ...PAID_MODEL_NAMES,
    };
    return names[modelId] ?? modelId.split('/').pop()?.split(':')[0] ?? 'Manager';
  }

  function generateName(): string {
    const model = shortModelName(form.llmModel);
    const interval = form.decisionInterval;
    const style = isPersonaCustomized.value ? 'Custom' : selectedProfileName.value || '';
    return style ? `${model} · ${interval} · ${style}` : `${model} · ${interval}`;
  }

  watch([() => form.llmModel, () => form.decisionInterval, isPersonaCustomized, selectedProfileName], () => {
    if (syncName.value) form.name = generateName();
  });

  watch(() => form.name, (name) => {
    if (!isPersonaCustomized.value && selectedProfileId.value && personaMd.value) {
      const newPersona = getManagerPersonaTemplate(selectedProfileId.value, name || 'Manager');
      const existingLines = personaMd.value.split('\n');
      const firstLine = newPersona.split('\n')[0] ?? '';
      if (existingLines[0] !== firstLine) {
        existingLines[0] = firstLine;
        personaMd.value = existingLines.join('\n');
      }
    }
  });

  onMounted(() => {
    try {
      const saved = localStorage.getItem(autoNamePrefKey.value);
      if (saved === 'true') syncName.value = true;
      else if (saved === 'false') syncName.value = false;
      else syncName.value = true;
    } catch {
      syncName.value = true;
    } finally {
      hasHydratedAutoNamePref.value = true;
    }

    if (syncName.value && (!props.isEdit || !form.name.trim())) {
      form.name = generateName();
    }
  });

  watch(syncName, (enabled) => {
    if (!hasHydratedAutoNamePref.value) return;
    try {
      localStorage.setItem(autoNamePrefKey.value, enabled ? 'true' : 'false');
    } catch { /* ignore */ }
  });

  const availableAgentModels = computed(() => getManagerAllowedAgentModelIds(hasOwnKey.value));

  const liveSystemPrompt = computed(() => {
    const pairsAllowlist = SUPPORTED_BASE_PAIRS.map((p) => `- "${p}"`).join('\n');
    const modelAllowlist = availableAgentModels.value.map((m) => `- "${m}"`).join('\n');
    const profileAllowlist = AGENT_PROFILES.map((p) => `- "${p.id}" ${p.emoji} ${p.name}: ${p.description}`).join('\n');

    return `You are an Agent Manager overseeing a portfolio of paper trading agents on Base chain DEXes.

## Allowed Trading Pairs
When creating or modifying agents, you MUST choose pairs only from this allowlist:
${pairsAllowlist}

## Allowed Agent Analysis Intervals
When creating or modifying agents, "analysisInterval" MUST be one of:
- "1h"
- "4h"
- "1d"
Do not use unsupported legacy values like "1m", "5m", "15m", "30m", or numeric seconds/minutes.

## Available LLM Models For Agents
Use only these llmModel IDs when creating or modifying agents:
${modelAllowlist}

${hasOwnKey.value
  ? 'The user has OpenRouter connected, so you may use free models and low-cost paid models (up to $3 per 1M tokens).'
  : 'The user has no connected OpenRouter key, so you must use free models only.'}
If unsure, default to "${DEFAULT_FREE_AGENT_MODEL}".

## Available Agent Profiles
When creating agents, pick a profileId that naturally fits your management style and risk tolerance — or combine several across your fleet for diversity. You can also write a fully custom personaMd instead.
${profileAllowlist}

## Instructions
Evaluate each agent's performance and decide what actions to take this cycle.

Valid actions:
- "create_agent": spawn a new agent. Params: name, pairs, llmModel, temperature, analysisInterval (1h|4h|1d), strategies, paperBalance; optional: profileId (from the list above — sets the agent's persona), personaMd (custom markdown persona, overrides profileId), stopLossPct, takeProfitPct, maxPositionSizePct, maxOpenPositions, maxDailyLossPct, cooldownAfterLossMinutes. Choose risk parameters that reflect your own risk tolerance.
- "start_agent": start a stopped or paused agent (provide agentId)
- "pause_agent": pause an underperforming agent (provide agentId)
- "modify_agent": change agent parameters (provide agentId + params). Params can include: name, pairs, llmModel, temperature, analysisInterval (1h|4h|1d), strategies, paperBalance, stopLossPct, takeProfitPct, maxPositionSizePct, maxOpenPositions, personaMd (markdown), profileId, etc.
- "terminate_agent": permanently stop an agent (provide agentId)
- "hold": no action needed (provide agentId, or omit for portfolio-level hold)

IMPORTANT: Respond with ONLY a valid JSON array — no markdown, no explanation.
Each element: { "action": "<action>", "agentId": "<id or omit>", "params": {<optional>}, "reasoning": "<why>" }

Example:
[
  { "action": "hold", "agentId": "agent_001", "reasoning": "Strong performance, no changes needed" },
  { "action": "pause_agent", "agentId": "agent_002", "reasoning": "Drawdown exceeds 15%" }
]`;
  });

  const liveEditableSetup = computed(() => {
    const parts: string[] = [];
    if (personaMd.value.trim()) {
      parts.push(`## Your Persona\n${personaMd.value.trim()}`);
    }

    const riskSummary = `MaxDrawdown: ${(form.riskParams.maxTotalDrawdown * 100).toFixed(0)}%, MaxAgents: ${form.riskParams.maxAgents}, MaxCorrelated: ${form.riskParams.maxCorrelatedPositions}`;
    parts.push(`## Risk Limits\n${riskSummary}`);

    const b = behavior.value;
    if (b && typeof b === 'object') {
      parts.push(`## Your Management Style
- Risk Tolerance: ${(b as any).riskTolerance} | Management Style: ${(b as any).managementStyle}
- Creation Aggressiveness: ${(b as any).creationAggressiveness}/100 | Performance Patience: ${(b as any).performancePatience}/100
- Diversification: ${(b as any).diversificationPreference} | Rebalance Frequency: ${(b as any).rebalanceFrequency}
- Philosophy: ${(b as any).philosophyBias}`);
    }

    return parts.filter(Boolean).join('\n\n').trim();
  });

  return {
    form,
    behavior,
    personaMd,
    selectedProfileId,
    selectedProfileName,
    selectedProfileDescription,
    isPersonaCustomized,
    hasOwnKey,
    modelCatalog,
    syncName,
    submitting,
    validationError,
    finetuneOpen,
    managerConfigOpen,
    liveSystemPrompt,
    liveEditableSetup,
    onProfileSelected,
    onPersonaEdited,
    restorePersona,
    generatePersonaMd,
  };
}
