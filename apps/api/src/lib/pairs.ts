/**
 * Normalize trading pair names for GeckoTerminal/DexScreener (Base chain).
 * Maps CEX-style symbols (e.g. ETH-USD) to Dex format (WETH/USDC) so the
 * agent works when the manager or user supplies the wrong format.
 */
const CEX_TO_DEX_PAIRS: Record<string, string> = {
  'ETH-USD': 'WETH/USDC',
  'ETH/USD': 'WETH/USDC',
  'BTC-USD': 'cbBTC/USDC',
  'BTC/USD': 'cbBTC/USDC',
  'INIT-USD': 'INIT/USD',
  'INIT/USD': 'INIT/USD',
  'INITIA-USD': 'INIT/USD',
  'INITIA/USD': 'INIT/USD',
  'AERO-USD': 'AERO/USDC',
  'AERO/USD': 'AERO/USDC',
  'DEGEN-USD': 'DEGEN/USDC',
  'DEGEN/USD': 'DEGEN/USDC',
};

const SYMBOL_ALIASES: Record<string, string> = {
  INITIA: 'INIT',
};

function normalizeSymbolAlias(symbol: string): string {
  const trimmed = symbol.trim();
  if (!trimmed) return trimmed;
  return SYMBOL_ALIASES[trimmed.toUpperCase()] ?? trimmed;
}

function normalizeInitStablePair(left: string, right: string): string | null {
  const l = left.toUpperCase();
  const r = right.toUpperCase();
  const isInitBase = l === 'INIT';
  const isInitQuote = r === 'INIT';
  const stable = new Set(['USD', 'USDC', 'USDBC', 'USDT', 'DAI']);
  if (isInitBase && stable.has(r)) return 'INIT/USD';
  if (isInitQuote && stable.has(l)) return 'INIT/USD';
  return null;
}

/**
 * Returns the Dex-style pair name (e.g. "WETH/USDC") for GeckoTerminal/DexScreener.
 * If the input already contains "/", it is returned trimmed. Otherwise CEX-style
 * names are mapped via CEX_TO_DEX_PAIRS.
 */
export function normalizePairForDex(pair: string): string {
  const trimmed = pair.trim();
  if (trimmed.includes('/')) {
    const [leftRaw, rightRaw, ...rest] = trimmed.split('/');
    if (rest.length === 0 && leftRaw && rightRaw) {
      const left = normalizeSymbolAlias(leftRaw);
      const right = normalizeSymbolAlias(rightRaw);
      const normalizedInit = normalizeInitStablePair(left, right);
      if (normalizedInit) return normalizedInit;
      return `${left}/${right}`;
    }
    return trimmed;
  }
  const upper = trimmed.toUpperCase().replace(/\s+/g, '-');
  return CEX_TO_DEX_PAIRS[upper] ?? trimmed;
}

/**
 * Normalize an array of pair names (e.g. when saving agent config).
 */
export function normalizePairsForDex(pairs: string[]): string[] {
  return pairs.map(normalizePairForDex);
}
