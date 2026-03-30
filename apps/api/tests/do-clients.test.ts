import { describe, expect, it, vi } from 'vitest';
import {
  registerSchedulerAgent,
  setManagerIntervalDo,
  setTradingAgentIntervalDo,
  startTradingAgentDo,
} from '../src/lib/do-clients.js';

function makeTradingEnv(fetchImpl: (request: Request) => Promise<Response>) {
  const fetch = vi.fn(fetchImpl);
  const stub = { fetch };
  const idFromName = vi.fn((name: string) => `do:${name}`);
  const get = vi.fn(() => stub);

  return {
    env: {
      TRADING_AGENT: { idFromName, get },
    },
    fetch,
    idFromName,
    get,
  };
}

function makeManagerEnv(fetchImpl: (request: Request) => Promise<Response>) {
  const fetch = vi.fn(fetchImpl);
  const stub = { fetch };
  const idFromName = vi.fn((name: string) => `mgr:${name}`);
  const get = vi.fn(() => stub);

  return {
    env: {
      AGENT_MANAGER: { idFromName, get },
    },
    fetch,
    idFromName,
    get,
  };
}

describe('do-clients', () => {
  it('normalizes legacy trading interval in startTradingAgentDo', async () => {
    const ctx = makeTradingEnv(async () => new Response(JSON.stringify({ ok: true })));

    await startTradingAgentDo(ctx.env as any, {
      agentId: 'agent_1',
      paperBalance: 1000,
      slippageSimulation: 0.3,
      analysisInterval: '300',
    });

    expect(ctx.idFromName).toHaveBeenCalledWith('agent_1');
    expect(ctx.fetch).toHaveBeenCalledOnce();

    const req = ctx.fetch.mock.calls[0][0] as Request;
    expect(new URL(req.url).pathname).toBe('/start');
    const body = await req.json() as { analysisInterval: string };
    expect(body.analysisInterval).toBe('1h');
  });

  it('sends normalized interval in setTradingAgentIntervalDo', async () => {
    const ctx = makeTradingEnv(async () => new Response(JSON.stringify({ ok: true })));

    await setTradingAgentIntervalDo(ctx.env as any, 'agent_2', 'invalid-value');

    const req = ctx.fetch.mock.calls[0][0] as Request;
    expect(new URL(req.url).pathname).toBe('/set-interval');
    const body = await req.json() as { analysisInterval: string };
    expect(body.analysisInterval).toBe('1h');
  });

  it('registers scheduler entries with normalized interval', async () => {
    const ctx = makeManagerEnv(async () => new Response(JSON.stringify({ ok: true })));

    await registerSchedulerAgent(ctx.env as any, { agentId: 'agent_3', interval: '900' });

    expect(ctx.idFromName).toHaveBeenCalledWith('scheduler');
    const req = ctx.fetch.mock.calls[0][0] as Request;
    expect(new URL(req.url).pathname).toBe('/scheduler/register');
    const body = await req.json() as { agentId: string; interval: string };
    expect(body.agentId).toBe('agent_3');
    expect(body.interval).toBe('1h');
  });

  it('throws with response details when manager DO returns non-ok', async () => {
    const ctx = makeManagerEnv(async () => new Response('bad interval', { status: 400 }));

    await expect(setManagerIntervalDo(ctx.env as any, 'mgr_1', 'bogus')).rejects.toThrow(
      'DO request failed /set-interval (status 400): bad interval',
    );
  });
});
