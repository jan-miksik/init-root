# LLM Prompt Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the trading agent's LLM prompt so it makes higher-quality, better-informed decisions by providing open position context, pre-interpreted signals, and cleaner formatting.

**Architecture:** All changes are in the prompt layer (`prompts.ts`, `llm-router.ts`, `agent-loop.ts`). No DB schema changes. Agent-loop computes new data (signal evaluation, open position summaries) before passing it to the LLM request. `buildAnalysisPrompt` renders the enriched data into text.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers. Key files: `apps/api/src/agents/prompts.ts`, `apps/api/src/agents/agent-loop.ts`, `apps/api/src/services/llm-router.ts`, `apps/api/src/services/indicators.ts`.

---

## Changes overview

1. **Fix portfolio state line** — `Open positions: 2/3% max` → `2 of 3 max | $283 max per trade`
2. **Add open positions section** — entry price, unrealized P&L%, distance to SL/TP
3. **Add pre-interpreted signals** — use existing `evaluateSignals()` + `combineSignals()` output
4. **Format indicators as inline text** — not JSON blob
5. **System prompt: add "hold is valid" principle**
6. **Remove `Active strategies: combined`** — replace with combined signal verdict
7. **Reduce price decimal precision** — 2 decimal places for assets > $1

---

### Task 1: Fix portfolio state display and reduce price precision

**Files:**
- Modify: `apps/api/src/agents/prompts.ts:58-62`

**Step 1: Update the portfolio state section in `buildAnalysisPrompt`**

Replace:
```typescript
return `## Portfolio State
Balance: $${portfolioState.balance.toFixed(2)} USDC
Open positions: ${portfolioState.openPositions}/${config.maxPositionSizePct}% max
Daily P&L: ${portfolioState.dailyPnlPct >= 0 ? '+' : ''}${portfolioState.dailyPnlPct.toFixed(2)}%
Total P&L: ${portfolioState.totalPnlPct >= 0 ? '+' : ''}${portfolioState.totalPnlPct.toFixed(2)}%
```

With:
```typescript
const maxPerTrade = (portfolioState.balance * config.maxPositionSizePct) / 100;
return `## Portfolio State
Balance: $${portfolioState.balance.toFixed(2)} USDC
Open positions: ${portfolioState.openPositions} of ${config.maxOpenPositions} max
Max per trade: ${config.maxPositionSizePct}% ($${maxPerTrade.toFixed(0)})
Daily P&L: ${portfolioState.dailyPnlPct >= 0 ? '+' : ''}${portfolioState.dailyPnlPct.toFixed(2)}%
Total P&L: ${portfolioState.totalPnlPct >= 0 ? '+' : ''}${portfolioState.totalPnlPct.toFixed(2)}%
```

**Step 2: Fix price precision in market data section**

Replace the 6-decimal price line:
```typescript
Price: $${m.priceUsd.toFixed(6)}
```
With smart precision (6 decimals only for micro-cap tokens < $0.01):
```typescript
Price: $${m.priceUsd < 0.01 ? m.priceUsd.toFixed(6) : m.priceUsd.toFixed(2)}
```

**Step 3: Verify build passes**
```bash
cd /Users/janmiksik/Desktop/projects/own/+/heppy-market
npm run build:api 2>&1 | tail -20
```
Expected: no TypeScript errors.

**Step 4: Commit**
```bash
git add apps/api/src/agents/prompts.ts
git commit -m "fix(prompt): fix portfolio state display and price precision"
```

---

### Task 2: Format indicators as inline text and add signal interpretation

**Files:**
- Modify: `apps/api/src/agents/agent-loop.ts:356-401` — compute signals, build inline indicator text
- Modify: `apps/api/src/agents/prompts.ts` — accept `signalSummary` string, remove JSON blob

**Context:** `evaluateSignals(indicators, currentPrice)` and `combineSignals(signals)` already exist in `apps/api/src/services/indicators.ts`. They're never called from agent-loop. We'll call them and pass the result as a pre-formatted string.

**Step 1: Import `evaluateSignals` and `combineSignals` in agent-loop.ts**

