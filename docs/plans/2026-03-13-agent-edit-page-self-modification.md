# Agent Edit Page + Self-Modification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the agent edit modal with a dedicated two-column edit page (left: config, right: live prompt preview), fix autonomy level having no effect on the LLM, and add a self-modification system where agents can suggest changes to their own config/persona each cycle.

**Architecture:** Three interconnected features: (1) prompt fix — autonomy level injected into `buildAnalysisPrompt()` + self-modification instructions gated by level; (2) self-modification — LLM response gains optional `selfModification` block, agent-loop applies or queues it with audit trail in a new DB table; (3) edit page — new `/agents/[id]/edit` route with reactive left/right split, prompt preview built from last market data snapshot.

**Tech Stack:** Hono (API routes), Drizzle ORM + D1 (DB), `packages/shared` Zod schemas, Nuxt 4 SPA (Vue 3), wrangler D1 migrations.

---

## Task 1: Fix autonomy level in `buildAnalysisPrompt()`

**Files:**
- Modify: `apps/api/src/agents/prompts.ts`
- Modify: `apps/api/src/services/llm-router.ts` (export `JSON_SCHEMA_INSTRUCTION`)

**Step 1: Export `JSON_SCHEMA_INSTRUCTION` from llm-router.ts**

In `apps/api/src/services/llm-router.ts`, change `const JSON_SCHEMA_INSTRUCTION` to `export const JSON_SCHEMA_INSTRUCTION`. This lets the prompt preview endpoint build the exact same system prompt without duplicating the string.

**Step 2: Add `autonomyLevel` param to `buildAnalysisPrompt()`**

In `apps/api/src/agents/prompts.ts`, extend the params object:

```typescript
export function buildAnalysisPrompt(params: {
  // ... existing fields ...
  autonomyLevel: 'full' | 'guided' | 'strict';
}): string {
```

**Step 3: Inject autonomy level into the Constraints section**

Replace the current Constraints block:
```
## Constraints
Allowed pairs: ${config.pairs.join(', ')}
Max position size: ${config.maxPositionSizePct}% of balance
Max open positions: ${config.maxOpenPositions}
Stop loss: ${config.stopLossPct}%
Take profit: ${config.takeProfitPct}%
```

With:
```typescript
const autonomyDesc: Record<string, string> = {
  strict:  'Strict — follow configured rules exactly, no discretion',
  guided:  'Guided — operate within configured bounds, persona guides style and judgment',
  full:    'Full — use complete discretion; persona and your own judgment can override defaults',
};

const selfModInstructions = params.autonomyLevel === 'strict' ? '' :
  params.autonomyLevel === 'guided'
    ? `\n\n## Self-Modification (optional)\nYou MAY suggest soft changes to your own setup for the next cycle. Include a "selfModification" key in your JSON response with: reason (string), changes.personaMd (updated persona markdown, optional), changes.behavior (object with any AgentBehaviorConfig keys, optional). You CANNOT modify hard trading parameters (SL, TP, position sizes).`
    : `\n\n## Self-Modification (optional)\nYou MAY suggest changes to your own setup for the next cycle. Include a "selfModification" key in your JSON response with: reason (string), changes.personaMd (updated persona markdown, optional), changes.behavior (object with any AgentBehaviorConfig keys, optional), changes.config (object with any of: stopLossPct, takeProfitPct, maxPositionSizePct — optional).`;
```

Then in the returned string, replace the Constraints section:
```typescript
## Constraints
Autonomy: ${autonomyDesc[params.autonomyLevel] ?? params.autonomyLevel}
Allowed pairs: ${config.pairs.join(', ')}
Max position size: ${config.maxPositionSizePct}% of balance
Max open positions: ${config.maxOpenPositions}
Stop loss: ${config.stopLossPct}%
Take profit: ${config.takeProfitPct}%
${selfModInstructions}
```

**Step 4: Pass `autonomyLevel` from agent-loop.ts**

In `apps/api/src/agents/agent-loop.ts`, the call to `buildAnalysisPrompt` is inside `getTradeDecision` in `llm-router.ts`. Pass `autonomyLevel` through. In `llm-router.ts`, update `buildAnalysisPrompt({...request, autonomyLevel: request.autonomyLevel})`. It's already in the request object — just needs to be forwarded.

**Step 5: Commit**

```bash
git add apps/api/src/agents/prompts.ts apps/api/src/services/llm-router.ts apps/api/src/agents/agent-loop.ts
git commit -m "fix(prompts): inject autonomy level into LLM constraints + self-mod instructions"
```

---

## Task 2: Extend `TradeDecisionSchema` with `selfModification`

**Files:**
- Modify: `packages/shared/src/validation.ts`
- Modify: `packages/shared/src/types.ts`

**Step 1: Add `SelfModificationSchema` to `validation.ts`**

Add before `TradeDecisionSchema`:

```typescript
export const SelfModificationSchema = z.object({
  reason: z.string().max(500),
  changes: z.object({
    personaMd: z.string().max(4000).optional(),
    behavior: z.record(z.unknown()).optional(),
    config: z.object({
      stopLossPct:          z.number().min(0.5).max(50).optional(),
      takeProfitPct:        z.number().min(0.5).max(100).optional(),
      maxPositionSizePct:   z.number().min(1).max(100).optional(),
    }).optional(),
  }),
});

