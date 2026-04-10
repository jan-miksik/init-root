<script setup lang="ts">
definePageMeta({ ssr: false });
import type { Trade } from '~/composables/useTrades';
import { pollUntilFutureAlarm } from '~/utils/statusPolling';
import { getAgentProfile, DEFAULT_AGENT_PROFILE_ID } from '@something-in-loop/shared';
import AgentDecisionsLog from '~/components/agent-detail/AgentDecisionsLog.vue';
import AgentPositionsSection from '~/components/agent-detail/AgentPositionsSection.vue';

const route = useRoute();
const id = computed(() => route.params.id as string);
const { getAgent, startAgent, stopAgent, pauseAgent, deleteAgent, clearAgentHistory } = useAgents();
const { pendingModifications, modDecisionIds, fetchModifications, approve, reject } = useSelfModifications();
const { fetchAgentTrades, closeTrade, pnlClass } = useTrades();
const { request } = useApi();
const { getAgentPersona, updateAgentPersona, resetAgentPersona } = useProfiles();
const router = useRouter();
const {
  state: initiaState,
  openConnect,
  refresh: refreshInitiaState,
  enableAutoSign,
  disableAutoSign,
} = useInitiaBridge();

const closingTrades = ref<Set<string>>(new Set());

async function closeTradeByUser(tradeId: string) {
  if (closingTrades.value.has(tradeId)) return;
  closingTrades.value.add(tradeId);
  try {
    await closeTrade(tradeId);
    // Refresh trades so UI updates (open → closed) and openPositions grouping recalculates.
    trades.value = await fetchAgentTrades(id.value);
  } finally {
    closingTrades.value.delete(tradeId);
  }
}

interface AgentDecision {
  id: string;
  decision: string;
  confidence: number;
  reasoning: string;
  llmModel: string;
  llmLatencyMs: number;
  llmTokensUsed?: number;
  llmPromptTokens?: number;
  llmCompletionTokens?: number;
  marketDataSnapshot?: string;
  llmPromptText?: string;
  llmRawResponse?: string;
  createdAt: string;
}

interface PerformanceSnapshot {
  id: string;
  balance: number;
  totalPnlPct: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  snapshotAt: string;
}

interface DoStatus {
  agentId: string | null;
  status: string;
  balance: number | null;
  nextAlarmAt: number | null;
  analysisState?: 'idle' | 'running' | 'awaiting_llm';
  isLoopRunning?: boolean;
  loopRunningAt?: number | null;
  pendingLlmJobId?: string | null;
  pendingLlmJobAt?: number | null;
  pendingLlmAgeMs?: number | null;
}

const agent = ref<Awaited<ReturnType<typeof getAgent>> | null>(null);
const trades = ref<Trade[]>([]);
const decisions = ref<AgentDecision[]>([]);
const snapshots = ref<PerformanceSnapshot[]>([]);
const doStatus = ref<DoStatus | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const isAnalyzing = ref(false);
const analyzePhase = ref<'request' | 'polling' | 'refreshing'>('request');
const analyzeElapsed = ref(0);
let analyzeTimer: ReturnType<typeof setInterval> | null = null;

function startAnalyzeTimer() {
  analyzeElapsed.value = 0;
  analyzeTimer = setInterval(() => { analyzeElapsed.value++; }, 1000);
}
function stopAnalyzeTimer() {
  if (analyzeTimer) { clearInterval(analyzeTimer); analyzeTimer = null; }
}

const analyzeStatusText = computed(() => {
  if (!isAnalyzing.value) return '';
  const s = analyzeElapsed.value;
  const elapsed = s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  const phaseText: Record<string, string> = {
    request: s < 5 ? 'Sending request…' : s < 15 ? 'Fetching market data…' : 'LLM reasoning…',
    polling: 'Waiting for decision…',
    refreshing: 'Loading results…',
  };
  return `${phaseText[analyzePhase.value]} (${elapsed})`;
});

const livePrices = ref<Record<string, number>>({});
const livePricesLoading = ref(false);
const livePricesError = ref<string | null>(null);
/** Tracks which pill sections are open per decision id */
const ANALYZE_REQUEST_TIMEOUT_MS = 10 * 60_000;
const ANALYZE_RESULT_WAIT_MS = 25_000;
const ANALYZE_RESULT_WAIT_ON_PENDING_MS = 90_000;
const ANALYZE_RESULT_POLL_MS = 1_500;
const ANALYZE_BACKGROUND_WAIT_MS = 3 * 60_000;
const ANALYZE_BACKGROUND_POLL_MS = 2_000;
let analyzeWatchToken = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const expandedTrades = ref<Set<string>>(new Set());
const analyzeError = ref<string | null>(null);
const personaMd = ref('');
const personaSaving = ref(false);
const clearingHistory = ref(false);
const autoSignBusy = ref<'enable' | 'disable' | null>(null);
const autoSignError = ref<string | null>(null);
const WALLET_STATE_TIMEOUT_MS = 30_000;
const WALLET_STATE_POLL_MS = 250;

