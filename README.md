## Initia Hackathon Submission

- **Project Name**: initRoot

### Project Overview

initRoot is an AI-assisted trading agent platform running on an Initia EVM rollup. Users create autonomous agents with configurable risk controls — each backed by an onchain vault with delegated execution. A real-time frontend lets users monitor balances, and strategy actions in one place. The target audience is anyone looking for automated strategy execution with clear safety boundaries and full transparency into agent state.

### Implementation Detail

- **The Custom Implementation**: A custom onchain `Agent` contract (`contracts/src/Agent.sol`) provides multi-agent vaults, per-agent executor approvals, target whitelisting, native and token accounting, pause controls, and per-trade/daily value limits. These constraints enforce execution safety at the contract level, independent of the off-chain logic.

- **The Native Feature**: The frontend bridge runtime (`apps/web/utils/initia/react-bridge.ts`) integrates both InterwovenKit auto-signing and the interwoven bridge. Auto-signing allows toggling delegated MsgCall signing per chain, removing repeated confirmation prompts during scheduled agent execution while keeping explicit user control intact. The interwoven bridge enables cross-chain asset transfers directly within the app — users can fund agent vaults from other Initia chains without leaving the interface.

### How to Run Locally

1. Install dependencies from the repo root: `pnpm install`.
2. Start the API service: `pnpm run dev:api`.
3. In a second terminal, start the web app: `pnpm run dev:web`.
4. Open the local app URL, connect with InterwovenKit, and make sure the local Initia endpoints/config (`NUXT_PUBLIC_INITIA_*`) point to a running rollup environment.


### Tech Stack

- Initia InterwovenKit React island embedded in a Nuxt app
- Frontend: Nuxt 4, Vue 3, TypeScript
- Backend: Hono on Cloudflare Workers
- Storage / state: D1, KV, Durable Objects, Cloudflare Queues
- AI layer: OpenRouter, PCKE
