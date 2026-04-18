<script setup lang="ts">
const props = defineProps<{
  behavior: Record<string, any>;
  finetuneOpen: boolean;
  isPersonaCustomized: boolean;
  type: 'agent' | 'manager';
}>();

const emit = defineEmits<{
  (e: 'update:finetuneOpen', val: boolean): void;
  (e: 'update:behavior', val: any): void;
  (e: 'restorePersona'): void;
}>();
</script>

<template>
  <div id="acf-behavior-section" class="acf__accordion">
    <button type="button" class="acf__accordion-btn" @click="$emit('update:finetuneOpen', !finetuneOpen)">
      <span>Fine-tune Behavior</span>
      <span class="acf__chevron" :class="{ open: finetuneOpen }">›</span>
    </button>
    <div class="acf__accordion-body" :class="{ open: finetuneOpen }">
      <!-- Lock banner when persona is customized -->
      <div v-if="isPersonaCustomized" class="acf__lock-banner">
        <span>Persona MD was manually edited — behavior sync paused.</span>
        <button type="button" class="btn btn-ghost btn-sm" @click="$emit('restorePersona')">
          Restore auto-persona
        </button>
      </div>
      <div :class="{ 'acf__locked-content': isPersonaCustomized }">
        <BehaviorSettingsForm :model-value="behavior" :type="type" @update:model-value="$emit('update:behavior', $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.acf__accordion { border: 1px solid var(--border, #2a2a2a); border-radius: 10px; overflow: hidden; }
.acf__accordion-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; background: color-mix(in srgb, var(--border, #2a2a2a) 30%, transparent); border: none; color: var(--text, #e0e0e0); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; text-align: left; gap: 8px; }
.acf__accordion-btn:hover { background: color-mix(in srgb, var(--border, #2a2a2a) 50%, transparent); }
.acf__chevron { font-size: 18px; color: var(--text-muted, #555); transition: transform 0.2s; display: inline-block; transform: rotate(0deg); }
.acf__chevron.open { transform: rotate(90deg); }
.acf__accordion-body { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
.acf__accordion-body.open { max-height: 2000px; }
.acf__lock-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; background: color-mix(in srgb, var(--warning, #f5a623) 8%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--warning, #f5a623) 18%, transparent); font-size: 12px; color: var(--text-muted, #888); flex-wrap: wrap; }
.acf__locked-content { opacity: 0.4; pointer-events: none; user-select: none; }
</style>
