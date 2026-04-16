## Initia Hackathon Submission

- **Project Name**: initRoot

### Project Overview

initRoot is an AI trading agents platform that runs autonomously on an Initia EVM appchain. You deposit funds into an onchain vault, configure agent or select from pre-defined agents, and then let it trade on your behalf — the agent analyses market data, makes decisions, and executes them within the limits you set.

### Implementation Detail

- **Custom onchain Agent contract** (`contracts/src/Agent.sol`) — handles multi-agent vaults, per-agent executor approvals, target contract whitelisting, native and ERC-20 accounting, and pause controls.

- **InterwovenKit React island embedded in the Nuxt frontend** — lets users move assets from other Initia chains directly into the app without leaving the page. The island is a React component mounted inside the Vue/Nuxt app, using Initia's InterwovenKit for interwoven transfers and bridging.


### How to Run Locally

#### Prerequisites
- nodejs 20+ (https://nodejs.org/en/download/)
- pnpm (https://pnpm.io/)
- Foundry (`forge` + `cast`) — install via https://getfoundry.sh
- initia EVM appchain - Follow the Initia hackathon setup guide: https://docs.initia.xyz/hackathon/get-started

#### First run (nothing set up yet)

1. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and set `OPENROUTER_API_KEY` (get a free key at https://openrouter.ai).
2. Run:
   ```bash
   chmod +x setupLocalAndStart.sh
   ./setupLocalAndStart.sh
   ```
   The script will look for a deployer key automatically (shell env `PRIVATE_KEY` / `INITIATE_MNEMONIC`, or `~/.weave/config.json`) and prompt if none is found.

The script installs dependencies, starts a local Initia chain, deploys all three contracts (Agent, iUSD demo token + faucet, MockPerpDEX), writes the env files for both apps, applies DB migrations, and starts everything.

- Web → http://localhost:3001
- API → http://localhost:8787

Flags:

- `--skip-chain`: use an already running chain at `INITIA_RPC_URL` / `INITIA_EVM_RPC` or the defaults `http://localhost:26657` and `http://localhost:8545`
- `--skip-contracts`: use already deployed contracts and the existing `apps/web/.env`


#### Subsequent runs (chain and contracts already deployed)

run api with `pnpm dev:api`
run web with `pnpm dev:web`

For manual step-by-step setup see [MANUAL_SETUP.md](./docs/MANUAL_SETUP.md)



### Tech Stack

- Initia InterwovenKit React island embedded in a Nuxt app
- Frontend: Nuxt 4, Vue 3, TypeScript
- Backend: Hono on Cloudflare Workers
- Storage / state: D1, KV, Durable Objects, Cloudflare Queues
- AI layer: OpenRouter, PCKE

### Future Features
 
* More types of collateral – support more tokens type for the trading base
* More privacy - MEV protection, private strategies, other
* Hedging – tools to reduce risk and protect positions
* Backtesting – test strategies on historical data before using them
* Self-improving agents – agents can adjust their own prompts and settings
* Notifications – alerts for trades, performance, and important events
* Strategies Market – Market with zk validated winning strategies
* Agent teams (technical analytic, fundamental, risk) + executor eventually bot
* Setup manager agents to create on-chain agents, and agent teams
* Big hope finder - agent or agent teams searching for next x2, x5, x10 future tokens, smaller caps, based on history patterns and technical + fundamental analysis
