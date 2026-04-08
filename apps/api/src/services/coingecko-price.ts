import type { Env } from '../types/env.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COINPAPRIKA_BASE = 'https://api.coinpaprika.com/v1';
const CACHE_TTL_SECONDS = 60;
const CHART_CACHE_TTL_SECONDS = 300;
const FETCH_TIMEOUT_MS = 8_000;

const STABLE_QUOTES = new Set(['USD', 'USDC', 'USDBC', 'USDT', 'DAI']);
const SYMBOL_TO_COIN_ID: Record<string, string> = {
  INIT: 'initia',
  INITIA: 'initia',
};
const SYMBOL_TO_PAPRIKA_COIN_ID: Record<string, string> = {
  INIT: 'init-initia',
  INITIA: 'init-initia',
};
const DEMO_FALLBACK_USD_BY_COIN_ID: Record<string, number> = {
  initia: 0.08,
};

type CoinGeckoMarketChartResponse = {
  prices?: Array<[number, number]>;
  total_volumes?: Array<[number, number]>;
};

export type CoinGeckoMarketContext = {
  spotUsd: number;
  hourlyPrices: number[];
  dailyPrices: number[];
  priceChange: Record<string, number | undefined>;
  volume24h?: number;
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function getCoinIdForSymbol(symbol: string): string | null {
  return SYMBOL_TO_COIN_ID[normalizeSymbol(symbol)] ?? null;
}

function isStableQuote(symbol: string): boolean {
  return STABLE_QUOTES.has(normalizeSymbol(symbol));
}

/**
 * For pair-style inputs, resolve a CoinGecko coin id when one side is a stable quote.
 * Example: INIT/USD -> initia
 */
export function resolveCoinGeckoCoinIdForPair(pairName: string): string | null {
  const [leftRaw, rightRaw, ...rest] = pairName.split('/');
  if (rest.length > 0 || !leftRaw || !rightRaw) return null;
  const left = normalizeSymbol(leftRaw);
  const right = normalizeSymbol(rightRaw);

  if (isStableQuote(right)) return getCoinIdForSymbol(left);
  if (isStableQuote(left)) return getCoinIdForSymbol(right);
  return null;
}

/** Fetch spot USD price for a CoinGecko coin id. Returns 0 on failure. */
export async function fetchCoinGeckoSpotUsd(env: Env, coinId: string): Promise<number> {
  const cacheKey = `coingecko:spot:${coinId}:usd`;
  try {
    const cached = await env.CACHE.get(cacheKey, 'text');
    if (cached) {
      const parsed = Number.parseFloat(cached);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // non-fatal
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(
        `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`,
        { headers: { Accept: 'application/json' }, signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) return 0;

    const json = (await response.json()) as Record<string, { usd?: unknown }>;
    const usdRaw = json?.[coinId]?.usd;
    const usd = typeof usdRaw === 'number' ? usdRaw : Number(usdRaw);
    if (!Number.isFinite(usd) || usd <= 0) return 0;

    try {
      await env.CACHE.put(cacheKey, String(usd), { expirationTtl: CACHE_TTL_SECONDS });
    } catch {
      // non-fatal
    }
    return usd;
  } catch {
    return 0;
  }
}

function calcPctChange(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined || previous === undefined || previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function sanitizeSeries(values: Array<[number, number]> | undefined, take: number): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((row) => (Array.isArray(row) ? Number(row[1]) : NaN))
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice(-take);
}

async function fetchCoinGeckoMarketChart(
  env: Env,
  coinId: string,
  days: 2 | 30,
  interval: 'hourly' | 'daily',
): Promise<CoinGeckoMarketChartResponse | null> {
  const cacheKey = `coingecko:chart:${coinId}:usd:${days}d:${interval}`;
  try {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (cached && typeof cached === 'object') return cached as CoinGeckoMarketChartResponse;
  } catch {
    // non-fatal
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(
        `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`,
        { headers: { Accept: 'application/json' }, signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) return null;
    let json = (await response.json()) as CoinGeckoMarketChartResponse;

    // Some coins return empty arrays for explicit interval values.
    // Retry once without interval and let CoinGecko auto-select granularity.
    if ((json.prices?.length ?? 0) === 0) {
      const fallbackController = new AbortController();
      const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), FETCH_TIMEOUT_MS);
      try {
        const fallbackResponse = await fetch(
          `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`,
          { headers: { Accept: 'application/json' }, signal: fallbackController.signal },
        );
        if (fallbackResponse.ok) {
          const fallbackJson = (await fallbackResponse.json()) as CoinGeckoMarketChartResponse;
          if ((fallbackJson.prices?.length ?? 0) > 0) {
            json = fallbackJson;
          }
        }
      } finally {
        clearTimeout(fallbackTimeoutId);
      }
    }

    try {
      await env.CACHE.put(cacheKey, JSON.stringify(json), { expirationTtl: CHART_CACHE_TTL_SECONDS });
    } catch {
      // non-fatal
    }
    return json;
  } catch {
    return null;
  }
}

export async function resolveCoinGeckoMarketContextForPair(env: Env, pairName: string): Promise<CoinGeckoMarketContext | null> {
  const coinId = resolveCoinGeckoCoinIdForPair(pairName);
  if (!coinId) return null;

  const [spotUsd, hourlyChart, dailyChart] = await Promise.all([
    fetchCoinGeckoSpotUsd(env, coinId),
    fetchCoinGeckoMarketChart(env, coinId, 2, 'hourly'),
    fetchCoinGeckoMarketChart(env, coinId, 30, 'daily'),
  ]);

  const hourlyPrices = sanitizeSeries(hourlyChart?.prices, 48);
  const dailyPrices = sanitizeSeries(dailyChart?.prices, 30);
  const current = hourlyPrices.at(-1) ?? dailyPrices.at(-1) ?? (spotUsd > 0 ? spotUsd : undefined);
  const oneHourAgo = hourlyPrices.length >= 2 ? hourlyPrices.at(-2) : undefined;
  const sixHoursAgo = hourlyPrices.length >= 7 ? hourlyPrices.at(-7) : undefined;
  const twentyFourHoursAgo = hourlyPrices.length >= 25
    ? hourlyPrices.at(-25)
    : dailyPrices.length >= 2
    ? dailyPrices.at(-2)
    : undefined;
  const volume24hRaw = hourlyChart?.total_volumes?.at(-1)?.[1] ?? dailyChart?.total_volumes?.at(-1)?.[1];
  const volume24h = typeof volume24hRaw === 'number' && Number.isFinite(volume24hRaw) && volume24hRaw > 0
    ? volume24hRaw
    : undefined;

  return {
    spotUsd,
    hourlyPrices,
    dailyPrices,
    priceChange: {
      m5: undefined,
      h1: calcPctChange(current, oneHourAgo),
      h6: calcPctChange(current, sixHoursAgo),
      h24: calcPctChange(current, twentyFourHoursAgo),
    },
    volume24h,
  };
}

/** Resolve spot USD by pair (e.g. INIT/USD). Returns 0 when unsupported or unavailable. */
export async function resolveCoinGeckoSpotUsdForPair(env: Env, pairName: string): Promise<number> {
  const coinId = resolveCoinGeckoCoinIdForPair(pairName);
  if (!coinId) return 0;
  return fetchCoinGeckoSpotUsd(env, coinId);
}

/**
 * Resolve CoinPaprika coin id when one side is a stable quote.
 * Example: INIT/USD -> init-initia
 */
export function resolveCoinPaprikaCoinIdForPair(pairName: string): string | null {
  const [leftRaw, rightRaw, ...rest] = pairName.split('/');
  if (rest.length > 0 || !leftRaw || !rightRaw) return null;
  const left = normalizeSymbol(leftRaw);
  const right = normalizeSymbol(rightRaw);

  if (isStableQuote(right)) return SYMBOL_TO_PAPRIKA_COIN_ID[left] ?? null;
  if (isStableQuote(left)) return SYMBOL_TO_PAPRIKA_COIN_ID[right] ?? null;
  return null;
}

async function fetchCoinPaprikaTicker(env: Env, coinId: string): Promise<Record<string, unknown> | null> {
  const cacheKey = `coinpaprika:ticker:${coinId}`;
  try {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (cached && typeof cached === 'object') return cached as Record<string, unknown>;
  } catch {
    // non-fatal
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${COINPAPRIKA_BASE}/tickers/${encodeURIComponent(coinId)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) return null;
    const json = (await response.json()) as Record<string, unknown>;
    try {
      await env.CACHE.put(cacheKey, JSON.stringify(json), { expirationTtl: CACHE_TTL_SECONDS });
    } catch {
      // non-fatal
    }
    return json;
  } catch {
    return null;
  }
}

function toIsoStart(nowMs: number, durationMs: number): string {
  return new Date(nowMs - durationMs).toISOString();
}

async function fetchCoinPaprikaPriceSeries(
  env: Env,
  coinId: string,
  interval: '1h' | '24h',
  points: number,
): Promise<number[]> {
  // CoinPaprika free plan limits hourly historical window to ~24h.
  const effectivePoints = interval === '1h' ? Math.min(points, 24) : points;
  const cacheKey = `coinpaprika:historical:${coinId}:${interval}:${effectivePoints}`;
  try {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (Array.isArray(cached)) {
      return cached.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
    }
  } catch {
    // non-fatal
  }

  try {
    const now = Date.now();
    const stepMs = interval === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const start = toIsoStart(now, stepMs * Math.max(effectivePoints - 1, 1));
    const url =
      `${COINPAPRIKA_BASE}/tickers/${encodeURIComponent(coinId)}/historical` +
      `?start=${encodeURIComponent(start)}&interval=${interval}&quote=usd`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) return [];

    const rows = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return [];

    const series = rows
      .map((row) => Number(row.price))
      .filter((v) => Number.isFinite(v) && v > 0)
      .slice(-effectivePoints);
    if (series.length > 0) {
      try {
        await env.CACHE.put(cacheKey, JSON.stringify(series), { expirationTtl: CHART_CACHE_TTL_SECONDS });
      } catch {
        // non-fatal
      }
    }
    return series;
  } catch {
    return [];
  }
}

function getCoinPaprikaUsdQuote(ticker: Record<string, unknown> | null): Record<string, unknown> | null {
  const quotesRaw = ticker?.quotes;
  if (!quotesRaw || typeof quotesRaw !== 'object') return null;
  const usdRaw = (quotesRaw as Record<string, unknown>).USD;
  if (!usdRaw || typeof usdRaw !== 'object') return null;
  return usdRaw as Record<string, unknown>;
}

export async function resolveCoinPaprikaSpotUsdForPair(env: Env, pairName: string): Promise<number> {
  const coinId = resolveCoinPaprikaCoinIdForPair(pairName);
  if (!coinId) return 0;
  const ticker = await fetchCoinPaprikaTicker(env, coinId);
  const quote = getCoinPaprikaUsdQuote(ticker);
  const spot = Number(quote?.price);
  return Number.isFinite(spot) && spot > 0 ? spot : 0;
}

export async function resolveCoinPaprikaMarketContextForPair(
  env: Env,
  pairName: string,
): Promise<CoinGeckoMarketContext | null> {
  const coinId = resolveCoinPaprikaCoinIdForPair(pairName);
  if (!coinId) return null;

  const [ticker, hourlyPrices, dailyPrices] = await Promise.all([
    fetchCoinPaprikaTicker(env, coinId),
    fetchCoinPaprikaPriceSeries(env, coinId, '1h', 48),
    fetchCoinPaprikaPriceSeries(env, coinId, '24h', 30),
  ]);

  const quote = getCoinPaprikaUsdQuote(ticker);
  const spotUsd = Number(quote?.price);
  const safeSpot = Number.isFinite(spotUsd) && spotUsd > 0 ? spotUsd : 0;
  const current = hourlyPrices.at(-1) ?? dailyPrices.at(-1) ?? (safeSpot > 0 ? safeSpot : undefined);
  const oneHourAgo = hourlyPrices.length >= 2 ? hourlyPrices.at(-2) : undefined;
  const sixHoursAgo = hourlyPrices.length >= 7 ? hourlyPrices.at(-7) : undefined;
  const twentyFourHoursAgo = hourlyPrices.length >= 25
    ? hourlyPrices.at(-25)
    : dailyPrices.length >= 2
    ? dailyPrices.at(-2)
    : undefined;

  const pct1h = Number(quote?.percent_change_1h);
  const pct24h = Number(quote?.percent_change_24h);
  const volume24hRaw = Number(quote?.volume_24h);
  const volume24h = Number.isFinite(volume24hRaw) && volume24hRaw > 0 ? volume24hRaw : undefined;

  if (safeSpot <= 0 && hourlyPrices.length === 0 && dailyPrices.length === 0) return null;

  return {
    spotUsd: safeSpot,
    hourlyPrices,
    dailyPrices,
    priceChange: {
      m5: undefined,
      h1: Number.isFinite(pct1h) ? pct1h : calcPctChange(current, oneHourAgo),
      h6: calcPctChange(current, sixHoursAgo),
      h24: Number.isFinite(pct24h) ? pct24h : calcPctChange(current, twentyFourHoursAgo),
    },
    volume24h,
  };
}

/**
 * Demo-only safety net for stable-quoted pairs when external providers are unavailable.
 * Returns 0 for unsupported pairs.
 */
export function resolveDemoFallbackSpotUsdForPair(pairName: string): number {
  const coinId = resolveCoinGeckoCoinIdForPair(pairName);
  if (!coinId) return 0;
  const price = DEMO_FALLBACK_USD_BY_COIN_ID[coinId];
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function buildDemoSeries(spot: number, points: number, stepAmplitudePct: number): number[] {
  if (!Number.isFinite(spot) || spot <= 0 || points <= 0) return [];
  return Array.from({ length: points }, (_, i) => {
    const wave = Math.sin(i / 4) * stepAmplitudePct + Math.cos(i / 9) * (stepAmplitudePct * 0.6);
    const drift = ((i - points / 2) / points) * (stepAmplitudePct * 0.25);
    const pct = wave + drift;
    return spot * (1 + pct / 100);
  }).map((v) => (v > 0 ? v : spot));
}

export function resolveDemoMarketContextForPair(pairName: string): CoinGeckoMarketContext | null {
  const spotUsd = resolveDemoFallbackSpotUsdForPair(pairName);
  if (spotUsd <= 0) return null;

  const hourlyPrices = buildDemoSeries(spotUsd, 48, 1.1);
  const dailyPrices = buildDemoSeries(spotUsd, 30, 2.6);
  const current = hourlyPrices.at(-1) ?? spotUsd;
  return {
    spotUsd,
    hourlyPrices,
    dailyPrices,
    priceChange: {
      m5: undefined,
      h1: calcPctChange(current, hourlyPrices.at(-2)),
      h6: calcPctChange(current, hourlyPrices.at(-7)),
      h24: calcPctChange(current, hourlyPrices.at(-25)),
    },
    volume24h: undefined,
  };
}
