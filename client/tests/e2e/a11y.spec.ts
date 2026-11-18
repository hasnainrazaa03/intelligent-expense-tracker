import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Keyboard and screen-reader checks for the controls fixed in phase 4b.
// Runs with the saved session (see auth.setup.ts).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const axe = async (page: Page, include?: string) => {
  // Park the mouse away from the sidebar: its labels fade in on hover, and axe
  // would measure their contrast mid-fade.
  await page.mouse.move(1200, 900);
  await page.waitForTimeout(400); // let the sidebar's hover transition finish
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
});

test('add an expense with the keyboard only, date picker and category included', async ({ page }) => {
  const title = `Keyboard ${Date.now()}`;
  await page.keyboard.press('Control+n');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Title')).toBeVisible();

  await dialog.getByLabel('Title').focus();
  await page.keyboard.type(title);
  await dialog.getByLabel('Amount (USD)').focus();
  await page.keyboard.type('12.34');

  // Date: Enter opens the calendar with focus on today; ArrowLeft moves to
  // yesterday; Enter picks it and focus returns to the field.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateField = page.locator('#exp-date');
  await dateField.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-day="${ymd(new Date())}"]`)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(`[data-day="${ymd(yesterday)}"]`)).toBeFocused();
  await page.keyboard.press('PageDown');
  await page.keyboard.press('PageUp');
  await expect(page.locator(`[data-day="${ymd(yesterday)}"]`)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dateField).toBeFocused();
  const shown = yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  await expect(dateField).toHaveAccessibleName(`Date, ${shown}`);

  // Escape inside the category dropdown closes only the dropdown, not the form.
  const categoryToggle = page.locator('#exp-category');
  await categoryToggle.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Search categories')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog.getByLabel('Search categories')).toBeHidden();
  await expect(categoryToggle).toBeFocused();
  await expect(dialog.getByLabel('Title')).toHaveValue(title);

  // Category by keyboard: search, arrow to the first match, Enter.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Groceries');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(categoryToggle).toContainText('Groceries');

  await dialog.getByRole('button', { name: 'Add expense' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  // Found through search (the list is paged and may start with later-dated bills).
  await page.getByRole('combobox', { name: 'Search transactions' }).fill(title);
  await expect(page.getByRole('option', { name: new RegExp(title) })).toBeVisible({ timeout: 10_000 });
});

test('quick actions menu and confirm dialog work from the keyboard', async ({ page }) => {
  // Quick actions: focus moves into the menu, arrows move, Escape returns.
  const fab = page.getByRole('button', { name: 'Add new entry' });
  await fab.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: /add expense/i })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /add income/i })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(fab).toBeFocused();

  // Confirm dialog: focus starts on Cancel, Tab stays inside, Escape cancels
  // and returns focus to the button that opened it.
  const name = `A11y Home ${Date.now()}`;
  await page.goto('/app/settings/households'); // households live in Settings (U5)
  await page.getByText('Households · shared budgeting').scrollIntoViewIfNeeded();
  await page.getByLabel('New household name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  const card = page.locator('div').filter({ hasText: name }).last();
  const del = card.getByRole('button', { name: 'Delete' }).first();
  await del.focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('alertdialog', { name: 'Delete household?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(await axe(page, '[role="alertdialog"]')).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(confirm.getByRole('button', { name: 'Confirm' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(del).toBeFocused();
  await expect(page.getByText(name).first()).toBeVisible();

  // Clean up.
  await page.keyboard.press('Enter');
  await confirm.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(name)).toBeHidden({ timeout: 10_000 });
});

test('popups and modals have no WCAG A/AA violations', async ({ page }) => {
  // Expense form, then with the date picker and the category dropdown open.
  await page.keyboard.press('Control+n');
  await expect(page.getByRole('dialog').getByLabel('Title')).toBeVisible();
  expect(await axe(page, '[role="dialog"]'), 'expense form').toEqual([]);
  await page.locator('#exp-date').click();
  expect(await axe(page), 'date picker').toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('#exp-category').click();
  expect(await axe(page, '[role="dialog"]'), 'category dropdown').toEqual([]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('link', { name: 'Budgets', exact: true }).click();
  await page.getByRole('button', { name: 'Edit budgets' }).click();
  await expect(page).toHaveURL(/\/app\/budgets\/edit$/);
  await expect(page.getByRole('region', { name: 'Edit budgets' })).toBeVisible(); // lazy-loaded
  expect(await axe(page), 'budget editor').toEqual([]);

  await page.getByRole('button', { name: 'Account and preferences' }).click();
  await page.getByRole('link', { name: 'Import and export' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/data$/);
  await expect(page.getByRole('region', { name: 'Export, import and back up' })).toBeVisible(); // lazy-loaded
  expect(await axe(page), 'export, import and back up').toEqual([]);

  await page.goto('/app/settings/categories');
  await expect(page.getByRole('region', { name: 'Categories' })).toBeVisible();
  expect(await axe(page), 'categories').toEqual([]);

  await page.getByRole('button', { name: 'Account and preferences' }).click();
  expect(await axe(page), 'profile menu').toEqual([]);
  await page.getByRole('button', { name: /^Display currency:/ }).click();
  expect(await axe(page), 'currency picker').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Currencies' })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Account and preferences' })).toBeHidden();

  await page.getByRole('combobox', { name: 'Search transactions' }).fill('a');
  await expect(page.getByRole('listbox', { name: 'Matching transactions' })).toBeVisible();
  expect(await axe(page), 'search results').toEqual([]);

  for (const path of ['/app/transactions', '/app/transactions/income', '/app/budgets', '/app/insights/reports', '/app/insights/breakdown',
    '/app/insights/income', '/app/insights/ask', '/app/tuition', '/app/settings']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await page.waitForTimeout(600);
    expect(await axe(page), `${path} screen`).toEqual([]);
  }

  // Settings' confirmation for turning on two-factor (cancelled, not confirmed).
  await page.getByRole('region', { name: 'Security' }).getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(await axe(page, '[role="alertdialog"]'), 'two-factor confirmation').toEqual([]);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
});
