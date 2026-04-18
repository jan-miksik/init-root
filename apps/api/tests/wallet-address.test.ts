import { describe, expect, it } from 'vitest';
import {
  normalizeEvmWalletAddress,
  normalizeInitiaWalletAddress,
  normalizeSupportedWalletAddress,
} from '../src/lib/wallet-address.js';

describe('wallet address normalization', () => {
  it('normalizes valid EVM addresses to lowercase', () => {
    expect(normalizeEvmWalletAddress('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
  });

  it('accepts valid Initia bech32 addresses', () => {
    expect(normalizeInitiaWalletAddress('init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d')).toBe(
      'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d',
    );
  });

  it('rejects malformed or non-wallet identifiers', () => {
    expect(normalizeSupportedWalletAddress('not-a-wallet')).toBeNull();
    expect(normalizeSupportedWalletAddress('init1abcdefghijklmn1234567890')).toBeNull();
    expect(normalizeSupportedWalletAddress('INIT1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQPQR5E3D')).toBeNull();
  });
});
