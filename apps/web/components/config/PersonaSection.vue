<script setup lang="ts">
const props = defineProps<{
  personaMd: string;
  personaMdOpen: boolean;
  isPersonaCustomized: boolean;
  hidePersonaEditor?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:personaMd', val: string): void;
  (e: 'update:personaMdOpen', val: boolean): void;
  (e: 'personaEdited'): void;
  (e: 'restorePersona'): void;
}>();
</script>

<template>
  <div v-if="!hidePersonaEditor" class="acf__accordion">
    <button type="button" class="acf__accordion-btn" @click="$emit('update:personaMdOpen', !personaMdOpen)">
      <span class="acf__acc-left">
        Persona MD
        <span v-if="isPersonaCustomized" class="acf__custom-badge">Custom</span>
      </span>
      <span class="acf__acc-right">
        <span class="acf__hint-chip">injected into system prompt</span>
        <span class="acf__chevron" :class="{ open: personaMdOpen }">›</span>
      </span>
    </button>
    <div class="acf__accordion-body" :class="{ open: personaMdOpen }">
      <div class="acf__persona-wrap">
        <PersonaEditor :model-value="personaMd" :show-actions="false" @update:model-value="$emit('update:personaMd', $event)" @edited="$emit('personaEdited')" />
        <div v-if="isPersonaCustomized" class="acf__restore-row">
          <button type="button" class="btn btn-ghost btn-sm" @click="$emit('restorePersona')">
            ↺ Restore auto-persona
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acf__accordion { border: 1px solid var(--border, #2a2a2a); border-radius: 10px; overflow: hidden; }
.acf__accordion-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; background: color-mix(in srgb, var(--border, #2a2a2a) 30%, transparent); border: none; color: var(--text, #e0e0e0); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; text-align: left; gap: 8px; }
.acf__acc-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.acf__acc-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.acf__hint-chip { font-size: 10px; font-weight: 400; color: var(--text-muted, #444); background: color-mix(in srgb, var(--border, #2a2a2a) 60%, transparent); padding: 2px 7px; border-radius: 4px; }
.acf__chevron { font-size: 18px; color: var(--text-muted, #555); transition: transform 0.2s; display: inline-block; transform: rotate(0deg); }
.acf__chevron.open { transform: rotate(90deg); }
.acf__accordion-body { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
.acf__accordion-body.open { max-height: 2000px; }
.acf__persona-wrap { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.acf__restore-row { display: flex; justify-content: flex-end; }
.acf__custom-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: color-mix(in srgb, var(--warning, #f5a623) 15%, transparent); color: var(--warning, #f5a623); border: 1px solid color-mix(in srgb, var(--warning, #f5a623) 30%, transparent); text-transform: none; letter-spacing: 0; }
</style>
