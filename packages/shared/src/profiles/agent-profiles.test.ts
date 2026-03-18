import { describe, expect, it } from 'vitest';

import {
  AGENT_PROFILES,
  DEFAULT_AGENT_PROFILE_ID,
  getAgentProfile,
  resolveAgentProfileId,
} from './agent-profiles.js';
import { getAgentPersonaTemplate } from './templates.js';

describe('agent persona reduction', () => {
  it('exposes only the three retained agent presets', () => {
    expect(AGENT_PROFILES.map((profile) => profile.id)).toEqual([
      'the_professor',
      'momentum_surfer',
      'contrarian_chad',
    ]);
    expect(DEFAULT_AGENT_PROFILE_ID).toBe('the_professor');
  });

  it('maps legacy profile ids to their canonical presets', () => {
    expect(resolveAgentProfileId('diamond_hands')).toBe('the_professor');
    expect(resolveAgentProfileId('the_bot')).toBe('the_professor');
    expect(resolveAgentProfileId('whale_watcher')).toBe('momentum_surfer');
    expect(resolveAgentProfileId('paper_hands')).toBe('momentum_surfer');
    expect(resolveAgentProfileId('contrarian_chad')).toBe('contrarian_chad');
    expect(resolveAgentProfileId('unknown_profile')).toBe('unknown_profile');
  });

  it('resolves legacy ids when fetching displayed profiles', () => {
    expect(getAgentProfile('the_bot')?.id).toBe('the_professor');
    expect(getAgentProfile('degen_ape')?.id).toBe('momentum_surfer');
    expect(getAgentProfile('contrarian_chad')?.id).toBe('contrarian_chad');
    expect(getAgentProfile('missing')).toBeUndefined();
  });

  it('uses canonical persona templates for legacy ids', () => {
    const name = 'Alias Test Agent';

    expect(getAgentPersonaTemplate('scared_cat', name)).toBe(
      getAgentPersonaTemplate('the_professor', name)
    );
    expect(getAgentPersonaTemplate('whale_watcher', name)).toBe(
      getAgentPersonaTemplate('momentum_surfer', name)
    );
  });
});
