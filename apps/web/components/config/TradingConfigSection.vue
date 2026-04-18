<script setup lang="ts">
const props = defineProps<{
  form: any;
  configOpen: boolean;
  hideBalanceInput?: boolean;
  AVAILABLE_PAIRS: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'update:configOpen', val: boolean): void;
  (e: 'togglePair', pair: string): void;
}>();
</script>

<template>
  <div class="acf__accordion">
    <button type="button" class="acf__accordion-btn" @click="$emit('update:configOpen', !configOpen)">
      <span>Trading Config</span>
      <span class="acf__chevron" :class="{ open: configOpen }">›</span>
    </button>
    <div class="acf__accordion-body" :class="{ open: configOpen }">
      <div class="acf__config">
        <div class="form-group">
          <label class="form-label">Analysis Interval</label>
          <select v-model="form.analysisInterval" class="form-select">
            <option value="1h">Every hour</option>
            <option value="4h">Every 4 hours</option>
            <option value="1d">Daily</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Trading Pairs</label>
          <div class="pair-toggles">
            <label v-for="pairLabel in AVAILABLE_PAIRS" :key="pairLabel" class="pair-toggle">
              <span class="toggle-track" :class="{ active: form.pairs.includes(pairLabel) }" @click.prevent="$emit('togglePair', pairLabel)">
                <span class="toggle-thumb" />
              </span>
              <span class="pair-toggle-label">{{ pairLabel }}</span>
            </label>
          </div>
        </div>

        <div class="grid-2">
          <div v-if="!hideBalanceInput" class="form-group">
            <label class="form-label">Starting Balance (USDC)</label>
            <input v-model.number="form.paperBalance" type="number" class="form-input" min="100" max="1000000" step="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Max Position Size (%)</label>
            <input v-model.number="form.maxPositionSizePct" type="number" class="form-input" min="1" max="100" />
          </div>
        </div>

        <div class="grid-3">
          <div class="form-group">
            <label class="form-label">Stop Loss (%)</label>
            <input v-model.number="form.stopLossPct" type="number" class="form-input" min="0.5" max="50" step="0.5" />
          </div>
          <div class="form-group">
            <label class="form-label">Take Profit (%)</label>
            <input v-model.number="form.takeProfitPct" type="number" class="form-input" min="0.5" max="100" step="0.5" />
          </div>
          <div class="form-group">
            <label class="form-label">Max Open Positions</label>
            <input v-model.number="form.maxOpenPositions" type="number" class="form-input" min="1" max="10" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Strategy</label>
          <select v-model="(form.strategies as string[])[0]" class="form-select">
            <option value="combined">Combined (LLM weighs all indicators)</option>
            <option value="rsi_oversold">RSI Oversold/Overbought</option>
            <option value="ema_crossover">EMA 9/21 Crossover</option>
            <option value="macd_signal">MACD Signal Cross</option>
            <option value="bollinger_bounce">Bollinger Band Bounce</option>
            <option value="llm_sentiment">LLM Sentiment Analysis</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acf__accordion { border: 1px solid var(--border, #2a2a2a); border-radius: 10px; overflow: hidden; }
.acf__accordion-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; background: color-mix(in srgb, var(--border, #2a2a2a) 30%, transparent); border: none; color: var(--text, #e0e0e0); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; text-align: left; gap: 8px; }
.acf__chevron { font-size: 18px; color: var(--text-muted, #555); transition: transform 0.2s; display: inline-block; transform: rotate(0deg); }
.acf__chevron.open { transform: rotate(90deg); }
.acf__accordion-body { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
.acf__accordion-body.open { max-height: 2000px; }
.acf__config { padding: 16px; display: flex; flex-direction: column; gap: 0; }
.pair-toggles { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px 20px; }
.pair-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.toggle-track { flex-shrink: 0; width: 32px; height: 18px; background: var(--border-light, #333); border-radius: 9px; position: relative; transition: background 0.2s; cursor: pointer; }
.toggle-track.active { background: var(--accent, #7c6af7); }
.toggle-thumb { width: 14px; height: 14px; background: var(--text, #e0e0e0); border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
.toggle-track.active .toggle-thumb { transform: translateX(14px); }
.pair-toggle-label { font-size: 13px; font-weight: 500; color: var(--text, #e0e0e0); font-family: 'JetBrains Mono', monospace; }
</style>
