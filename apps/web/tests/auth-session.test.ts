import { describe, expect, it } from 'vitest';
import { doesSessionMatchWallet, normalizeComparableAddress } from '../utils/auth-session';

describe('normalizeComparableAddress', () => {
  it('normalizes case and trims whitespace', () => {
    expect(normalizeComparableAddress('  0xAbCd  ')).toBe('0xabcd');
  });

  it('returns null for empty values', () => {
    expect(normalizeComparableAddress('   ')).toBeNull();
    expect(normalizeComparableAddress(null)).toBeNull();
    expect(normalizeComparableAddress(undefined)).toBeNull();
  });
});

describe('doesSessionMatchWallet', () => {
  it('matches the connected evm address', () => {
    expect(doesSessionMatchWallet('0xAbC123', ['0xabc123', 'init1xyz'])).toBe(true);
  });

  it('matches a legacy bech32 session against the connected initia address', () => {
    expect(doesSessionMatchWallet('init1abc', ['0xdef456', 'init1abc'])).toBe(true);
  });

  it('returns false when the connected wallet is different', () => {
    expect(doesSessionMatchWallet('0xabc123', ['0xdef456', 'init1xyz'])).toBe(false);
  });

  it('returns false when there is no connected wallet address to compare', () => {
    expect(doesSessionMatchWallet('0xabc123', [null, undefined])).toBe(false);
  });
});