const personaEmoji = computed(() => {
  if (!agent.value) return '';
  const configProfileId = (agent.value.config as { profileId?: string }).profileId;
  const profileId = agent.value.profileId ?? configProfileId ?? DEFAULT_AGENT_PROFILE_ID;
  const profile = getAgentProfile(profileId);
  return profile?.emoji ?? '';
});

const isInitiaAgent = computed(() => agent.value?.chain === 'initia');

const persistedInitiaState = computed<Record<string, unknown> | null>(() => {
  const raw = (agent.value as { initiaSyncState?: unknown } | null)?.initiaSyncState;
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
});

const linkedOnchainAgentId = computed(() => {
  const raw = persistedInitiaState.value?.onchainAgentId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
});

const activeOnchainAgentId = computed(() => initiaState.value.onchainAgentId);

const autoSignMismatch = computed(() => {
  if (!linkedOnchainAgentId.value || !activeOnchainAgentId.value) return false;
  return linkedOnchainAgentId.value !== activeOnchainAgentId.value;
});

const autoSignEnabled = computed(() => {
  if (initiaState.value.initiaAddress) return initiaState.value.autoSignEnabled;
  const persisted = persistedInitiaState.value?.autoSignEnabled;
  return typeof persisted === 'boolean' ? persisted : initiaState.value.autoSignEnabled;
});

const autoSignButtonLabel = computed(() => {
  if (autoSignBusy.value === 'enable') return 'Enabling…';
  if (autoSignBusy.value === 'disable') return 'Disabling…';
  return autoSignEnabled.value ? 'Auto-Sign ON' : 'Auto-Sign OFF';
});

const autoSignButtonTitle = computed(() => {
  if (autoSignMismatch.value) {
    return `Connected wallet points to onchain agent ${activeOnchainAgentId.value}, but this page is linked to ${linkedOnchainAgentId.value}.`;
  }
  return autoSignEnabled.value
    ? 'Disable auto-sign for all supported on-chain actions.'
    : 'Enable auto-sign for all supported on-chain actions.';
});

/** True when the analysis failed because the selected model is unavailable (no automatic fallback) */
const isModelUnavailableError = computed(() => {
  const err = analyzeError.value?.toLowerCase() ?? '';
  return (
    err.includes('is unavailable') ||
    err.includes('unavailable for free') ||
    err.includes('free requests') ||
    err.includes('rate limit') ||
    err.includes('402') ||
    err.includes('429') ||
    (err.includes('llm') && err.includes('failed'))
  );
});

// Countdown timer
const now = ref(Date.now());
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let cancelStatusPoll: (() => void) | null = null;

// Three-dot menu
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
function onDocClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    menuOpen.value = false;
  }
}

function logAnalyzeTrace(stage: string, payload?: Record<string, unknown>) {
  const logPayload = { at: new Date().toISOString(), stage, ...(payload ?? {}) };
  console.log('[analyze-trace]', logPayload);
}

function cancelBackgroundAnalyzeWatch() {
  analyzeWatchToken += 1;
}

onMounted(() => {
  countdownInterval = setInterval(() => { now.value = Date.now(); }, 1000);
  document.addEventListener('click', onDocClick);
});
onUnmounted(() => {
  cancelBackgroundAnalyzeWatch();
  if (countdownInterval) clearInterval(countdownInterval);
  if (cancelStatusPoll) cancelStatusPoll();
  stopAnalyzeTimer();
  document.removeEventListener('click', onDocClick);
});

async function loadAll() {
  loading.value = true;
  loadError.value = null;
  try {
    const [a, t, d, p] = await Promise.all([
      getAgent(id.value),
      fetchAgentTrades(id.value),
      request<{ decisions: AgentDecision[] }>(`/api/agents/${id.value}/decisions`),
      request<{ snapshots: PerformanceSnapshot[] }>(`/api/agents/${id.value}/performance`),
    ]);
    agent.value = a;
    trades.value = t;
    decisions.value = d.decisions;
    snapshots.value = p.snapshots;
    await fetchLivePrices();
    // Load DO status for countdown
    await refreshDoStatus();
    try {
      const personaData = await getAgentPersona(id.value);
      personaMd.value = personaData.personaMd ?? '';
    } catch { /* ignore */ }
    if (a.chain === 'initia') {
      await refreshInitiaState();
    }
    fetchModifications(id.value).catch(() => { /* non-critical */ });
  } catch (err) {
    loadError.value = extractApiError(err);
  } finally {
    loading.value = false;
  }
}

