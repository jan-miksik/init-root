export const TRADING_INTERVALS = ['1h', '4h', '1d'] as const;

export type TradingInterval = (typeof TRADING_INTERVALS)[number];

const TRADING_INTERVAL_SET = new Set<string>(TRADING_INTERVALS);

const LEGACY_INTERVAL_MAP: Record<string, TradingInterval> = {
  '1m': '1h',
  '5m': '1h',
  '15m': '1h',
  '30m': '1h',
  '60': '1h',
  '300': '1h',
  '900': '1h',
  '1800': '1h',
  '3600': '1h',
  '14400': '4h',
  '86400': '1d',
};

export function tryNormalizeTradingInterval(value: unknown): TradingInterval | null {
  const raw = typeof value === 'number' && Number.isFinite(value)
    ? String(Math.trunc(value))
    : value;

  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const mapped = LEGACY_INTERVAL_MAP[trimmed];
  if (mapped) return mapped;

  if (TRADING_INTERVAL_SET.has(trimmed)) {
    return trimmed as TradingInterval;
  }

  return null;
}

export function normalizeTradingInterval(
  value: unknown,
  fallback: TradingInterval = '1h',
): TradingInterval {
  return tryNormalizeTradingInterval(value) ?? fallback;
}

export function isTradingInterval(value: unknown): value is TradingInterval {
  return typeof value === 'string' && TRADING_INTERVAL_SET.has(value);
}

export function intervalToMs(value: unknown, fallback: TradingInterval = '1h'): number {
  const interval = normalizeTradingInterval(value, fallback);
  switch (interval) {
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return 24 * 60 * 60_000;
    default:
      return 60 * 60_000;
  }
}
