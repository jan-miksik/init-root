import { describe, expect, it } from 'vitest';
import { resolveAgentPersonaMd } from '../src/agents/resolve-agent-persona.js';

describe('resolveAgentPersonaMd', () => {
  it('prefers agents.personaMd over everything', () => {
    const md = resolveAgentPersonaMd({
      agentName: 'Nemotron-120B · WETH/USDC · Joker',
      agentPersonaMd: '# Custom Persona\n\nDo the thing.',
      agentProfileId: 'joker',
      config: { personaMd: '# Config Persona', profileId: 'drunk_uncle' },
    });
    expect(md).toContain('# Custom Persona');
  });

  it('falls back to config.personaMd when agents.personaMd is missing', () => {
    const md = resolveAgentPersonaMd({
      agentName: 'Nemotron-120B · WETH/USDC · Joker',
      agentPersonaMd: null,
      agentProfileId: 'joker',
      config: { personaMd: '# Config Persona\n\nHello.' },
    });
    expect(md).toContain('# Config Persona');
  });

  it('falls back to profile template from agents.profileId', () => {
    const md = resolveAgentPersonaMd({
      agentName: 'Nemotron-120B · WETH/USDC · Joker',
      agentPersonaMd: null,
      agentProfileId: 'joker',
      config: {},
    });
    expect(md).toContain('Trading Persona');
    expect(md).toContain('Joker');
    expect(md).not.toContain('systematic crypto trading agent');
  });

  it('falls back to profile template from config.profileId', () => {
    const md = resolveAgentPersonaMd({
      agentName: 'Nemotron-120B · WETH/USDC · Drunk Uncle',
      agentPersonaMd: null,
      agentProfileId: null,
      config: { profileId: 'drunk_uncle' },
    });
    expect(md).toContain('Drunk Uncle');
  });

  it('falls back to default persona when no persona or profile is present', () => {
    const md = resolveAgentPersonaMd({
      agentName: 'Nemotron-120B · WETH/USDC · Custom',
      agentPersonaMd: null,
      agentProfileId: null,
      config: {},
    });
    expect(md).toContain('# Trading Persona: Nemotron-120B · WETH/USDC · Custom');
    expect(md).toContain('systematic crypto trading agent');
  });
});

