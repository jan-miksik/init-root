<script setup lang="ts">
const props = defineProps<{
  totalTokensUsed: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}>();
</script>

<template>
  <div class="tokens-summary-row">
    <div class="tokens-summary-label">LLM tokens used</div>
    <div class="tokens-summary-values mono">
      <span class="tokens-summary-total">
        {{ totalTokensUsed.toLocaleString('en') }} total
      </span>
      <span class="tokens-summary-split">
        ({{ totalPromptTokens.toLocaleString('en') }} ↑ / {{ totalCompletionTokens.toLocaleString('en') }} ↓)
      </span>
      <span class="tokens-summary-scope">· All analysis cycles</span>
    </div>
  </div>
</template>

<style scoped>
.tokens-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  margin-bottom: 24px;
}

.tokens-summary-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
}

.tokens-summary-values {
  font-size: 11px;
  color: var(--text-dim);
}

.tokens-summary-total {
  font-weight: 700;
  color: var(--text);
  margin-right: 6px;
}

.tokens-summary-split {
  opacity: 0.7;
  margin-right: 6px;
}

.tokens-summary-scope {
  opacity: 0.5;
}
</style>
