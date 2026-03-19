/**
 * CodingAgentDO — Experimental prototype of a Durable Object–based autonomous coding agent.
 *
 * This is a PROTOTYPE for evaluating feasibility of running autonomous coding agents on the edge.
 * It is NOT used in production and NOT exported from index.ts.
 *
 * Concept:
 *   - Each DO instance manages one coding task (from a simple task spec)
 *   - Alarm-driven: each alarm tick = one agent iteration (plan → implement → verify)
 *   - State machine stored in DO storage: idle → planning → implementing → verifying → done | failed
 *   - LLM calls via getTradeDecision-style pattern (using the existing llm-router)
 *   - All progress and logs persisted in DO storage
 *
 * Feasibility findings (see evalFeasibility below):
 *   - DO alarms provide durable scheduling ✓
 *   - DO storage provides crash-safe state ✓
 *   - LLM calls from DO are fully supported ✓
 *   - Limitation: cannot exec shell commands / write to filesystem from CF Workers
 *   - Conclusion: DO-based agents work well for LLM-driven decision loops (like TradingAgentDO)
 *     but cannot replace full coding agents that require shell access
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types/env.js';
import { generateId, nowIso } from '../lib/utils.js';

// ── State machine types ────────────────────────────────────────────────────

export type CodingAgentPhase = 'idle' | 'planning' | 'implementing' | 'verifying' | 'done' | 'failed';

export type CodingAgentState = {
  taskId: string;
  phase: CodingAgentPhase;
  taskSpec: string;
  plan: string | null;
  implementation: string | null;
  verificationResult: string | null;
  iterations: number;
  maxIterations: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

export type CodingAgentLog = {
  at: string;
  phase: CodingAgentPhase;
  message: string;
};

// ── Storage schema ─────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  STATE: 'codingAgentState',
  LOGS: 'codingAgentLogs',
} as const;

/**
 * CodingAgentDO — experimental prototype.
 * Demonstrates DO-based autonomous agent with alarm-driven iteration.
 *
 * NOTE: This class is intentionally NOT exported from index.ts and NOT
 * registered in wrangler.toml — it is a feasibility prototype only.
 */