async function fetchLivePrices() {
  livePricesLoading.value = true;
  livePricesError.value = null;
  try {
    const cfgPairs = (agent.value?.config?.pairs as string[] | undefined) ?? [];
    const tradePairs = trades.value.map((t) => t.pair);
    const pairs = Array.from(new Set([...cfgPairs, ...tradePairs])).filter(Boolean);
    if (pairs.length === 0) {
      livePrices.value = {};
      return;
    }

    const res = await request<{ prices: Record<string, number> }>(`/api/pairs/prices`, {
      method: 'POST',
      body: { pairs },
      timeout: 30_000,
    });
    livePrices.value = res.prices ?? {};
  } catch (err) {
    livePricesError.value = extractApiError(err);
  } finally {
    livePricesLoading.value = false;
  }
}

async function refreshDoStatus() {
  try {
    doStatus.value = await request<DoStatus>(`/api/agents/${id.value}/status`, { fresh: true });
  } catch {
    // non-critical
  }
}

async function refreshAnalysisOutputs() {
  const [t, d, p] = await Promise.all([
    fetchAgentTrades(id.value),
    request<{ decisions: AgentDecision[] }>(`/api/agents/${id.value}/decisions`, { fresh: true }),
    request<{ snapshots: PerformanceSnapshot[] }>(`/api/agents/${id.value}/performance`, { fresh: true }),
  ]);
  trades.value = t;
  decisions.value = d.decisions;
  snapshots.value = p.snapshots;
}

async function waitForDecisionChange(
  previousDecisionIds: Set<string>,
  timeoutMs: number,
  options?: {
    pollMs?: number;
    stage?: 'foreground' | 'background';
    shouldStop?: () => boolean;
  },
): Promise<boolean> {
  const stage = options?.stage ?? 'foreground';
  const pollMs = options?.pollMs ?? ANALYZE_RESULT_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  let polls = 0;
  while (Date.now() < deadline) {
    if (options?.shouldStop?.()) {
      logAnalyzeTrace('poll_canceled', { stage, polls });
      return false;
    }

    polls += 1;
    try {
      const [res, status] = await Promise.all([
        request<{ decisions: AgentDecision[] }>(`/api/agents/${id.value}/decisions`, {
          timeout: 30_000,
          silent: true,
          fresh: true,
        }),
        request<DoStatus>(`/api/agents/${id.value}/status`, {
          timeout: 30_000,
          silent: true,
          fresh: true,
        }),
      ]);
      decisions.value = res.decisions;
      doStatus.value = status;
      const hasAnyNewDecision = res.decisions.some((d) => !previousDecisionIds.has(d.id));
      const latest = res.decisions[0];
      logAnalyzeTrace('poll', {
        stage,
        polls,
        hasAnyNewDecision,
        decisionCount: res.decisions.length,
        latestDecisionId: latest?.id ?? null,
        latestDecisionAt: latest?.createdAt ?? null,
        analysisState: status.analysisState ?? 'idle',
        pendingLlmAgeMs: status.pendingLlmAgeMs ?? null,
      });
      if (hasAnyNewDecision) {
        logAnalyzeTrace('poll_new_decision_detected', {
          stage,
          polls,
          latestDecisionId: latest?.id ?? null,
          latestDecisionAt: latest?.createdAt ?? null,
        });
        return true;
      }
    } catch (err) {
      logAnalyzeTrace('poll_error', {
        stage,
        polls,
        error: extractApiError(err),
      });
      // Keep polling; this is best-effort and should not interrupt analyze flow.
    }
    await sleep(pollMs);
  }
  logAnalyzeTrace('poll_timeout', { stage, polls, timeoutMs });
  return false;
}

