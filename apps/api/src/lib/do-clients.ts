import { normalizeTradingInterval } from '@something-in-loop/shared';
import type { CachedAgentRow } from '../agents/trading-agent.js';
import type { Env } from '../types/env.js';

type TradingAgentBindings = Pick<Env, 'TRADING_AGENT'>;
type AgentManagerBindings = Pick<Env, 'AGENT_MANAGER'>;

type JsonRecord = Record<string, unknown>;

export class DoRequestError extends Error {
  status: number;
  body: string;
  path: string;

  constructor(path: string, status: number, body: string) {
    super(`DO request failed ${path} (status ${status})${body ? `: ${body}` : ''}`);
    this.name = 'DoRequestError';
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

async function fetchDoJson<T>(
  stub: DurableObjectStub,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await stub.fetch(
    new Request(`http://do${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
      },
    }),
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new DoRequestError(path, res.status, errorText);
  }

  if (res.status === 204) return {} as T;
  return (await res.json().catch(() => ({}))) as T;
}

function getTradingAgentStub(env: TradingAgentBindings, agentId: string): DurableObjectStub {
  return env.TRADING_AGENT.get(env.TRADING_AGENT.idFromName(agentId));
}

function getAgentManagerStub(env: AgentManagerBindings, managerId: string): DurableObjectStub {
  return env.AGENT_MANAGER.get(env.AGENT_MANAGER.idFromName(managerId));
}

export async function startTradingAgentDo(
  env: TradingAgentBindings,
  params: {
    agentId: string;
    paperBalance?: number;
    slippageSimulation?: number;
    analysisInterval?: string;
    agentRow?: CachedAgentRow;
  },
): Promise<void> {
  const stub = getTradingAgentStub(env, params.agentId);
  await fetchDoJson(stub, '/start', {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      analysisInterval: normalizeTradingInterval(params.analysisInterval ?? '1h'),
    }),
  });
}

export async function stopTradingAgentDo(env: TradingAgentBindings, agentId: string): Promise<void> {
  const stub = getTradingAgentStub(env, agentId);
  await fetchDoJson(stub, '/stop', { method: 'POST' });
}

export async function pauseTradingAgentDo(env: TradingAgentBindings, agentId: string): Promise<void> {
  const stub = getTradingAgentStub(env, agentId);
  await fetchDoJson(stub, '/pause', { method: 'POST' });
}

export async function setTradingAgentIntervalDo(
  env: TradingAgentBindings,
  agentId: string,
  analysisInterval: string,
): Promise<void> {
  const stub = getTradingAgentStub(env, agentId);
  await fetchDoJson(stub, '/set-interval', {
    method: 'POST',
    body: JSON.stringify({
      analysisInterval: normalizeTradingInterval(analysisInterval, '1h'),
    }),
  });
}

export async function syncTradingAgentConfigDo(
  env: TradingAgentBindings,
  agentId: string,
  agentRow: CachedAgentRow,
): Promise<void> {
  const stub = getTradingAgentStub(env, agentId);
  await fetchDoJson(stub, '/sync-config', {
    method: 'POST',
    body: JSON.stringify({ agentRow }),
  });
}

export async function startManagerDo(
  env: AgentManagerBindings,
  params: { managerId: string; decisionInterval?: string },
): Promise<void> {
  const stub = getAgentManagerStub(env, params.managerId);
  await fetchDoJson(stub, '/start', {
    method: 'POST',
    body: JSON.stringify({
      managerId: params.managerId,
      decisionInterval: normalizeTradingInterval(params.decisionInterval ?? '1h', '1h'),
    }),
  });
}

export async function stopManagerDo(env: AgentManagerBindings, managerId: string): Promise<void> {
  const stub = getAgentManagerStub(env, managerId);
  await fetchDoJson(stub, '/stop', { method: 'POST' });
}

export async function pauseManagerDo(env: AgentManagerBindings, managerId: string): Promise<void> {
  const stub = getAgentManagerStub(env, managerId);
  await fetchDoJson(stub, '/pause', { method: 'POST' });
}

export async function setManagerIntervalDo(
  env: AgentManagerBindings,
  managerId: string,
  decisionInterval: string,
): Promise<void> {
  const stub = getAgentManagerStub(env, managerId);
  await fetchDoJson(stub, '/set-interval', {
    method: 'POST',
    body: JSON.stringify({ decisionInterval: normalizeTradingInterval(decisionInterval, '1h') }),
  });
}

export async function triggerManagerDo(
  env: AgentManagerBindings,
  managerId: string,
  decisionInterval?: string,
): Promise<void> {
  const stub = getAgentManagerStub(env, managerId);
  await fetchDoJson(stub, '/trigger', {
    method: 'POST',
    body: JSON.stringify({
      ...(decisionInterval ? { decisionInterval: normalizeTradingInterval(decisionInterval, '1h') } : {}),
    }),
  });
}

export async function registerSchedulerAgent(
  env: AgentManagerBindings,
  params: { agentId: string; interval: string },
): Promise<void> {
  const stub = getAgentManagerStub(env, 'scheduler');
  await fetchDoJson<JsonRecord>(stub, '/scheduler/register', {
    method: 'POST',
    body: JSON.stringify({
      agentId: params.agentId,
      interval: normalizeTradingInterval(params.interval, '1h'),
    }),
  });
}

export async function unregisterSchedulerAgent(
  env: AgentManagerBindings,
  agentId: string,
): Promise<void> {
  const stub = getAgentManagerStub(env, 'scheduler');
  await fetchDoJson<JsonRecord>(stub, '/scheduler/unregister', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}
