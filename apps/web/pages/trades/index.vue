<script setup lang="ts">
import { getAgentProfile, DEFAULT_AGENT_PROFILE_ID } from '@something-in-loop/shared';

definePageMeta({ ssr: false });

const TRADE_HISTORY_PAPER_STORAGE_KEY = 'heppy:trades:showPaperAgents';

const { trades, loading, error, fetchTrades } = useTrades();
const { stats, error: realStatsError, fetchStats } = useTrades();
const { stats: paperStats, error: paperStatsError, fetchStats: fetchPaperStats } = useTrades();
const { agents, fetchAgents } = useAgents();

const statusFilter = ref('');
const limitFilter = ref(100);
const storedShowPaper = ref<boolean | null>(null);
const preferencesReady = ref(false);
const agentsReady = ref(false);

const realAgents = computed(() => agents.value.filter((agent) => !agent.isPaper));
const paperAgents = computed(() => agents.value.filter((agent) => agent.isPaper));
const hasRealAgents = computed(() => realAgents.value.length > 0);
const hasPaperAgents = computed(() => paperAgents.value.length > 0);
const showingPaperFallback = computed(() => !hasRealAgents.value && hasPaperAgents.value);
const showPaperTrades = computed(() => (hasRealAgents.value ? (storedShowPaper.value ?? false) : hasPaperAgents.value));
const toggleDisabled = computed(() => showingPaperFallback.value);
const primaryStats = computed(() => (hasRealAgents.value ? stats.value : paperStats.value));
const pageError = computed(() => error.value ?? realStatsError.value ?? paperStatsError.value ?? null);
const showPaperMiniStats = computed(() => hasRealAgents.value && showPaperTrades.value && hasPaperAgents.value);

const agentEmojiMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const agent of agents.value) {
    const configProfileId = (agent.config as { profileId?: string }).profileId;
    const profileId = agent.profileId ?? configProfileId ?? DEFAULT_AGENT_PROFILE_ID;
    map[agent.id] = getAgentProfile(profileId)?.emoji ?? '🤖';
  }
  return map;
});

const tradesSummaryText = computed(() => {
  if (showingPaperFallback.value) return `Showing ${trades.value.length} paper trades`;
  if (showPaperTrades.value) return `Showing ${trades.value.length} real + paper trades`;
  return `Showing ${trades.value.length} real trades`;
});

