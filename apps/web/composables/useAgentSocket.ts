/**
 * useAgentSocket — WebSocket composable for real-time agent updates.
 *
 * Connects to /api/agents/:id/ws, handles auto-reconnect with exponential
 * backoff, and exposes typed reactive state for decisions, trades, and balance.
 *
 * Usage:
 *   const { latestDecision, latestTrade, balance, status, connected } = useAgentSocket(agentId)
 */

export type AgentWsDecision = {
  type: 'decision';
  agentId: string;
  decision: 'buy' | 'sell' | 'hold' | 'close';
  confidence: number;
  reasoning: string;
  balance: number;
  openPositions: number;
  createdAt: string;
};

export type AgentWsTrade = {
  type: 'trade';
  event: 'open' | 'close';
  agentId: string;
  pair: string;
  side: 'buy' | 'sell';
  amountUsd?: number;
  priceUsd?: number;
  pnlPct?: number | null;
  pnlUsd?: number | null;
  balance: number;
  openPositions: number;
};

export type AgentWsSnapshot = {
  type: 'snapshot';
  agentId: string;
  status: string;
  balance: number | null;
  openPositions: number;
};

export type AgentWsEvent = AgentWsDecision | AgentWsTrade | AgentWsSnapshot;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_FACTOR = 2;

export function useAgentSocket(agentId: MaybeRef<string | null | undefined>) {
  const config = useRuntimeConfig();

  // Derive WebSocket URL from the HTTP API base (http→ws, https→wss)
  function buildWsUrl(id: string): string {
    const apiBase = config.public.apiBase as string;
    const wsBase = apiBase.replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws'));
    return `${wsBase}/agents/${id}/ws`;
  }

  const connected = ref(false);
  const latestDecision = ref<AgentWsDecision | null>(null);
  const latestTrade = ref<AgentWsTrade | null>(null);
  const balance = ref<number | null>(null);
  const openPositions = ref<number>(0);
  const agentStatus = ref<string>('unknown');

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let destroyed = false;

  function connect(id: string): void {
    if (destroyed) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(buildWsUrl(id));

    ws.onopen = () => {
      connected.value = true;
      attempts = 0;
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: AgentWsEvent;
      try {
        msg = JSON.parse(event.data as string) as AgentWsEvent;
      } catch {
        return;
      }

      if (msg.type === 'snapshot') {
        agentStatus.value = msg.status;
        balance.value = msg.balance;
        openPositions.value = msg.openPositions;
      } else if (msg.type === 'decision') {
        latestDecision.value = msg;
        balance.value = msg.balance;
        openPositions.value = msg.openPositions;
      } else if (msg.type === 'trade') {
        latestTrade.value = msg;
        balance.value = msg.balance;
        openPositions.value = msg.openPositions;
      }
    };

    ws.onclose = () => {
      connected.value = false;
      ws = null;
      scheduleReconnect(id);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — let onclose handle reconnect
      connected.value = false;
    };
  }

  function scheduleReconnect(id: string): void {
    if (destroyed) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_FACTOR, attempts),
      RECONNECT_MAX_MS
    );
    attempts++;
    reconnectTimer = setTimeout(() => connect(id), delay);
  }

  function disconnect(): void {
    destroyed = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;  // prevent reconnect loop on manual disconnect
      ws.close(1000, 'Composable destroyed');
      ws = null;
    }
    connected.value = false;
  }

  // Reactively connect / disconnect when agentId changes
  watch(
    () => toValue(agentId),
    (id) => {
      disconnect();
      destroyed = false;
      attempts = 0;
      if (id) connect(id);
    },
    { immediate: true }
  );

  onUnmounted(() => disconnect());

  return {
    connected: readonly(connected),
    latestDecision: readonly(latestDecision),
    latestTrade: readonly(latestTrade),
    balance: readonly(balance),
    openPositions: readonly(openPositions),
    agentStatus: readonly(agentStatus),
    disconnect,
  };
}
