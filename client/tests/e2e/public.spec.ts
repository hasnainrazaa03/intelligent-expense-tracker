import { test, expect } from '@playwright/test';

// Public pages — run WITHOUT an authenticated session (an authed session would
// redirect '/' to the app).

test('landing renders the Orbit hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /finance hub built for student life/i })).toBeVisible();
  await expect(page.getByText('Orbit').first()).toBeVisible();
});

test('knowledge base is reachable', async ({ page }) => {
  await page.goto('/knowledge');
  await expect(page.getByText('Public Knowledge Base')).toBeVisible();
});

test('login page renders core controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByPlaceholder('you@email.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
