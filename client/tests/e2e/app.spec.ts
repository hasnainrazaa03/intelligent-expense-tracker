import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// Authenticated flows — the project supplies a pre-authenticated storageState,
// so each test starts logged in (no per-test login → no rate-limit trips).

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible({ timeout: 20_000 });
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

test('currency picker switches display to INR', async ({ page }) => {
  await page.getByRole('button', { name: /Display currency/i }).click();
  await page.getByLabel('Search currency').fill('INR');
  await page.getByRole('option').first().click();
  // INR always has a fallback rate, so amounts render even without live FX.
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
  // getByLabel resolves only if the <label> is programmatically associated with
  // the input (htmlFor/id) — so this also guards the field-label a11y wiring.
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Amount (USD)').fill('42.50');
  await dialog.getByRole('button', { name: 'Add expense' }).click();

  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await page.getByPlaceholder('Search transactions…').fill(title);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
});

test('search dropdown surfaces a transaction and opens its detail', async ({ page }) => {
  const search = page.getByRole('combobox', { name: 'Search transactions' });
  await search.click();
  await search.fill('a'); // broad query so at least one seeded transaction matches

  const results = page.locator('#search-results [role="option"]');
  await expect(results.first()).toBeVisible({ timeout: 10_000 });

  // Clicking a result opens that transaction's detail (edit) modal.
  await results.first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Edit (expense|income)/ })).toBeVisible();
});

test('bank statement CSV maps columns and reaches the review step', async ({ page }) => {
  await page.getByRole('button', { name: 'Open data import and export' }).click();
  // Launch the dedicated statement-import modal from the data modal.
  await page.getByRole('dialog').getByRole('button', { name: /Import a bank statement/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Import bank statement' })).toBeVisible();

  // Upload an in-memory statement: 3 debits + 1 credit.
  const csv = [
    'Posted Date,Description,Amount,Category',
    '07/01/2026,STARBUCKS,-5.75,Dining',
    '07/02/2026,PAYROLL,2400.00,Income',
    '07/03/2026,TRADER JOES,-62.18,Groceries',
    '07/05/2026,UBER,-14.30,Transport',
  ].join('\n');
  await dialog.getByLabel('Bank statement CSV or PDF file').setInputFiles({
    name: 'statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  // Auto-detected mapping + credit-skipping: advance to review (3 debits ready).
  await dialog.getByRole('button', { name: /Review 3 transactions/ }).click();
  await expect(dialog.getByText(/3 detected · 3 expenses · 0 income selected/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Import 3 transactions/ })).toBeEnabled();
});

test('offline: an expense is queued and syncs on reconnect', async ({ page, context }) => {
  const title = `Offline ${Date.now()}`;

  // Warm the (lazy) chunks while online — offline they'd be served from the
  // SW/module cache, which requires them to have loaded once. Also switch to the
  // Transactions sub-tab so the expense list (where the optimistic row appears)
  // is mounted.
  await page.getByRole('tab', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Recent expenses' })).toBeVisible();
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.getByRole('menuitem', { name: /add expense/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await context.setOffline(true);

  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.getByRole('menuitem', { name: /add expense/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Amount (USD)').fill('12.34');
  await dialog.getByRole('button', { name: 'Add expense' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // Offline indicator + optimistic row shown while offline. Search for the
  // unique title so the row is surfaced regardless of how many other
  // transactions share today's date (the list is paginated).
  await expect(page.getByText(/Offline · 1 queued/)).toBeVisible();
  await page.getByPlaceholder('Search transactions…').fill(title);
  await expect(page.getByText(title).first()).toBeVisible();
  await page.getByPlaceholder('Search transactions…').fill('');

  // Reconnect → the queue flushes and the pill clears.
  await context.setOffline(false);
  await expect(page.getByText(/queued/)).toBeHidden({ timeout: 15_000 });

  // Persisted on the server: a reload + search still finds it.
  await page.reload();
  await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search transactions…').fill(title);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
});

test('create and delete a household', async ({ page }) => {
  const name = `E2E Home ${Date.now()}`;
  await page.getByText('Households · shared budgeting').scrollIntoViewIfNeeded();
  await page.getByLabel('New household name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const card = page.locator('div').filter({ hasText: name }).last();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  await expect(card.getByText('owner', { exact: true }).first()).toBeVisible();

  // Owner deletes it — clean up after ourselves.
  await card.getByRole('button', { name: 'Delete' }).first().click();
  await expect(page.getByText(name)).toBeHidden({ timeout: 10_000 });
});

test('dashboard has no WCAG A/AA accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
