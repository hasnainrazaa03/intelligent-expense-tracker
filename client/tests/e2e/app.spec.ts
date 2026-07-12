import { test, expect } from '@playwright/test';

// Authenticated flows — the project supplies a pre-authenticated storageState,
// so each test starts logged in (no per-test login → no rate-limit trips).

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
});

test('lands on the dashboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Financial hub' })).toBeVisible();
});

test('navigates between tabs', async ({ page }) => {
  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Annual audit' })).toBeVisible();
  await page.getByRole('tab', { name: 'Pivot' }).click();
  await expect(page.getByRole('heading', { name: 'Pivot analysis' })).toBeVisible();
  await page.getByRole('tab', { name: 'Tuition' }).click();
  await expect(page.getByRole('heading', { name: 'Tuition ledger' })).toBeVisible();
});

test('currency toggle switches display to INR', async ({ page }) => {
  await page.getByRole('button', { name: 'Display currency INR' }).click();
  await expect(page.getByText(/₹\s?[\d,]/).first()).toBeVisible();
});

test('theme toggle switches to light mode', async ({ page }) => {
  await page.getByRole('button', { name: /switch to light theme/i }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('adds an expense and finds it via search', async ({ page }) => {
  const title = `E2E test ${Date.now()}`;

  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.getByRole('menuitem', { name: /add expense/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'New expense' })).toBeVisible();
  await dialog.getByPlaceholder('e.g. Groceries').fill(title);
  await dialog.getByPlaceholder('0.00').fill('42.50');
  await dialog.getByRole('button', { name: 'Add expense' }).click();

  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await page.getByPlaceholder('Search transactions…').fill(title);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
});
