/**
 * Trades composable — fetch trade history and stats.
 */

const TRADES_TTL = 15 * 60 * 1000; // 15 min
const STATS_KEY = 'trades:stats';

function tradesKey(params?: { status?: string; limit?: number }): string {
  return `trades:list:${params?.status ?? ''}:${params?.limit ?? ''}`;
}

export interface Trade {
  id: string;
  agentId: string;
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
  status: 'open' | 'closed' | 'stopped_out';
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

  async function fetchTrades(params?: {
    status?: string;
    limit?: number;
  }) {
    loading.value = true;
    error.value = null;
    try {
      const key = tradesKey(params);
      const cached = cache.get<{ trades: Trade[] }>(key);
      if (cached) {
        trades.value = cached.trades;
        return;
      }
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.limit) query.set('limit', String(params.limit));
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

  async function fetchStats() {
    try {
      const cached = cache.get<TradeStats>(STATS_KEY);
      if (cached) {
        stats.value = cached;
        return;
      }
      const result = await request<TradeStats>('/api/trades/stats');
      cache.set(STATS_KEY, result, TRADES_TTL);
      stats.value = result;
    } catch (e) {
      error.value = extractApiError(e);
    }
  }

  async function fetchAgentTrades(agentId: string): Promise<Trade[]> {
    const res = await request<{ trades: Trade[] }>(`/api/agents/${agentId}/trades`);
    return res.trades;
  }

  async function closeTrade(tradeId: string): Promise<Trade> {
    const res = await request<{ ok: boolean; trade: Trade }>(`/api/trades/${tradeId}/close`, {
      method: 'POST',
    });
    cache.invalidate(STATS_KEY);
    cache.invalidatePrefix('trades:list:');
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
