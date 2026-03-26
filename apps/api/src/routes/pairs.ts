import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env.js';
import {
  createDexDataService,
  filterBaseChainPairs,
} from '../services/dex-data.js';
import { createGeckoTerminalService } from '../services/gecko-terminal.js';
import { resolveCurrentPriceUsd } from '../services/price-resolver.js';
import { validateQuery } from '../lib/validation.js';
import { ValidationError } from '../lib/validation.js';
import { normalizePairForDex } from '../lib/pairs.js';

const pairs = new Hono<{ Bindings: Env }>();

/**
 * GET /api/pairs/gecko-search?q=WETH+USDC
 * Diagnostic: test GeckoTerminal directly and show raw results.
 */
pairs.get('/gecko-search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q param required' }, 400);
  const svc = createGeckoTerminalService(c.env.CACHE);
  try {
    const pools = await svc.searchPools(q);
    return c.json({ query: q, count: pools.length, pools });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

/** GET /api/pairs/search?q=WETH+USDC */
pairs.get('/search', async (c) => {
  const query = validateQuery(c, z.object({ q: z.string().min(1) }));
  const svc = createDexDataService(c.env.CACHE);
  const results = await svc.searchPairs(query.q);
  const basePairs = filterBaseChainPairs(results);

  return c.json({
    query: query.q,
    count: basePairs.length,
    pairs: basePairs,
  });
});

/** GET /api/pairs/top?chain=base — top pairs by 24h volume, cached 5min */
pairs.get('/top', async (c) => {
  const query = validateQuery(
    c,
    z.object({ chain: z.enum(['base']).default('base') })
  );
  const svc = createDexDataService(c.env.CACHE);
  const topPairs = await svc.getTopPairsForChain(query.chain);
  return c.json({
    pairs: topPairs,
    updatedAt: new Date().toISOString(),
  });
});

/**
 * POST /api/pairs/prices
 * Body: { pairs: string[] }
 * Returns:
 * - prices: Record<string, number> keyed by both normalized and input pair labels
 * - normalizedByInput: Record<input, normalized>
 */
pairs.post('/prices', async (c) => {
  const body = await c.req.json().catch(() => null) as unknown;
  const parsed = z.object({ pairs: z.array(z.string().min(1)).min(1).max(50) }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'pairs must be a non-empty string[] (max 50)' }, 400);
  }

  const normalizedByInput: Record<string, string> = {};
  for (const input of parsed.data.pairs) {
    normalizedByInput[input] = normalizePairForDex(input);
  }

  const uniqueNormalized = Array.from(new Set(Object.values(normalizedByInput).filter(Boolean)));

  const entries = await Promise.all(
    uniqueNormalized.map(async (pair) => {
      try {
        const priceUsd = await resolveCurrentPriceUsd(c.env, pair);
        return [pair, priceUsd] as const;
      } catch (err) {
        console.warn('[pairs/prices] failed', pair, err);
        return [pair, 0] as const;
      }
    })
  );

  const pricesByNormalized = Object.fromEntries(entries) as Record<string, number>;
  const prices: Record<string, number> = { ...pricesByNormalized };
  for (const [input, normalized] of Object.entries(normalizedByInput)) {
    prices[input] = pricesByNormalized[normalized] ?? 0;
  }

  return c.json({ prices, normalizedByInput });
});

/**
 * GET /api/pairs/:chain/:address/ohlcv?timeframe=1h&limit=48
 * Returns OHLCV candles for charting. Timeframes: 15m, 1h, 4h, 1d.
 * NOTE: Must be registered BEFORE /:chain/:address to avoid param capture.
 */
pairs.get('/:chain/:address/ohlcv', async (c) => {
  const address = c.req.param('address');
  const tf = (c.req.query('timeframe') ?? '1h') as string;

  const tfMap: Record<string, { api: 'minute' | 'hour' | 'day'; limit: number }> = {
    '15m': { api: 'minute', limit: 96 },   // ~24h of 15m candles
    '1h':  { api: 'hour',   limit: 48 },   // 48h
    '4h':  { api: 'hour',   limit: 96 },   // ~16 days (4h = every 4th hourly candle)
    '1d':  { api: 'day',    limit: 30 },   // 30 days
  };

  const config = tfMap[tf];
  if (!config) return c.json({ error: `Invalid timeframe: ${tf}. Use 15m, 1h, 4h, 1d` }, 400);

  const gecko = createGeckoTerminalService(c.env.CACHE);
  const candles = await gecko.getPoolOHLCV(address, config.limit, config.api);

  // For 4h: downsample hourly candles to 4h buckets
  const result = tf === '4h' ? downsample(candles, 4) : candles;

  return c.json({ candles: result, timeframe: tf });
});

/** GET /api/pairs/:chain/:address */
pairs.get('/:chain/:address', async (c) => {
  const chain = c.req.param('chain');
  const address = c.req.param('address');

  const svc = createDexDataService(c.env.CACHE);
  const results = await svc.getPairsByChain(chain, address);

  if (results.length === 0) {
    return c.json({ error: 'Pair not found' }, 404);
  }

  return c.json({ pair: results[0], allResults: results });
});

/** Downsample hourly candles into N-hour buckets */
function downsample(candles: Array<{ t: number; o: number; h: number; l: number; c: number }>, hours: number) {
  const buckets: typeof candles = [];
  for (let i = 0; i < candles.length; i += hours) {
    const slice = candles.slice(i, i + hours);
    if (slice.length === 0) continue;
    buckets.push({
      t: slice[0].t,
      o: slice[0].o,
      h: Math.max(...slice.map(c => c.h)),
      l: Math.min(...slice.map(c => c.l)),
      c: slice[slice.length - 1].c,
    });
  }
  return buckets;
}

/** GET /api/pairs/token/:address */
pairs.get('/token/:address', async (c) => {
  const address = c.req.param('address');
  const svc = createDexDataService(c.env.CACHE);
  const results = await svc.getTokenPairs(address);
  const basePairs = filterBaseChainPairs(results);

  return c.json({ count: basePairs.length, pairs: basePairs });
});

// Error handler for this router
pairs.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ error: err.message, fieldErrors: err.fieldErrors }, 400);
  }
  console.error('[pairs route]', err);
  return c.json({ error: 'Failed to fetch pair data' }, 502);
});

export default pairs;
