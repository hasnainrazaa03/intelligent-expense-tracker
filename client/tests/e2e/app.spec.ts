import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// Authenticated flows — the project supplies a pre-authenticated storageState,
// so each test starts logged in (no per-test login → no rate-limit trips).

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 20_000 });
});

test('lands on the dashboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});

test('Home: the month, budgets at risk, and links into the details (U3)', async ({ page }) => {
  // The demo account has budgets: the main card weighs this month against them.
  const month = page.getByRole('region', { name: 'This month' });
  await expect(month.getByText('Budget this month')).toBeVisible();
  await expect(month.getByText(/days? left/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Budgets at risk' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Coming up/ })).toBeVisible();

  // A category opens the expense list filtered to it.
  const firstCategory = page.getByRole('region', { name: 'Spending by category' }).getByRole('link').first();
  const name = (await firstCategory.locator('span').nth(1).innerText()).trim();
  await firstCategory.click();
  await expect(page).toHaveURL(new RegExp(`/app/transactions\\?category=${encodeURIComponent(name)}`));
  await expect(page.getByRole('button', { name: `Remove filter ${name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page).toHaveURL(/\/app\/transactions$/);

  // A question typed on Home arrives in Ask AI, ready to send.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByLabel('Your question').fill('Where did my money go?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/insights\/ask$/);
  await expect(page.getByPlaceholder(/Ask anything about your spending/)).toHaveValue('Where did my money go?');
});

test('every screen has its own address, and Back walks through them (U2a)', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('link', { name: 'Insights', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/insights\/reports$/);
  await expect(page.getByRole('heading', { name: 'Spending report' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Insights', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('navigation', { name: 'Insights sections' }).getByRole('link', { name: 'Breakdown' }).click();
  await expect(page).toHaveURL(/\/app\/insights\/breakdown$/);
  await expect(page.getByRole('heading', { name: 'Breakdown', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Tuition', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tuition ledger' })).toBeVisible();
  await nav.getByRole('link', { name: 'Budgets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible();

  // Back and Forward move between screens; a reload stays put.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Tuition ledger' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Breakdown', exact: true })).toBeVisible();
  await page.goForward();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tuition ledger' })).toBeVisible();

  // /app/insights opens Reports; an address the app doesn't have goes home.
  await page.goto('/app/insights');
  await expect(page).toHaveURL(/\/app\/insights\/reports$/);
  await page.goto('/app/no-such-screen');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});

test('phones: a bottom bar, with More for Budgets, Tuition and Settings (U2a)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  try {
    await phone.goto('/app');
    const bar = phone.getByRole('navigation', { name: 'Primary' });
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await expect(bar.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await bar.getByRole('button', { name: 'More' }).click();
    const more = phone.getByRole('dialog', { name: 'More' });
    await more.getByRole('link', { name: 'Tuition' }).click();
    await expect(phone).toHaveURL(/\/app\/tuition$/);
    await expect(more).toBeHidden();
    await bar.getByRole('button', { name: 'Add new entry' }).click();
    await expect(phone.getByRole('menuitem', { name: /add expense/i })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('the profile menu holds the preferences that were header icons (U2a)', async ({ page }) => {
  const profile = page.getByRole('button', { name: 'Account and preferences' });
  await profile.click();
  const panel = page.getByRole('dialog', { name: 'Account and preferences' });
  await expect(panel.getByText('test@test.com')).toBeVisible();
  for (const name of ['Categories', 'Import and export', 'All settings']) await expect(panel.getByRole('link', { name })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(profile).toBeFocused();

  // The pop-ups that were header icons are pages with addresses now (U2b).
  await profile.click();
  await panel.getByRole('link', { name: 'Categories' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/categories$/);
  await page.getByRole('region', { name: 'Categories' }).getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
});

test('currency picker switches display to INR', async ({ page }) => {
  await page.getByRole('button', { name: 'Account and preferences' }).click();
  await page.getByRole('button', { name: /Display currency/i }).click();
  await page.getByLabel('Search currency').fill('INR');
  await page.getByRole('option').first().click();
  // INR always has a fallback rate, so amounts render even without live FX.
  await expect(page.getByText(/₹\s?[\d,]/).first()).toBeVisible();
  // An account setting now: saved on the server, so other devices get it.
  const saved = async () => (await (await page.request.get('http://localhost:3001/api/settings')).json()).settings.displayCurrency;
  await expect.poll(saved, { timeout: 10_000, intervals: [500, 1000] }).toBe('INR');
  // Put it back: the demo account is shared by the other specs. (The menu
  // stays open after a pick; Escape closes it.)
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Account and preferences' }).click();
  await page.getByRole('button', { name: /Display currency/i }).click();
  await page.getByLabel('Search currency').fill('USD');
  await page.getByRole('option').first().click();
  await expect.poll(saved, { timeout: 10_000, intervals: [500, 1000] }).toBe('USD');
});

test('theme toggle switches to light mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Account and preferences' }).click();
  const dark = page.getByRole('switch', { name: 'Dark theme' });
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await dark.click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(dark).toHaveAttribute('aria-checked', 'false');
});

test('recurring charges due: one line on Expenses, reviewed with nothing ticked', async ({ page }) => {
  const API = 'http://localhost:3001/api';
  const headers = { 'x-csrf-token': (await (await page.request.get(`${API}/auth/csrf`)).json()).csrfToken };
  // A monthly charge last paid 40 days ago is due again.
  const d = new Date(Date.now() - 40 * 864e5);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const title = `E2E Gym ${Date.now()}`;
  const created = await page.request.post(`${API}/expenses`, {
    headers, data: { title, amount: 30, category: 'Personal', date, isRecurring: true, tags: [] },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    await page.reload();
    const notice = page.getByRole('region', { name: 'Recurring charges due' });
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toContainText(/recurring charges? due/);

    // Only on the Expenses home, not on top of every screen.
    await page.getByRole('link', { name: 'Transactions', exact: true }).click();
    await expect(notice).toHaveCount(0);
    await page.getByRole('link', { name: 'Home', exact: true }).click();

    await notice.getByRole('button', { name: 'Review' }).click();
    const dialog = page.getByRole('dialog', { name: 'Recurring charges due' });
    const box = dialog.getByRole('checkbox', { name: `Add recurring ${title}` });
    await expect(box).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Add selected (0)' })).toBeDisabled();
    await box.check();
    await expect(dialog.getByRole('button', { name: 'Add selected (1)' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Dismiss' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(notice).toHaveCount(0);
  } finally {
    await page.request.delete(`${API}/expenses/${id}`, { headers });
  }
});

test('adds an expense and finds it via search', async ({ page }) => {
  const title = `E2E test ${Date.now()}`;

  await page.getByRole('button', { name: 'Add new entry' }).click();
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
  await page.getByRole('button', { name: 'Account and preferences' }).click();
  await page.getByRole('link', { name: 'Import and export' }).click();
  // Launch the dedicated statement-import page from the data modal.
  await page.getByRole('region', { name: 'Export, import and back up' }).getByRole('button', { name: /Import a bank statement/ }).click();
  // The importer is a full-page view (region), not a modal.
  const imp = page.getByRole('region', { name: 'Import bank statement' });
  await expect(imp.getByRole('heading', { name: 'Import bank statement' })).toBeVisible();

  // Upload an in-memory statement: 3 debits + 1 credit.
  const csv = [
    'Posted Date,Description,Amount,Category',
    '07/01/2026,STARBUCKS,-5.75,Dining',
    '07/02/2026,PAYROLL,2400.00,Income',
    '07/03/2026,TRADER JOES,-62.18,Groceries',
    '07/05/2026,UBER,-14.30,Transport',
  ].join('\n');
  await imp.getByLabel('Bank statement CSV or PDF file').setInputFiles({
    name: 'statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  // Auto-detected mapping: the importer detects income as well as expenses
  // (#81), so the credit (PAYROLL) is reviewed as income alongside 3 debits.
  await imp.getByRole('button', { name: /Review 4 transactions/ }).click();
  await expect(imp.getByText(/4 detected · 3 expenses · 1 income selected/)).toBeVisible();
  await expect(imp.getByRole('button', { name: /Import 4 \(3 exp · 1 inc\)/ })).toBeEnabled();
});

test('offline: an expense is queued and syncs on reconnect', async ({ page, context }) => {
  const title = `Offline ${Date.now()}`;

  // Warm the (lazy) chunks while online — offline they'd be served from the
  // SW/module cache, which requires them to have loaded once. Also switch to the
  // Transactions sub-tab so the expense list (where the optimistic row appears)
  // is mounted.
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add new entry' }).click();
  await page.getByRole('menuitem', { name: /add expense/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await context.setOffline(true);

  await page.getByRole('button', { name: 'Add new entry' }).click();
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
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search transactions…').fill(title);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
});

test('create and delete a household', async ({ page }) => {
  const name = `E2E Home ${Date.now()}`;
  await page.getByRole('link', { name: 'Budgets', exact: true }).click(); // planning lives on Budgets (U3)
  await page.getByText('Households · shared budgeting').scrollIntoViewIfNeeded();
  await page.getByLabel('New household name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const card = page.locator('div').filter({ hasText: name }).last();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  await expect(card.getByText('owner', { exact: true }).first()).toBeVisible();

  // Owner deletes it — clean up after ourselves.
  await card.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('alertdialog', { name: 'Delete household?' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(name)).toBeHidden({ timeout: 10_000 });
});

test('dashboard has no WCAG A/AA accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