At the top of `agent-loop.ts`, find:
```typescript
import { computeIndicators } from '../services/indicators.js';
```
Replace with:
```typescript
import { computeIndicators, evaluateSignals, combineSignals } from '../services/indicators.js';
```

**Step 2: After computing `indicatorSummary` in agent-loop.ts, compute signals and build inline text**

After the `indicatorSummary` block (after line ~390), replace the entire `if (indicators) { ... } else { ... }` block with:

```typescript
let indicatorText = 'No OHLCV data available — indicators skipped';
if (indicators) {
  const lastRsi = indicators.rsi?.at(-1);
  const lastEma9 = indicators.ema9?.at(-1);
  const lastEma21 = indicators.ema21?.at(-1);
  const lastMacd = indicators.macd?.at(-1);
  const lastBb = indicators.bollingerBands?.at(-1);

  const parts: string[] = [];

  if (lastRsi !== undefined) {
    const rsiLabel = lastRsi < 30 ? 'oversold' : lastRsi > 70 ? 'overbought' : 'neutral';
    parts.push(`RSI: ${lastRsi.toFixed(1)} (${rsiLabel})`);
  }
  if (lastEma9 !== undefined && lastEma21 !== undefined) {
    const trend = lastEma9 > lastEma21 ? 'bullish' : 'bearish';
    parts.push(`EMA9/21: ${trend} (${lastEma9.toFixed(2)} / ${lastEma21.toFixed(2)})`);
  }
  if (lastMacd?.MACD !== undefined && lastMacd?.signal !== undefined) {
    const hist = lastMacd.MACD - lastMacd.signal;
    const macdLabel = hist > 0 ? 'bullish' : 'bearish';
    parts.push(`MACD: ${macdLabel} (histogram ${hist > 0 ? '+' : ''}${hist.toFixed(4)})`);
  }
  if (lastBb !== undefined) {
    const bandWidth = lastBb.upper - lastBb.lower;
    if (bandWidth > 0) {
      const pb = (priceUsd - lastBb.lower) / bandWidth;
      const bbLabel = pb < 0.2 ? 'near lower band' : pb > 0.8 ? 'near upper band' : 'mid-range';
      parts.push(`Bollinger %B: ${pb.toFixed(2)} (${bbLabel})`);
    }
  }

  // Pre-interpreted signal verdict
  const signals = evaluateSignals(indicators, priceUsd);
  const combined = combineSignals(signals);
  parts.push(`Signal: ${combined.signal.toUpperCase()} (${(combined.confidence * 100).toFixed(0)}% conf) — ${combined.reason}`);

  indicatorText = parts.join('\n');
}
```