export type SelfModification = z.infer<typeof SelfModificationSchema>;
```

**Step 2: Add `selfModification` to `TradeDecisionSchema`**

```typescript
export const TradeDecisionSchema = z.object({
  action: z.enum(['buy', 'sell', 'hold', 'close']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  targetPair: z.string().nullable().optional(),
  suggestedPositionSizePct: z.number().min(0).max(100).nullable().optional(),
  selfModification: SelfModificationSchema.optional().nullable(),
});
```

**Step 3: Update `TradeDecision` interface in `types.ts`**

```typescript
export interface TradeDecision {
  action: TradeAction;
  confidence: number;
  reasoning: string;
  targetPair?: string;
  suggestedPositionSizePct?: number;
  selfModification?: {
    reason: string;
    changes: {
      personaMd?: string;
      behavior?: Record<string, unknown>;
      config?: {
        stopLossPct?: number;
        takeProfitPct?: number;
        maxPositionSizePct?: number;
      };
    };
  } | null;
}
```

**Step 4: Commit**

```bash
git add packages/shared/src/validation.ts packages/shared/src/types.ts
git commit -m "feat(schema): add selfModification block to TradeDecisionSchema"
```

---

## Task 3: Add `autoApplySelfModification` to `AgentConfigSchema`

**Files:**
- Modify: `packages/shared/src/validation.ts`

**Step 1: Add field to `AgentConfigSchema`**

In the `AgentConfigSchema` z.object, add after the `autonomyLevel` field:

```typescript
autoApplySelfModification: z.boolean().default(false),
selfModCooldownCycles: z.number().min(1).max(20).default(3),
```

`autoApplySelfModification`: if true, modifications are applied immediately. If false, they go into a pending queue.
`selfModCooldownCycles`: minimum number of loop cycles between applied self-modifications.

**Step 2: Add same fields to `CreateAgentRequestSchema`**

Same two fields with same defaults.

**Step 3: Update `AgentConfig` interface in `types.ts`**

Add to the `AgentConfig` interface:
```typescript
autoApplySelfModification: boolean;
selfModCooldownCycles: number;
```

**Step 4: Commit**

```bash
git add packages/shared/src/validation.ts packages/shared/src/types.ts
git commit -m "feat(schema): add autoApplySelfModification + selfModCooldownCycles to AgentConfig"
```

---

## Task 4: DB schema — add `agentSelfModifications` table

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/migrations/0001_add_self_modifications.sql`

**Step 1: Add table to `schema.ts`**

At the end of `apps/api/src/db/schema.ts`, add:

```typescript
export const agentSelfModifications = sqliteTable('agent_self_modifications', {
  id:           text('id').primaryKey(),
  agentId:      text('agent_id').notNull(),
  decisionId:   text('decision_id').notNull(),
  reason:       text('reason').notNull(),
  changes:      text('changes').notNull(),      // JSON blob: {personaMd?, behavior?, config?}
  changesApplied: text('changes_applied'),       // JSON blob of what was actually gated+applied
  status:       text('status').notNull().default('pending'), // 'pending' | 'applied' | 'rejected'
  appliedAt:    text('applied_at'),
  createdAt:    text('created_at').notNull(),
});
```

**Step 2: Create migration SQL**

Create `apps/api/migrations/0001_add_self_modifications.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_self_modifications (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  changes TEXT NOT NULL,
  changes_applied TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_self_mods_agent_id ON agent_self_modifications(agent_id);
CREATE INDEX IF NOT EXISTS idx_self_mods_status ON agent_self_modifications(status);
```

**Step 3: Apply migration locally**

```bash
cd apps/api && npm run migration:apply:local
```

Expected output: `✅ Applied 1 migration`

**Step 4: Import new table in agent-loop and routes**

In any file that needs it: `import { agentSelfModifications } from '../db/schema.js';`

**Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/migrations/
git commit -m "feat(db): add agent_self_modifications table"
```

---

## Task 5: Agent loop — handle `selfModification` from LLM response

**Files:**
- Modify: `apps/api/src/agents/agent-loop.ts`

**Overview:** After logging the decision (step 7), check if `decision.selfModification` exists. Gate by autonomy level. Check cooldown (stored as cycle count in config JSON). Apply or queue. Update agent config in DB. Log to `agentSelfModifications` table.

**Step 1: Import new table**

Add to imports at top:
```typescript
import { agentSelfModifications } from '../db/schema.js';
import { SelfModificationSchema } from '@dex-agents/shared';
```

**Step 2: After the decision log (after step 7 in agent-loop), add self-modification handler**

```typescript
// 7b. Handle self-modification suggestions
const selfMod = decision.selfModification;
if (selfMod && autonomyLevel !== 'strict') {
  // Validate the selfModification block
  const parsed = SelfModificationSchema.safeParse(selfMod);
  if (!parsed.success) {
    console.warn(`[agent-loop] ${agentId}: selfModification failed validation:`, parsed.error);
  } else {
    const mod = parsed.data;
    const modId = generateId('selfmod');

    // Check confidence gate
    const meetsConfidence = decision.confidence >= 0.6;

    // Check cooldown: read cyclesSinceLastMod from config, default 0
    const cyclesSinceLastMod: number = (rawConfig as any).cyclesSinceLastMod ?? 999;
    const cooldownCycles = config.selfModCooldownCycles ?? 3;
    const cooldownPassed = cyclesSinceLastMod >= cooldownCycles;

    // Gate changes by autonomy level
    let gatedChanges = { ...mod.changes };
    if (autonomyLevel === 'guided') {
      // Strip hard config changes
      delete gatedChanges.config;
    }

    const canApply = meetsConfidence && cooldownPassed;
    const shouldAutoApply = config.autoApplySelfModification === true;

    if (!canApply) {
      console.log(`[agent-loop] ${agentId}: selfMod blocked — confidence=${decision.confidence.toFixed(2)} cooldown=${cyclesSinceLastMod}/${cooldownCycles}`);
    } else {
      const status = (canApply && shouldAutoApply) ? 'applied' : 'pending';

      await db.insert(agentSelfModifications).values({
        id: modId,
        agentId,
        decisionId: decisionId, // store the ID of the decision that triggered this
        reason: mod.reason,
        changes: JSON.stringify(mod.changes),
        changesApplied: JSON.stringify(gatedChanges),
        status,
        appliedAt: status === 'applied' ? nowIso() : null,
        createdAt: nowIso(),
      });

      if (status === 'applied') {
        // Build DB updates
        const agentUpdates: Partial<typeof agents.$inferInsert> = { updatedAt: nowIso() };
        const configPatch: Record<string, unknown> = {};

        if (gatedChanges.personaMd) {
          agentUpdates.personaMd = gatedChanges.personaMd;
        }
        if (gatedChanges.behavior) {
          configPatch.behavior = { ...(config.behavior ?? {}), ...gatedChanges.behavior };
        }
        if (gatedChanges.config) {
          if (gatedChanges.config.stopLossPct !== undefined) configPatch.stopLossPct = gatedChanges.config.stopLossPct;
          if (gatedChanges.config.takeProfitPct !== undefined) configPatch.takeProfitPct = gatedChanges.config.takeProfitPct;
          if (gatedChanges.config.maxPositionSizePct !== undefined) configPatch.maxPositionSizePct = gatedChanges.config.maxPositionSizePct;
        }

        // Reset cooldown counter
        configPatch.cyclesSinceLastMod = 0;

        if (Object.keys(configPatch).length > 0) {
          const newConfig = JSON.stringify({ ...rawConfig, ...configPatch });
          agentUpdates.config = newConfig;
        }

        await db.update(agents).set(agentUpdates).where(eq(agents.id, agentId));
        console.log(`[agent-loop] ${agentId}: Applied self-modification — ${mod.reason}`);
      }
    }

    // Increment cycle counter (always, unless we just reset it)
    if (!canApply || !shouldAutoApply) {
      const newCycles = (cyclesSinceLastMod === 999 ? 0 : cyclesSinceLastMod) + 1;
      const newConfig = JSON.stringify({ ...rawConfig, cyclesSinceLastMod: newCycles });
      await db.update(agents).set({ config: newConfig }).where(eq(agents.id, agentId));
    }
  }
}
```

Note: `decisionId` is the ID of the decision just inserted. Make sure to capture it: before the `db.insert(agentDecisions)` call, assign `const decisionId = generateId('dec');` and use it in both the insert and the selfMod handler.

**Step 3: Commit**

```bash
git add apps/api/src/agents/agent-loop.ts
git commit -m "feat(agent-loop): handle LLM self-modification suggestions with autonomy gating + cooldown"
```

---

## Task 6: API — prompt preview + self-modifications CRUD

**Files:**
- Modify: `apps/api/src/routes/agents.ts`

**Step 1: Add prompt preview endpoint**

The preview uses the most recent `marketDataSnapshot` from `agentDecisions` (already the exact data the last real loop used). If no decisions exist yet, returns a placeholder. Add after the existing `/persona/reset` route:

```typescript
import { BASE_AGENT_PROMPT, buildAnalysisPrompt } from '../agents/prompts.js';
import { JSON_SCHEMA_INSTRUCTION } from '../services/llm-router.js';
import { intToAutonomyLevel } from '../lib/utils.js';

/** GET /api/agents/:id/prompt-preview — build the full prompt from last market snapshot */
agentsRoute.get('/:id/prompt-preview', async (c) => {
  const id = c.req.param('id');
  const walletAddress = c.get('walletAddress');
  const db = drizzle(c.env.DB);

  const agent = await requireOwnership(db, id, walletAddress);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const config = JSON.parse(agent.config) as Record<string, unknown>;

  // Get last decision for market data snapshot
  const [lastDecision] = await db
    .select()
    .from(agentDecisions)
    .where(eq(agentDecisions.agentId, id))
    .orderBy(desc(agentDecisions.createdAt))
    .limit(1);

  const rawMarketData = lastDecision?.marketDataSnapshot
    ? JSON.parse(lastDecision.marketDataSnapshot) as Array<{
        pair: string; priceUsd: number; priceChange: Record<string, number|undefined>;
        volume24h?: number; liquidity?: number; indicatorText: string;
      }>
    : [];

  // Get recent decisions for context
  const recentDecisions = await db
    .select({ decision: agentDecisions.decision, confidence: agentDecisions.confidence, createdAt: agentDecisions.createdAt })
    .from(agentDecisions)
    .where(eq(agentDecisions.agentId, id))
    .orderBy(desc(agentDecisions.createdAt))
    .limit(10);

  // Get open positions from trades table
  const openTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.agentId, id));
  const openPositions = openTrades
    .filter((t) => t.status === 'open')
    .map((t) => ({
      pair: t.pair,
      side: t.side as 'buy' | 'sell',
      entryPrice: t.entryPrice,
      amountUsd: t.amountUsd,
      unrealizedPct: 0, // approximate
      currentPrice: t.entryPrice, // approximate
      openedAt: t.openedAt,
      slPct: (config.stopLossPct as number) ?? 5,
      tpPct: (config.takeProfitPct as number) ?? 7,
    }));

  const paperBalance = (config.paperBalance as number) ?? 10000;
  const autonomyLevel = intToAutonomyLevel(agent.autonomyLevel) as 'full' | 'guided' | 'strict';

  const systemPrompt = BASE_AGENT_PROMPT + JSON_SCHEMA_INSTRUCTION;
  const userPrompt = rawMarketData.length > 0
    ? buildAnalysisPrompt({
        portfolioState: {
          balance: paperBalance,
          openPositions: openPositions.length,
          dailyPnlPct: 0,
          totalPnlPct: 0,
        },
        openPositions,
        marketData: rawMarketData,
        lastDecisions: recentDecisions,
        config: {
          pairs: (config.pairs as string[]) ?? [],
          maxPositionSizePct: (config.maxPositionSizePct as number) ?? 5,
          maxOpenPositions: (config.maxOpenPositions as number) ?? 3,
          stopLossPct: (config.stopLossPct as number) ?? 5,
          takeProfitPct: (config.takeProfitPct as number) ?? 7,
        },
        autonomyLevel,
        behavior: config.behavior as any,
        personaMd: agent.personaMd,
      })
    : '(No market data yet — run the agent at least once to populate the preview)';

  return c.json({
    systemPrompt,
    userPrompt,
    marketDataAt: lastDecision?.createdAt ?? null,
    hasMarketData: rawMarketData.length > 0,
  });
});
```

**Step 2: Add self-modifications list endpoint**

```typescript
import { agentSelfModifications } from '../db/schema.js';

