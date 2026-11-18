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
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 20_000 });
  // Preferences are account settings on the server; start every run from the
  // defaults, whatever an earlier (perhaps interrupted) run left behind.
  const api = 'http://localhost:3001/api';
  const { csrfToken } = await (await page.request.get(`${api}/auth/csrf`)).json();
  const reset = await page.request.patch(`${api}/settings`, {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      displayCurrency: null, hideTuition: null, onboardingDismissed: null, recurringSnoozeUntil: null,
      notifyBudgets: null, notifyBills: null, notifyMonthlySummary: null, timeZone: null,
    },
  });
  expect(reset.ok()).toBe(true);
  await page.context().storageState({ path: authFile });
});
