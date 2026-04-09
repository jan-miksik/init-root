# Architecture Index

This index is optimized for fast code navigation and AI-agent token efficiency.

## Task Map

- Add or change authentication/session behavior: `apps/api/src/lib/auth/*`
- Agent tick orchestration and trading decision flow: `apps/api/src/agents/agent-loop.ts` and `apps/api/src/agents/agent-loop/*`
- Trading Durable Object runtime and alarms: `apps/api/src/agents/trading-agent.ts`
- HTTP routes for agents: `apps/api/src/routes/agents-route/*`
- HTTP routes for managers: `apps/api/src/routes/managers-route/*`
- Shared runtime types/config defaults: `packages/shared/src/*`
- Frontend API data access: `apps/web/composables/*`
- Initia wallet bridge and onchain actions: `apps/web/utils/initia/*`

## Conventions

- Keep modules focused by responsibility; avoid mixed route + business + persistence logic in a single file.
- Prefer barrel exports at subsystem boundaries so internal moves do not force wide import churn.
- Preserve API contracts while refactoring internals.
- For new modules, target `< 250` LOC when practical and split before `400` LOC.

## Current High-Complexity Files

- `apps/web/utils/initia/react-bridge.ts`
- `apps/api/src/agents/agent-loop.ts`
- `apps/api/src/agents/trading-agent.ts`

## Refactor Entry Points

- Auth decomposition complete: `apps/api/src/lib/auth.ts` now re-exports from `apps/api/src/lib/auth/index.ts`.
- Next staged splits should prioritize bridge + agent loop + trading DO by extracting cohesive helpers first.