/** GET /api/agents/:id/self-modifications */
agentsRoute.get('/:id/self-modifications', async (c) => {
  const id = c.req.param('id');
  const walletAddress = c.get('walletAddress');
  const db = drizzle(c.env.DB);
  const agent = await requireOwnership(db, id, walletAddress);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  const mods = await db
    .select()
    .from(agentSelfModifications)
    .where(eq(agentSelfModifications.agentId, id))
    .orderBy(desc(agentSelfModifications.createdAt))
    .limit(20);
  return c.json({ modifications: mods });
});
```

**Step 3: Add approve/reject endpoints**

```typescript
/** POST /api/agents/:id/self-modifications/:modId/approve */
agentsRoute.post('/:id/self-modifications/:modId/approve', async (c) => {
  const id = c.req.param('id');
  const modId = c.req.param('modId');
  const walletAddress = c.get('walletAddress');
  const db = drizzle(c.env.DB);
  const agent = await requireOwnership(db, id, walletAddress);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const [mod] = await db.select().from(agentSelfModifications)
    .where(eq(agentSelfModifications.id, modId));
  if (!mod || mod.agentId !== id || mod.status !== 'pending') {
    return c.json({ error: 'Modification not found or not pending' }, 404);
  }

  const changes = JSON.parse(mod.changesApplied ?? mod.changes) as {
    personaMd?: string; behavior?: Record<string, unknown>;
    config?: { stopLossPct?: number; takeProfitPct?: number; maxPositionSizePct?: number };
  };

  const agentUpdates: Partial<typeof agents.$inferInsert> = { updatedAt: nowIso() };
  const existingConfig = JSON.parse(agent.config) as Record<string, unknown>;
  const configPatch: Record<string, unknown> = {};

  if (changes.personaMd) agentUpdates.personaMd = changes.personaMd;
  if (changes.behavior) configPatch.behavior = { ...(existingConfig.behavior as object ?? {}), ...changes.behavior };
  if (changes.config) {
    if (changes.config.stopLossPct !== undefined) configPatch.stopLossPct = changes.config.stopLossPct;
    if (changes.config.takeProfitPct !== undefined) configPatch.takeProfitPct = changes.config.takeProfitPct;
    if (changes.config.maxPositionSizePct !== undefined) configPatch.maxPositionSizePct = changes.config.maxPositionSizePct;
  }
  if (Object.keys(configPatch).length > 0) {
    agentUpdates.config = JSON.stringify({ ...existingConfig, ...configPatch });
  }

  await db.update(agents).set(agentUpdates).where(eq(agents.id, id));
  await db.update(agentSelfModifications)
    .set({ status: 'applied', appliedAt: nowIso() })
    .where(eq(agentSelfModifications.id, modId));

  return c.json({ ok: true });
});

