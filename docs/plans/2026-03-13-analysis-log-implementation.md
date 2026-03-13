# Analysis Log Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Decision Log in the agent detail page with a chat-style Analysis Log that exposes the full Prompt ↔ LLM exchange, with colour-coded toggleable sections per prompt part.

**Architecture:** All logic is frontend-only — no backend changes. `llmPromptText` is already stored and retrieved; we parse it by known `##` markdown headers into SYSTEM / MARKET DATA / EDITABLE SETUP sections. The ghost "next" entry reuses existing countdown state. CSS lives in the `<style>` block of the same `.vue` file.

**Tech Stack:** Vue 3 `<script setup>`, Nuxt 4, raw-craft CSS conventions (no Tailwind, no component library), existing CSS variables from the project design system.

**Worktree:** `.worktrees/analysis-log-redesign` on branch `feat/analysis-log-redesign`

---

### Task 1: Add parsing utility functions

**Files:**
- Modify: `apps/web/pages/agents/[id].vue` — inside `<script setup>`, after the existing `toggleDecision` / `setDecisionTab` helpers

**Step 1: Add the three helper functions**

Find the block starting with `function toggleDecision` and add these functions **before** it:

```typescript
/** Split a stored llmPromptText into the three logical sections */
function parsePromptSections(promptText: string | undefined): {
  system: string;
  marketData: string;
  editableSetup: string;
} {
  if (!promptText) return { system: '', marketData: '', editableSetup: '' };

  const portfolioIdx = promptText.indexOf('## Portfolio State');
  const behaviorIdx  = promptText.indexOf('## Your Behavior Profile');
  const personaIdx   = promptText.indexOf('## Your Persona');

  // SYSTEM: everything before ## Portfolio State
  const system = portfolioIdx >= 0 ? promptText.slice(0, portfolioIdx).trim() : promptText.trim();

  // EDITABLE SETUP: ## Your Behavior Profile and/or ## Your Persona onwards
  const editableStart = behaviorIdx >= 0 ? behaviorIdx : (personaIdx >= 0 ? personaIdx : -1);
  const editableSetup = editableStart >= 0 ? promptText.slice(editableStart).trim() : '';

  // MARKET DATA: between system and editableSetup
  const marketEnd = editableStart >= 0 ? editableStart : promptText.length;
  const marketData = portfolioIdx >= 0 ? promptText.slice(portfolioIdx, marketEnd).trim() : '';

  return { system, marketData, editableSetup };
}

/** Rough token estimate: 1 token ≈ 4 characters */
function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Returns true when the EDITABLE SETUP section of `dec` differs from `prevDec`.
 * `prevDec` is the entry that came *before* this one in the decisions array
 * (i.e. decisions[idx + 1], because the array is newest-first).
 */
function hasEditedSetup(dec: AgentDecision, prevDec: AgentDecision | undefined): boolean {
  if (!prevDec || !dec.llmPromptText || !prevDec.llmPromptText) return false;
  const curr = parsePromptSections(dec.llmPromptText).editableSetup;
  const prev = parsePromptSections(prevDec.llmPromptText).editableSetup;
  return curr.length > 0 && prev.length > 0 && curr !== prev;
}
```

**Step 2: Add expanded-sections state**

Find the line `const expandedDecisions = ref<Set<string>>(new Set());` and add directly below it:

```typescript
/** Tracks which pill sections are open per decision id */
const expandedSections = ref<Record<string, Set<string>>>({});

function toggleSection(decId: string, section: string) {
  const current = expandedSections.value[decId] ?? new Set<string>();
  const next = new Set(current);
  if (next.has(section)) {
    next.delete(section);
  } else {
    next.add(section);
  }
  expandedSections.value = { ...expandedSections.value, [decId]: next };
}
```

**Step 3: Commit**

```bash
cd .worktrees/analysis-log-redesign
git add apps/web/pages/agents/\[id\].vue
git commit -m "feat(analysis-log): add prompt section parsing utilities"
```

---

### Task 2: Replace the Decision Log template block

**Files:**
- Modify: `apps/web/pages/agents/[id].vue` — the `<!-- ── Decisions Log ── -->` section in `<template>`

**Step 1: Locate the section to replace**

Find this comment in the template:
```html
<!-- ── Decisions Log ───────────────────────────────────────────── -->
```
The section ends just before the `<!-- Open Positions section -->` comment. Replace the entire block with the following:

