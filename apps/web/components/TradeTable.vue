<script setup lang="ts">
import type { Trade } from '~/composables/useTrades';

const props = defineProps<{
  trades: Trade[];
  showAgent?: boolean;
}>();

const { formatPnl, pnlClass, closeTrade } = useTrades();
const expandedRows = ref<Set<string>>(new Set());
const closing = ref<Set<string>>(new Set());

type SortKey = 'pair' | 'amountUsd' | 'confidenceBefore' | 'pnlPct' | 'pnlUsd' | 'openedAt';
type SortDir = 'asc' | 'desc';

const sortKey = ref<SortKey | null>(null);
const sortDir = ref<SortDir>('desc');

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'desc';
  }
}

function sortIcon(key: SortKey) {
  if (sortKey.value !== key) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

const sortedTrades = computed(() => {
  if (!sortKey.value) return props.trades;
  return [...props.trades].sort((a, b) => {
    const k = sortKey.value!;
    const av = (a as any)[k] ?? (k === 'pnlPct' || k === 'pnlUsd' ? -Infinity : '');
    const bv = (b as any)[k] ?? (k === 'pnlPct' || k === 'pnlUsd' ? -Infinity : '');
    const dir = sortDir.value === 'asc' ? 1 : -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
});

function toggleRow(id: string) {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id);
  } else {
    expandedRows.value.add(id);
  }
}

async function onCloseClick(ev: MouseEvent, trade: Trade) {
  ev.stopPropagation();
  if (trade.status !== 'open') return;
  if (closing.value.has(trade.id)) return;
  closing.value.add(trade.id);
  try {
    await closeTrade(trade.id);
  } finally {
    closing.value.delete(trade.id);
  }
}

function formatPrice(p: number) {
  return p >= 1 ? p.toLocaleString('en', { maximumFractionDigits: 4 }) : p.toPrecision(5);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPnlUsd(usd?: number) {
  if (usd === undefined || usd === null) return '—';
  const sign = usd >= 0 ? '+' : '';
  return `${sign}$${Math.abs(usd).toFixed(2)}`;
}
</script>

<template>
  <div class="table-wrap">
    <table class="tt">
      <thead>
        <tr>
          <th class="tt-col-expand"></th>
          <th v-if="showAgent" class="tt-col-agent">Agent</th>
          <th class="sortable" @click="toggleSort('pair')">Pair <span class="sort-icon">{{ sortIcon('pair') }}</span></th>
          <th>Side</th>
          <th>Entry</th>
          <th>Exit</th>
          <th class="sortable" @click="toggleSort('amountUsd')">Amt <span class="sort-icon">{{ sortIcon('amountUsd') }}</span></th>
          <th class="sortable" @click="toggleSort('confidenceBefore')">Conf <span class="sort-icon">{{ sortIcon('confidenceBefore') }}</span></th>
          <th class="sortable" @click="toggleSort('pnlPct')">P&amp;L % <span class="sort-icon">{{ sortIcon('pnlPct') }}</span></th>
          <th class="sortable" @click="toggleSort('pnlUsd')">P&amp;L $ <span class="sort-icon">{{ sortIcon('pnlUsd') }}</span></th>
          <th>Status</th>
          <th class="sortable" @click="toggleSort('openedAt')">Opened <span class="sort-icon">{{ sortIcon('openedAt') }}</span></th>
          <th class="tt-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="sortedTrades.length === 0">
          <td :colspan="showAgent ? 13 : 12" style="text-align: center; padding: 32px; color: var(--text-muted);">
            No trades yet
          </td>
        </tr>
        <template v-for="trade in sortedTrades" :key="trade.id">
          <tr class="tt-row" @click="toggleRow(trade.id)">
            <td class="tt-cell-expand">
              {{ expandedRows.has(trade.id) ? '▼' : '▶' }}
            </td>
            <td v-if="showAgent" class="tt-cell-agent">
              <NuxtLink
                :to="`/agents/${trade.agentId}`"
                class="agent-link mono tt-agent-name"
                :title="trade.agentName ?? trade.agentId"
                @click.stop
              >
                {{ trade.agentName ?? trade.agentId }}
              </NuxtLink>
            </td>
            <td class="mono">{{ trade.pair }}</td>
            <td>
              <span class="badge" :class="`badge-${trade.side}`">{{ trade.side }}</span>
            </td>
            <td class="mono">${{ formatPrice(trade.entryPrice) }}</td>
            <td class="mono">
              {{ trade.exitPrice ? '$' + formatPrice(trade.exitPrice) : '—' }}
            </td>
            <td class="mono">${{ trade.amountUsd.toLocaleString() }}</td>
            <td class="mono" :class="trade.confidenceBefore >= 0.7 ? 'positive' : 'neutral'" style="font-size: 12px;">
              {{ (trade.confidenceBefore * 100).toFixed(0) }}%
            </td>
            <td class="mono" :class="pnlClass(trade.pnlPct)">
              {{ formatPnl(trade.pnlPct) }}
            </td>
            <td class="mono" :class="pnlClass(trade.pnlUsd)">
              {{ formatPnlUsd(trade.pnlUsd) }}
            </td>
            <td>
              <span
                class="badge"
                :class="trade.status === 'open' ? 'badge-running' : 'badge-stopped'"
              >
                {{ trade.status === 'open' ? 'OPEN' : 'CLOSED' }}
              </span>
            </td>
            <td class="tt-cell-date">{{ formatDate(trade.openedAt) }}</td>
            <td class="tt-cell-actions">
              <button
                v-if="trade.status === 'open'"
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="closing.has(trade.id)"
                @click="(ev) => onCloseClick(ev, trade)"
              >
                {{ closing.has(trade.id) ? 'Closing…' : 'Close' }}
              </button>
              <span v-else style="color: var(--text-muted); font-size: 12px;">—</span>
            </td>
          </tr>
          <tr v-if="expandedRows.has(trade.id)" class="tt-detail-row">
            <td :colspan="showAgent ? 13 : 12">
              <div class="tt-detail">
                <div class="tt-detail-meta">
                  <span v-if="trade.strategyUsed" class="tt-meta-tag">{{ trade.strategyUsed }}</span>
                  <span v-if="trade.closeReason" class="tt-meta-tag tt-meta-tag--reason">{{ trade.closeReason.replace(/_/g, ' ') }}</span>
                  <span v-if="trade.dex" class="tt-meta-tag">{{ trade.dex }}</span>
                </div>
                <div class="tt-detail-reasoning">
                  <span class="tt-detail-label">Reasoning</span>
                  {{ trade.reasoning }}
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* ── Table structure ─────────────────────────────────── */
.tt { table-layout: fixed; }

.tt-col-expand { width: 24px; }
.tt-col-agent  { width: 140px; }
.tt-col-actions { width: 80px; text-align: right; }

.tt-row { cursor: pointer; }

.tt-cell-expand {
  color: var(--text-muted);
  font-size: 10px;
  width: 24px;
  padding-left: 8px;
  padding-right: 0;
}

/* ── Agent name truncation ───────────────────────────── */
.tt-cell-agent { max-width: 0; }

.tt-agent-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  font-size: 11px;
}

.tt-cell-date {
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.tt-cell-actions { text-align: right; }

/* ── Sorting ─────────────────────────────────────────── */
.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sortable:hover { color: var(--text); }
.sort-icon {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: 2px;
}

/* ── Agent link ──────────────────────────────────────── */
.agent-link {
  color: var(--accent);
  text-decoration: none;
}
.agent-link:hover { text-decoration: underline; }

/* ── Expanded detail row ─────────────────────────────── */
.tt-detail-row td {
  background: var(--bg-secondary, #1a1a2e);
  padding: 0;
  border-bottom: 1px solid var(--border);
}

.tt-detail {
  padding: 10px 16px 12px;
}

.tt-detail-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.tt-meta-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.tt-meta-tag--reason {
  border-color: var(--accent-dim);
  color: var(--accent);
}

.tt-detail-reasoning {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  white-space: pre-wrap;
}

.tt-detail-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin-bottom: 4px;
}
</style>
