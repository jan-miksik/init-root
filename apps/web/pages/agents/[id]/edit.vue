<script setup lang="ts">
definePageMeta({ ssr: false });

import type { CreateAgentPayload } from '~/composables/useAgents';
import AgentConfigForm from '~/components/AgentConfigForm.vue';
import AgentPromptPreviewPanel from '~/components/AgentPromptPreviewPanel.vue';
import { splitAgentPromptSections } from '~/lib/agent-prompt';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);
const { getAgent, updateAgent } = useAgents();
const { request } = useApi();

const agent = ref<Awaited<ReturnType<typeof getAgent>> | null>(null);
const loading = ref(true);
const saving = ref(false);
const saveError = ref('');
const previewError = ref('');
const apiMarketData = ref('');
const apiFallbackEditableSetup = ref('');
const configFormRef = ref<InstanceType<typeof AgentConfigForm> | null>(null);

function parseApiSections(userPrompt: string) {
  const sections = splitAgentPromptSections(userPrompt);
  apiMarketData.value = sections.marketData;
  apiFallbackEditableSetup.value = sections.editableSetup
    .replace(/\n\nBased on the above data, what is your trading decision\?$/, '')
    .trim();
}

onMounted(async () => {
  try {
    agent.value = await getAgent(id.value);
  } finally {
    loading.value = false;
  }

  try {
    const data = await request<{ userPrompt: string }>(`/api/agents/${id.value}/prompt-preview`);
    parseApiSections(data.userPrompt);
  } catch {
    previewError.value = 'Prompt preview unavailable.';
  }
});

async function handleSave(payload: Partial<CreateAgentPayload>) {
  saving.value = true;
  saveError.value = '';
  try {
    await updateAgent(id.value, payload as Parameters<typeof updateAgent>[1]);
    router.push(`/agents/${id.value}`);
  } catch (err) {
    saveError.value = extractApiError(err) || 'Save failed';
  } finally {
    saving.value = false;
  }
}

function handleCancel() {
  router.push(`/agents/${id.value}`);
}

const editInitialValues = computed(() => {
  if (!agent.value) return undefined;
  const profileId = agent.value.profileId ?? (agent.value.config as { profileId?: string })?.profileId;
  return {
    name: agent.value.name,
    llmModel: agent.value.llmModel,
    pairs: agent.value.config.pairs,
    paperBalance: agent.value.config.paperBalance,
    strategies: agent.value.config.strategies,
    analysisInterval: agent.value.config.analysisInterval,
    maxPositionSizePct: agent.value.config.maxPositionSizePct,
    stopLossPct: agent.value.config.stopLossPct,
    takeProfitPct: agent.value.config.takeProfitPct,
    maxOpenPositions: agent.value.config.maxOpenPositions,
    temperature: agent.value.config.temperature ?? 0.7,
    allowFallback: agent.value.config.allowFallback ?? false,
    profileId: profileId ?? undefined,
    behavior: (agent.value.config as any).behavior,
    personaMd: agent.value.personaMd || undefined,
    behaviorMd: (agent.value.config as any).behaviorMd || undefined,
    roleMd: (agent.value.config as any).roleMd || undefined,
  };
});
</script>

<template>
  <div class="edit-page">
    <div v-if="loading" class="edit-page__loading">Loading...</div>
    <template v-else-if="agent">
      <div class="edit-bar">
        <NuxtLink :to="`/agents/${id}`" class="edit-bar__back">← back</NuxtLink>
        <span class="edit-bar__sep">/</span>
        <span class="edit-bar__name">{{ agent.name }}</span>
        <span v-if="agent.status === 'running'" class="edit-page__running-badge">running - changes apply next cycle</span>
        <div class="edit-bar__actions">
          <button type="button" class="edit-bar__cancel" @click="handleCancel">Cancel</button>
          <button type="submit" form="agent-config-form" class="edit-bar__save" :disabled="saving">
            <span v-if="saving" class="spinner" style="width:13px;height:13px;border-color:#fff3;border-top-color:#fff" />
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>

      <div v-if="saveError" class="edit-error">{{ saveError }}</div>

      <div class="edit-page__body">
        <div class="edit-page__left">
          <AgentConfigForm
            v-if="editInitialValues"
            ref="configFormRef"
            :initial-values="editInitialValues"
            hide-persona-editor
            :hide-footer="true"
            @submit="handleSave"
            @cancel="handleCancel"
          />
        </div>

        <div class="edit-page__right">
          <AgentPromptPreviewPanel
            :form-ref="configFormRef"
            :market-data-preview-text="apiMarketData"
            :fallback-editable-setup="apiFallbackEditableSetup"
            :preview-error="previewError"
          />
        </div>
      </div>
    </template>
    <div v-else class="edit-page__loading">Agent not found.</div>
  </div>
</template>

<style scoped>
.edit-page {
  min-height: 100vh;
  background: var(--bg, #0a0a0a);
  padding: 0 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.edit-page__loading {
  color: var(--text-muted);
  padding: 40px;
  text-align: center;
}

.edit-bar {
  position: sticky;
  top: 52px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  background: var(--bg, #0a0a0a);
  border-bottom: 1px solid var(--border, #1e1e1e);
}

.edit-bar__back {
  font-size: 13px;
  color: var(--accent, #7c6af7);
  text-decoration: none;
  white-space: nowrap;
  font-family: 'Space Mono', monospace;
}

.edit-bar__back:hover { text-decoration: underline; }

.edit-bar__sep {
  color: var(--border, #333);
  font-size: 14px;
}

.edit-bar__name {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--text, #e0e0e0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Space Mono', monospace;
  letter-spacing: -0.01em;
}

.edit-bar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.edit-bar__cancel {
  padding: 6px 14px;
  background: none;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  color: #555;
  font-size: 11px;
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}

.edit-bar__cancel:hover {
  border-color: #555;
  color: #aaa;
}

.edit-bar__save {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 18px;
  background: #e0e0e0;
  color: #0a0a0a;
  border: none;
  border-radius: 3px;
  font-size: 11px;
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.12s, opacity 0.12s;
}

.edit-bar__save:hover { background: #fff; }
.edit-bar__save:disabled { opacity: 0.35; cursor: not-allowed; }

.edit-page__running-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--warning, #f5a623) 12%, transparent);
  color: var(--warning, #f5a623);
  border: 1px solid color-mix(in srgb, var(--warning, #f5a623) 25%, transparent);
  font-family: 'Space Mono', monospace;
  letter-spacing: 0.03em;
}

.edit-error {
  padding: 10px 14px;
  background: color-mix(in srgb, #e55 10%, transparent);
  border: 1px solid color-mix(in srgb, #e55 30%, transparent);
  border-radius: 4px;
  font-size: 12px;
  color: #e55;
}

.edit-page__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: stretch;
  max-width: 740px;
  margin: 0 auto;
  width: 100%;
}

.edit-page__left {
  position: static;
  max-height: none;
  overflow: visible;
}

.edit-page__right { min-width: 0; }

@media (max-width: 1000px) {
  .edit-page__body { max-width: 100%; }
}
</style>
