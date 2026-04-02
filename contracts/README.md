## Contracts

This folder contains two smart-contract generations:

- `src/Agent.sol` (V1, recovered from history)
  - Single agent per wallet (`mapping(address => AgentInfo)`).
  - Functions: `createAgent`, `deposit`, `withdraw`, `executeTick`, `enableAutoSign`, `disableAutoSign`, `getAgent`, `hasAgent`.
  - Matches the ABI currently wired in `apps/web` (Nuxt bridge runtime).

- `src/AgentVaultV2.sol` (new)
  - Multiple agents per user (ID-based vaults).
  - `autoSignEnabled` is a master switch for delegated execution (non-owner executors).
  - Per-agent delegated executor approvals (`canTick`, `canTrade` + per-trade/daily native value limits).
  - Per-agent target whitelist for trade calls.
  - Native + ERC-20 vault deposit/withdraw per agent.
  - Guarded external execution primitives for real trading integration.

## Build / Test

From `contracts/`:

```bash
forge build
forge test -vv
```

## Scripts

- V1 deploy script: `script/DeployAgent.s.sol`
- V2 deploy script: `script/DeployAgentVaultV2.s.sol`

Example:

```bash
forge script script/DeployAgentVaultV2.s.sol:DeployAgentVaultV2 --rpc-url <RPC_URL> --broadcast
```
