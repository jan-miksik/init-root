<script setup lang="ts">
const {
  state: initiaState,
  openConnect: openInitiaConnect,
  refresh: refreshInitia,
} = useInitiaBridge();
const { isAuthenticated, fetchMe } = useAuth();
const connecting = ref(false);
const connectError = ref<string | null>(null);

const visibleError = computed(() => connectError.value ?? initiaState.value.error);

async function handleConnect() {
  connectError.value = null;
  connecting.value = true;
  try {
    await openInitiaConnect();
    await refreshInitia();
    const walletAddress = initiaState.value.evmAddress;
    if (!isAuthenticated.value && walletAddress) {
      await $fetch('/api/auth/hackathon-session', {
        method: 'POST',
        credentials: 'include',
        body: { walletAddress },
      });
      await fetchMe();
    }
    await navigateTo('/agents', { replace: true });
  } catch (err: unknown) {
    connectError.value = (err as Error)?.message ?? 'Failed to connect wallet.';
  } finally {
    connecting.value = false;
  }
}

onMounted(async () => {
  await refreshInitia().catch(() => undefined);
  if (isAuthenticated.value) {
    await navigateTo('/agents', { replace: true });
  }
});
</script>

<template>
  <main class="connect-page">
    <div class="connect-center">
      <div class="connect-card">
        <p class="connect-label">Heppy Market</p>
        <p class="connect-desc">
          Autonomous trading agents on Initia. Deploy strategies, track performance, and let AI manage your portfolio.
        </p>

        <button
          type="button"
          class="connect-btn"
          :disabled="connecting"
          @click="handleConnect"
        >
          {{ connecting ? 'Connecting…' : 'Connect wallet' }}
        </button>

        <div v-if="visibleError" class="connect-error">
          {{ visibleError }}
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.connect-page {
  min-height: calc(100vh - 52px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.connect-center {
  width: 100%;
  max-width: 380px;
  padding: 0 var(--space-md);
}

.connect-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-xl) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.connect-label {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.connect-desc {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.connect-btn {
  width: 100%;
  height: 40px;
  background: transparent;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
  transition: background var(--t-snap), color var(--t-snap);
}

.connect-btn:hover:not(:disabled) {
  background: var(--accent-dim);
  color: var(--accent-hover);
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.connect-error {
  border: 1px solid var(--red-dim, #2a1414);
  background: var(--red-dim, #2a1414);
  color: var(--red);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  padding: var(--space-sm) 10px;
  border-radius: var(--radius);
}
</style>