async function startBackgroundDecisionWatch(previousDecisionIds: Set<string>) {
  const watchToken = ++analyzeWatchToken;
  logAnalyzeTrace('background_watch_start', {
    watchToken,
    waitMs: ANALYZE_BACKGROUND_WAIT_MS,
    pollMs: ANALYZE_BACKGROUND_POLL_MS,
  });

  const hasNewDecision = await waitForDecisionChange(previousDecisionIds, ANALYZE_BACKGROUND_WAIT_MS, {
    stage: 'background',
    pollMs: ANALYZE_BACKGROUND_POLL_MS,
    shouldStop: () => watchToken !== analyzeWatchToken,
  });

  if (watchToken !== analyzeWatchToken) {
    return;
  }

  if (!hasNewDecision) {
    logAnalyzeTrace('background_watch_end_no_new_decision', { watchToken });
    return;
  }

  try {
    await refreshAnalysisOutputs();
    await Promise.all([refreshDoStatus(), fetchLivePrices()]);
    if (
      analyzeError.value?.includes('No new decision yet') ||
      analyzeError.value?.includes('still running in the background')
    ) {
      analyzeError.value = null;
    }
    const latest = decisions.value[0];
    logAnalyzeTrace('background_watch_applied', {
      watchToken,
      latestDecisionId: latest?.id ?? null,
      latestDecisionAt: latest?.createdAt ?? null,
    });
  } catch (err) {
    logAnalyzeTrace('background_watch_apply_error', {
      watchToken,
      error: extractApiError(err),
    });
  }
}

function extractAnalyzeError(err: unknown): string {
  return (
    (err as { data?: { error?: string }; message?: string })?.data?.error ??
    (err as { message?: string })?.message ??
    'Analysis failed — check that OPENROUTER_API_KEY is configured.'
  );
}

onMounted(loadAll);

const openTrades = computed(() => trades.value.filter((t) => t.status === 'open'));
const closedTrades = computed(() => trades.value.filter((t) => t.status !== 'open'));
function getUnrealizedPnlForSummary(trade: Trade): { pnlPct: number } | null {
  const live = livePrices.value[trade.pair];
  if (live && live > 0) {
    const slippage = agent.value?.config.slippageSimulation ?? 0.3;
    const effectiveEntry = trade.side === 'buy'
      ? trade.entryPrice * (1 + slippage / 100)
      : trade.entryPrice * (1 - slippage / 100);
    const pnlPct = trade.side === 'buy'
      ? ((live - effectiveEntry) / effectiveEntry) * 100
      : ((effectiveEntry - live) / effectiveEntry) * 100;
    return { pnlPct };
  }
  return null;
}
const winRate = computed(() => {
  if (closedTrades.value.length === 0) return 0;
  const wins = closedTrades.value.filter((t) => (t.pnlPct ?? 0) > 0).length;
  return (wins / closedTrades.value.length) * 100;
});
const realizedPnlUsd = computed(() =>
  closedTrades.value.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0)
);
const unrealizedPnlUsd = computed(() =>
  openTrades.value.reduce((sum, t) => {
    const pnl = getUnrealizedPnlForSummary(t);
    return pnl ? sum + (pnl.pnlPct / 100) * t.amountUsd : sum;
  }, 0)
);
const totalPnlUsd = computed(() => realizedPnlUsd.value + unrealizedPnlUsd.value);
const totalPnlPct = computed(() => {
  const initial = agent.value?.config.paperBalance ?? 0;
  if (!initial) return 0;
  return (totalPnlUsd.value / initial) * 100;
});
const inPositionsUsd = computed(() =>
  openTrades.value.reduce((sum, t) => sum + (t.amountUsd ?? 0), 0)
);
const displayedBalance = computed(() => {
  const initial = agent.value?.config.paperBalance ?? 0;
  if (!initial) return 0;
  // Available balance excludes open positions and reflects only realized P&L.
  return initial + realizedPnlUsd.value;
});

const totalTokensUsed = computed(
  () => decisions.value.reduce((sum, d) => sum + (d.llmTokensUsed ?? 0), 0),
);

const totalPromptTokens = computed(
  () => decisions.value.reduce((sum, d) => sum + (d.llmPromptTokens ?? 0), 0),
);

const totalCompletionTokens = computed(
  () => decisions.value.reduce((sum, d) => sum + (d.llmCompletionTokens ?? 0), 0),
);

/** Seconds until next agent analysis cycle */
const secondsUntilNextAction = computed(() => {
  if (!doStatus.value?.nextAlarmAt) return null;
  const diff = Math.floor((doStatus.value.nextAlarmAt - now.value) / 1000);
  return diff > 0 ? diff : 0;
});

// When the countdown hits 0 while running, poll the DO every 5s until a future
// alarm is confirmed (the loop has finished and rescheduled).
watch(secondsUntilNextAction, (val) => {
  if (val === 0 && agent.value?.status === 'running') {
    if (cancelStatusPoll) cancelStatusPoll();
    cancelStatusPoll = pollUntilFutureAlarm(
      () => secondsUntilNextAction.value,
      () => agent.value?.status === 'running',
      refreshDoStatus,
      5_000,
      async () => {
        const [t, d] = await Promise.all([
          fetchAgentTrades(id.value),
          request<{ decisions: AgentDecision[] }>(`/api/agents/${id.value}/decisions`, { fresh: true }),
        ]);
        trades.value = t;
        decisions.value = d.decisions;
      },
    );
  }
});