/** POST /api/agents/:id/self-modifications/:modId/reject */
agentsRoute.post('/:id/self-modifications/:modId/reject', async (c) => {
  const id = c.req.param('id');
  const modId = c.req.param('modId');
  const walletAddress = c.get('walletAddress');
  const db = drizzle(c.env.DB);
  const agent = await requireOwnership(db, id, walletAddress);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  await db.update(agentSelfModifications)
    .set({ status: 'rejected' })
    .where(eq(agentSelfModifications.id, modId));
  return c.json({ ok: true });
});
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/agents.ts
git commit -m "feat(api): add prompt-preview + self-modifications CRUD endpoints"
```

---

## Task 7: Frontend — `AgentConfigForm.vue` reorder + new fields

**Files:**
- Modify: `apps/web/components/AgentConfigForm.vue`

**Step 1: Move LLM Model + Autonomy Level to the top**

In the `<template>`, reorder sections to:
1. Name row (already first)
2. LLM Model selector (move from inside `Trading Config` accordion to directly below the name row)
3. Autonomy Level select (move from inside `Trading Config` accordion to directly below LLM Model)
4. Persona style (profile picker) — already in position
5. Fine-tune Behavior accordion
6. Persona MD accordion
7. Trading Config accordion (now contains only: Trading Pairs, Starting Balance, Max Position Size, SL/TP, Max Open Positions, Strategy)

**Step 2: Add `autoApplySelfModification` to the form reactive state**

In `<script setup>`, add to `form`:
```typescript
const form = reactive<CreateAgentPayload & { pairs: string[] }>({
  // ... existing ...
  autoApplySelfModification: false,
  selfModCooldownCycles: 3,
});
```

**Step 3: Add the checkbox in template, just under Autonomy Level**

Show only when `form.autonomyLevel !== 'strict'`:

```html
<div v-if="form.autonomyLevel !== 'strict'" class="form-group">
  <label class="acf__self-mod-label">
    <input v-model="form.autoApplySelfModification" type="checkbox" />
    <span>Auto-apply self-modifications</span>
    <span class="acf__hint-chip">agent can update its own persona/behavior each cycle</span>
  </label>
  <div v-if="form.autoApplySelfModification" class="form-group" style="margin-top:8px">
    <label class="form-label">Cooldown (cycles between modifications)</label>
    <input v-model.number="form.selfModCooldownCycles" type="number" class="form-input" min="1" max="20" />
  </div>
