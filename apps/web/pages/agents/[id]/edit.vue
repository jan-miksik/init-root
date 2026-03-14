<script setup lang="ts">
definePageMeta({ ssr: false });
const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);
const { getAgent, updateAgent } = useAgents();
const { request } = useApi();

const agent = ref<any>(null);
const loading = ref(true);
const error = ref('');

// Prompt preview state
const previewLoading = ref(true);
const previewError = ref('');
const systemPrompt = ref('');
const userPrompt = ref('');
const marketDataAt = ref<string | null>(null);
const hasMarketData = ref(false);

// Expandable sections in preview
const systemExpanded = ref(false);
const marketDataExpanded = ref(false);

onMounted(async () => {
  try {
    agent.value = await getAgent(id.value);
  } finally {
    loading.value = false;
  }

  // Fetch prompt preview once on open
  try {
    const data = await request<{
      systemPrompt: string;
      userPrompt: string;
      marketDataAt: string | null;
      hasMarketData: boolean;
    }>(`/agents/${id.value}/prompt-preview`);
    systemPrompt.value = data.systemPrompt;
    userPrompt.value = data.userPrompt;
    marketDataAt.value = data.marketDataAt;
    hasMarketData.value = data.hasMarketData;
  } catch {
    previewError.value = 'Failed to load prompt preview';
  } finally {
    previewLoading.value = false;
  }
});

async function handleSave(payload: any) {
  error.value = '';
  try {
    await updateAgent(id.value, payload);
    router.push(`/agents/${id.value}`);
  } catch (e: any) {
    error.value = e.message ?? 'Save failed';
  }
}

function handleCancel() {
  router.push(`/agents/${id.value}`);
}

// Extract Market Data section from userPrompt for collapsible display
const marketDataContent = computed(() => {
  if (!userPrompt.value) return '';
  const match = userPrompt.value.match(/## Market Data[\s\S]*?(?=\n## (?!###)|$)/);
  return match ? match[0].trim() : '';
});

const promptWithoutMarketData = computed(() => {
  if (!userPrompt.value) return '';
  if (!marketDataContent.value) return userPrompt.value;
  return userPrompt.value.replace(marketDataContent.value, '').trim();
});

function formatTime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="edit-page">
    <div v-if="loading" class="edit-page__loading">Loading…</div>
    <template v-else>
      <!-- Header -->
      <div class="edit-page__header">
        <NuxtLink :to="`/agents/${id}`" class="edit-page__back">← Back</NuxtLink>
        <h1 class="edit-page__title">Edit Agent</h1>
      </div>

      <div class="edit-page__body">
        <!-- Left: Config form -->
        <div class="edit-page__left">
          <AgentConfigForm
            v-if="agent"
            :initial-values="{ ...agent.config, ...agent, pairs: agent.config?.pairs }"
            @submit="handleSave"
            @cancel="handleCancel"
          />
          <div v-if="error" class="alert alert-error" style="margin-top:12px">{{ error }}</div>
        </div>

        <!-- Right: Prompt preview -->
        <div class="edit-page__right">
          <div class="prompt-preview">
            <div class="prompt-preview__header">
              <span class="prompt-preview__title">Prompt Preview</span>
              <span v-if="marketDataAt" class="prompt-preview__meta">
                market data from {{ formatTime(marketDataAt) }}
              </span>
            </div>

            <div v-if="previewLoading" class="prompt-preview__state">Loading preview…</div>
            <div v-else-if="previewError" class="prompt-preview__state prompt-preview__state--error">{{ previewError }}</div>
            <template v-else>
              <!-- SYSTEM — collapsed by default -->
              <div class="prompt-section">
                <button class="prompt-section__toggle" type="button" @click="systemExpanded = !systemExpanded">
                  <span class="prompt-section__label">SYSTEM</span>
                  <span class="prompt-section__chevron" :class="{ open: systemExpanded }">›</span>
                </button>
                <pre v-if="systemExpanded" class="prompt-section__content">{{ systemPrompt }}</pre>
              </div>

              <!-- MARKET DATA — collapsed by default -->
              <div class="prompt-section">
                <button class="prompt-section__toggle" type="button" @click="marketDataExpanded = !marketDataExpanded">
                  <span class="prompt-section__label">MARKET DATA</span>
                  <span v-if="!hasMarketData" class="prompt-section__hint">no data yet</span>
                  <span class="prompt-section__chevron" :class="{ open: marketDataExpanded }">›</span>
                </button>
                <pre v-if="marketDataExpanded" class="prompt-section__content">{{ marketDataContent || '(no market data yet — run agent first)' }}</pre>
              </div>

              <!-- Rest of prompt — always visible -->
              <pre v-if="promptWithoutMarketData" class="prompt-section__content prompt-section__content--main">{{ promptWithoutMarketData }}</pre>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.edit-page {
  min-height: 100vh;
  background: var(--bg, #0a0a0a);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1400px;
  margin: 0 auto;
}
.edit-page__loading {
  color: var(--text-muted, #555);
  padding: 40px;
  text-align: center;
}
.edit-page__header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.edit-page__back {
  color: var(--accent, #7c6af7);
  font-size: 13px;
  text-decoration: none;
}
.edit-page__back:hover { text-decoration: underline; }
.edit-page__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text, #e0e0e0);
  margin: 0;
}
.edit-page__body {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 24px;
  align-items: start;
}
.edit-page__left {
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}
.edit-page__right { min-width: 0; }

/* Prompt preview panel */
.prompt-preview {
  background: var(--surface, #141414);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.prompt-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #2a2a2a);
  background: color-mix(in srgb, var(--border, #2a2a2a) 30%, transparent);
}
.prompt-preview__title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted, #555);
}
.prompt-preview__meta {
  font-size: 11px;
  color: var(--text-muted, #444);
}
.prompt-preview__state {
  padding: 24px 16px;
  font-size: 13px;
  color: var(--text-muted, #555);
}
.prompt-preview__state--error { color: var(--error, #e55); }

/* Section rows */
.prompt-section {
  border-bottom: 1px solid var(--border, #1e1e1e);
}
.prompt-section:last-child { border-bottom: none; }
.prompt-section__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: none;
  border: none;
  color: var(--text-muted, #555);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;
  gap: 8px;
}
.prompt-section__toggle:hover {
  background: color-mix(in srgb, var(--border, #2a2a2a) 20%, transparent);
}
.prompt-section__label { flex: 1; }
.prompt-section__hint {
  font-size: 10px;
  font-weight: 400;
  text-transform: none;
  color: var(--text-muted, #444);
}
.prompt-section__chevron {
  font-size: 16px;
  transition: transform 0.2s;
  display: inline-block;
}
.prompt-section__chevron.open { transform: rotate(90deg); }

.prompt-section__content {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.65;
  color: var(--text-secondary, #aaa);
  padding: 12px 16px;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  background: color-mix(in srgb, var(--border, #2a2a2a) 8%, transparent);
}
.prompt-section__content--main {
  max-height: 65vh;
  overflow-y: auto;
}

@media (max-width: 900px) {
  .edit-page__body {
    grid-template-columns: 1fr;
  }
  .edit-page__left {
    position: static;
    max-height: none;
  }
}
</style>
