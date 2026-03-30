import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FREE_AGENT_MODEL,
  buildAgentModelCatalog,
  getManagerAllowedAgentModelIds,
} from './model-catalog.js';
import { intervalToMs, normalizeTradingInterval, tryNormalizeTradingInterval } from './intervals.js';

describe('model catalog policy', () => {
  it('keeps free models available without own key', () => {
    const models = buildAgentModelCatalog({ hasOwnOpenRouterKey: false, isTester: false });
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.tier === 'free')).toBe(true);
    expect(models.some((m) => m.id === DEFAULT_FREE_AGENT_MODEL)).toBe(true);
  });

  it('adds paid and tester models based on flags', () => {
    const paidOnly = buildAgentModelCatalog({ hasOwnOpenRouterKey: true, isTester: false });
    expect(paidOnly.some((m) => m.tier === 'paid')).toBe(true);
    expect(paidOnly.some((m) => m.tier === 'tester')).toBe(false);

    const withTester = buildAgentModelCatalog({ hasOwnOpenRouterKey: true, isTester: true });
    expect(withTester.some((m) => m.tier === 'tester')).toBe(true);
  });

  it('restricts manager-selected agent models without user key', () => {
    const freeOnly = getManagerAllowedAgentModelIds(false);
    expect(freeOnly.every((id) => id.includes(':free'))).toBe(true);

    const withPaid = getManagerAllowedAgentModelIds(true);
    expect(withPaid.length).toBeGreaterThan(freeOnly.length);
  });
});

describe('interval policy', () => {
  it('normalizes current and legacy formats', () => {
    expect(normalizeTradingInterval('1h')).toBe('1h');
    expect(normalizeTradingInterval('300')).toBe('1h');
    expect(normalizeTradingInterval('14400')).toBe('4h');
    expect(normalizeTradingInterval('86400')).toBe('1d');
    expect(normalizeTradingInterval('5m')).toBe('1h');
  });

  it('supports nullable normalization helper', () => {
    expect(tryNormalizeTradingInterval('bogus')).toBeNull();
    expect(tryNormalizeTradingInterval('1d')).toBe('1d');
  });

  it('maps normalized intervals to milliseconds', () => {
    expect(intervalToMs('1h')).toBe(3_600_000);
    expect(intervalToMs('4h')).toBe(14_400_000);
    expect(intervalToMs('1d')).toBe(86_400_000);
  });
});
