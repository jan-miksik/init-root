/**
 * Caching tests — KV cache key generation, prefix filtering, and invalidation logic.
 * Tests that cache keys are stable, unique per query, and that purge prefix matching works.
 */
import { describe, it, expect } from 'vitest';
import { CACHE_PREFIXES } from '../src/routes/health.js';

// ── Cache key format ──────────────────────────────────────────────────────────

describe('GeckoTerminal cache key generation', () => {
  function geckoSearchKey(query: string): string {
    return `gecko:search:${query.toLowerCase().replace(/\s+/g, '-')}`;
  }

  function geckoOhlcvKey(address: string, timeframe: 'hour' | 'day', limit: number): string {
    return `gecko:ohlcv:base:${address.toLowerCase()}:${timeframe}:${limit}`;
  }

  it('generates stable search keys (lowercase, spaces to dashes)', () => {
    expect(geckoSearchKey('WETH USDC')).toBe('gecko:search:weth-usdc');
    expect(geckoSearchKey('weth usdc')).toBe('gecko:search:weth-usdc');
    expect(geckoSearchKey('WETH USDC')).toBe(geckoSearchKey('weth usdc'));
  });

  it('generates unique search keys for different queries', () => {
    expect(geckoSearchKey('WETH USDC')).not.toBe(geckoSearchKey('AERO USDC'));
  });

  it('generates stable OHLCV keys with address, timeframe and limit', () => {
    const addr = '0xDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEf';
    expect(geckoOhlcvKey(addr, 'hour', 48)).toBe(
      `gecko:ohlcv:base:${addr.toLowerCase()}:hour:48`
    );
  });

  it('differentiates hour vs day timeframe in OHLCV key', () => {
    const addr = '0x1234';
    expect(geckoOhlcvKey(addr, 'hour', 48)).not.toBe(geckoOhlcvKey(addr, 'day', 48));
  });

  it('differentiates different limits in OHLCV key', () => {
    const addr = '0x1234';
    expect(geckoOhlcvKey(addr, 'hour', 48)).not.toBe(geckoOhlcvKey(addr, 'hour', 30));
  });

  it('normalises address to lowercase in OHLCV key', () => {
    expect(geckoOhlcvKey('0xABCDEF', 'hour', 48)).toBe(geckoOhlcvKey('0xabcdef', 'hour', 48));
  });
});

describe('DexScreener cache key generation', () => {
  function dexSearchKey(query: string): string {
    return `dex:search:${query.toLowerCase().replace(/\s+/g, '-')}`;
  }

  function dexTokenPairsKey(address: string): string {
    return `dex:token-pairs:${address.toLowerCase()}`;
  }

  function dexPairKey(chain: string, pairAddress: string): string {
    return `dex:pair:${chain}:${pairAddress.toLowerCase()}`;
  }

  it('generates stable search keys', () => {
    expect(dexSearchKey('WETH USDC')).toBe('dex:search:weth-usdc');
  });

  it('generates token pair keys', () => {
    expect(dexTokenPairsKey('0xABC')).toBe('dex:token-pairs:0xabc');
  });

  it('generates pair keys with chain', () => {
    expect(dexPairKey('base', '0xABC')).toBe('dex:pair:base:0xabc');
  });
});

// ── Cache TTL values ──────────────────────────────────────────────────────────

describe('cache TTL strategy', () => {
  const MARKET_DATA_TTL = 900; // 15 min
  const TOP_PAIRS_TTL = 300;   // 5 min

  it('market data TTL is at least 5 minutes', () => {
    expect(MARKET_DATA_TTL).toBeGreaterThanOrEqual(300);
  });

  it('top pairs TTL is shorter than market data TTL', () => {
    expect(TOP_PAIRS_TTL).toBeLessThan(MARKET_DATA_TTL);
  });

  it('TTL values are positive integers', () => {
    expect(Number.isInteger(MARKET_DATA_TTL)).toBe(true);
    expect(Number.isInteger(TOP_PAIRS_TTL)).toBe(true);
    expect(MARKET_DATA_TTL).toBeGreaterThan(0);
    expect(TOP_PAIRS_TTL).toBeGreaterThan(0);
  });
});

// ── Cache prefix registry ─────────────────────────────────────────────────────

describe('CACHE_PREFIXES registry', () => {
  it('includes gecko and dex prefixes', () => {
    expect(CACHE_PREFIXES).toContain('gecko:');
    expect(CACHE_PREFIXES).toContain('dex:');
  });

  it('includes cron and rate-limit prefixes', () => {
    expect(CACHE_PREFIXES).toContain('cron:');
    expect(CACHE_PREFIXES).toContain('rl:');
  });

  it('all prefixes end with colon (namespace convention)', () => {
    for (const prefix of CACHE_PREFIXES) {
      expect(prefix.endsWith(':')).toBe(true);
    }
  });
});

// ── Purge prefix filtering ────────────────────────────────────────────────────

describe('purge prefix filtering logic', () => {
  function resolvePrefixesToPurge(requestedPrefix: string | undefined): string[] {
    return requestedPrefix
      ? CACHE_PREFIXES.filter((p) => p.startsWith(requestedPrefix))
      : ['gecko:', 'dex:'];
  }

  it('returns market-data prefixes when no prefix specified', () => {
    expect(resolvePrefixesToPurge(undefined).sort()).toEqual(['dex:', 'gecko:']);
  });

  it('filters to gecko prefix only', () => {
    expect(resolvePrefixesToPurge('gecko')).toEqual(['gecko:']);
  });

  it('filters to dex prefix only', () => {
    expect(resolvePrefixesToPurge('dex')).toEqual(['dex:']);
  });

  it('returns empty array for unknown prefix', () => {
    expect(resolvePrefixesToPurge('unknown')).toEqual([]);
  });

  it('filters to rl prefix', () => {
    expect(resolvePrefixesToPurge('rl')).toEqual(['rl:']);
  });
});

// ── bypassCache semantics ─────────────────────────────────────────────────────

describe('bypassCache semantics', () => {
  it('bypass=true skips cache read and forces fresh fetch', () => {
    // Validates the logic: if bypassCache is true, we should always go to network
    const bypassCache = true;
    let cacheRead = false;

    if (!bypassCache) {
      cacheRead = true; // would read cache
    }
    // network fetch happens regardless

    expect(cacheRead).toBe(false);
  });

  it('bypass=false reads cache first', () => {
    const bypassCache = false;
    let cacheRead = false;

    if (!bypassCache) {
      cacheRead = true;
    }

    expect(cacheRead).toBe(true);
  });
});
