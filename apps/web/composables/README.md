# Web Composables

- `useApi.ts`: base request wrapper and error extraction.
- `useAgents.ts`, `useManagers.ts`, `useTrades.ts`: domain fetch/mutation + client cache coordination.

Prefer extracting shared cache/fetch patterns when adding repeated fetch + invalidate behavior.
