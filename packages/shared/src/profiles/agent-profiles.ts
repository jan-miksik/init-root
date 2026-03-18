import type { AgentBehaviorConfig } from '../validation.js';

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: 'preset' | 'custom';
  behavior: AgentBehaviorConfig;
}

export const LEGACY_AGENT_PROFILE_ALIASES: Record<string, string> = {
  diamond_hands: 'the_professor',
  scared_cat: 'the_professor',
  the_bot: 'the_professor',
  the_sniper: 'the_professor',
  degen_ape: 'momentum_surfer',
  whale_watcher: 'momentum_surfer',
  paper_hands: 'momentum_surfer',
};

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'the_professor',
    name: 'The Professor',
    emoji: '🎓',
    category: 'preset',
    description: 'Academic, data-driven, cautious. Thorough analysis, high confidence threshold, conservative.',
    behavior: {
      riskAppetite: 'conservative',
      fomoProne: 5,
      panicSellThreshold: 40,
      contrarian: 30,
      analysisDepth: 'thorough',
      decisionSpeed: 'patient',
      confidenceThreshold: 80,
      overthinker: true,
      style: 'swing',
      preferredConditions: 'trending',
      entryPreference: 'pullback',
      exitStrategy: 'signal_based',
      averageDown: false,
      verbosity: 'detailed',
      personality: 'academic',
      emotionalAwareness: false,
      defaultBias: 'neutral',
      adaptability: 30,
      memoryWeight: 'long',
    },
  },
  {
    id: 'momentum_surfer',
    name: 'Momentum Surfer',
    emoji: '🏄',
    category: 'preset',
    description: 'Rides trends until they break. Aggressive on trends, trailing stops, high adaptability.',
    behavior: {
      riskAppetite: 'aggressive',
      fomoProne: 70,
      panicSellThreshold: 25,
      contrarian: 5,
      analysisDepth: 'quick',
      decisionSpeed: 'impulsive',
      confidenceThreshold: 45,
      overthinker: false,
      style: 'scalper',
      preferredConditions: 'trending',
      entryPreference: 'momentum',
      exitStrategy: 'trailing',
      averageDown: false,
      verbosity: 'normal',
      personality: 'casual',
      emotionalAwareness: true,
      defaultBias: 'bullish',
      adaptability: 85,
      memoryWeight: 'short',
    },
  },
  {
    id: 'contrarian_chad',
    name: 'Contrarian Chad',
    emoji: '🔄',
    category: 'preset',
    description: 'Always bets against the crowd. High contrarian, pullback/dip_buy entry, bearish default bias.',
    behavior: {
      riskAppetite: 'aggressive',
      fomoProne: 5,
      panicSellThreshold: 30,
      contrarian: 95,
      analysisDepth: 'balanced',
      decisionSpeed: 'measured',
      confidenceThreshold: 55,
      overthinker: false,
      style: 'swing',
      preferredConditions: 'volatile',
      entryPreference: 'dip_buy',
      exitStrategy: 'signal_based',
      averageDown: true,
      verbosity: 'normal',
      personality: 'casual',
      emotionalAwareness: false,
      defaultBias: 'bearish',
      adaptability: 40,
      memoryWeight: 'medium',
    },
  },
];

export function resolveAgentProfileId(id: string): string {
  return LEGACY_AGENT_PROFILE_ALIASES[id] ?? id;
}

export function isAgentProfileId(id: string): boolean {
  const resolvedId = resolveAgentProfileId(id);
  return AGENT_PROFILES.some((profile) => profile.id === resolvedId);
}

export function getAgentProfile(id: string): AgentProfile | undefined {
  const resolvedId = resolveAgentProfileId(id);
  return AGENT_PROFILES.find((profile) => profile.id === resolvedId);
}

export const DEFAULT_AGENT_PROFILE_ID = 'the_professor';
