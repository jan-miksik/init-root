import { test, expect } from '@playwright/test';

test('app loads and shows authenticated UI', async ({ page }) => {
  await page.goto('/');
  // Should not be stuck on the connect wallet screen
  await expect(page.locator('text=Connect Wallet')).not.toBeVisible({ timeout: 5000 });
  // Should show some main content
  await expect(page).not.toHaveURL(/login|connect/);
});
