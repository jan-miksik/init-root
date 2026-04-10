origin task
okay, so prepeare complete plan for all future refactoring changes, the origin task is same.
  Optimalization mainly for more effective usage of AI agents, so they can better oriented in
  the codebase, spent less tokens on tasks etc.


Gemini 3 Flash for apps/web/**

• Complete Refactor Plan

  Goal: restructure the repo so an AI agent can solve most tasks by opening a small, predictable
  set of files, without scanning large mixed-concern pages, duplicated logic, or ambiguous
  ownership.

  This is a repo-wide plan for the remaining work. It assumes the current partial refactor stays
  and we continue from there.

  Success Criteria

  - Feature work should usually require reading 1-5 files, not 10+.
  - App-owned runtime files should usually stay under 250 LOC.
  - 350 LOC is the review threshold.
  - Each feature root has one obvious entrypoint and one short README.
  - Shared logic exists once, under a predictable name.
  - Tests are named by module/behavior, not by historical “phase”.
  - Route/page files are thin shells, not business-logic containers.

  Current Hotspots

  - Frontend:
      - apps/web/pages/agents/[id]/index.vue
      - apps/web/components/AgentConfigForm.vue
      - apps/web/components/ManagerConfigForm.vue
      - apps/web/utils/initia/react-bridge.ts
  - Backend:
      - apps/api/src/agents/trading-agent.ts
      - apps/api/src/services/llm-router.ts
      - apps/api/src/services/coingecko-price.ts
      - apps/api/src/agents/agent-loop/market.ts
      - apps/api/src/routes/auth.ts
      - apps/api/src/routes/pairs.ts

  Architecture Rules

  - pages/:
      - route params
      - page-level loading/error state
      - section composition
      - no heavy orchestration
  - components/:
      - presentational sections and bounded smart panels
  - composables/:
      - page/feature orchestration
      - derived state
      - mutation flows
  - features/<domain>/<flow>/:
      - one flow owner
      - one README
      - one obvious entrypoint composable
  - services/:
      - external API/data access only
  - routes/:
      - HTTP composition only
  - repo/ or *-repo.ts:
      - DB access only
  - *-schema.ts:
      - validation + DTOs
  - *-types.ts:
      - shared types only, no behavior

  ## Completed: Phase 1 & 2 (Frontend & Bridge)

  - [x] **Agent/Manager Detail Pages**: Refactored monolithic pages into thin route shells with feature composables and modular sections.
  - [x] **Config Forms**: Decomposed `AgentConfigForm` and `ManagerConfigForm` into shared presentational sections and feature-based logic.
  - [x] **Initia Bridge**: Modularized `react-bridge.ts` into specialized units (`bootstrap`, `sync`, `actions`, `events`).

  ---

  ## Phase 3: Backend Agent Runtime Modularization

  Priority: highest

  ### 1. Trading Agent Durable Object

  Refactor apps/api/src/agents/trading-agent.ts.

  Target structure:

  - apps/api/src/agents/trading-agent/index.ts
  - apps/api/src/agents/trading-agent/state.ts
  - apps/api/src/agents/trading-agent/alarms.ts
  - apps/api/src/agents/trading-agent/websocket.ts
  - apps/api/src/agents/trading-agent/cache.ts
  - apps/api/src/agents/trading-agent/endpoints.ts

  Outcome:

  - transport, state, scheduling, and socket concerns are separate
  - DO behavior becomes discoverable by file name

  ### 2. Agent Loop Flow Modules

  If the orchestration still lives too centrally, split agent-loop flow into named phases.

  Target structure:

  - apps/api/src/agents/agent-loop/load-agent-context.ts
  - apps/api/src/agents/agent-loop/resolve-market-context.ts
  - apps/api/src/agents/agent-loop/resolve-llm-decision.ts
  - apps/api/src/agents/agent-loop/execute-decision.ts
  - apps/api/src/agents/agent-loop/persist-tick-artifacts.ts

  Also split apps/api/src/agents/agent-loop/market.ts if it still mixes fetch, normalization,
  and decision input shaping.

  Outcome:

  - loop stages become explicit and grepable
  - easier for AI agents to jump to the right decision phase

  ### 3. LLM Router

  Refactor apps/api/src/services/llm-router.ts.

  Target structure:

  - apps/api/src/services/llm-router/index.ts
  - apps/api/src/services/llm-router/provider-selection.ts
  - apps/api/src/services/llm-router/request-builders.ts
  - apps/api/src/services/llm-router/response-parsers.ts
  - apps/api/src/services/llm-router/schema-instructions.ts only if needed, otherwise keep
    shared import only

  Outcome:

  - provider selection, prompt assembly, and response parsing are not interleaved

  ### 4. Market/Price Services

  Refactor:

  - apps/api/src/services/coingecko-price.ts
  - apps/api/src/agents/agent-loop/market.ts

  Target structure:

  - fetch client
  - cache keys/constants
  - response normalization
  - domain mapping

  Outcome:

  - easier caching changes
  - easier provider replacement
  - testable normalization units

  ## Phase 4: Route Helper Unification

  Priority: medium-high

  Unify repeated patterns across agents-route/*, managers-route/*, and general routes.

  Create:

  - apps/api/src/routes/_shared/owned-entity.ts
  - apps/api/src/routes/_shared/json-response.ts
  - apps/api/src/routes/_shared/parse-stored-json.ts
  - apps/api/src/routes/_shared/format-stored-entity.ts

  Likely shared helpers:

  - withOwnedEntity
  - parseStoredJson
  - formatStoredEntity
  - notFoundJson

  Refactor:

  - apps/api/src/routes/auth.ts
  - apps/api/src/routes/pairs.ts
  - route groups under agents-route and managers-route

  Outcome:

  - route handlers become smaller and more uniform
  - AI agents see one route pattern instead of several local variants

  ## Phase 5: Shared Auth, Cache, and Constants Surface

  Priority: medium-high

  Create single-source modules for operational constants and cross-cutting helpers.

  Targets:

  - auth/session extraction
  - cache key builders
  - TTL constants
  - provider names
  - route-local response helpers

  Potential layout:

  - apps/api/src/auth/session.ts
  - apps/api/src/cache/keys.ts
  - apps/api/src/cache/ttl.ts
  - apps/api/src/http/responses.ts

  Outcome:

  - tests stop re-declaring constants
  - “where is this cache key defined?” has one answer

  ## Phase 6: README and Navigation Layer

  Priority: medium

  Add short local READMEs at feature roots.

  Status:
  - [x] apps/web/features/agents/create/README.md
  - [ ] apps/web/features/agents/detail/README.md
  - [ ] apps/web/features/agents/edit/README.md
  - [x] apps/web/features/managers/detail/README.md
  - [ ] apps/web/features/agents/config/README.md
  - [ ] apps/web/features/managers/config/README.md
  - [x] apps/web/utils/initia/README.md
  - [x] apps/api/src/agents/README.md
  - [x] apps/api/src/routes/README.md
  - [ ] apps/api/src/services/README.md

  Each README should answer:

  - entrypoint
  - main data flow
  - where to change behavior
  - related tests
  - what not to edit first

  Outcome:

  - AI agents can orient from one README before reading code

  ## Phase 7: Replace Phase-Style Tests

  Priority: medium

  Current test naming still hides ownership:

  - apps/api/tests/phase1.test.ts
  - apps/api/tests/phase2.test.ts
  - apps/api/tests/phase3.test.ts
  - apps/api/tests/phase4.test.ts
  - apps/api/tests/phase6.test.ts

  Replace with module-aligned tests, for example:

  - [x] coingecko-price.test.ts
  - [ ] agent-loop.test.ts
  - [x] managers-route-utils.test.ts
  - [ ] auth-session.test.ts
  - [x] pairs-normalization.test.ts

  Rules:

  - tests import production constants/helpers
  - no duplicated cache key logic
  - no duplicated prompt schema logic
  - no “phase” naming

  Outcome:

  - tests become navigation aids instead of historical artifacts

  ## Phase 8: Repo Hygiene Automation

  Priority: medium

  Add a lightweight script or CI check that fails on structural regressions.

  Suggested checks:

  - app-owned files above threshold
  - missing README in required feature roots
  - duplicate banned symbols
  - maybe import-boundary violations for selected areas

  Suggested files:

  - scripts/check-file-sizes.mjs
  - scripts/check-feature-readmes.mjs
  - scripts/check-duplicate-symbols.mjs

  Suggested policy:

  - warn above 250
  - fail above 350 for allowlisted directories only after migration
  - maintain a short allowlist during transition

  Outcome:

  - the repo does not drift back into large-file sprawl

  ## Phase 9: Export Surface Cleanup

  Priority: lower

  Review barrel and public export strategy.

  Rules:

  - allow boundary barrels only
  - avoid broad global barrels
  - avoid index.ts files that hide ownership unless they are true feature entrypoints

  Potential cleanup:

  - packages/shared/src/index.ts
  - any oversized index.ts that exports unrelated domains together

  Outcome:

  - AI agents can infer ownership from import paths

  ## Recommended Execution Order

  1. apps/api/src/agents/trading-agent.ts
  2. apps/api/src/services/llm-router.ts
  3. apps/api/src/services/coingecko-price.ts and apps/api/src/agents/agent-loop/market.ts
  4. route helper unification
  5. test renaming and duplication cleanup
  6. hygiene scripts and README completion

  ## Definition Of Done

  The original refactor task is fully complete only when:

  - the listed hotspots are split or reduced below agreed thresholds
  - route and agent runtime boundaries are explicit
  - shared helpers have one source of truth
  - required feature READMEs exist
  - phase-style tests are gone
  - structural hygiene checks are in place

---

# COMPLETED TASKS

### Phase 1 & 2: Frontend & Bridge Modularization
- [x] **Agent/Manager Detail Pages**: Lean route shells + feature composables.
- [x] **Config Forms**: Shared sections + logical composables.
- [x] **Initia Bridge**: Domain-split logic unit.
- [x] **Outcome**: High predictability and reduced token scanning for frontend tasks.

### Completed READMEs & Tests
- [x] READMEs: `agents/create`, `managers/detail`, `initia`, `api/agents`, `api/routes`.
- [x] Tests: `coingecko-price`, `managers-route-utils`, `pairs-normalization`.