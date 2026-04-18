import { describe, expect, it } from 'vitest';
import { normalizePairForDex } from '../src/lib/pairs.js';

describe('pair normalization', () => {
  it('uses INIT/USD as canonical stable quote form', () => {
    expect(normalizePairForDex('INIT/USD')).toBe('INIT/USD');
    expect(normalizePairForDex('INIT/USDC')).toBe('INIT/USD');
    expect(normalizePairForDex('INIT/USDT')).toBe('INIT/USD');
  });

  it('maps INITIA aliases to INIT/USD', () => {
    expect(normalizePairForDex('INITIA/USD')).toBe('INIT/USD');
    expect(normalizePairForDex('INITIA-USD')).toBe('INIT/USD');
  });

  it('keeps existing non-INIT pairs unchanged', () => {
    expect(normalizePairForDex('WETH/USDC')).toBe('WETH/USDC');
    expect(normalizePairForDex('BTC/USD')).toBe('BTC/USD');
  });
});
