<template>
  <div class="edit-page">
    <div class="edit-bar">
      <NuxtLink to="/managers" class="edit-bar__back">&larr; back</NuxtLink>
      <span class="edit-bar__sep">/</span>
      <span class="edit-bar__name">New Manager</span>
      <div class="edit-bar__actions">
        <button type="button" class="edit-bar__cancel" @click="$router.push('/managers')">Cancel</button>
        <button type="submit" form="manager-config-form" class="edit-bar__save" :disabled="creating">
          <span v-if="creating" class="spinner" style="width:13px;height:13px;border-color:#fff3;border-top-color:#fff" />
          {{ creating ? 'Creating...' : 'Create Manager' }}
        </button>
      </div>
    </div>

    <div v-if="createError" class="edit-error">{{ createError }}</div>

    <div class="edit-page__body">
      <ManagerConfigForm
        :hide-footer="true"
        @submit="handleCreate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const createError = ref('');
const creating = ref(false);

async function handleCreate(form: Record<string, unknown>) {
  createError.value = '';
  creating.value = true;
  try {
    await $fetch('/api/managers', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    router.push('/managers');
  } catch (err: any) {
    createError.value = err?.data?.error ?? 'Failed to create manager';
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.edit-page {
  min-height: 100vh;
  background: var(--bg, #0a0a0a);
  padding: 0 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
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
.edit-bar__sep { color: var(--border, #333); font-size: 14px; }
.edit-bar__name {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--text, #e0e0e0);
  font-family: 'Space Mono', monospace;
}
.edit-bar__actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
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
}
.edit-bar__save:disabled { opacity: 0.35; cursor: not-allowed; }
.edit-error {
  padding: 10px 14px;
  background: color-mix(in srgb, #e55 10%, transparent);
  border: 1px solid color-mix(in srgb, #e55 30%, transparent);
  border-radius: 4px;
  font-size: 12px;
  color: #e55;
}
.edit-page__body {
  max-width: 740px;
  margin: 0 auto;
  width: 100%;
}
</style>
