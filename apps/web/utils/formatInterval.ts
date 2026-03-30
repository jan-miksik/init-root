import { tryNormalizeTradingInterval } from '@something-in-loop/shared';

/** Normalise legacy seconds-based interval strings to human-readable labels. */
export function formatInterval(interval: string): string {
  return tryNormalizeTradingInterval(interval) ?? interval;
}