Also update the `marketData.push(...)` call to use `indicatorText` instead of `indicatorSummary`:
```typescript
marketData.push({
  pair: pairName,
  pairAddress,
  dexScreenerUrl: `https://dexscreener.com/base/${pairAddress}`,
  priceUsd,
  priceChange,
  volume24h,
  liquidity,
  indicatorText,  // ← renamed from indicators
});
```

**Step 3: Update the market data type in agent-loop.ts**

At line ~245, update the `marketData` array type:
```typescript
const marketData: Array<{
  pair: string;
  pairAddress: string;
  dexScreenerUrl: string;
  priceUsd: number;
  priceChange: Record<string, number | undefined>;
  volume24h?: number;
  liquidity?: number;
  indicatorText: string;  // ← was: indicators?: Record<string, unknown>
}> = [];
```

**Step 4: Update `TradeDecisionRequest` in `llm-router.ts:32-39`**

```typescript
marketData: Array<{
  pair: string;
  priceUsd: number;
  priceChange: Record<string, number | undefined>;
  volume24h?: number;
  liquidity?: number;
  indicatorText: string;  // ← was: indicators?: Record<string, unknown>
}>;
```

**Step 5: Update `buildAnalysisPrompt` params type and rendering in `prompts.ts`**

In the params type:
```typescript
marketData: {
  pair: string;
  priceUsd: number;
  priceChange: Record<string, number | undefined>;
  volume24h?: number;
  liquidity?: number;
  indicatorText: string;  // ← was: indicators?: Record<string, unknown>
}[];
```

In the template, replace:
```typescript
${
  m.indicators
    ? `Indicators: ${JSON.stringify(m.indicators, null, 2)}`
    : ''
}
```
With:
```typescript
${m.indicatorText}
```

Also remove `Active strategies` line from constraints and add signal info is already in indicator text:
```typescript
## Constraints
Allowed pairs: ${config.pairs.join(', ')}
Max position size: ${config.maxPositionSizePct}% of balance
Max open positions: ${config.maxOpenPositions}
Stop loss: ${config.stopLossPct}%
Take profit: ${config.takeProfitPct}%
```
(Remove the `Active strategies: ...` line entirely.)

**Step 6: Verify build passes**
```bash
cd /Users/janmiksik/Desktop/projects/own/+/heppy-market
npm run build:api 2>&1 | tail -30
```
Expected: no TypeScript errors.

**Step 7: Commit**
```bash
git add apps/api/src/agents/agent-loop.ts apps/api/src/agents/prompts.ts apps/api/src/services/llm-router.ts
git commit -m "feat(prompt): inline indicator text with pre-interpreted signal verdict"
```

---

### Task 3: Add open positions section to the prompt

**Goal:** LLM sees each open position with entry price, unrealized P&L, and distance to SL/TP — so it can make intelligent `close` decisions and avoid doubling down.

**Files:**
- Modify: `apps/api/src/agents/agent-loop.ts:526-546` — pass open positions to request
- Modify: `apps/api/src/services/llm-router.ts:24-52` — add `openPositions` to request type
- Modify: `apps/api/src/agents/prompts.ts` — render open positions section

**Step 1: Add `openPositions` to `TradeDecisionRequest` in `llm-router.ts`**

```typescript
export interface TradeDecisionRequest {
  autonomyLevel: 'full' | 'guided' | 'strict';
  portfolioState: { ... };
  openPositions: Array<{
    pair: string;
    side: 'buy' | 'sell';
    entryPrice: number;
    amountUsd: number;
    unrealizedPct: number;   // (currentPrice - entryPrice) / entryPrice * 100 for buys
    currentPrice: number;
    openedAt: string;
    slPct: number;
    tpPct: number;
  }>;
  marketData: Array<{ ... }>;
  ...
}
```

**Step 2: Compute `openPositions` in agent-loop.ts before the LLM call**

Right before `decision = await getTradeDecision(...)`, build the open positions summary:

```typescript
const openPositionsSummary = engine.openPositions.map((pos) => {
  // Use current price from marketData if available, otherwise fall back to entry
  const currentPriceData = marketData.find((m) => m.pair === pos.pair);
  const currentPrice = currentPriceData?.priceUsd ?? pos.entryPrice;
  const unrealizedPct =
    pos.side === 'buy'
      ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
  return {
    pair: pos.pair,
    side: pos.side,
    entryPrice: pos.entryPrice,
    amountUsd: pos.amountUsd,
    unrealizedPct,
    currentPrice,
    openedAt: pos.openedAt,
    slPct: config.stopLossPct,
    tpPct: config.takeProfitPct,
  };
});
```

Then in the `getTradeDecision` call, add:
```typescript
openPositions: openPositionsSummary,
```

**Step 3: Update `buildAnalysisPrompt` params type in `prompts.ts`**

Add to the params:
```typescript
openPositions: Array<{
  pair: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amountUsd: number;
  unrealizedPct: number;
  currentPrice: number;
  openedAt: string;
  slPct: number;
  tpPct: number;
}>;
```

**Step 4: Add rendering logic in `buildAnalysisPrompt`**

After the portfolio state block and before `## Market Data`, insert:

```typescript
${openPositions.length > 0 ? `
## Open Positions
${openPositions.map((p) => {
  const slPrice = p.side === 'buy'
    ? p.entryPrice * (1 - p.slPct / 100)
    : p.entryPrice * (1 + p.slPct / 100);
  const tpPrice = p.side === 'buy'
    ? p.entryPrice * (1 + p.tpPct / 100)
    : p.entryPrice * (1 - p.tpPct / 100);
  const pnlSign = p.unrealizedPct >= 0 ? '+' : '';
  const hoursOpen = Math.round((Date.now() - new Date(p.openedAt).getTime()) / 3_600_000);
  return `- ${p.pair} ${p.side.toUpperCase()} · entry $${p.entryPrice.toFixed(2)} → now $${p.currentPrice.toFixed(2)} · unrealized ${pnlSign}${p.unrealizedPct.toFixed(2)}% · $${p.amountUsd.toFixed(0)} · ${hoursOpen}h open
  SL at $${slPrice.toFixed(2)} (${p.slPct}% away from entry) | TP at $${tpPrice.toFixed(2)} (${p.tpPct}% away from entry)`;
}).join('\n')}` : ''}
```