</div>
```

**Step 4: Default `autoApplySelfModification` based on autonomy level**

Watch `form.autonomyLevel`:
```typescript
watch(() => form.autonomyLevel, (level) => {
  if (level === 'full' && !props.initialValues?.autoApplySelfModification) {
    form.autoApplySelfModification = true;
  } else if (level !== 'full' && !props.initialValues?.autoApplySelfModification) {
    form.autoApplySelfModification = false;
  }
});
```

**Step 5: Include in submit payload**

Already included via `...form` spread in `handleSubmit`. Make sure `CreateAgentPayload` type in `useAgents.ts` gets `autoApplySelfModification?: boolean` and `selfModCooldownCycles?: number`.

**Step 6: Commit**

```bash
git add apps/web/components/AgentConfigForm.vue apps/web/composables/useAgents.ts
git commit -m "feat(form): reorder AgentConfigForm (LLM+autonomy up top) + auto-apply self-mod checkbox"
```

---

## Task 8: New edit page `/agents/[id]/edit`

**Files:**
- Create: `apps/web/pages/agents/[id]/edit.vue`

> Note: Nuxt 4 file-based routing. Creating `pages/agents/[id]/edit.vue` makes the route `/agents/:id/edit`. The existing `pages/agents/[id].vue` becomes the parent-or-sibling depending on layout. In Nuxt 4, `[id].vue` and `[id]/edit.vue` coexist fine as separate routes.

**Step 1: Create the edit page file**

`apps/web/pages/agents/[id]/edit.vue`:

```vue
<script setup lang="ts">
definePageMeta({ ssr: false });
const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);
const { getAgent, updateAgent } = useAgents();
const { request } = useApi();

