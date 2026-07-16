import { test as setup, expect } from '@playwright/test';

// Log in ONCE and persist the session so the authenticated specs reuse it —
// the API's login limiter is 5 attempts / 15 min, so re-logging-in per test
// would trip it. Requires the API running + demo account seeded (2FA off).
const authFile = 'tests/e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill('test@test.com');
  await page.getByLabel('Password', { exact: true }).fill('Test1234!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: authFile });
});
