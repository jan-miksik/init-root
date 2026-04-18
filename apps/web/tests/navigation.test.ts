import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('authenticated navigation', () => {
  it('includes a managers link in the authenticated navbar', () => {
    const appVue = readFileSync(resolve(process.cwd(), 'app.vue'), 'utf8');
    expect(appVue).toContain('<NuxtLink to="/managers">Managers</NuxtLink>');
  });
});