const agent = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

// Prompt preview state
const previewLoading = ref(true);
const previewError = ref('');
const systemPrompt = ref('');
const userPrompt = ref('');
const marketDataAt = ref<string | null>(null);
const hasMarketData = ref(false);

// Local copy of config that the form edits — used to reactively rebuild preview
const previewConfig = ref<any>(null);

// Expandable sections in preview
const systemExpanded = ref(false);
const marketDataExpanded = ref(false);

onMounted(async () => {
  try {
    agent.value = await getAgent(id.value);
    previewConfig.value = { ...agent.value.config, ...agent.value };
  } finally {
    loading.value = false;
  }

  // Fetch prompt preview once
  try {
    const data = await request<{
      systemPrompt: string; userPrompt: string;
      marketDataAt: string | null; hasMarketData: boolean;
    }>(`/agents/${id.value}/prompt-preview`);
    systemPrompt.value = data.systemPrompt;
    userPrompt.value = data.userPrompt;
    marketDataAt.value = data.marketDataAt;
    hasMarketData.value = data.hasMarketData;
  } catch (e) {
    previewError.value = 'Failed to load prompt preview';
  } finally {
    previewLoading.value = false;
  }
});

// Rebuild userPrompt reactively as form config changes
// (client-side reconstruction of the prompt from form values)
// We import buildAnalysisPrompt from shared — but it's a server-side utility.
// Instead, we re-fetch the preview from the API on meaningful config changes
// with a debounce (heavy changes only — persona, autonomy, behavior).
// For simplicity in v1: just show the fetched-once preview with a note that
// it reflects the last agent loop run. Full reactive rebuild is a future enhancement.

async function handleSave(payload: any) {
  saving.value = true;
  error.value = '';
  try {
    await updateAgent(id.value, payload);
    router.push(`/agents/${id.value}`);
  } catch (e: any) {
    error.value = e.message ?? 'Save failed';
    saving.value = false;
  }
}

function handleCancel() {
  router.push(`/agents/${id.value}`);
}