export class CodingAgentDO extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/start' && request.method === 'POST') {
      const body = await request.json() as {
        taskSpec: string;
        maxIterations?: number;
      };
      if (!body.taskSpec?.trim()) {
        return Response.json({ error: 'taskSpec is required' }, { status: 400 });
      }

      const existingState = await this.ctx.storage.get<CodingAgentState>(STORAGE_KEYS.STATE);
      if (existingState && existingState.phase !== 'done' && existingState.phase !== 'failed') {
        return Response.json({ error: 'Agent is already running', state: existingState }, { status: 409 });
      }

      const taskId = generateId('coding');
      const state: CodingAgentState = {
        taskId,
        phase: 'planning',
        taskSpec: body.taskSpec.trim(),
        plan: null,
        implementation: null,
        verificationResult: null,
        iterations: 0,
        maxIterations: body.maxIterations ?? 5,
        startedAt: nowIso(),
        completedAt: null,
        error: null,
      };

      await this.ctx.storage.put(STORAGE_KEYS.STATE, state);
      await this.ctx.storage.put(STORAGE_KEYS.LOGS, []);

      // Schedule first tick in 1s
      await this.ctx.storage.setAlarm(Date.now() + 1_000);

      return Response.json({ ok: true, taskId, state });
    }

    if (url.pathname === '/status') {
      const state = await this.ctx.storage.get<CodingAgentState>(STORAGE_KEYS.STATE);
      const logs = (await this.ctx.storage.get<CodingAgentLog[]>(STORAGE_KEYS.LOGS)) ?? [];
      return Response.json({ state: state ?? null, logs });
    }

    if (url.pathname === '/stop' && request.method === 'POST') {
      await this.ctx.storage.deleteAlarm();
      const state = await this.ctx.storage.get<CodingAgentState>(STORAGE_KEYS.STATE);
      if (state && state.phase !== 'done') {
        await this.ctx.storage.put(STORAGE_KEYS.STATE, {
          ...state,
          phase: 'failed',
          error: 'Stopped by user',
          completedAt: nowIso(),
        });
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === '/reset' && request.method === 'POST') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.delete(STORAGE_KEYS.STATE);
      await this.ctx.storage.delete(STORAGE_KEYS.LOGS);
      return Response.json({ ok: true });
    }

    return new Response('Not Found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<CodingAgentState>(STORAGE_KEYS.STATE);
    if (!state || state.phase === 'done' || state.phase === 'failed') return;

    state.iterations++;

    if (state.iterations > state.maxIterations) {
      await this.setState({ ...state, phase: 'failed', error: 'Max iterations exceeded', completedAt: nowIso() });
      return;
    }

    await this.appendLog(state.phase, `Iteration ${state.iterations}/${state.maxIterations} — phase=${state.phase}`);

    const nextState = await this.runIteration(state);
    await this.setState(nextState);

    // Reschedule unless terminal
    if (nextState.phase !== 'done' && nextState.phase !== 'failed') {
      await this.ctx.storage.setAlarm(Date.now() + 5_000);
    }
  }

  /**
   * Run one iteration of the state machine.
   * Each phase calls the LLM (via OpenRouter) and advances state.
   *
   * IMPORTANT: In a real coding agent this would also execute shell commands and
   * write files. That is not possible from Cloudflare Workers — this prototype
   * instead produces text output that would need to be applied externally.
   */
  private async runIteration(state: CodingAgentState): Promise<CodingAgentState> {
    try {
      switch (state.phase) {
        case 'planning': {
          const plan = await this.callLlm(
            `You are an autonomous coding agent. Given this task spec, produce a concise implementation plan.\n\nTask: ${state.taskSpec}\n\nRespond with a numbered plan only.`
          );
          await this.appendLog('planning', `Plan generated (${plan.length} chars)`);
          return { ...state, phase: 'implementing', plan };
        }

        case 'implementing': {
          const implementation = await this.callLlm(
            `You are an autonomous coding agent. Execute this implementation plan.\n\nTask: ${state.taskSpec}\n\nPlan:\n${state.plan}\n\nDescribe exactly what code changes you would make (file paths + diffs). Note: actual file writing is handled externally.`
          );
          await this.appendLog('implementing', `Implementation produced (${implementation.length} chars)`);
          return { ...state, phase: 'verifying', implementation };
        }

        case 'verifying': {
          const verificationResult = await this.callLlm(
            `You are reviewing a coding implementation for correctness.\n\nOriginal task: ${state.taskSpec}\n\nImplementation:\n${state.implementation?.slice(0, 2000)}\n\nList any issues found. If none, respond with "LGTM".`
          );
          const passed = verificationResult.toUpperCase().includes('LGTM');
          await this.appendLog('verifying', `Verification ${passed ? 'passed' : 'found issues'}`);
          if (passed) {
            return { ...state, phase: 'done', verificationResult, completedAt: nowIso() };
          }
          // Issues found — loop back to implementing with feedback
          return {
            ...state,
            phase: 'implementing',
            verificationResult,
            plan: state.plan + `\n\nFeedback from verification:\n${verificationResult}`,
          };
        }

        default:
          return state;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.appendLog(state.phase, `Error: ${message}`);
      return { ...state, phase: 'failed', error: message, completedAt: nowIso() };
    }
  }

  /**
   * Call the LLM with a simple system prompt.
   * Uses OpenRouter if OPENROUTER_API_KEY is set, otherwise returns a stub.
   */
  private async callLlm(prompt: string): Promise<string> {
    if (!this.env.OPENROUTER_API_KEY) {
      return `[STUB — no OPENROUTER_API_KEY] ${prompt.slice(0, 100)}...`;
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [
          { role: 'system', content: 'You are a precise coding assistant. Be concise.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter error: ${res.status} ${await res.text().catch(() => '')}`);
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  private async setState(state: CodingAgentState): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEYS.STATE, state);
  }

  private async appendLog(phase: CodingAgentPhase, message: string): Promise<void> {
    const logs = (await this.ctx.storage.get<CodingAgentLog[]>(STORAGE_KEYS.LOGS)) ?? [];
    logs.push({ at: nowIso(), phase, message });
    // Keep last 50 log entries
    await this.ctx.storage.put(STORAGE_KEYS.LOGS, logs.slice(-50));
  }
}

/**
 * Feasibility evaluation for DO-based coding agents.
 *
 * ✓ WORKS WELL:
 *   - Alarm-driven iteration (same pattern as TradingAgentDO)
 *   - DO storage for durable state + crash safety
 *   - LLM calls for planning/implementing/verifying phases
 *   - State machine (idle → planning → implementing → verifying → done/failed)
 *   - WebSocket broadcasting of progress to UI (same as TradingAgentDO realtime)
 *
 * ✗ LIMITATIONS:
 *   - Cannot execute shell commands from CF Workers (no exec/spawn)
 *   - Cannot write directly to the filesystem
 *   - Cannot clone git repos or install npm packages
 *   - Max CPU time ~50ms per alarm (free) / 30s (paid) — adequate for LLM calls
 *   - LLM call timeout must fit within DO alarm budget
 *
 * CONCLUSION:
 *   The DO pattern is viable for LLM-driven decision agents (like the trading agent).
 *   For full autonomous coding agents, the DO would need to delegate file operations
 *   to an external service (e.g., a GitHub Actions workflow triggered via API, or a
 *   separate compute layer). The DO can orchestrate the LLM reasoning loop while
 *   an external executor applies the generated changes.
 */
export const evalFeasibility = {
  suitable: [
    'LLM reasoning loops (decision, planning, analysis)',
    'State machine orchestration with durable storage',
    'Alarm-driven periodic execution',
    'WebSocket progress streaming',
    'Retry logic with idempotency',
  ],
  unsuitable: [
    'Shell command execution (no exec/spawn in CF Workers)',
    'Direct filesystem writes',
    'Git operations (clone, commit, push)',
    'Package installation (npm/pip)',
    'Running test suites directly',
  ],
  recommendation:
    'Use DO for orchestration + LLM calls. Delegate shell/git/fs operations to GitHub Actions, ' +
    'a dedicated compute VM, or the Cloudflare Workers for Platforms approach (eval-level isolation).',
} as const;
