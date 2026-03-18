/**
 * Playwright global setup — authenticates via GET /dev-login and saves
 * the session cookie to e2e/.auth/user.json for all subsequent tests.
 *
 * Requires:
 *   - API running on localhost:8787 (npm run dev:api)
 *   - Web running on localhost:3000 (npm run dev:web)
 *   - PLAYWRIGHT_SECRET env var set in wrangler.toml [vars] and process.env
 */
import { test as setup, expect } from '@playwright/test';
import { resolve } from 'path';

const AUTH_FILE = resolve(__dirname, '.auth/user.json');
const PLAYWRIGHT_SECRET = process.env.PLAYWRIGHT_SECRET || 'playwright-dev-secret';

setup('authenticate', async ({ page }) => {
  const response = await page.goto(
    `http://localhost:3000/dev-login?secret=${PLAYWRIGHT_SECRET}`
  );

  expect(response?.ok(), `dev-login failed with status ${response?.status()}`).toBeTruthy();

  // Should have redirected to home page
  await expect(page).not.toHaveURL(/dev-login/);

  // Save session cookie so all tests start authenticated
  await page.context().storageState({ path: AUTH_FILE });
});
