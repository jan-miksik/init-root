import type { Trade } from '~/composables/useTrades';

const MAX_TRADE_PRICE_SCALE_RATIO = 1_000_000;

function isPositiveFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasComparablePriceScale(referencePrice: number, marketPrice: number): boolean {
  if (!isPositiveFiniteNumber(referencePrice) || !isPositiveFiniteNumber(marketPrice)) return false;
  return Math.abs(Math.log(referencePrice) - Math.log(marketPrice)) <= Math.log(MAX_TRADE_PRICE_SCALE_RATIO);
}

export function isTradeEntryPriceSane(entryPrice: number, marketPrice?: number | null): boolean {
  if (!isPositiveFiniteNumber(entryPrice)) return false;
  if (!isPositiveFiniteNumber(marketPrice)) return true;
  return hasComparablePriceScale(entryPrice, marketPrice);
}

export function computeTradeExitBounds(
  trade: Pick<Trade, 'entryPrice' | 'side'>,
  takeProfitPct: number,
  stopLossPct: number,
  marketPrice?: number | null,
): { target: number; stop: number } | null {
  if (!isTradeEntryPriceSane(trade.entryPrice, marketPrice)) return null;
  if (trade.side === 'buy') {
    return {
      target: trade.entryPrice * (1 + takeProfitPct / 100),
      stop: trade.entryPrice * (1 - stopLossPct / 100),
    };
  }
  return {
    target: trade.entryPrice * (1 - takeProfitPct / 100),
    stop: trade.entryPrice * (1 + stopLossPct / 100),
  };
}

export function computeTradeUnrealizedPnl(
  trade: Pick<Trade, 'entryPrice' | 'side'>,
  livePrice: number | null | undefined,
  slippageSimulation = 0.3,
): { pnlPct: number; currentPrice: number } | null {
  if (!isPositiveFiniteNumber(livePrice) || !isTradeEntryPriceSane(trade.entryPrice, livePrice)) return null;
  const effectiveEntry = trade.side === 'buy'
    ? trade.entryPrice * (1 + slippageSimulation / 100)
    : trade.entryPrice * (1 - slippageSimulation / 100);
  if (!isPositiveFiniteNumber(effectiveEntry)) return null;
  const pnlPct = trade.side === 'buy'
    ? ((livePrice - effectiveEntry) / effectiveEntry) * 100
    : ((effectiveEntry - livePrice) / effectiveEntry) * 100;
  if (!Number.isFinite(pnlPct)) return null;
  return { pnlPct, currentPrice: livePrice };
}

export function computeTradeUnrealizedPnlUsd(
  trade: Pick<Trade, 'entryPrice' | 'side' | 'amountUsd'>,
  livePrice: number | null | undefined,
  slippageSimulation = 0.3,
): number | null {
  if (!isPositiveFiniteNumber(trade.amountUsd)) return null;
  const pnl = computeTradeUnrealizedPnl(trade, livePrice, slippageSimulation);
  if (!pnl) return null;
  const pnlUsd = (pnl.pnlPct / 100) * trade.amountUsd;
  return Number.isFinite(pnlUsd) ? pnlUsd : null;
}
