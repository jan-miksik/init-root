import type { Env } from '../types/env.js';
import { TRADING_INTERVALS, normalizeTradingInterval, type TradingInterval } from '@something-in-loop/shared';
import { setManagerIntervalDo } from './do-clients.js';

export const VALID_MANAGER_DECISION_INTERVALS = TRADING_INTERVALS;
const VALID_MANAGER_DECISION_INTERVAL_SET = new Set<string>(VALID_MANAGER_DECISION_INTERVALS);

export type ManagerDecisionInterval = TradingInterval;

export function normalizeManagerDecisionInterval(
  value: unknown,
  fallback: ManagerDecisionInterval = '1h',
): ManagerDecisionInterval {
  const normalized = normalizeTradingInterval(value, fallback);
  if (VALID_MANAGER_DECISION_INTERVAL_SET.has(normalized)) {
    return normalized;
  }
  return fallback;
}

export function didManagerDecisionIntervalChange(previous: unknown, next: unknown): boolean {
  const previousNormalized = normalizeManagerDecisionInterval(previous);
  const nextNormalized = normalizeManagerDecisionInterval(next, previousNormalized);
  return previousNormalized !== nextNormalized;
}

export async function syncRunningManagerDecisionInterval(
  env: Pick<Env, 'AGENT_MANAGER'>,
  managerId: string,
  status: string | null | undefined,
  previousInterval: unknown,
  nextInterval: unknown,
): Promise<boolean> {
  if (status !== 'running') return false;

  const previousNormalized = normalizeManagerDecisionInterval(previousInterval);
  const nextNormalized = normalizeManagerDecisionInterval(nextInterval, previousNormalized);
  if (previousNormalized === nextNormalized) return false;

  await setManagerIntervalDo(env, managerId, nextNormalized);

  return true;
}
