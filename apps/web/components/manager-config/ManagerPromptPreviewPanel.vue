<script setup lang="ts">
import { splitManagerPromptSections } from '~/lib/manager-prompt';
import { renderMarkdown } from '~/utils/markdown';

const props = defineProps<{
  managerId?: string;
  isEdit?: boolean;
  systemPrompt: string;
  editableSetup: string;
  personaMd: string;
  isPersonaCustomized: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:personaMd', value: string): void;
  (e: 'edited'): void;
  (e: 'restore'): void;
}>();

const showMdPreview = ref(false);
const systemExpanded = ref(false);
const contextExpanded = ref(false);
const editingSetup = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const lastPromptText = ref('');
const lastPromptAt = ref<string | null>(null);

const editablePersonaMd = computed({
  get: () => props.personaMd,
  set: (value: string) => emit('update:personaMd', value),
});

async function loadPromptPreview() {
  if (!props.managerId) return;
  previewLoading.value = true;
  previewError.value = '';
  try {
    const data = await $fetch<{ promptText: string | null; promptAt: string | null }>(`/api/managers/${props.managerId}/prompt-preview`, {
      credentials: 'include',
    });
    lastPromptText.value = data.promptText ?? '';
    lastPromptAt.value = data.promptAt ?? null;
  } catch {
    previewError.value = 'Prompt preview unavailable - run the manager once';
    lastPromptText.value = '';
    lastPromptAt.value = null;
  } finally {
    previewLoading.value = false;
  }
}

const apiContext = computed(() => splitManagerPromptSections(lastPromptText.value).context);
const contextNote = computed(() => {
  if (previewLoading.value) return 'loading...';
  if (!props.isEdit) return '- available after first run';
  if (!lastPromptText.value) return '- run manager to populate';
  return lastPromptAt.value ? `- last run ${new Date(lastPromptAt.value).toLocaleString()}` : '- last run';
});

watch(
  () => [props.isEdit, props.managerId] as const,
  ([isEdit, managerId]) => {
    if (isEdit && managerId) {
      loadPromptPreview();
      return;
    }
    previewError.value = '';
    lastPromptText.value = '';
    lastPromptAt.value = null;
  },
  { immediate: true }
);
</script>

<template>
  <div class="mpp">
    <div class="mpp__header">
      <span class="mpp__title">Prompt Preview</span>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        style="font-size: 11px;"
        @click.prevent.stop="showMdPreview = !showMdPreview"
      >
        {{ showMdPreview ? 'MD ●' : 'MD ○' }}
      </button>
    </div>

    <div v-if="previewError" class="mpp__error">{{ previewError }}</div>

    <div class="mpp__pills">
      <button type="button" class="mpp__pill mpp__pill--system" @click="systemExpanded = !systemExpanded">
        <span>[SYSTEM]</span>
        <span class="mpp__pill-chevron">{{ systemExpanded ? '▾' : '▸' }}</span>
      </button>
      <div v-if="systemExpanded" class="mpp__pill-content">
        <pre v-if="!showMdPreview" class="mpp__code-block">{{ systemPrompt }}</pre>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else class="mpp__code-block mpp__code-block--md" v-html="renderMarkdown(systemPrompt)" />
      </div>

      <button
        type="button"
        class="mpp__pill mpp__pill--context"
        :disabled="!managerId"
        @click="contextExpanded = !contextExpanded"
      >
        <span>[PORTFOLIO CONTEXT]</span>
        <span class="mpp__pill-meta">
          <span class="mpp__pill-note">{{ contextNote }}</span>
          <span v-if="managerId" class="mpp__pill-chevron">{{ contextExpanded ? '▾' : '▸' }}</span>
        </span>
      </button>
      <div v-if="contextExpanded" class="mpp__pill-content">
        <pre v-if="!showMdPreview" class="mpp__code-block">{{ apiContext || '(No runtime context yet - run the manager at least once to populate the preview)' }}</pre>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-else
          class="mpp__code-block mpp__code-block--md"
          v-html="renderMarkdown(apiContext || '(No runtime context yet - run the manager at least once to populate the preview)')"
        />
      </div>
    </div>

    <div class="mpp__editable-setup">
      <div class="mpp__editable-setup-row">
        <span class="mpp__editable-label">[EDITABLE SETUP]</span>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          style="font-size: 11px;"
          @click="editingSetup = !editingSetup"
        >
          {{ editingSetup ? 'Done' : 'Edit' }}
        </button>
      </div>

      <template v-if="editingSetup">
        <div class="mpp__persona-wrap">
          <PersonaEditor v-model="editablePersonaMd" :show-actions="false" @edited="emit('edited')" />
          <div v-if="isPersonaCustomized" class="mpp__restore-row">
            <button type="button" class="btn btn-ghost btn-sm" @click="emit('restore')">
              ↺ Restore auto-persona
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <pre v-if="!showMdPreview" class="mpp__code-block">{{ editableSetup }}</pre>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else class="mpp__code-block mpp__code-block--md" v-html="renderMarkdown(editableSetup)" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.mpp {
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface, #141414) 94%, black);
}
.mpp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--border, #2a2a2a);
  background: color-mix(in srgb, var(--border, #2a2a2a) 22%, transparent);
}
.mpp__title {
  font-size: 13px;
  font-weight: 650;
  color: var(--text, #e0e0e0);
}
.mpp__error {
  padding: 10px 14px;
  background: color-mix(in srgb, #e55 10%, transparent);
  border-bottom: 1px solid color-mix(in srgb, #e55 30%, transparent);
  font-size: 12px;
  color: #e55;
}
.mpp__pills {
  padding: 10px 12px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mpp__pill {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-muted, #888);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-family: var(--font-mono, monospace);
  padding: 4px 2px;
  text-align: left;
  cursor: pointer;
}
.mpp__pill--context { color: #f59e0b; }
.mpp__pill:disabled {
  opacity: 0.55;
  cursor: default;
}
.mpp__pill-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.mpp__pill-chevron {
  font-size: 12px;
  flex-shrink: 0;
}
.mpp__pill-note {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}
.mpp__pill-content {
  padding: 0 0 4px 10px;
}
.mpp__editable-setup {
  border-top: 1px solid var(--border, #2a2a2a);
  margin-top: 8px;
}
.mpp__editable-setup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px;
}
.mpp__editable-label {
  color: #60a5fa;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-family: var(--font-mono, monospace);
}
.mpp__code-block {
  margin: 0;
  padding: 8px 12px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text, #e0e0e0);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono, monospace);
}
.mpp__code-block--md :deep(p) { margin: 0 0 6px; }
.mpp__code-block--md :deep(ul) { margin: 4px 0; padding-left: 16px; }
.mpp__code-block--md :deep(li) { margin-bottom: 2px; }
.mpp__code-block--md :deep(h1),
.mpp__code-block--md :deep(h2),
.mpp__code-block--md :deep(h3) { margin: 6px 0 2px; font-size: 12px; font-weight: 700; }
.mpp__persona-wrap {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mpp__restore-row {
  display: flex;
  justify-content: flex-end;
}
</style>
