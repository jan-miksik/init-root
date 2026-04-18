import { describe, expect, it } from 'vitest';
import { computeTradeExitBounds, computeTradeUnrealizedPnl, computeTradeUnrealizedPnlUsd } from '../utils/trade-math';

describe('trade math sanitization', () => {
  const baseTrade = {
    id: 'trade-1',
    agentId: 'agent-1',
    pair: 'INIT/USD',
    dex: 'mock-perp-v1',
    side: 'buy' as const,
    entryPrice: 0.093,
    amountUsd: 20,
    confidenceBefore: 0.88,
    reasoning: 'test',
    strategyUsed: 'combined',
    status: 'open' as const,
    openedAt: '2026-04-18T08:00:00.000Z',
  };

  it('computes sane unrealized pnl for a normal position', () => {
    const pnl = computeTradeUnrealizedPnl(baseTrade, 0.1, 0.3);
    expect(pnl).not.toBeNull();
    expect(pnl?.pnlPct).toBeGreaterThan(0);
  });

  it('suppresses unrealized pnl when the entry price is corrupt relative to market', () => {
    const pnl = computeTradeUnrealizedPnl({ ...baseTrade, entryPrice: 1e-15 }, 0.1, 0.3);
    expect(pnl).toBeNull();
    expect(computeTradeUnrealizedPnlUsd({ ...baseTrade, entryPrice: 1e-15 }, 0.1, 0.3)).toBeNull();
  });

  it('suppresses target and stop when the entry price is corrupt', () => {
    const bounds = computeTradeExitBounds({ ...baseTrade, entryPrice: 1e-15 }, 10, 5, 0.1);
    expect(bounds).toBeNull();
  });
});
