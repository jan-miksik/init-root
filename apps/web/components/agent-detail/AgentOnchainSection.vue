<script setup lang="ts">
const props = defineProps<{
  agent: any;
  isInitiaAgent: boolean;
  autoSignEnabled: boolean;
  autoSignBusy: 'enable' | 'disable' | null;
  autoSignError: string | null;
  autoSignButtonLabel: string;
  autoSignButtonTitle: string;
  autoSignMismatch: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggleAutoSign'): void;
}>();
</script>

<template>
  <div v-if="isInitiaAgent" class="onchain-card">
    <div class="onchain-header">
      <div class="onchain-title">
        <span class="initia-icon" /> Initia Appchain
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button
          class="btn btn-sm"
          :class="autoSignEnabled ? 'btn-autosign-on' : 'btn-ghost'"
          :disabled="!!autoSignBusy"
          :title="autoSignButtonTitle"
          @click="$emit('toggleAutoSign')"
        >
          {{ autoSignButtonLabel }}
        </button>
      </div>
    </div>
    
    <div v-if="autoSignError" class="alert alert-error alert-sm" style="margin-top: 8px;">
      {{ autoSignError }}
    </div>

    <div v-if="autoSignMismatch" class="alert alert-warn alert-sm" style="margin-top: 8px;">
      Wallet mismatch. Connect the wallet linked to this agent to manage auto-sign.
    </div>
  </div>
</template>

<style scoped>
.onchain-card {
  padding: 16px;
  background: var(--bg-card);
  border: 1px dotted var(--border-light);
  border-radius: var(--radius);
  margin-bottom: 16px;
}

.onchain-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.onchain-title {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.initia-icon {
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
}

.btn-autosign-on {
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
  color: var(--accent);
}

.alert-sm {
  font-size: 11px;
  padding: 6px 10px;
}
</style>
