import { test, expect } from '@playwright/test';

test('landing and knowledge pages are reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('USC Ledger')).toBeVisible();

  await page.goto('/knowledge');
  await expect(page.getByText('Public Knowledge Base')).toBeVisible();
});

test('login page renders core controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByPlaceholder('USER@USC.EDU')).toBeVisible();
  await expect(page.getByText('INITIALIZE_SESSION')).toBeVisible();
});
