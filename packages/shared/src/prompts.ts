import { AgentBehaviorConfigSchema } from './validation.js';
import type { AgentBehaviorConfig } from './validation.js';

/**
 * Base system prompt shared by all agents.
 */
export const BASE_AGENT_PROMPT = `Hard constraints (always enforced, cannot be overridden by persona or behavior):
- Only trade pairs explicitly listed in your allowed list
- Always include a confidence value (0.0–1.0) that reflects your actual conviction

Your persona and behavior profile define everything else: your risk appetite, trading style, confidence thresholds. Follow those.`;

/**
 * Role and task description injected at the top of the editable setup section (user prompt).
 */
export const AGENT_ROLE_SECTION = `## Your Role
You are a crypto trading agent operating on Base chain DEXes.
Analyze the provided market data, portfolio state, and recent decision history, then make a trading decision.`;

/**
 * Builds the JSON schema instruction appended to the system prompt.
 */
export function buildJsonSchemaInstruction(): string {
  return `\nIMPORTANT: Respond with ONLY a valid JSON object — no markdown, no code blocks, no explanation.\nThe JSON must match this schema exactly:\n{\n  "action": "buy" | "sell" | "hold" | "close",\n  "confidence": <number 0.0–1.0>,\n  "reasoning": "<string>",\n  "targetPair": "<string, optional>",\n  "suggestedPositionSizePct": <number 0–100, optional>\n}`;
}

/** Build a human-readable behavior section to inject into prompts */
export function buildBehaviorSection(behavior: Partial<AgentBehaviorConfig>): string {
  const b = AgentBehaviorConfigSchema.parse({ ...behavior });
  return `## Your Behavior Profile
- Risk Appetite: ${b.riskAppetite} | FOMO Prone: ${b.fomoProne}/100 | Panic Sell Threshold: ${b.panicSellThreshold}/100
- Analysis Depth: ${b.analysisDepth} | Decision Speed: ${b.decisionSpeed} | Confidence Threshold: ${b.confidenceThreshold}%
- Trading Style: ${b.style} | Entry Preference: ${b.entryPreference} | Exit Strategy: ${b.exitStrategy}
- Market Bias: ${b.defaultBias} | Contrarian: ${b.contrarian}/100 | Adaptability: ${b.adaptability}/100
- Average Down on losses: ${b.averageDown ? 'Yes' : 'No'} | Overthinker: ${b.overthinker ? 'Yes' : 'No'} | Emotional Awareness: ${b.emotionalAwareness ? 'Yes' : 'No'}
- Preferred Conditions: ${b.preferredConditions} | Memory Weight: ${b.memoryWeight}
- Verbosity: ${b.verbosity} | Personality: ${b.personality}

Precedence: behavior config (parameters above) > persona text > everything else.`;
}

/** Build the constraints section to inject into prompts */
export function buildConstraintsSection(config: {
  pairs: string[];
  maxPositionSizePct: number;
  maxOpenPositions: number;
  stopLossPct: number;
  takeProfitPct: number;
}): string {
  return `## Constraints
Allowed pairs: ${config.pairs.join(', ')}
Max position size: ${config.maxPositionSizePct}% of balance
Max open positions: ${config.maxOpenPositions}
Stop loss: ${config.stopLossPct}%
Take profit: ${config.takeProfitPct}%`;
}
