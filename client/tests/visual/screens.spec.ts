import { test, expect } from '@playwright/test';
import { prepare, settle } from './harness';

// Screenshot tests (U7): each main screen, on a laptop and a phone, dark and
// light (the four projects in playwright.visual.config.ts). A failure means a
// screen looks different: if that was intended, update the reference images
// (`npm run test:visual:update`) and commit them with the change.

const SCREENS: [name: string, path: string][] = [
  ['home', '/app'],
  ['transactions', '/app/transactions'],
  ['budgets', '/app/budgets'],
  ['insights-reports', '/app/insights/reports'],
  ['insights-breakdown', '/app/insights/breakdown'],
  ['insights-income', '/app/insights/income'],
  ['insights-ask', '/app/insights/ask'],
  ['tuition', '/app/tuition'],
  ['settings', '/app/settings'],
];

test.describe('signed in', () => {
  test.beforeEach(async ({ page }, testInfo) => prepare(page, testInfo, { signedIn: true }));

  for (const [name, path] of SCREENS) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`${name}.png`);
    });
  }

  test('quick add', async ({ page }) => {
    await page.goto('/app');
    await settle(page);
    // The header's Add on a laptop, the bottom bar's + on a phone.
    await page.getByRole('button', { name: 'Add new entry' }).filter({ visible: true }).first().click();
    await page.getByRole('menuitem', { name: '+ Add expense' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('quick-add.png');
  });
});

test('landing', async ({ page }, testInfo) => {
  await prepare(page, testInfo, { signedIn: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settle(page);
  await expect(page.getByRole('img', { name: /Orbit's Home screen/ })).toHaveJSProperty('complete', true);
  await expect(page).toHaveScreenshot('landing.png', { fullPage: true });
});
