<script setup lang="ts">
const STORAGE_KEY = 'initroot:small-screen-dismissed';

const visible = ref(false);
const viewportWidth = ref<number | null>(null);

onMounted(() => {
  if (typeof window === 'undefined') return;
  viewportWidth.value = window.innerWidth;
  if (localStorage.getItem(STORAGE_KEY)) return;
  if (viewportWidth.value < 1000) {
    visible.value = true;
  }
});

function dismiss() {
  visible.value = false;
  localStorage.setItem(STORAGE_KEY, '1');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="ssm-overlay">
        <div class="ssm-modal">
          <div class="ssm-eyebrow">DISPLAY WARNING</div>
          <h2 class="ssm-title">Not optimised<br>for small screens</h2>
          <p class="ssm-body">
            initRoot is built for desktop.<br>
            Some panels, charts, and data tables may not render correctly at this viewport width.
          </p>
          <div class="ssm-meta">
            ⟨ viewport · {{ viewportWidth ?? '—' }}px · recommended ≥1000px ⟩
          </div>
          <button class="ssm-btn" @click="dismiss">
            Use anyway →
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ssm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: color-mix(in srgb, var(--bg, #111) 92%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.ssm-modal {
  width: min(400px, 100%);
  border: 1px solid var(--border, #2a2a2a);
  border-left: 3px solid var(--accent, #e8ff3e);
  background: var(--bg-card, #171717);
  padding: 28px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ssm-eyebrow {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--accent, #e8ff3e);
  text-transform: uppercase;
}

.ssm-title {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 22px;
  font-weight: 700;
  color: var(--text, #f0f0f0);
  line-height: 1.25;
  margin: 0;
  letter-spacing: -0.02em;
}

.ssm-body {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  color: var(--text-dim, #888);
  line-height: 1.65;
  margin: 0;
}

.ssm-meta {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--text-muted, #555);
  letter-spacing: 0.02em;
  margin-top: 2px;
}

.ssm-btn {
  margin-top: 8px;
  align-self: flex-start;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bg, #111);
  background: var(--accent, #e8ff3e);
  border: none;
  padding: 9px 18px;
  cursor: pointer;
  transition: opacity 150ms;
}

.ssm-btn:hover {
  opacity: 0.85;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