```html
<!-- ── Analysis Log ───────────────────────────────────────────── -->
<div class="dec-section">
  <div class="dec-section-header">
    <span class="dec-section-title">Analysis Log</span>
    <span class="dec-section-count">{{ decisions.length }}</span>
  </div>

  <div v-if="decisions.length === 0" class="dec-empty">
    No decisions yet — click <strong>⚡ Run Analysis</strong> to fetch market data and get the LLM&apos;s reasoning
  </div>

  <div v-else class="chat-feed">
    <!-- ── Past decisions ── -->
    <div v-for="(dec, idx) in decisions" :key="dec.id" class="chat-row">

      <!-- LEFT: Prompt bubble -->
      <div class="chat-bubble chat-bubble--prompt">
        <div class="chat-bubble-label">PROMPT →</div>

        <div class="prompt-pills">
          <!-- SYSTEM -->
          <button class="prompt-pill prompt-pill--system" @click="toggleSection(dec.id, 'system')">
            <span>[SYSTEM · {{ countTokens(parsePromptSections(dec.llmPromptText).system) }}]</span>
            <span class="pill-chevron">{{ expandedSections[dec.id]?.has('system') ? '▾' : '▸' }}</span>
          </button>
          <div v-if="expandedSections[dec.id]?.has('system')" class="pill-content">
            <pre class="dec-code-block">{{ parsePromptSections(dec.llmPromptText).system }}</pre>
          </div>

          <!-- MARKET DATA -->
          <button class="prompt-pill prompt-pill--market" @click="toggleSection(dec.id, 'market')">
            <span>[MARKET DATA · {{ countTokens(parsePromptSections(dec.llmPromptText).marketData) }}]</span>
            <span class="pill-chevron">{{ expandedSections[dec.id]?.has('market') ? '▾' : '▸' }}</span>
          </button>
          <div v-if="expandedSections[dec.id]?.has('market')" class="pill-content">
            <pre class="dec-code-block">{{ parsePromptSections(dec.llmPromptText).marketData }}</pre>
          </div>

          <!-- EDITABLE SETUP -->
          <button
            class="prompt-pill prompt-pill--setup"
            @click="toggleSection(dec.id, 'setup')"
          >
            <span>
              [EDITABLE SETUP · {{ countTokens(parsePromptSections(dec.llmPromptText).editableSetup) }}]
            </span>
            <span v-if="hasEditedSetup(dec, decisions[idx + 1])" class="pill-edited-tag">edited</span>
            <span class="pill-chevron">{{ expandedSections[dec.id]?.has('setup') ? '▾' : '▸' }}</span>
          </button>
          <div v-if="expandedSections[dec.id]?.has('setup')" class="pill-content">
            <pre class="dec-code-block">{{ parsePromptSections(dec.llmPromptText).editableSetup }}</pre>
          </div>
        </div>

        <div class="chat-bubble-meta">
          total: {{ (dec.llmPromptTokens ?? countTokens(dec.llmPromptText ?? '')).toLocaleString() }}↑
        </div>
      </div>

      <!-- RIGHT: LLM response bubble -->
      <div class="chat-bubble chat-bubble--response">
        <div class="chat-bubble-label">← LLM</div>

        <div class="chat-decision-header">
          <span class="dec-action-badge" :class="`dec-action--${dec.decision}`">{{ dec.decision.toUpperCase() }}</span>
          <div class="dec-conf">
            <span class="dec-conf-label">conf</span>
            <span class="dec-conf-num">{{ (dec.confidence * 100).toFixed(0) }}%</span>
            <div class="dec-conf-track">
              <div class="dec-conf-fill" :class="`dec-conf-fill--${dec.decision}`" :style="{ width: (dec.confidence * 100) + '%' }" />
            </div>
          </div>
        </div>

        <div class="chat-reasoning">{{ dec.reasoning }}</div>

        <template v-if="dec.llmRawResponse">
          <button class="prompt-pill prompt-pill--llm-response" @click="toggleSection(dec.id, 'response')">
            <span>[RESPONSE]</span>
            <span class="pill-chevron">{{ expandedSections[dec.id]?.has('response') ? '▾' : '▸' }}</span>
          </button>
          <div v-if="expandedSections[dec.id]?.has('response')" class="pill-content">
            <pre class="dec-code-block">{{ dec.llmRawResponse }}</pre>
          </div>
        </template>

        <div class="chat-bubble-meta">
          {{ dec.llmModel.split('/').pop() }} · {{ formatLatency(dec.llmLatencyMs) }} · {{ (dec.llmCompletionTokens ?? 0).toLocaleString() }}↓ · {{ timeAgo(dec.createdAt) }}
        </div>
      </div>
    </div>

    <!-- ── Ghost: next analysis preview ── -->
    <div class="chat-row chat-row--ghost">
      <div class="chat-bubble chat-bubble--prompt">
        <div class="chat-bubble-label">PROMPT →</div>
        <div class="prompt-pills">
          <span class="prompt-pill prompt-pill--system">[SYSTEM]</span>
          <span class="prompt-pill prompt-pill--market">[MARKET DATA]</span>
          <span class="prompt-pill prompt-pill--setup">[EDITABLE SETUP]</span>
        </div>
        <div class="chat-bubble-meta">next cycle</div>
      </div>
      <div class="chat-bubble chat-bubble--response">
        <div class="chat-bubble-label">← LLM</div>
        <div class="ghost-awaiting">
          <span v-if="agent.status === 'running'" :class="{ 'ghost-pulse': isNextAnalysisImminent }">
            {{ isNextAnalysisImminent ? '● analyzing…' : `— next in ${formatCountdown(secondsUntilNextAction)} —` }}
          </span>
          <span v-else style="opacity: 0.5;">— stopped —</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add apps/web/pages/agents/\[id\].vue
git commit -m "feat(analysis-log): chat layout template with prompt section pills"
```