function formatCountdown(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds <= 0) return 'any moment…';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/** True when countdown shows "any moment…" — used for animation */
const isNextAnalysisImminent = computed(
  () =>
    agent.value?.status === 'running' &&
    secondsUntilNextAction.value !== null &&
    secondsUntilNextAction.value <= 0,
);

async function handleStart() {
  if (!agent.value) return;
  await startAgent(id.value);
  agent.value.status = 'running';
  await refreshDoStatus();
}
async function handleStop() {
  if (!agent.value) return;
  await stopAgent(id.value);
  agent.value.status = 'stopped';
  doStatus.value = null;
}

async function syncInitiaStateToApi(trigger: string) {
  if (!isInitiaAgent.value || !agent.value || !initiaState.value.initiaAddress) return;

  const mergedState = {
    ...(persistedInitiaState.value ?? {}),
    walletAddress: initiaState.value.initiaAddress,
    evmAddress: initiaState.value.evmAddress ?? undefined,
    onchainAgentId: initiaState.value.onchainAgentId ?? undefined,
    chainOk: initiaState.value.chainOk,
    existsOnchain: initiaState.value.agentExists,
    autoSignEnabled: initiaState.value.autoSignEnabled,
    executorAuthorized: initiaState.value.executorAuthorized,
    walletBalanceWei: initiaState.value.walletBalanceWei ?? undefined,
    vaultBalanceWei: initiaState.value.vaultBalanceWei ?? undefined,
    walletShowcaseTokenBalanceWei: initiaState.value.walletShowcaseTokenBalanceWei ?? undefined,
    showcaseTokenBalanceWei: initiaState.value.showcaseTokenBalanceWei ?? undefined,
    lastTxHash: initiaState.value.lastTxHash ?? undefined,
    syncTrigger: trigger,
  };

  try {
    await request(`/api/agents/${id.value}/initia/sync`, {
      method: 'POST',
      body: { state: mergedState },
      silent: true,
    });
  } catch (err) {
    console.warn('[agent-detail] failed to sync initia state', err);
  } finally {
    (agent.value as { initiaSyncState?: Record<string, unknown> | null }).initiaSyncState = mergedState;
  }
}

async function ensureInitiaWalletConnected() {
  await refreshInitiaState();
  if (initiaState.value.initiaAddress) return;

  await openConnect();
  const startedAt = Date.now();
  while (Date.now() - startedAt < WALLET_STATE_TIMEOUT_MS) {
    await refreshInitiaState();
    if (initiaState.value.initiaAddress) return;
    await sleep(WALLET_STATE_POLL_MS);
  }

  throw new Error('Wallet connection was not detected. Finish wallet connect and try again.');
}

async function handleToggleAutoSign() {
  if (!isInitiaAgent.value) return;
  autoSignError.value = null;
  const enabling = !autoSignEnabled.value;
  autoSignBusy.value = enabling ? 'enable' : 'disable';

  try {
    await ensureInitiaWalletConnected();
    await refreshInitiaState();

    if (!initiaState.value.chainOk) {
      throw new Error('Local rollup chain is not reachable. Ensure the chain is running at the configured RPC endpoint.');
    }
    if (autoSignMismatch.value) {
      throw new Error(`Connected wallet is focused on onchain agent ${activeOnchainAgentId.value}, but this page is linked to ${linkedOnchainAgentId.value}.`);
    }
    if (!initiaState.value.agentExists) {
      throw new Error('No onchain agent found for the connected wallet.');
    }

    if (enabling) {
      await enableAutoSign();
    } else {
      await disableAutoSign();
    }
    await refreshInitiaState();
    await syncInitiaStateToApi(enabling ? 'detail-enable-autosign' : 'detail-disable-autosign');
  } catch (err) {
    autoSignError.value = extractApiError(err);
  } finally {
    autoSignBusy.value = null;
  }
}

