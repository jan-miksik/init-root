import { drizzle } from 'drizzle-orm/d1';
import { performanceSnapshots, trades } from '../../db/schema.js';
import { generateId, nowIso } from '../../lib/utils.js';
import type { Env } from '../../types/env.js';
import { PaperEngine, type Position } from '../../services/paper-engine.js';

export async function savePerformanceSnapshot(env: Env, agentId: string, engine: PaperEngine): Promise<void> {
  try {
    const db = drizzle(env.DB);
    const closed = engine.closedPositions;
    const totalTrades = closed.length;
    const winRate = engine.getWinRate();
    const realizedPnlUsd = closed.reduce((sum, p) => sum + (p.pnlUsd ?? 0), 0);
    const serialized = engine.serialize();
    const initialBalance = serialized.initialBalance;
    const openAtCost = serialized.positions.reduce((sum, p) => sum + p.amountUsd, 0);
    const balanceAtCost = serialized.balance + openAtCost;
    const totalPnlPct = initialBalance > 0 ? (realizedPnlUsd / initialBalance) * 100 : 0;

    let sharpeRatio: number | null = null;
    if (closed.length >= 5) {
      const pnls = closed.map((t) => t.pnlPct ?? 0);
      const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
      const variance = pnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pnls.length;
      const stddev = Math.sqrt(variance);
      sharpeRatio = stddev > 0 ? mean / stddev : 0;
    }

    let maxDrawdown: number | null = null;
    if (closed.length >= 2) {
      let peak = 0;
      let drawdown = 0;
      let cumPnl = 0;
      for (const t of closed) {
        cumPnl += t.pnlPct ?? 0;
        if (cumPnl > peak) peak = cumPnl;
        const dd = peak - cumPnl;
        if (dd > drawdown) drawdown = dd;
      }
      maxDrawdown = drawdown;
    }

    await db.insert(performanceSnapshots).values({
      id: generateId('snap'),
      agentId,
      balance: balanceAtCost,
      totalPnlPct,
      winRate,
      totalTrades,
      sharpeRatio,
      maxDrawdown,
      snapshotAt: nowIso(),
    });
  } catch (err) {
    console.warn('[TradingAgentDO] Failed to save snapshot:', err);
  }
}

export async function persistTrade(env: Env, position: Position): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .insert(trades)
    .values({
      id: position.id,
      agentId: position.agentId,
      pair: position.pair,
      dex: position.dex,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: position.exitPrice ?? null,
      amountUsd: position.amountUsd,
      pnlPct: position.pnlPct ?? null,
      pnlUsd: position.pnlUsd ?? null,
      confidenceBefore: position.confidenceBefore,
      confidenceAfter: position.confidenceAfter ?? null,
      reasoning: position.reasoning,
      strategyUsed: position.strategyUsed,
      slippageSimulated: position.slippageSimulated,
      status: position.status,
      closeReason: position.closeReason ?? null,
      openedAt: position.openedAt,
      closedAt: position.closedAt ?? null,
    })
    .onConflictDoUpdate({
      target: trades.id,
      set: {
        exitPrice: position.exitPrice ?? null,
        pnlPct: position.pnlPct ?? null,
        pnlUsd: position.pnlUsd ?? null,
        confidenceAfter: position.confidenceAfter ?? null,
        status: position.status,
        closeReason: position.closeReason ?? null,
        closedAt: position.closedAt ?? null,
      },
    });
}