// Split userPrompt into sections for display
const promptSections = computed(() => {
  if (!userPrompt.value) return null;
  const text = userPrompt.value;
  const systemSection = systemPrompt.value;

  // Split user prompt at known section headers
  const sections: Array<{ title: string; content: string; collapsible: boolean; expanded: Ref<boolean> }> = [];

  // Market Data section
  const mdMatch = text.match(/(## Market Data[\s\S]*?)(?=\n## |$)/);
  const restWithoutMd = text.replace(mdMatch?.[0] ?? '', '');

  if (mdMatch) {
    sections.push({ title: 'Market Data', content: mdMatch[0].trim(), collapsible: true, expanded: marketDataExpanded });
  }
  // Push remaining sections inline
  sections.push({ title: 'Context', content: restWithoutMd.trim(), collapsible: false, expanded: ref(true) });

  return { systemSection, sections };
});
</script>

<template>
  <div class="edit-page">
    <div v-if="loading" class="edit-page__loading">Loading…</div>
    <template v-else>
      <!-- Header -->
      <div class="edit-page__header">
        <NuxtLink :to="`/agents/${id}`" class="edit-page__back">← Back to agent</NuxtLink>
        <h1 class="edit-page__title">Edit Agent</h1>
      </div>

      <div class="edit-page__body">
        <!-- Left: Config form -->
        <div class="edit-page__left">
          <AgentConfigForm
            v-if="agent"
            :initial-values="{ ...agent.config, ...agent, pairs: agent.config?.pairs }"
            @submit="handleSave"
            @cancel="handleCancel"
          />
          <div v-if="error" class="alert alert-error" style="margin-top:12px">{{ error }}</div>
        </div>

        <!-- Right: Prompt preview -->
        <div class="edit-page__right">
          <div class="prompt-preview">
            <div class="prompt-preview__header">
              <span class="prompt-preview__title">Prompt Preview</span>
              <span v-if="marketDataAt" class="prompt-preview__meta">
                market data from {{ new Date(marketDataAt).toLocaleTimeString() }}
              </span>
            </div>

            <div v-if="previewLoading" class="prompt-preview__loading">Loading preview…</div>
            <div v-else-if="previewError" class="prompt-preview__error">{{ previewError }}</div>
            <template v-else>
              <!-- SYSTEM section (collapsed by default) -->
              <div class="prompt-section">
                <button class="prompt-section__toggle" @click="systemExpanded = !systemExpanded">
                  <span class="prompt-section__label">SYSTEM</span>
                  <span class="prompt-section__chevron" :class="{ open: systemExpanded }">›</span>
                </button>
                <pre v-if="systemExpanded" class="prompt-section__content">{{ systemPrompt }}</pre>
              </div>

              <!-- MARKET DATA section (collapsed by default) -->
              <div class="prompt-section">
                <button class="prompt-section__toggle" @click="marketDataExpanded = !marketDataExpanded">
                  <span class="prompt-section__label">MARKET DATA</span>
                  <span v-if="!hasMarketData" class="prompt-section__hint">no data yet</span>
                  <span class="prompt-section__chevron" :class="{ open: marketDataExpanded }">›</span>
                </button>
                <pre v-if="marketDataExpanded" class="prompt-section__content">{{ promptSections?.sections[0]?.content ?? '(no market data)' }}</pre>
              </div>

              <!-- Rest of prompt (always visible) -->
              <pre class="prompt-section__content prompt-section__content--main">{{ promptSections?.sections[1]?.content }}</pre>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.edit-page {
  min-height: 100vh;
  background: var(--bg, #0a0a0a);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1400px;
  margin: 0 auto;
}
.edit-page__loading { color: var(--text-muted); padding: 40px; text-align: center; }
.edit-page__header { display: flex; align-items: center; gap: 16px; }
.edit-page__back { color: var(--accent, #7c6af7); font-size: 13px; text-decoration: none; }
.edit-page__back:hover { text-decoration: underline; }
.edit-page__title { font-size: 20px; font-weight: 700; color: var(--text); margin: 0; }
.edit-page__body {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 24px;
  align-items: start;
}
.edit-page__left { position: sticky; top: 24px; }
.edit-page__right { min-width: 0; }

/* Prompt preview */
.prompt-preview {
  background: var(--surface, #141414);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.prompt-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #2a2a2a);
  background: color-mix(in srgb, var(--border, #2a2a2a) 30%, transparent);
}
.prompt-preview__title { font-size: 12px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-muted, #555); }
.prompt-preview__meta { font-size: 11px; color: var(--text-muted, #444); }
.prompt-preview__loading, .prompt-preview__error { padding: 24px 16px; font-size: 13px; color: var(--text-muted); }

/* Prompt sections */
.prompt-section { border-bottom: 1px solid var(--border, #1e1e1e); }
.prompt-section__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: none;
  border: none;
  color: var(--text-muted, #555);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;
  gap: 8px;
}
.prompt-section__toggle:hover { background: color-mix(in srgb, var(--border) 20%, transparent); }
.prompt-section__label { flex: 1; }
.prompt-section__hint { font-size: 10px; font-weight: 400; color: var(--text-muted, #444); }
.prompt-section__chevron { font-size: 16px; transition: transform 0.2s; }
.prompt-section__chevron.open { transform: rotate(90deg); }
.prompt-section__content {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary, #aaa);
  padding: 12px 16px;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  background: color-mix(in srgb, var(--border, #2a2a2a) 10%, transparent);
}
.prompt-section__content--main {
  border-bottom: none;
  max-height: 600px;
  overflow-y: auto;
}

@media (max-width: 900px) {
  .edit-page__body { grid-template-columns: 1fr; }
  .edit-page__left { position: static; }
}
</style>
```

**Step 2: Commit**

```bash
git add apps/web/pages/agents/
git commit -m "feat(web): add /agents/[id]/edit page with two-column config + prompt preview"
```

---

## Task 9: Update `[id].vue` — replace edit modal with link to edit page

**Files:**
- Modify: `apps/web/pages/agents/[id].vue`

**Step 1: Find the "Edit" button or modal trigger in `[id].vue`**

Search for where the edit modal is opened (likely a ref like `showEditModal = ref(false)` or a button triggering it). Replace the button's handler with a router navigation:

```typescript
function openEdit() {
  router.push(`/agents/${id.value}/edit`);
}
```

Or use a `<NuxtLink>` directly on the Edit button:
```html
<NuxtLink :to="`/agents/${id}/edit`" class="btn btn-secondary">Edit</NuxtLink>
```

**Step 2: Remove the inline edit modal component usage**

Find any `<AgentConfigForm>` usage inside a modal in `[id].vue` and remove it (the form now lives exclusively on the edit page). Also remove any `showEditModal` ref and related state if they exist.

**Step 3: Commit**

```bash
git add apps/web/pages/agents/[id].vue
git commit -m "feat(web): replace edit modal with link to /agents/[id]/edit"
```

---

## Task 10: Frontend — `useSelfModifications` composable + pending UI

**Files:**
- Create: `apps/web/composables/useSelfModifications.ts`
- Modify: `apps/web/pages/agents/[id].vue`

**Step 1: Create `useSelfModifications.ts`**

```typescript
export interface SelfModification {
  id: string;
  agentId: string;
  decisionId: string;
  reason: string;
  changes: string; // raw JSON
  changesApplied: string | null;
  status: 'pending' | 'applied' | 'rejected';
  appliedAt: string | null;
  createdAt: string;
}

export function useSelfModifications() {
  const { request } = useApi();

  async function fetchModifications(agentId: string): Promise<SelfModification[]> {
    const data = await request<{ modifications: SelfModification[] }>(`/agents/${agentId}/self-modifications`);
    return data.modifications;
  }

  async function approve(agentId: string, modId: string): Promise<void> {
    await request(`/agents/${agentId}/self-modifications/${modId}/approve`, { method: 'POST' });
  }

  async function reject(agentId: string, modId: string): Promise<void> {
    await request(`/agents/${agentId}/self-modifications/${modId}/reject`, { method: 'POST' });
  }

  return { fetchModifications, approve, reject };
}
```

**Step 2: Add pending self-modifications section to `[id].vue`**

In the `<script setup>` of `[id].vue`:
```typescript
const { fetchModifications, approve, reject } = useSelfModifications();
const selfMods = ref<SelfModification[]>([]);

// Load alongside agent data
async function loadSelfMods() {
  selfMods.value = await fetchModifications(id.value);
}

// Call in onMounted alongside other fetches
// pending count for badge
const pendingMods = computed(() => selfMods.value.filter(m => m.status === 'pending'));
```

In the `<template>`, add a section (near the top of the agent detail, after the status header):

```html
<!-- Pending Self-Modifications -->
<div v-if="pendingMods.length > 0" class="selfmod-queue">
  <div class="selfmod-queue__header">
    <span class="selfmod-queue__title">Pending Self-Modifications</span>
    <span class="selfmod-queue__badge">{{ pendingMods.length }}</span>
  </div>
  <div v-for="mod in pendingMods" :key="mod.id" class="selfmod-card">
    <div class="selfmod-card__reason">{{ mod.reason }}</div>
    <div class="selfmod-card__changes">
      <pre>{{ JSON.stringify(JSON.parse(mod.changesApplied ?? mod.changes), null, 2) }}</pre>
    </div>
    <div class="selfmod-card__actions">
      <button class="btn btn-primary btn-sm" @click="approveMod(mod.id)">Apply</button>
      <button class="btn btn-ghost btn-sm" @click="rejectMod(mod.id)">Reject</button>
    </div>
  </div>
</div>
```

Add `approveMod` and `rejectMod` handlers that call the composable then reload `selfMods`.

**Step 3: Show "self-modified" badge in the analysis log**

In the decisions log section of `[id].vue`, if a decision has triggered a self-modification (join by `decisionId`), show a small badge "self-modified ✎" next to the decision timestamp. This requires loading `selfMods` and building a `Set` of decision IDs that triggered modifications.

```typescript
const selfModDecisionIds = computed(() =>
  new Set(selfMods.value.map(m => m.decisionId))
);
```

In the decision template:
```html
<span v-if="selfModDecisionIds.has(dec.id)" class="selfmod-badge">✎ self-modified</span>
```

**Step 4: Commit**

```bash
git add apps/web/composables/useSelfModifications.ts apps/web/pages/agents/[id].vue
git commit -m "feat(web): self-modifications queue + approve/reject UI in agent detail"
```

---

## Verification Checklist

- [ ] `npm run dev:api` — no TypeScript errors, server starts on port 8787
- [ ] `npm run dev:web` — no TypeScript errors, web starts on port 3000
- [ ] Navigate to `/agents/:id/edit` — two-column layout renders
- [ ] Edit page left column order: Name → LLM Model → Autonomy Level → Persona → Behavior → Trading Config
- [ ] Edit page right column shows prompt preview with SYSTEM (collapsed) and MARKET DATA (collapsed) sections
- [ ] Saving from edit page returns to agent detail page
- [ ] Autonomy level `strict` hides self-mod checkbox; `guided` shows it unchecked; `full` shows it checked by default
- [ ] Migration applied: `agent_self_modifications` table exists in local D1
- [ ] `GET /api/agents/:id/prompt-preview` returns `{systemPrompt, userPrompt, marketDataAt, hasMarketData}`
- [ ] Agent with `autoApplySelfModification=true` and `autonomyLevel=full` — run analysis — check if `agent_self_modifications` row appears when LLM returns a `selfModification` block
- [ ] Pending modifications appear in agent detail, approve/reject work
- [ ] `npm run test` — no regressions