**Step 5: Verify build passes**
```bash
cd /Users/janmiksik/Desktop/projects/own/+/heppy-market
npm run build:api 2>&1 | tail -30
```

**Step 6: Commit**
```bash
git add apps/api/src/agents/agent-loop.ts apps/api/src/agents/prompts.ts apps/api/src/services/llm-router.ts
git commit -m "feat(prompt): add open positions section with unrealized P&L and SL/TP targets"
```

---

### Task 4: Improve system prompt with "hold is valid" principle

**Files:**
- Modify: `apps/api/src/agents/prompts.ts:14-22`

**Step 1: Update `BASE_AGENT_PROMPT`**

Replace:
```typescript
export const BASE_AGENT_PROMPT = `You are a crypto trading agent operating on Base chain DEXes.

Analyze the provided market data, portfolio state, and recent decision history, then make a trading decision.

Hard constraints (always enforced, cannot be overridden by persona or behavior):
- Only trade pairs explicitly listed in your allowed list
- Always include a confidence value (0.0–1.0) that reflects your actual conviction

Your persona and behavior profile define everything else: your risk appetite, trading style, confidence thresholds, and how much autonomy you exercise. Follow those.`;
```

With:
```typescript
export const BASE_AGENT_PROMPT = `You are a crypto trading agent operating on Base chain DEXes.

Analyze the provided market data, portfolio state, and recent decision history, then make a trading decision.

Hard constraints (always enforced, cannot be overridden by persona or behavior):
- Only trade pairs explicitly listed in your allowed list
- Always include a confidence value (0.0–1.0) that reflects your actual conviction
- A "hold" decision is fully valid and often the best decision — do not trade for the sake of trading
- Only act when multiple signals align. When there is no compelling setup, output hold with high confidence

Your persona and behavior profile define everything else: your risk appetite, trading style, confidence thresholds, and how much autonomy you exercise. Follow those.`;
```

**Step 2: Verify build passes**
```bash
npm run build:api 2>&1 | tail -10
```

**Step 3: Commit**
```bash
git add apps/api/src/agents/prompts.ts
git commit -m "feat(prompt): add hold-is-valid principle to system prompt"
```

---

## Expected final prompt shape

```
[SYSTEM]
You are a crypto trading agent...
Hard constraints: ... hold is valid... only act when signals align...

[USER]
## Portfolio State
Balance: $9457.50 USDC
Open positions: 2 of 3 max
Max per trade: 3% ($284)
Daily P&L: +0.00%
Total P&L: -5.42%

## Open Positions
- WETH/USDC BUY · entry $2030.00 → now $2060.97 · unrealized +1.52% · $283 · 4h open
  SL at $1969.10 (3% away from entry) | TP at $2090.90 (3% away from entry)

## Market Data
### WETH/USDC
Price: $2060.97
24h change: +1.99%
1h change: +0.98%
Volume 24h: $83664.3K
Liquidity: $81.81M
RSI: 57.0 (neutral)
EMA9/21: bullish (2046.03 / 2045.60)
MACD: bullish (histogram +1.5051)
Bollinger %B: 0.64 (mid-range)
Signal: HOLD (60% conf) — Mixed signals — buy score: 1.47, sell score: 0.00

## Recent Decisions (last 2)
- 2026-03-10T13:41: buy (confidence: 0.66)
- 2026-03-10T11:22: buy (confidence: 0.78)

## Constraints
Allowed pairs: WETH/USDC
Max position size: 3% of balance
Max open positions: 3
Stop loss: 3%
Take profit: 3%

## Your Behavior Profile
...

## Your Persona
...

Based on the above data, what is your trading decision?
```
