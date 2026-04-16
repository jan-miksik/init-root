import { describe, expect, it } from 'vitest';
import { getPaperAgentLiveStateReset, stripPaperAgentLiveConfig } from '../src/routes/agents-route/shared.js';

describe('paper agent normalization helpers', () => {
  it('removes live-only Initia fields from config payloads', () => {
    const normalized = stripPaperAgentLiveConfig({
      name: 'Paper Agent',
      chain: 'initia',
      isPaper: true,
      initiaWalletAddress: 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d',
      initiaMetadataHash: 'hash_live',
      initiaMetadataVersion: 4,
      analysisInterval: '4h',
    });

    expect(normalized).toEqual({
      name: 'Paper Agent',
      chain: 'initia',
      isPaper: true,
      analysisInterval: '4h',
    });
  });

  it('clears persisted Initia linkage and sync state when switching to paper mode', () => {
    expect(getPaperAgentLiveStateReset('2026-04-16T12:00:00.000Z')).toEqual({
      initiaWalletAddress: null,
      initiaMetadataHash: null,
      initiaMetadataVersion: null,
      initiaLinkTxHash: null,
      initiaLinkedAt: null,
      initiaSyncState: null,
      initiaLastSyncedAt: null,
      updatedAt: '2026-04-16T12:00:00.000Z',
    });
  });
});