async function handleAnalyze() {
  if (isAnalyzing.value) return;
  cancelBackgroundAnalyzeWatch();
  isAnalyzing.value = true;
  analyzePhase.value = 'request';
  analyzeError.value = null;
  startAnalyzeTimer();
  const previousDecisionIds = new Set(decisions.value.map((d) => d.id));
  const analyzeStartedAt = Date.now();
  let pendingRun = false;
  logAnalyzeTrace('analyze_start', {
    previousDecisionCount: previousDecisionIds.size,
    currentLatestDecisionId: decisions.value[0]?.id ?? null,
    currentLatestDecisionAt: decisions.value[0]?.createdAt ?? null,
  });

  try {
    try {
      await request(`/api/agents/${id.value}/analyze`, {
        method: 'POST',
        timeout: ANALYZE_REQUEST_TIMEOUT_MS,
      });
      logAnalyzeTrace('analyze_request_ok', { elapsedMs: Date.now() - analyzeStartedAt });
    } catch (err: unknown) {
      const msg = extractAnalyzeError(err).toLowerCase();
      const isAlreadyRunning = msg.includes('already in progress');
      const isTimeout = msg.includes('request timed out') || msg.includes('timed out') || msg.includes('aborted');
      if (isAlreadyRunning || isTimeout) {
        pendingRun = true;
        logAnalyzeTrace('analyze_request_pending', {
          reason: isAlreadyRunning ? 'already_in_progress' : 'request_timeout',
          elapsedMs: Date.now() - analyzeStartedAt,
        });
      } else {
        throw err;
      }
    }

    analyzePhase.value = 'polling';
    const hasNewDecision = await waitForDecisionChange(
      previousDecisionIds,
      pendingRun ? ANALYZE_RESULT_WAIT_ON_PENDING_MS : ANALYZE_RESULT_WAIT_MS,
    );

    analyzePhase.value = 'refreshing';
    await refreshAnalysisOutputs();
    await Promise.all([refreshDoStatus(), fetchLivePrices()]);
    logAnalyzeTrace('analyze_refresh_done', {
      elapsedMs: Date.now() - analyzeStartedAt,
      hasNewDecision,
      latestDecisionId: decisions.value[0]?.id ?? null,
      latestDecisionAt: decisions.value[0]?.createdAt ?? null,
      analysisState: doStatus.value?.analysisState ?? 'idle',
      pendingLlmAgeMs: doStatus.value?.pendingLlmAgeMs ?? null,
    });

    if (!hasNewDecision) {
      analyzeError.value = pendingRun
        ? 'Analysis is still running in the background. No new decision yet — try again in a few seconds.'
        : 'No new decision yet — analysis may still be running. Try again in a few seconds.';
      void startBackgroundDecisionWatch(previousDecisionIds);
    }

    const latest = decisions.value[0];
    if (latest) {
      const level = latest.confidence === 0 ? 'warn' : 'log';
      console[level](`[analyze] decision=${latest.decision} confidence=${latest.confidence} model=${latest.llmModel}\n${latest.reasoning}`);
    }
  } catch (err: unknown) {
    const msg = extractAnalyzeError(err);
    analyzeError.value = msg;
    console.error('[analyze] failed:', msg, err);
    logAnalyzeTrace('analyze_failed', {
      elapsedMs: Date.now() - analyzeStartedAt,
      error: msg,
    });
  } finally {
    stopAnalyzeTimer();
    isAnalyzing.value = false;
    logAnalyzeTrace('analyze_end', {
      elapsedMs: Date.now() - analyzeStartedAt,
      errorShown: analyzeError.value ?? null,
    });
  }
}
async function handleDelete() {
  if (!confirm('Delete this agent?')) return;
  await deleteAgent(id.value);
  router.push('/agents');
}

async function handleClearHistory() {
  if (!agent.value) return;
  if (!confirm('Clear all trades, decisions, and P&L snapshots for this agent? This cannot be undone.')) return;
  clearingHistory.value = true;
  try {
    await clearAgentHistory(id.value);
    trades.value = [];
    decisions.value = [];
    snapshots.value = [];
    // Keep UI in sync with cleared DO state immediately.
    doStatus.value = {
      agentId: id.value,
      status: agent.value.status,
      balance: agent.value.config.paperBalance,
      nextAlarmAt: doStatus.value?.nextAlarmAt ?? null,
    };
    await refreshDoStatus();
  } finally {
    clearingHistory.value = false;
  }
}

async function savePersona(md: string) {
  personaSaving.value = true;
  try {
    await updateAgentPersona(id.value, md);
    personaMd.value = md;
  } finally {
    personaSaving.value = false;
  }
}

async function doResetPersona() {
  personaSaving.value = true;
  try {
    const res = await resetAgentPersona(id.value);
    personaMd.value = res.personaMd;
  } finally {
    personaSaving.value = false;
  }
}
function winRateClass(rate: number): 'positive' | 'negative' | 'neutral' {
  if (rate === 0) return 'neutral';
  return rate >= 50 ? 'positive' : 'negative';
}
function formatUsdNoNegativeZero(value: number, digits = 0): string {
  const abs = Math.abs(value);
  const effectiveDigits = digits === 0 && abs < 1 ? 2 : digits;
  const roundingUnit = 10 ** (-effectiveDigits);
  const roundsToZero = abs < 0.5 * roundingUnit;
  const normalized = Object.is(value, -0) || roundsToZero ? 0 : value;
  if (normalized < 0) return `$-${Math.abs(normalized).toFixed(effectiveDigits)}`;
  return `$${normalized.toFixed(effectiveDigits)}`;
}
</script>

