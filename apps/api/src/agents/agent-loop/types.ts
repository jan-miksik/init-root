export type MarketDataItem = {
  pair: string;
  pairAddress: string;
  dexScreenerUrl: string;
  priceUsd: number;
  priceChange: Record<string, number | undefined>;
  volume24h?: number;
  liquidity?: number;
  indicatorText: string;
  dailyIndicatorText: string;
};

export type RecentDecision = {
  decision: string;
  confidence: number;
  createdAt: string;
};

/**
 * Context saved to DO storage when the LLM job is enqueued.
 * Loaded by /receive-decision to execute the trade once the LLM result arrives.
 */
export type PendingLlmContext = {
  jobId: string;
  enqueuedAt: number;
  marketData: MarketDataItem[];
  pairsToFetch: string[];
  effectiveLlmModel: string;
  maxOpenPositions: number;
  maxPositionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  minConfidence: number;
  dexes: string[];
  strategies: string[];
  slippageSimulation: number;
};
