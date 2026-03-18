import { test, expect } from '@playwright/test';

const API = 'http://localhost:8787';

test('joker persona appears in editable setup with no duplicate behavior sections', async ({ page, request }) => {
  // Create a joker agent via API (auth cookie comes from global setup storageState)
  const res = await request.post(`${API}/api/agents`, {
    data: {
      name: 'E2E Joker Test',
      profileId: 'joker',
      pairs: ['WETH/USDC'],
    },
  });
  expect(res.ok(), `Create agent failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const { id } = await res.json() as { id: string };

  // Navigate to the edit page (client-side SPA — auth from stored session cookie)
  await page.goto(`/agents/${id}/edit`);

  // Wait for the editable setup pre to be visible (Vue hydration + form load)
  const setupPre = page.locator('pre.prompt-section__content--setup');
  await expect(setupPre).toBeVisible({ timeout: 15000 });

  const content = await setupPre.textContent() ?? '';

  // 1. Persona heading injected by the edit page
  expect(content).toContain('## Your Persona');

  // 2. Joker-specific content from the persona template
  expect(content).toContain('Trading Persona: The Joker');

  // 3. No duplicate behavior profile sections
  const behaviorMatches = [...content.matchAll(/## Your Behavior Profile/g)];
  expect(
    behaviorMatches.length,
    '## Your Behavior Profile should appear exactly once'
  ).toBe(1);

  // Cleanup: delete the test agent
  await request.delete(`${API}/api/agents/${id}`);
});