---

### Task 3: Add CSS for the chat layout

**Files:**
- Modify: `apps/web/pages/agents/[id].vue` — inside the `<style scoped>` block at the bottom of the file

**Step 1: Add new styles**

Append the following block inside the existing `<style scoped>` (before the closing `</style>`). If there is no `<style scoped>`, add one after `</template>`.

```css
/* ── Analysis Log — Chat Layout ────────────────────────────────── */

.chat-feed {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  align-items: start;
}

@media (max-width: 800px) {
  .chat-row {
    grid-template-columns: 1fr;
  }
}

.chat-bubble {
  padding: 12px 14px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.chat-bubble--prompt {
  border-left: 3px solid var(--border);
}

.chat-bubble--response {
  border-right: 3px solid var(--border);
}

.chat-bubble-label {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.chat-bubble-meta {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
  margin-top: 4px;
}

/* ── Prompt pills ── */

.prompt-pills {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prompt-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: transparent;
  border: none;
  border-left: 2px solid currentColor;
  cursor: pointer;
  text-align: left;
  width: 100%;
  color: var(--text-muted);
  transition: opacity 0.1s;
}

.prompt-pill:hover {
  opacity: 0.75;
}

/* span-only pills in the ghost row have no interactivity */
span.prompt-pill {
  cursor: default;
}
span.prompt-pill:hover {
  opacity: 1;
}

.prompt-pill--system   { color: var(--text-muted); }
.prompt-pill--market   { color: #f59e0b; }
.prompt-pill--setup    { color: #60a5fa; }
.prompt-pill--llm-response { color: #4ade80; }

.pill-chevron {
  flex-shrink: 0;
  font-size: 12px;
}

.pill-edited-tag {
  font-size: 10px;
  color: #f59e0b;
  border: 1px solid #f59e0b;
  padding: 0 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.pill-content {
  padding-left: 10px;
}

/* ── Response bubble internals ── */

.chat-decision-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.chat-reasoning {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
}

/* ── Ghost entry ── */

.chat-row--ghost {
  opacity: 0.35;
  pointer-events: none;
}

/* Allow pointer events only on the ghost entry itself for the pulse */
.chat-row--ghost .ghost-awaiting {
  pointer-events: none;
}

.ghost-awaiting {
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
  padding: 8px 0;
}

@keyframes ghost-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.ghost-pulse {
  animation: ghost-blink 1s ease-in-out infinite;
  color: #4ade80;
}
```

**Step 2: Commit**

```bash
git add apps/web/pages/agents/\[id\].vue
git commit -m "feat(analysis-log): chat layout CSS — pills, bubbles, ghost entry"
```

---

### Task 4: Verify in the browser

**Step 1: Start the dev servers**

In two terminals (or two panes):

```bash
# Terminal 1 — API
cd .worktrees/analysis-log-redesign
npm run dev:api

# Terminal 2 — Web
cd .worktrees/analysis-log-redesign
npm run dev:web
```

**Step 2: Check these things manually**

1. Open an agent detail page that has at least 2 decisions
2. Confirm: two-column chat rows are visible
3. Click `[SYSTEM]` pill → section expands showing BASE_AGENT_PROMPT text
4. Click `[MARKET DATA]` pill → expands showing portfolio + market + constraints
5. Click `[EDITABLE SETUP]` pill → expands showing behavior profile / persona
6. Click `[RESPONSE]` pill on the response side → shows raw JSON
7. If two adjacent decisions have different personas/behavior: `edited` tag appears on the older one's EDITABLE SETUP pill (the newer decisions are at index 0)
8. Ghost entry visible at the bottom with correct countdown / `— stopped —`
9. Resize window to < 800px — layout stacks vertically

**Step 3: Run API tests to confirm no regressions**

```bash
pnpm --filter api test
```

Expected: 75 passed, 0 failures.

---

### Task 5: Clean up removed state

**Files:**
- Modify: `apps/web/pages/agents/[id].vue`

The old tab system (`decisionDetailTab`, `setDecisionTab`) and the old `toggleDecision` function are no longer used. Remove them.

**Step 1: Remove these from `<script setup>`**

- `const decisionDetailTab = ref<Record<string, 'prompt' | 'response' | 'market'>>({});`
- The entire `toggleDecision` function
- The entire `setDecisionTab` function

Also remove `expandedDecisions` — it is no longer used (replaced by `expandedSections`).

**Step 2: Commit**

```bash
git add apps/web/pages/agents/\[id\].vue
git commit -m "chore(analysis-log): remove old decision tab state + helpers"
```

---

## Done

After Task 5, run a final check:

```bash
pnpm --filter api test   # 75 passed
```

Open the agent detail page one more time and verify nothing is broken.

Then use **superpowers:finishing-a-development-branch** to decide how to merge.