function readStoredPaperPreference(): boolean | null {
  if (!import.meta.client) return null;
  const raw = localStorage.getItem(TRADE_HISTORY_PAPER_STORAGE_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function saveStoredPaperPreference(value: boolean) {
  if (!import.meta.client) return;
  localStorage.setItem(TRADE_HISTORY_PAPER_STORAGE_KEY, String(value));
}

function setShowPaperTrades(value: boolean) {
  storedShowPaper.value = value;
  saveStoredPaperPreference(value);
}

function winRateClass(rate: number): 'positive' | 'negative' | 'neutral' {
  if (rate === 0) return 'neutral';
  return rate >= 50 ? 'positive' : 'negative';
}

function formatSignedUsd(value: number): string {
  return `${value >= 0 ? '+' : ''}$${value.toFixed(0)}`;
}

function formatSignedPct(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

async function loadTradeData(force = false) {
  if (!preferencesReady.value || !agentsReady.value) return;

  const tradeParams = {
    status: statusFilter.value || undefined,
    limit: limitFilter.value,
    isPaper: showingPaperFallback.value ? true : showPaperTrades.value ? undefined : false,
  };

  const requests: Promise<unknown>[] = [
    fetchTrades(tradeParams, { force }),
  ];

  if (hasRealAgents.value) {
    requests.push(fetchStats({ isPaper: false, force }));
    if (showPaperMiniStats.value) requests.push(fetchPaperStats({ isPaper: true, force }));
  } else if (hasPaperAgents.value) {
    requests.push(fetchPaperStats({ isPaper: true, force }));
  }

  await Promise.all(requests);
}

function onTradeClosed(updatedTrade: (typeof trades.value)[number]) {
  const tradeIndex = trades.value.findIndex((trade) => trade.id === updatedTrade.id);
  if (tradeIndex >= 0) {
    trades.value.splice(tradeIndex, 1, updatedTrade);
  }
  void loadTradeData(true);
}

onMounted(async () => {
  storedShowPaper.value = readStoredPaperPreference();
  preferencesReady.value = true;
  await fetchAgents();
  agentsReady.value = true;
  await loadTradeData();
});

watch([statusFilter, limitFilter, showPaperTrades, hasRealAgents, hasPaperAgents], () => {
  if (!preferencesReady.value || !agentsReady.value) return;
  void loadTradeData();
});
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Trade History</h1>
        <p class="page-subtitle">
          Review real and paper trades together, or hide paper activity when you want a cleaner view.
        </p>
      </div>
    </div>

    <div v-if="primaryStats" class="stats-grid" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-label">Total Trades</div>
        <div class="stat-value">{{ primaryStats.totalTrades }}</div>
        <div class="stat-change">{{ primaryStats.openTrades }} open</div>
        <div v-if="showPaperMiniStats && paperStats" class="stat-change stat-change-secondary">
          paper {{ paperStats.totalTrades }} · {{ paperStats.openTrades }} open
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value" :class="winRateClass(primaryStats.winRate)">
          {{ primaryStats.winRate.toFixed(1) }}%
        </div>
        <div class="stat-change">across closed trades</div>
        <div v-if="showPaperMiniStats && paperStats" class="stat-change stat-change-secondary">
          paper {{ paperStats.winRate.toFixed(1) }}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total P&amp;L</div>
        <div class="stat-value" :class="primaryStats.totalPnlUsd >= 0 ? 'positive' : 'negative'">
          {{ formatSignedUsd(primaryStats.totalPnlUsd) }}
        </div>
        <div class="stat-change">closed trades</div>
        <div v-if="showPaperMiniStats && paperStats" class="stat-change stat-change-secondary">
          paper {{ formatSignedUsd(paperStats.totalPnlUsd) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg P&amp;L</div>
        <div class="stat-value" :class="primaryStats.avgPnlPct >= 0 ? 'positive' : 'negative'">
          {{ formatSignedPct(primaryStats.avgPnlPct) }}
        </div>
        <div class="stat-change">per closed trade</div>
        <div v-if="showPaperMiniStats && paperStats" class="stat-change stat-change-secondary">
          paper {{ formatSignedPct(paperStats.avgPnlPct) }}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="trades-filters">
        <div class="trades-filters__group">
          <label class="form-label" style="margin: 0; white-space: nowrap;">Status:</label>
          <select v-model="statusFilter" class="form-select" style="width: 140px;">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div class="trades-filters__group">
          <label class="form-label" style="margin: 0; white-space: nowrap;">Show:</label>
          <select v-model.number="limitFilter" class="form-select" style="width: 100px;">
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="250">250</option>
            <option :value="500">500</option>
          </select>
        </div>
        <label class="paper-toggle" :class="{ 'paper-toggle--disabled': toggleDisabled }">
          <input
            :checked="showPaperTrades"
            :disabled="toggleDisabled"
            type="checkbox"
            @change="setShowPaperTrades(($event.target as HTMLInputElement).checked)"
          />
          <span>Show paper agents</span>
        </label>
        <span class="trades-filters__summary">{{ tradesSummaryText }}</span>
      </div>
    </div>

    <div v-if="loading" class="page-loader">
      <div class="page-loader-track">
        <span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" />
        <span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" />
      </div>
      <span class="page-loader-label">Loading trades</span>
    </div>
    <div v-else-if="pageError" class="alert alert-error">{{ pageError }}</div>
    <div v-else class="card">
      <TradeTable
        :trades="trades"
        :show-agent="true"
        :agent-emojis="agentEmojiMap"
        @trade-closed="onTradeClosed"
      />
    </div>
  </main>
</template>

<style scoped>
.trades-filters {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.trades-filters__group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trades-filters__summary {
  font-size: 12px;
  color: var(--text-muted);
}

.paper-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}

.paper-toggle--disabled {
  opacity: 0.7;
}

.paper-toggle input {
  width: auto;
}

.stat-change-secondary {
  color: #d97706;
  opacity: 0.85;
}
</style>
