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
    <table>
      <thead>
        <tr>
          <th></th>
          <th v-if="showAgent">Agent</th>
          <th class="sortable" @click="toggleSort('pair')">Pair <span class="sort-icon">{{ sortIcon('pair') }}</span></th>
          <th>Side</th>
          <th>Entry</th>
          <th>Exit</th>
          <th class="sortable" @click="toggleSort('amountUsd')">Amount <span class="sort-icon">{{ sortIcon('amountUsd') }}</span></th>
          <th class="sortable" @click="toggleSort('confidenceBefore')">Conf <span class="sort-icon">{{ sortIcon('confidenceBefore') }}</span></th>
          <th class="sortable" @click="toggleSort('pnlPct')">P&amp;L % <span class="sort-icon">{{ sortIcon('pnlPct') }}</span></th>
          <th class="sortable" @click="toggleSort('pnlUsd')">Gain/Loss <span class="sort-icon">{{ sortIcon('pnlUsd') }}</span></th>
          <th>Strategy</th>
          <th>Status</th>
          <th class="sortable" @click="toggleSort('openedAt')">Opened <span class="sort-icon">{{ sortIcon('openedAt') }}</span></th>
          <th style="width: 110px; text-align: right;">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="sortedTrades.length === 0">
          <td :colspan="showAgent ? 14 : 13" style="text-align: center; padding: 32px; color: var(--text-muted);">
            No trades yet
          </td>
        </tr>
        <template v-for="trade in sortedTrades" :key="trade.id">
          <tr style="cursor: pointer;" @click="toggleRow(trade.id)">
            <td style="color: var(--text-muted); font-size: 11px; width: 16px;">
              {{ expandedRows.has(trade.id) ? '▼' : '▶' }}
            </td>
            <td v-if="showAgent">
              <NuxtLink
                :to="`/agents/${trade.agentId}`"
                class="agent-link mono"
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
            <td style="color: var(--text-muted); font-size: 12px;">{{ trade.strategyUsed }}</td>
            <td>
              <span
                class="badge"
                :class="trade.status === 'open' ? 'badge-running' : 'badge-stopped'"
              >
                <span :class="{ 'close-status': trade.status === 'closed' }">
                  {{ trade.status === 'closed' ? 'CLOSED' : trade.status }}
                </span>
                <span v-if="trade.status === 'closed' && trade.closeReason" class="close-reason">({{ trade.closeReason.replace(/_/g, ' ') }})</span>
              </span>
            </td>
            <td style="color: var(--text-muted); font-size: 12px;">{{ formatDate(trade.openedAt) }}</td>
            <td style="text-align: right;">
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
          <tr v-if="expandedRows.has(trade.id)">
            <td :colspan="showAgent ? 14 : 13" style="background: var(--bg-secondary, #1a1a2e); padding: 12px 16px;">
              <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6; white-space: pre-wrap;">
                <strong style="color: var(--text-primary);">Reasoning:</strong> {{ trade.reasoning }}
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sortable:hover {
  color: var(--text);
}
.sort-icon {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: 2px;
}
.agent-link {
  color: var(--accent);
  text-decoration: none;
}
.agent-link:hover {
  text-decoration: underline;
}
.close-reason {
  font-size: 10px;
  opacity: 0.6;
  margin-left: 3px;
}
.close-status {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
