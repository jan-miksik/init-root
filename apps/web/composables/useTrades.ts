/**
 * Trades composable — fetch trade history and stats.
 */

import { TRADES_LIST_PREFIX, TRADES_STATS_KEY } from './cacheKeys';

const TRADES_TTL = 15 * 60 * 1000; // 15 min

function tradesKey(params?: { status?: string; limit?: number; isPaper?: boolean }): string {
  const paperKey = params?.isPaper === undefined ? 'all' : params.isPaper ? 'paper' : 'real';
  return `${TRADES_LIST_PREFIX}${params?.status ?? ''}:${params?.limit ?? ''}:${paperKey}`;
}

export interface Trade {
  id: string;
  agentId: string;
  agentName?: string;
  isPaper?: boolean;
  pair: string;
  dex: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  amountUsd: number;
  pnlPct?: number;
  pnlUsd?: number;
  confidenceBefore: number;
  reasoning: string;
  strategyUsed: string;
  status: 'open' | 'closed';
  closeReason?: 'stop_loss' | 'take_profit' | 'manual' | 'llm_decision';
  openedAt: string;
  closedAt?: string;
}

export interface TradeStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlPct: number;
}

export function useTrades() {
  const { request } = useApi();
  const cache = useClientCache();

  const trades = ref<Trade[]>([]);
  const stats = ref<TradeStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchTrades(
    params?: {
      status?: string;
      limit?: number;
      isPaper?: boolean;
    },
    opts?: { force?: boolean }
  ) {
    loading.value = true;
    error.value = null;
    try {
      const key = tradesKey(params);
      const cached = opts?.force ? null : cache.get<{ trades: Trade[] }>(key);
      if (cached && !opts?.force) {
        trades.value = cached.trades;
        return;
      }
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.isPaper !== undefined) query.set('isPaper', String(params.isPaper));
      const qs = query.toString() ? `?${query.toString()}` : '';
      const res = await request<{ trades: Trade[] }>(`/api/trades${qs}`);
      cache.set(key, res, TRADES_TTL);
      trades.value = res.trades;
    } catch (e) {
      error.value = extractApiError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchStats(opts?: { force?: boolean; isPaper?: boolean }) {
    try {
      const cacheKey = opts?.isPaper === true
        ? `${TRADES_STATS_KEY}:paper`
        : opts?.isPaper === false
          ? `${TRADES_STATS_KEY}:real`
          : TRADES_STATS_KEY;
      const cached = opts?.force ? null : cache.get<TradeStats>(cacheKey);
      if (cached && !opts?.force) {
        stats.value = cached;
        return;
      }
      const qs = opts?.isPaper !== undefined ? `?isPaper=${opts.isPaper}` : '';
      const result = await request<TradeStats>(`/api/trades/stats${qs}`);
      cache.set(cacheKey, result, TRADES_TTL);
      stats.value = result;
    } catch (e) {
      error.value = extractApiError(e);
    }
  }

  async function fetchAgentTrades(agentId: string, opts?: { fresh?: boolean }): Promise<Trade[]> {
    const res = await request<{ trades: Trade[] }>(`/api/agents/${agentId}/trades`, {
      fresh: opts?.fresh,
    });
    return res.trades;
  }

  async function closeTrade(tradeId: string): Promise<Trade> {
    const res = await request<{ ok: boolean; trade: Trade }>(`/api/trades/${tradeId}/close`, {
      method: 'POST',
    });
    cache.invalidate(TRADES_STATS_KEY);
    cache.invalidatePrefix(TRADES_LIST_PREFIX);
    return res.trade;
  }

  function formatPnl(pnl?: number): string {
    if (pnl === undefined || pnl === null) return '—';
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}${pnl.toFixed(2)}%`;
  }

  function pnlClass(pnl?: number): string {
    if (pnl === undefined || pnl === null) return 'neutral';
    return pnl >= 0 ? 'positive' : 'negative';
  }

  return {
    trades,
    stats,
    loading,
    error,
    fetchTrades,
    fetchStats,
    fetchAgentTrades,
    closeTrade,
    formatPnl,
    pnlClass,
  };
}
