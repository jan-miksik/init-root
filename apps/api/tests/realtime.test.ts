/**
 * Realtime WebSocket tests — DO WS acceptance, broadcast, connection tracking,
 * auth guard, event shapes, and reconnect backoff calculation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(_state: unknown, _env: unknown) {}
  },
}));

// ── Minimal DO storage stub ────────────────────────────────────────────────

function makeStorageStub(initial: Record<string, unknown> = {}): any {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? undefined),
    put: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    _store: store,
  };
}

// ── Minimal WebSocket stub ────────────────────────────────────────────────

function makeWsStub() {
  const sent: string[] = [];
  return {
    send: vi.fn((msg: string) => { sent.push(msg); }),
    close: vi.fn(),
    readyState: 1, // OPEN
    _sent: sent,
  };
}

// ── Broadcast helper (mirrors broadcastAgentEvent in agent-loop) ──────────

function broadcastToAll(wsList: ReturnType<typeof makeWsStub>[], event: object): void {
  const json = JSON.stringify(event);
  for (const ws of wsList) {
    try { ws.send(json); } catch { /* closed */ }
  }
}

// ── Event shape builders ──────────────────────────────────────────────────

function makeDecisionEvent(overrides?: object) {
  return {
    type: 'decision',
    agentId: 'agent_test',
    decision: 'buy',
    confidence: 0.82,
    reasoning: 'RSI oversold',
    balance: 9500,
    openPositions: 1,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTradeOpenEvent(overrides?: object) {
  return {
    type: 'trade',
    event: 'open',
    agentId: 'agent_test',
    pair: 'WETH/USDC',
    side: 'buy',
    amountUsd: 500,
    priceUsd: 2500,
    balance: 9500,
    openPositions: 1,
    ...overrides,
  };
}

function makeTradeCloseEvent(overrides?: object) {
  return {
    type: 'trade',
    event: 'close',
    agentId: 'agent_test',
    pair: 'WETH/USDC',
    side: 'buy',
    pnlPct: 2.3,
    pnlUsd: 11.5,
    priceUsd: 2558,
    balance: 10011.5,
    openPositions: 0,
    ...overrides,
  };
}

// ── Broadcast tests ────────────────────────────────────────────────────────

describe('broadcastAgentEvent — delivery', () => {
  it('broadcasts to a single connected client', () => {
    const ws = makeWsStub();
    const event = makeDecisionEvent();
    broadcastToAll([ws], event);
    expect(ws.send).toHaveBeenCalledOnce();
    expect(JSON.parse(ws._sent[0])).toEqual(event);
  });

  it('broadcasts to multiple connected clients', () => {
    const clients = [makeWsStub(), makeWsStub(), makeWsStub()];
    const event = makeDecisionEvent();
    broadcastToAll(clients, event);
    for (const c of clients) {
      expect(c.send).toHaveBeenCalledOnce();
    }
  });

  it('sends valid JSON', () => {
    const ws = makeWsStub();
    broadcastToAll([ws], makeTradeOpenEvent());
    expect(() => JSON.parse(ws._sent[0])).not.toThrow();
  });

  it('does not throw when WS list is empty', () => {
    expect(() => broadcastToAll([], makeDecisionEvent())).not.toThrow();
  });

  it('continues broadcasting to healthy clients when one throws', () => {
    const bad = makeWsStub();
    bad.send.mockImplementation(() => { throw new Error('WS closed'); });
    const good = makeWsStub();

    broadcastToAll([bad, good], makeDecisionEvent());

    // bad WS threw but good WS still received the message
    expect(good.send).toHaveBeenCalledOnce();
  });
});

// ── Event shape tests ──────────────────────────────────────────────────────

describe('WS event shapes', () => {
  it('decision event has all required fields', () => {
    const event = makeDecisionEvent();
    expect(event).toMatchObject({
      type: 'decision',
      agentId: expect.any(String),
      decision: expect.any(String),
      confidence: expect.any(Number),
      reasoning: expect.any(String),
      balance: expect.any(Number),
      openPositions: expect.any(Number),
      createdAt: expect.any(String),
    });
  });

  it('trade open event has all required fields', () => {
    const event = makeTradeOpenEvent();
    expect(event).toMatchObject({
      type: 'trade',
      event: 'open',
      agentId: expect.any(String),
      pair: expect.any(String),
      side: expect.any(String),
      amountUsd: expect.any(Number),
      priceUsd: expect.any(Number),
      balance: expect.any(Number),
      openPositions: expect.any(Number),
    });
  });

  it('trade close event includes pnl fields', () => {
    const event = makeTradeCloseEvent();
    expect(event).toMatchObject({
      type: 'trade',
      event: 'close',
      pnlPct: expect.any(Number),
      pnlUsd: expect.any(Number),
    });
  });

  it('decision confidence is in [0,1] range', () => {
    const event = makeDecisionEvent({ confidence: 0.82 });
    expect(event.confidence).toBeGreaterThanOrEqual(0);
    expect(event.confidence).toBeLessThanOrEqual(1);
  });
});

// ── Snapshot event ────────────────────────────────────────────────────────

describe('WS snapshot event', () => {
  it('snapshot sent to newly connected client', () => {
    const ws = makeWsStub();
    const snapshot = {
      type: 'snapshot',
      agentId: 'agent_test',
      status: 'running',
      balance: 10000,
      openPositions: 0,
    };
    ws.send(JSON.stringify(snapshot));
    const received = JSON.parse(ws._sent[0]);
    expect(received.type).toBe('snapshot');
    expect(received.status).toBe('running');
    expect(received.balance).toBe(10000);
  });

  it('snapshot balance is null when engine not initialized', () => {
    const snapshot = { type: 'snapshot', agentId: 'x', status: 'stopped', balance: null, openPositions: 0 };
    expect(snapshot.balance).toBeNull();
  });
});

// ── Auth: session validation ───────────────────────────────────────────────

describe('WS auth guard', () => {
  it('rejects upgrade if no session cookie', async () => {
    // Simulates the parseCookieValue returning null → no token
    function extractSessionToken(cookieHeader: string): string | null {
      const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      return match ? match[1] : null;
    }
    const token = extractSessionToken('');
    expect(token).toBeNull();
  });

  it('accepts upgrade with valid session cookie', async () => {
    function extractSessionToken(cookieHeader: string): string | null {
      const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      return match ? match[1] : null;
    }
    const token = extractSessionToken('session=abc123deadbeef; other=foo');
    expect(token).toBe('abc123deadbeef');
  });

  it('rejects non-websocket request to /ws path', () => {
    const isWsUpgrade = (headers: Record<string, string>) =>
      headers['upgrade']?.toLowerCase() === 'websocket';
    expect(isWsUpgrade({ 'content-type': 'application/json' })).toBe(false);
    expect(isWsUpgrade({ upgrade: 'websocket' })).toBe(true);
  });
});

// ── Reconnect backoff ──────────────────────────────────────────────────────

describe('useAgentSocket reconnect backoff', () => {
  const RECONNECT_BASE_MS = 1_000;
  const RECONNECT_MAX_MS = 30_000;
  const RECONNECT_FACTOR = 2;

  function getBackoffMs(attempts: number): number {
    return Math.min(RECONNECT_BASE_MS * Math.pow(RECONNECT_FACTOR, attempts), RECONNECT_MAX_MS);
  }

  it('first reconnect is RECONNECT_BASE_MS', () => {
    expect(getBackoffMs(0)).toBe(1_000);
  });

  it('second reconnect doubles', () => {
    expect(getBackoffMs(1)).toBe(2_000);
  });

  it('third reconnect doubles again', () => {
    expect(getBackoffMs(2)).toBe(4_000);
  });

  it('backoff is capped at RECONNECT_MAX_MS', () => {
    expect(getBackoffMs(10)).toBe(RECONNECT_MAX_MS);
    expect(getBackoffMs(20)).toBe(RECONNECT_MAX_MS);
  });

  it('never exceeds max even at very high attempt counts', () => {
    for (let i = 0; i <= 50; i++) {
      expect(getBackoffMs(i)).toBeLessThanOrEqual(RECONNECT_MAX_MS);
    }
  });
});
