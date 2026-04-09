export interface AgentState {
  id: bigint | null;
  exists: boolean;
  balance: bigint;
  showcaseTokenBalance: bigint;
  walletShowcaseTokenBalance: bigint;
  executorAuthorized: boolean;
  autoSignEnabled: boolean;
}

export const EMPTY_AGENT_STATE: AgentState = {
  id: null,
  exists: false,
  balance: 0n,
  showcaseTokenBalance: 0n,
  walletShowcaseTokenBalance: 0n,
  executorAuthorized: false,
  autoSignEnabled: false,
};
