import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// Public pages — run WITHOUT an authenticated session (an authed session would
// redirect '/' to the app).

test('landing renders the Orbit hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /finance hub built for student life/i })).toBeVisible();
  await expect(page.getByText('Orbit').first()).toBeVisible();
});

test('landing: the real app on show, every old feature still listed, and "Create free account" opens sign-up (U6b)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Orbit's Home screen/ })).toBeVisible();
  // The features the old page led with are still named.
  await expect(page.getByText('Budget alerts and templates.')).toBeVisible();
  await expect(page.getByText(/QuickBooks and Xero/)).toBeVisible();
  await expect(page.getByText('Install it on your phone.')).toBeVisible();
  // The privacy note says what the policy says.
  await expect(page.getByText(/doesn't sell your data, show ads, or track you across sites/)).toBeVisible();
  // FAQ answers open in place.
  await page.getByText('Does it connect to my bank?').click();
  await expect(page.getByText('Orbit never asks for your bank login.', { exact: false })).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Create free account' }).first().click();
  await expect(page).toHaveURL(/\/login\?mode=signup$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
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

test('landing has no WCAG A/AA accessibility violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('privacy policy and terms are public, linked from the landing page and sign-up, and pass axe', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
  // The parts the plan requires: what goes to Gemini, and how to reach the operator.
  await expect(page.getByRole('heading', { name: 'AI features and Google Gemini' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'hasnainrazaa03@gmail.com' }).first()).toHaveAttribute('href', 'mailto:hasnainrazaa03@gmail.com');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, 'privacy policy').toEqual([]);

  await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { name: 'Terms of Use', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not financial advice' })).toBeVisible();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, 'terms').toEqual([]);

  // Creating an account names both documents.
  await page.goto('/login');
  await page.getByRole('link', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByText(/By creating an account or continuing with Google, you agree to the/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms');
});
