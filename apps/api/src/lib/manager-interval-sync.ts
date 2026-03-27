import type { Env } from '../types/env.js';

export const VALID_MANAGER_DECISION_INTERVALS = ['1h', '4h', '1d'] as const;
const VALID_MANAGER_DECISION_INTERVAL_SET = new Set<string>(VALID_MANAGER_DECISION_INTERVALS);

export type ManagerDecisionInterval = typeof VALID_MANAGER_DECISION_INTERVALS[number];

export function normalizeManagerDecisionInterval(
  value: unknown,
  fallback: ManagerDecisionInterval = '1h',
): ManagerDecisionInterval {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (VALID_MANAGER_DECISION_INTERVAL_SET.has(normalized)) {
      return normalized as ManagerDecisionInterval;
    }
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

  const doId = env.AGENT_MANAGER.idFromName(managerId);
  const stub = env.AGENT_MANAGER.get(doId);
  const res = await stub.fetch(
    new Request('http://do/set-interval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionInterval: nextNormalized }),
    }),
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(
      `Failed to sync manager decisionInterval to DO for ${managerId} (status ${res.status})${errorText ? `: ${errorText}` : ''}`,
    );
  }

  return true;
}
