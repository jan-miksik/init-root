<script setup lang="ts">
const props = defineProps<{
  form: any;
  managerConfigOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:managerConfigOpen', val: boolean): void;
}>();
</script>

<template>
  <div class="mcf__accordion">
    <button type="button" class="mcf__accordion-btn" @click="$emit('update:managerConfigOpen', !managerConfigOpen)">
      <span>Manager config</span>
      <span class="mcf__chevron" :class="{ open: managerConfigOpen }">›</span>
    </button>
    <div class="mcf__accordion-body" :class="{ open: managerConfigOpen }">
      <div class="mcf__config">
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Decision Interval</label>
            <select v-model="form.decisionInterval" class="form-select">
              <option value="1h">Every 1 hour</option>
              <option value="4h">Every 4 hours</option>
              <option value="1d">Every 24 hours</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Temperature</label>
            <input
              v-model.number="form.temperature"
              class="form-range"
              type="range"
              min="0"
              max="1"
              step="0.05"
            />
            <div class="mcf__range-inline">{{ form.temperature.toFixed(2) }}</div>
          </div>
        </div>

        <div class="mcf__risk">
          <div class="mcf__risk-title">Risk Parameters</div>
          <div class="grid-3">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">
                Max Drawdown
                <span class="mcf__range-val">{{ (form.riskParams.maxTotalDrawdown * 100).toFixed(0) }}%</span>
              </label>
              <input v-model.number="form.riskParams.maxTotalDrawdown" class="form-range" type="range" min="0.01" max="1" step="0.01" />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">
                Max Agents
                <span class="mcf__range-val">{{ form.riskParams.maxAgents }}</span>
              </label>
              <input v-model.number="form.riskParams.maxAgents" class="form-range" type="range" min="1" max="20" step="1" />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">
                Max Correlated
                <span class="mcf__range-val">{{ form.riskParams.maxCorrelatedPositions }}</span>
              </label>
              <input v-model.number="form.riskParams.maxCorrelatedPositions" class="form-range" type="range" min="1" max="10" step="1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcf__accordion { border: 1px solid var(--border, #2a2a2a); border-radius: 10px; overflow: hidden; }
.mcf__accordion-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; background: color-mix(in srgb, var(--border, #2a2a2a) 30%, transparent); border: none; color: var(--text, #e0e0e0); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; text-align: left; gap: 8px; }
.mcf__accordion-btn:hover { background: color-mix(in srgb, var(--border, #2a2a2a) 50%, transparent); }
.mcf__chevron { font-size: 18px; color: var(--text-muted, #555); transition: transform 0.2s; display: inline-block; transform: rotate(0deg); }
.mcf__chevron.open { transform: rotate(90deg); }
.mcf__accordion-body { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
.mcf__accordion-body.open { max-height: 2000px; }
.mcf__config { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.mcf__risk { border: 1px solid var(--border, #2a2a2a); border-radius: 8px; padding: 14px 16px; }
.mcf__risk-title { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-muted, #555); margin-bottom: 14px; }
.mcf__range-val { color: var(--text-muted, #555); font-weight: 400; margin-left: 4px; }
.mcf__range-inline { margin-top: 4px; font-size: 12px; color: var(--text-muted, #666); font-family: 'JetBrains Mono', monospace; }
.form-range { width: 100%; accent-color: var(--accent); cursor: pointer; margin-top: 4px; }
</style>
