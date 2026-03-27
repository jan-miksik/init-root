import { describe, it, expect, vi } from 'vitest';
import {
  didManagerDecisionIntervalChange,
  normalizeManagerDecisionInterval,
  syncRunningManagerDecisionInterval,
} from '../src/lib/manager-interval-sync.js';

describe('manager interval sync helpers', () => {
  it('normalizes decision intervals and detects changes safely', () => {
    expect(normalizeManagerDecisionInterval('1h')).toBe('1h');
    expect(normalizeManagerDecisionInterval('4h')).toBe('4h');
    expect(normalizeManagerDecisionInterval('1d')).toBe('1d');
    expect(normalizeManagerDecisionInterval('invalid')).toBe('1h');
    expect(normalizeManagerDecisionInterval('invalid', '4h')).toBe('4h');

    expect(didManagerDecisionIntervalChange('1h', '4h')).toBe(true);
    expect(didManagerDecisionIntervalChange('1h', 'invalid')).toBe(false);
    expect(didManagerDecisionIntervalChange('invalid', '1d')).toBe(true);
  });

  it('calls AGENT_MANAGER /set-interval when running and interval changed', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const getMock = vi.fn(() => ({ fetch: fetchMock }));
    const idFromNameMock = vi.fn(() => 'manager-do-id');
    const env = {
      AGENT_MANAGER: {
        idFromName: idFromNameMock,
        get: getMock,
      },
    } as any;

    const changed = await syncRunningManagerDecisionInterval(
      env,
      'mgr_1',
      'running',
      '1h',
      '4h',
    );

    expect(changed).toBe(true);
    expect(idFromNameMock).toHaveBeenCalledWith('mgr_1');
    expect(getMock).toHaveBeenCalledWith('manager-do-id');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const req = fetchMock.mock.calls[0]![0] as Request;
    expect(req.url).toContain('/set-interval');
    const body = await req.json() as { decisionInterval?: string };
    expect(body.decisionInterval).toBe('4h');
  });

  it('does not call AGENT_MANAGER when status is not running or interval unchanged', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const env = {
      AGENT_MANAGER: {
        idFromName: vi.fn(() => 'manager-do-id'),
        get: vi.fn(() => ({ fetch: fetchMock })),
      },
    } as any;

    const noSyncStopped = await syncRunningManagerDecisionInterval(
      env,
      'mgr_1',
      'stopped',
      '1h',
      '4h',
    );
    expect(noSyncStopped).toBe(false);

    const noSyncUnchanged = await syncRunningManagerDecisionInterval(
      env,
      'mgr_1',
      'running',
      '1h',
      'invalid',
    );
    expect(noSyncUnchanged).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
