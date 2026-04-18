// Market data KV cache TTL — intentionally matches the default 1h analysis interval.
// Any value shorter than the alarm interval guarantees a KV write every tick (cache always expired).
// Free CF plan: 1k KV writes/day. At 1h TTL, writes = unique pairs × 24, not agents × ticks.
export const MARKET_DATA_CACHE_TTL_SECONDS = 3_600; // 1 hour (was 900 = 15 min)
export const TOP_PAIRS_CACHE_TTL_SECONDS = 3_600;   // 1 hour (was 300 = 5 min)
export const HOT_CACHE_TTL_MS = 60_000;             // 1 min in-process L1 (was 20s)

// CoinGecko fallback — these are slower-moving prices, longer TTL is fine
export const COINGECKO_SPOT_CACHE_TTL_SECONDS = 3_600;  // 1 hour (was 60s)
export const COINGECKO_CHART_CACHE_TTL_SECONDS = 3_600; // 1 hour (was 300s)

// Dashboard chart display — user-triggered, separate key from agent OHLCV.
// Agents write to gecko:ohlcv:* every tick (drives KV budget math above).
// Chart display writes to gecko:ohlcv-full:* only on user page visits, so
// a shorter TTL here is fine and keeps charts fresher without blowing the budget.
export const CHART_DISPLAY_CACHE_TTL_SECONDS = 300; // 5 min
