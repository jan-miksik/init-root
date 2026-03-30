export type ManagerAction =
  | 'create_agent'
  | 'start_agent'
  | 'pause_agent'
  | 'modify_agent'
  | 'terminate_agent'
  | 'hold';

export interface ManagerDecision {
  action: ManagerAction;
  agentId?: string;
  params?: Record<string, unknown>;
  reasoning: string;
}

export interface ManagerMemory {
  hypotheses: Array<{
    description: string;
    tested_at: string;
    outcome: string;
    still_valid: boolean;
  }>;
  parameter_history: Array<{
    agent_id: string;
    change: string;
    change_at: string;
    outcome_after_n_cycles: string | null;
  }>;
  market_regime: {
    detected_at: string;
    regime: 'trending' | 'ranging' | 'volatile';
    reasoning: string;
  } | null;
  last_evaluation_at: string;
}

export interface ManagedAgentSnapshot {
  id: string;
  name: string;
  status: string;
  llmModel: string;
  config: {
    pairs: string[];
    strategies: string[];
    maxPositionSizePct: number;
    analysisInterval: string;
    paperBalance: number;
    temperature: number;
  };
  performance: {
    balance: number;
    totalPnlPct: number;
    winRate: number;
    totalTrades: number;
    sharpeRatio: number | null;
    maxDrawdown: number | null;
  };
  recentTrades: Array<{
    pair: string;
    side: string;
    pnlPct: number | null;
    openedAt: string;
    closedAt: string | null;
  }>;
}