<template>
  <main class="page">
    <div v-if="loading" class="page-loader">
      <div class="page-loader-track">
        <span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" />
        <span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" />
      </div>
      <span class="page-loader-label">Loading agent</span>
    </div>

    <div v-else-if="loadError" style="text-align: center; padding: 64px;">
      <div class="api-error-banner" style="display: inline-flex; max-width: 500px;">
        <span class="error-icon">!</span>
        <span>{{ loadError }}</span>
        <button class="btn btn-ghost btn-sm" @click="loadAll">Retry</button>
      </div>
    </div>

    <template v-else-if="agent">
      <!-- Header -->
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <button class="btn btn-ghost btn-sm" @click="$router.back()">← Back</button>
            <h1 class="page-title">
              <span v-if="personaEmoji" class="agent-emoji" style="margin-right: 6px;">{{ personaEmoji }}</span>
              {{ agent.name }}
            </h1>
            <span class="badge" :class="`badge-${agent.status}`">{{ agent.status }}</span>
          </div>
          <p class="page-subtitle">
            {{ agent.llmModel.split('/')[1] ?? agent.llmModel }} · {{ formatInterval(agent.config.analysisInterval) }} interval · temp {{ (agent.config.temperature ?? 0.7).toFixed(1) }}
            <span v-if="livePricesLoading" class="mono" style="opacity: 0.7;"> · fetching live prices…</span>
            <span v-else-if="livePricesError" class="mono" style="opacity: 0.7;"> · live price unavailable</span>
          </p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <AgentFundPanel :agent-id="agent.id" :current-balance="agent.config.paperBalance" @done="(bal) => { if (agent) agent.config.paperBalance = bal; }" />
          <button
            class="btn btn-sm"
            :class="isAnalyzing ? 'btn-analyze-active' : 'btn-ghost'"
            :disabled="isAnalyzing"
            @click="handleAnalyze"
            title="Run one analysis cycle immediately — fetches market data, computes indicators, calls LLM for decision"
          >
            <span v-if="isAnalyzing" class="analyze-pulse" />
            <span v-if="isAnalyzing" class="analyze-status-text">{{ analyzeStatusText }}</span>
            <template v-else>⚡ Run Analysis</template>
          </button>
          <button v-if="agent.status !== 'running'" class="btn btn-success btn-sm" @click="handleStart">
            ▶ Start
          </button>
          <div ref="menuRef" style="position: relative;">
            <button class="btn btn-ghost btn-sm" @click.stop="menuOpen = !menuOpen" title="More actions">•••</button>
            <div v-if="menuOpen" class="agent-dot-menu">
              <NuxtLink :to="`/agents/${id}/edit`" class="agent-dot-menu-item" @click="menuOpen = false">✎ Edit</NuxtLink>
              <button v-if="agent.status === 'running'" class="agent-dot-menu-item" @click="handleStop(); menuOpen = false">■ Stop</button>
              <button class="agent-dot-menu-item" :disabled="clearingHistory" @click="handleClearHistory(); menuOpen = false">{{ clearingHistory ? 'Clearing…' : 'Clear history' }}</button>
              <div class="agent-dot-menu-sep" />
              <button class="agent-dot-menu-item agent-dot-menu-item--danger" @click="handleDelete(); menuOpen = false">Delete</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Analysis error banner -->
      <div v-if="analyzeError" class="api-error-banner" style="margin-bottom: 16px; align-items: flex-start;">
        <span class="error-icon" style="margin-top: 1px;">!</span>
        <div style="flex: 1; min-width: 0;">
          <span v-if="isModelUnavailableError">
            This model is currently unavailable. Choose another model in agent settings, or enable "Try fallback model" if you've set one.
          </span>
          <span v-else>{{ analyzeError }}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <NuxtLink
            v-if="isModelUnavailableError"
            :to="`/agents/${id}/edit`"
            class="btn btn-ghost btn-sm"
            @click="analyzeError = null"
          >
            Select other model
          </NuxtLink>
          <button class="btn btn-ghost btn-sm" @click="analyzeError = null" aria-label="Dismiss">✕</button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="stats-grid" style="margin-bottom: 8px;">
        <div class="stat-card">
          <div class="stat-label">Balance</div>
          <div class="stat-value">
            ${{ displayedBalance.toLocaleString('en', { maximumFractionDigits: 0 }) }}
          </div>
          <div class="stat-change">
            started at ${{ agent.config.paperBalance.toLocaleString() }}
            · in positions {{ formatUsdNoNegativeZero(inPositionsUsd, 0) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total P&amp;L</div>
          <div class="stat-value" :class="realizedPnlUsd > 0 ? 'positive' : realizedPnlUsd < 0 ? 'negative' : 'neutral'">
            {{ formatUsdNoNegativeZero(realizedPnlUsd, 0) }}
          </div>
          <div class="stat-change">
            {{ (Object.is(totalPnlPct, -0) || Math.abs(totalPnlPct) < 0.005 ? 0 : totalPnlPct).toFixed(1) + '% total' }}
            · <span :class="unrealizedPnlUsd > 0 ? 'positive' : unrealizedPnlUsd < 0 ? 'negative' : 'neutral'">{{ formatUsdNoNegativeZero(unrealizedPnlUsd, 0) }} unrealized</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Win Rate</div>
          <div class="stat-value" :class="winRateClass(winRate)">
            {{ winRate.toFixed(1) }}%
          </div>
          <div class="stat-change">{{ closedTrades.length }} closed trades</div>
        </div>
        <div class="stat-card" :class="{ 'stat-card-active': isAnalyzing }">
          <div class="stat-label">Next Analysis</div>
          <div
            class="stat-value mono"
            :class="[
              isAnalyzing ? 'accent' : agent.status === 'running' ? 'positive' : 'neutral',
              { 'next-analysis-imminent': !isAnalyzing && isNextAnalysisImminent },
            ]"
          >
            <template v-if="isAnalyzing">
              <span class="analyze-pulse" style="width: 6px; height: 6px;" />
              running now
            </template>
            <template v-else>
              {{ agent.status === 'running' ? formatCountdown(secondsUntilNextAction) : '—' }}
            </template>
          </div>
          <div class="stat-change">{{ openTrades.length }} of {{ agent.config.maxOpenPositions }} positions open</div>
        </div>
      </div>

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

      <AgentDecisionsLog
        :agent-id="id"
        :decisions="decisions"
        :mod-decision-ids="modDecisionIds"
        :pending-modifications="pendingModifications"
        :approve-modification="approve"
        :reject-modification="reject"
      />

      <!-- PnL Chart temporarily disabled -->
      <div v-if="false && snapshots.length > 1" class="card" style="margin-bottom: 24px;">
        <div class="card-header">P&amp;L History</div>
        <PnLChart :snapshots="snapshots" :initialBalance="agent?.config?.paperBalance ?? 0" />
      </div>

      <AgentPositionsSection
        :agent="agent"
        :closing-trades="closingTrades"
        :close-trade-by-user="closeTradeByUser"
        :decisions="decisions"
        :is-analyzing="isAnalyzing"
        :is-next-analysis-imminent="isNextAnalysisImminent"
        :live-prices="livePrices"
        :pnl-class="pnlClass"
        :seconds-until-next-action="secondsUntilNextAction"
        :trades="trades"
      />


    </template>

  </main>
</template>

<style scoped>
/* ── Three-dot menu ─────────────────────────────────────────────── */

.agent-dot-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 200;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  min-width: 148px;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
}

.agent-dot-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 7px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  text-decoration: none;
  transition: background var(--t-snap), color var(--t-snap);
}

.agent-dot-menu-item:hover:not(:disabled) {
  background: var(--border);
  color: var(--text);
}

.agent-dot-menu-item:disabled {
  opacity: 0.5;
  cursor: default;
}

.agent-dot-menu-item--danger {
  color: var(--red);
}

.agent-dot-menu-item--danger:hover:not(:disabled) {
  background: var(--red-dim);
  color: var(--red);
}

.agent-dot-menu-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

/* ── Analyze button active state ────────────────────────────────── */

.btn-analyze-active {
  background: var(--surface-2, #1a1a2e);
  border: 1px solid var(--accent, #6366f1);
  color: var(--text, #e2e8f0);
  cursor: wait;
  gap: 6px;
  min-width: 180px;
}

.analyze-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #6366f1);
  animation: analyze-blink 1.2s ease-in-out infinite;
  flex-shrink: 0;
}

.analyze-status-text {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  letter-spacing: 0.01em;
}

@keyframes analyze-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Stat card active (during analysis) ─────────────────────────── */

.stat-card-active {
  border-color: var(--accent, #6366f1);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent, #6366f1) 30%, transparent);
}

.accent {
  color: var(--accent, #6366f1);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-autosign-on {
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
  color: var(--accent);
}
</style>
