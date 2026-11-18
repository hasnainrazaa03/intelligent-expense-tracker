import { test, expect, type Page, type APIRequestContext, type Download } from '@playwright/test';
import fs from 'fs';
import type { Expense, Income } from '../../src/types';

// End-to-end flows: CSV and statement import, tuition, PDF export, AI chat and
// backup restore. Most run as the shared demo account (see auth.setup.ts); the restore
// test uses its own account because it replaces all of that account's data.

const API = 'http://localhost:3001/api';

/** The signed-in user's data, read straight from the API. */
const allData = async (request: APIRequestContext) => (await request.get(`${API}/data/all`)).json();
const request = (page: Page) => page.request.get(`${API}/data/all`);
const titles = async (request: APIRequestContext): Promise<string[]> => (await allData(request)).expenses.map((e: { title: string }) => e.title);
const csrfHeaders = async (request: APIRequestContext) =>
  ({ 'x-csrf-token': (await (await request.get(`${API}/auth/csrf`)).json()).csrfToken });

const serverGoals = async (request: APIRequestContext): Promise<{ name: string; target: number }[]> =>
  (await (await request.get(`${API}/settings`)).json()).settings.savingsGoals ?? [];

const signIn = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Test1234!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible({ timeout: 20_000 });
};

const openApp = async (page: Page) => {
  await page.goto('/app');
  await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();
  await page.getByRole('tab', { name: 'Expenses', exact: true }).first().click();
};

test.describe('as the demo account', () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test('CSV import reads "1,234.56", keeps a multi-line note, and skips a refund', async ({ page }) => {
    const tag = Date.now();
    const csv = [
      'title,amount,category,date,paymentMethod,notes,isRecurring,tags',
      `E2E Laptop ${tag},"1,234.56",Electronics,2026-07-02,Credit Card,,false,`,
      `E2E Rent ${tag},1500,Rent,2026-07-01,Bank Transfer,"Split with\nroommates",true,home; fixed`,
      `E2E Refund ${tag},-20,Shopping,2026-07-03,,,false,`,
    ].join('\r\n');
    await page.getByRole('button', { name: 'Open data import and export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles({ name: 'expenses.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await dialog.getByRole('button', { name: 'Import CSV' }).click();
    await expect(page.getByText(/skipped 1 \(1 with a zero or negative amount/)).toBeVisible({ timeout: 10_000 });

    const expenses = (await allData(page.request)).expenses as { title: string; amount: number; notes?: string; tags?: string[] }[];
    expect(expenses.find((e) => e.title === `E2E Laptop ${tag}`)?.amount).toBe(1234.56);
    expect(expenses.find((e) => e.title === `E2E Rent ${tag}`)).toMatchObject({ notes: 'Split with\nroommates', tags: ['home', 'fixed'] });
    expect(expenses.some((e) => e.title === `E2E Refund ${tag}`)).toBe(false);
  });

  test('a bank statement is imported after review: debits as expenses, the credit as income', async ({ page }) => {
    const tag = Date.now();
    await page.getByRole('button', { name: 'Open data import and export' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Import a bank statement/ }).click();
    const imp = page.getByRole('region', { name: 'Import bank statement' });
    const csv = [
      'Posted Date,Description,Amount,Category',
      `06/01/2026,E2E COFFEE ${tag},-5.75,Dining`,
      `06/02/2026,E2E PAYROLL ${tag},2400.00,Income`,
      `06/03/2026,E2E GROCER ${tag},-62.18,Groceries`,
    ].join('\n');
    await imp.getByLabel('Bank statement CSV or PDF file').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await imp.getByRole('button', { name: /Review 3 transactions/ }).click();
    await imp.getByRole('button', { name: /Import 3 \(2 exp · 1 inc\)/ }).click();

    await expect.poll(async () => (await titles(page.request)).filter((t) => t.includes(String(tag))).length, { timeout: 15_000, intervals: [500, 1000] }).toBe(2);
    // Incomes are a second request, sent only after the expenses have landed.
    const payroll = async () =>
      ((await allData(page.request)).incomes as { title: string; amount: number }[]).find((i) => i.title.includes(`E2E PAYROLL ${tag}`))?.amount;
    await expect.poll(payroll, { timeout: 15_000, intervals: [500, 1000] }).toBe(2400);
  });

  test('tuition: paying an installment adds the expense, and deleting it re-opens the installment', async ({ page }) => {
    await page.getByRole('tab', { name: 'Tuition', exact: true }).first().click();
    await page.mouse.move(1200, 900); // the sidebar expands under the pointer and covers the semester tabs
    await page.getByRole('button', { name: /^Fall 2026/ }).click();
    const awaiting = page.getByText('Awaiting payment');
    const before = await awaiting.count();
    expect(before, 'the demo semester has unpaid installments').toBeGreaterThan(0);

    const tuitionTitles = async (): Promise<string[]> =>
      (await allData(page.request)).expenses.filter((e: { category: string }) => e.category === 'Tuition').map((e: { title: string }) => e.title);
    const existing = new Set(await tuitionTitles());
    await page.getByRole('button', { name: 'Mark paid' }).first().click();
    await expect(awaiting).toHaveCount(before - 1, { timeout: 10_000 });
    let title = '';
    await expect.poll(async () => (title = (await tuitionTitles()).find((t) => !existing.has(t)) ?? ''), { timeout: 10_000, intervals: [500, 1000] }).not.toBe('');
    // Numbered like the tracker shows it, not by a database id.
    expect(title).toMatch(/^USC Tuition - Fall 2026 \(Inst #[1-9]\)$/);

    // Its paid date can be changed from the tracker, and the expense moves with
    // it. The 1st of this month (the 2nd on the 1st) keeps it in "This month".
    const n = title.match(/#(\d)/)![1];
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() === 1 ? 2 : 1);
    const ymd = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    await page.getByRole('button', { name: `Change the paid date of installment ${n}` }).click();
    await page.getByRole('button', { name: new RegExp(`^Paid date for installment ${n},`) }).click();
    await page.getByRole('button', { name: target.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Paid: ${ymd}`)).toBeVisible({ timeout: 10_000 });
    const tuitionDate = async () => (await allData(page.request)).expenses.find((e: { title: string }) => e.title === title)?.date?.slice(0, 10);
    await expect.poll(tuitionDate, { timeout: 10_000, intervals: [500, 1000] }).toBe(ymd);

    // Delete it from the list, past the undo window. Searching for it, not
    // paging: a long-lived local database holds hundreds of test expenses.
    await page.getByRole('tab', { name: 'Expenses', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Transactions' }).click();
    await page.getByPlaceholder('Search transactions…').fill(title);
    const del = page.getByRole('button', { name: `Delete expense ${title}` });
    await del.click();
    await page.getByPlaceholder('Search transactions…').fill('');
    await page.getByRole('alertdialog', { name: 'Delete transaction?' }).getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => (await titles(page.request)).includes(title), { timeout: 15_000, intervals: [500, 1000] }).toBe(false);

    await page.getByRole('tab', { name: 'Tuition', exact: true }).first().click();
    await page.mouse.move(1200, 900); // the sidebar expands under the pointer and covers the semester tabs
    await page.getByRole('button', { name: /^Fall 2026/ }).click();
    await expect(awaiting).toHaveCount(before);
  });

  test('PDF exports download a real PDF with the report and its table rows', async ({ page }, testInfo) => {
    // jsPDF and jspdf-autotable are upgraded independently (Dependabot); this
    // catches a pair that builds fine but no longer draws the report.
    const tag = Date.now();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await page.request.post(`${API}/expenses`, {
      headers: await csrfHeaders(page.request),
      data: { title: `E2E PDF ${tag}`, amount: 18.25, category: 'Groceries', date: today },
    });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();

    // jsPDF writes uncompressed text, so each drawn string shows up as "(text) Tj".
    const save = async (download: Download) => {
      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const raw = fs.readFileSync(file, 'latin1');
      expect(raw.startsWith('%PDF-')).toBe(true);
      expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
      return raw;
    };

    await page.getByRole('button', { name: 'Open data import and export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
    const [exported] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download export' }).click()]);
    expect(exported.suggestedFilename()).toMatch(/^financial-report-\d{4}-\d{2}-\d{2}\.pdf$/);
    const report = await save(exported);
    expect(report).toContain('(Financial Report) Tj');
    expect(report).toContain(`(E2E PDF ${tag}) Tj`); // a table row, drawn by jspdf-autotable
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'Reports', exact: true }).first().click();
    const [audit] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
    const auditPdf = await save(audit);
    expect(auditPdf).toContain('(Spending report) Tj');
    expect(auditPdf).toContain('(Total spent) Tj');
  });

  test('a savings goal added on one device shows on another (settings live on the server)', async ({ page, browser }) => {
    const name = `E2E goal ${Date.now()}`;
    await page.getByLabel('Goal name').fill(name);
    await page.getByLabel(/^Goal target amount/).fill('750');
    await page.getByRole('button', { name: 'Add goal' }).click();
    await expect(page.getByText(name)).toBeVisible();
    await expect.poll(async () => (await serverGoals(page.request)).map((g) => g.name), { timeout: 10_000, intervals: [500, 1000] }).toContain(name);

    // Another device: a separate browser profile, signed in on its own.
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const phone = await other.newPage();
    await signIn(phone, 'test@test.com');
    await phone.getByRole('tab', { name: 'Expenses', exact: true }).first().click();
    await expect(phone.getByText(name)).toBeVisible({ timeout: 15_000 });

    // Removed there, gone here too after a reload.
    await phone.getByRole('button', { name: `Delete goal ${name}` }).click();
    await expect.poll(async () => (await serverGoals(phone.request)).map((g) => g.name), { timeout: 10_000, intervals: [500, 1000] }).not.toContain(name);
    await other.close();
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.getByLabel('Goal name')).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('a list emptied by a search or period says so, with a way back (5f-1)', async ({ page }) => {
    await page.getByRole('tab', { name: 'Transactions' }).click();
    const search = page.getByPlaceholder('Search transactions…');
    await search.fill('zzqx-nothing-like-this');
    await expect(page.getByText('Nothing matches')).toBeVisible();
    await expect(page.getByText('No expenses match “zzqx-nothing-like-this” in this month.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add first expense' })).toHaveCount(0);

    await page.locator('#main-content').getByRole('button', { name: 'Show all time' }).click();
    await expect(page.getByText('No expenses match “zzqx-nothing-like-this”.')).toBeVisible();
    // The empty state's button (the search box has its own clear button too).
    await page.locator('#main-content').getByRole('button', { name: 'Clear search' }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByText('Nothing matches')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit expense / }).first()).toBeVisible();
  });

  test('import errors are in plain language (5f-1)', async ({ page }) => {
    await page.getByRole('button', { name: 'Open data import and export' }).click();
    const dialog = page.getByRole('dialog');
    // The file input only accepts .csv in the picker; a drag or a rename can still hand it something else.
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(dialog.getByRole('alert')).toHaveText('Choose a .csv file.');
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('title,amount,category,date\n') });
    await dialog.getByRole('button', { name: 'Import CSV' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('This CSV has no rows.');
  });

  test('AI chat answers a question', async ({ page }) => {
    test.skip(!process.env.E2E_MOCK_AI, 'Needs the API pointed at the mock Gemini (CI sets E2E_MOCK_AI).');
    await page.getByRole('tab', { name: 'AI Analyst', exact: true }).first().click();
    await page.getByLabel('Ask the AI analyst').fill('How is my spending this month?');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Mock analyst reply: your spending is on track this month.')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('reports period (5e-1)', () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test('the period selector changes what the report covers, and says so', async ({ page }) => {
    await page.getByRole('tab', { name: 'Reports', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Spending report' })).toBeVisible();
    const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    await expect(page.getByText(`This month · ${month}`)).toBeVisible();
    const total = page.locator('h3').first();
    const thisMonth = await total.textContent();

    await page.getByRole('button', { name: 'All time', exact: true }).click();
    await expect(page.getByText(/^All time · \d{4}/)).toBeVisible();
    await expect(page.getByText(/Budget used · average month/)).toBeVisible();
    // The demo account has spending before this month.
    await expect(total).not.toHaveText(thisMonth ?? '');
    await expect(page.getByText(/Status: audited|Certified/)).toHaveCount(0);
  });
});

test.describe('when saving is slow or fails (5d-2)', () => {
  test.beforeEach(async ({ page }) => openApp(page));

  // An expense dated today, so it's in the default "This month" list.
  const addToday = async (page: Page, title: string) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await page.request.post(`${API}/expenses`, { headers: await csrfHeaders(page.request), data: { title, amount: 12.5, category: 'Groceries', date: today } });
    await page.reload();
    await page.getByRole('tab', { name: 'Expenses', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Transactions' }).click();
    // Many test expenses share today's date: filter the list down to this one.
    await page.getByPlaceholder('Search transactions…').fill(title.split(' ').pop()!);
    await expect(page.getByRole('button', { name: `Edit expense ${title}` })).toBeVisible({ timeout: 10_000 });
  };
  const failWith500 = { status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Server error' }) };
  // Matches whether or not a dialog has hidden the list from the accessibility tree.
  const row = (page: Page, title: string) => page.locator(`[aria-label="Edit expense ${title}"]`);

  test('an edit shows at once; if the server refuses one, it is undone and the form keeps it', async ({ page }) => {
    const title = `E2E edit ${Date.now()}`;
    await addToday(page, title);

    // A slow server: the change is on screen before it answers.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/expenses/*', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      await held;
      return route.continue();
    });
    await page.getByRole('button', { name: `Edit expense ${title}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(`${title} renamed`);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(row(page, `${title} renamed`)).toHaveCount(1);
    release();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await page.unroute('**/api/expenses/*');

    // A refusal: the list goes back, the form stays open with the new text.
    await page.route('**/api/expenses/*', (route) => (route.request().method() === 'PUT' ? route.fulfill(failWith500) : route.fallback()));
    await page.getByRole('button', { name: `Edit expense ${title} renamed` }).click();
    await dialog.getByLabel('Title').fill(`${title} refused`);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Could not update expense. Your changes are still in the form.')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByLabel('Title')).toHaveValue(`${title} refused`);
    await expect(row(page, `${title} renamed`)).toHaveCount(1);
    await expect(row(page, `${title} refused`)).toHaveCount(0);
    await page.unroute('**/api/expenses/*');
  });

  test('a delete the server refuses puts the row back', async ({ page }) => {
    const title = `E2E keep ${Date.now()}`;
    await addToday(page, title);
    await page.route('**/api/expenses/*', (route) => (route.request().method() === 'DELETE' ? route.fulfill(failWith500) : route.fallback()));
    await page.getByRole('button', { name: `Delete expense ${title}` }).click();
    await page.getByRole('alertdialog', { name: 'Delete transaction?' }).getByRole('button', { name: 'Confirm' }).click();
    await expect(row(page, title)).toHaveCount(0);
    // After the undo window the delete is sent, refused, and the row returns.
    await expect(page.getByText("Couldn't delete the expense, so it's back in the list.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: `Edit expense ${title}` })).toBeVisible();
    await page.unroute('**/api/expenses/*');
  });

  test('an add that fails keeps what was typed (C4)', async ({ page }) => {
    await page.route('**/api/expenses', (route) => (route.request().method() === 'POST' ? route.fulfill(failWith500) : route.fallback()));
    await page.getByRole('button', { name: 'Quick actions' }).click();
    await page.getByRole('menuitem', { name: /add expense/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Typed before a failure');
    await dialog.getByLabel('Amount (USD)').fill('9.99');
    await dialog.getByRole('button', { name: 'Add expense' }).click();
    await expect(page.getByText('Could not add expense. Your entry is still in the form.')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByLabel('Title')).toHaveValue('Typed before a failure');
    await expect(dialog.getByLabel('Amount (USD)')).toHaveValue('9.99');
    await page.unroute('**/api/expenses');
  });
});

test.describe('backup restore (own account)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a downloaded backup restores the data exactly as it was', async ({ page }, testInfo) => {
    await signIn(page, 'e2e-restore@test.com');

    const request = page.request;
    const headers = await csrfHeaders(request);
    await request.post(`${API}/data/restore`, { headers, data: { expenses: [], incomes: [], budgets: [], semesters: [] } });
    await request.post(`${API}/expenses`, { headers, data: { title: 'Kept by the backup', amount: 25, category: 'Groceries', date: '2026-07-10' } });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();

    await page.getByRole('button', { name: 'Open data import and export' }).click();
    const dialog = page.getByRole('dialog');
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export full backup (JSON)' }).click()]);
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).data.expenses).toHaveLength(1);
    await page.keyboard.press('Escape');

    await request.post(`${API}/expenses`, { headers, data: { title: 'Added after the backup', amount: 9, category: 'Groceries', date: '2026-07-11' } });
    expect(await titles(request)).toHaveLength(2);

    await page.getByRole('button', { name: 'Open data import and export' }).click();
    await dialog.locator('input[type="file"][accept=".json"]').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Restore full backup…' }).click();
    await dialog.locator('#restore-confirm').fill('REPLACE');
    await dialog.getByRole('button', { name: 'Replace my data' }).click();

    await expect.poll(async () => (await titles(request)).sort(), { timeout: 15_000, intervals: [500, 1000] }).toEqual(['Kept by the backup']);
  });

  test('a passphrase-protected backup is unreadable without it and restores with it (B9)', async ({ page }, testInfo) => {
    await signIn(page, 'e2e-restore@test.com');

    const request = page.request;
    const headers = await csrfHeaders(request);
    await request.post(`${API}/data/restore`, { headers, data: { expenses: [], incomes: [], budgets: [], semesters: [] } });
    await request.post(`${API}/expenses`, { headers, data: { title: 'Kept by the encrypted backup', amount: 31, category: 'Groceries', date: '2026-07-12' } });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();

    await page.getByRole('button', { name: 'Open data import and export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Protect the backup with a passphrase').check();
    const exportButton = dialog.getByRole('button', { name: 'Export encrypted backup (JSON)' });
    await dialog.getByLabel('Passphrase', { exact: true }).fill('orbit test passphrase');
    await dialog.getByLabel('Repeat passphrase').fill('orbit test passphrasf');
    await expect(dialog.getByText("The two passphrases don't match.")).toBeVisible();
    await expect(exportButton).toBeDisabled();
    await dialog.getByLabel('Repeat passphrase').fill('orbit test passphrase');

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/_encrypted\.json$/);
    const file = testInfo.outputPath('backup-encrypted.json');
    await download.saveAs(file);
    const text = fs.readFileSync(file, 'utf8');
    expect(JSON.parse(text)).toMatchObject({ format: 'orbit-backup-encrypted', v: 1 });
    expect(text).not.toContain('Kept by the encrypted backup');
    await page.keyboard.press('Escape');

    await request.post(`${API}/expenses`, { headers, data: { title: 'Added after the encrypted backup', amount: 9, category: 'Groceries', date: '2026-07-13' } });

    await page.getByRole('button', { name: 'Open data import and export' }).click();
    await dialog.locator('input[type="file"][accept=".json"]').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Restore full backup…' }).click();
    await expect(dialog.getByText('This backup is encrypted')).toBeVisible();
    await dialog.locator('#unlock-passphrase').fill('not the passphrase');
    await dialog.getByRole('button', { name: 'Unlock backup' }).click();
    await expect(dialog.getByRole('alert')).toContainText("That passphrase doesn't open this backup.");

    await dialog.locator('#unlock-passphrase').fill('orbit test passphrase');
    await dialog.getByRole('button', { name: 'Unlock backup' }).click();
    await expect(dialog.getByText('Replace all your data with this backup?')).toBeVisible();
    await dialog.locator('#restore-confirm').fill('REPLACE');
    await dialog.getByRole('button', { name: 'Replace my data' }).click();

    await expect.poll(async () => (await titles(request)).sort(), { timeout: 15_000, intervals: [500, 1000] }).toEqual(['Kept by the encrypted backup']);
  });

  test('goals kept in this browser before settings moved to the server are uploaded on sign-in', async ({ page }) => {
    const email = 'e2e-restore@test.com';
    await signIn(page, email);
    const headers = await csrfHeaders(page.request);
    await page.request.patch(`${API}/settings`, { headers, data: { savingsGoals: null } });

    // What an earlier version of the app left in localStorage for this account.
    await page.evaluate((who) => {
      localStorage.setItem(`savingsGoalsV2::${who}`, JSON.stringify([{ id: 'old-1', name: 'Saved before the move', target: 640, saved: 40 }]));
      localStorage.removeItem(`settingsMigrated::${who}`);
      localStorage.removeItem(`settingsCache::${who}`);
    }, email);
    await page.reload();
    await page.getByRole('tab', { name: 'Expenses', exact: true }).first().click();
    await expect(page.getByText('Saved before the move')).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => serverGoals(page.request), { timeout: 10_000, intervals: [500, 1000] })
      .toEqual([expect.objectContaining({ name: 'Saved before the move', target: 640 })]);
    expect(await page.evaluate((who) => localStorage.getItem(`savingsGoalsV2::${who}`), email)).toBeNull();
  });
});

test.describe('settings page (5b-2)', () => {
  test('one page for preferences and security; turning on two-factor asks first', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    // Hide tuition: an account setting, mirrored by the header's tuition button.
    const hide = page.getByRole('switch', { name: 'Hide tuition from overviews' });
    await expect(hide).toHaveAttribute('aria-checked', 'false');
    await hide.click();
    await expect(hide).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: /Show tuition across summaries/ })).toHaveAttribute('aria-pressed', 'true');
    const saved = async () => (await (await page.request.get(`${API}/settings`)).json()).settings.hideTuition;
    await expect.poll(saved, { timeout: 10_000, intervals: [500, 1000] }).toBe(true);
    await hide.click();
    await expect.poll(saved, { timeout: 10_000, intervals: [500, 1000] }).toBe(false);

    // Theme: per device, and the header follows.
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: /switch to dark theme/i })).toBeVisible();
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Two-factor: the old gear turned it on in one click. Now it asks.
    await expect(page.getByText('Two-factor sign-in: off')).toBeVisible();
    await page.getByRole('region', { name: 'Security' }).getByRole('button', { name: 'Turn on' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Turn on two-factor sign-in?' });
    await expect(dialog).toContainText('test@test.com');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Two-factor sign-in: off')).toBeVisible();
    expect((await (await page.request.get(`${API}/auth/session`)).json()).twoFactorEnabled).toBe(false);
  });

  test('notifications: which kinds to send are account settings, and this device says where it stands (5e-2)', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const section = page.getByRole('region', { name: 'Notifications' });
    await expect(section).toBeVisible();
    // The test API has no VAPID keys, and headless Chromium has no push service.
    await expect(section.getByText(/aren't set up on the server yet|Off on this device|doesn't support notifications/)).toBeVisible();

    const saved = async () => (await (await page.request.get(`${API}/settings`)).json()).settings;
    const budgets = section.getByRole('switch', { name: 'Budget alerts' });
    await expect(budgets).toHaveAttribute('aria-checked', 'false');
    await budgets.click();
    await expect(budgets).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await saved()).notifyBudgets, { timeout: 10_000, intervals: [500, 1000] }).toBe(true);
    // The device's time zone goes with it, so alerts arrive in the user's daytime.
    expect((await saved()).timeZone).toBe(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone));
    await budgets.click();
    await expect.poll(async () => (await saved()).notifyBudgets, { timeout: 10_000, intervals: [500, 1000] }).toBe(false);
  });

  test('anonymous visit counts can be turned off per device, and nothing loads off the production site (5f-3)', async ({ page }) => {
    const analyticsRequests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/_vercel/')) analyticsRequests.push(r.url()); });
    await openApp(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const visits = page.getByRole('switch', { name: 'Anonymous visit counts' });
    await expect(visits).toHaveAttribute('aria-checked', 'true');
    await visits.click();
    await expect(visits).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => localStorage.getItem('analyticsOptOut'))).toBe('1');
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(visits).toHaveAttribute('aria-checked', 'false');
    await visits.click();
    expect(await page.evaluate(() => localStorage.getItem('analyticsOptOut'))).toBeNull();
    // This is localhost, not the production site: Vercel's script never loads.
    expect(analyticsRequests).toEqual([]);
  });
});

test.describe('account actions (own accounts)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('"sign out everywhere" ends the session in every browser', async ({ page, browser }) => {
    await signIn(page, 'e2e-restore@test.com');
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const laptop = await other.newPage();
    await signIn(laptop, 'e2e-restore@test.com');
    expect((await laptop.request.get(`${API}/settings`)).status()).toBe(200);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out everywhere' }).click();
    await page.getByRole('alertdialog', { name: 'Sign out everywhere?' }).getByRole('button', { name: 'Sign out everywhere' }).click();
    await expect(page).toHaveURL(/\/login/);

    expect((await laptop.request.get(`${API}/settings`)).status()).toBe(401);
    await other.close();
  });

  test('changing the password keeps this browser signed in, signs out the others, and the new one works', async ({ page, browser }) => {
    // Its own account (CI creates it; locally run
    // `server/scripts/ensure-test-user.ts e2e-password@test.com` first).
    const email = 'e2e-password@test.com';
    const NEW_PASSWORD = 'Changed5678?';
    await page.goto('/login');
    await page.getByPlaceholder('you@email.com').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const signedIn = await page.getByRole('tablist', { name: 'Primary navigation' }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
    test.skip(!signedIn, `No ${email} account: run server/scripts/ensure-test-user.ts ${email} first.`);
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const laptop = await other.newPage();
    await signIn(laptop, email);

    try {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('region', { name: 'Security' }).getByRole('button', { name: 'Change' }).click();
      const form = page.getByRole('form', { name: 'Change password' });
      await form.getByLabel('Current password').fill('Test1234!');
      await form.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
      await form.getByLabel('Repeat new password').fill('Changed5678!');
      await form.getByRole('button', { name: 'Change password' }).click();
      await expect(form.getByRole('alert')).toHaveText("The new passwords don't match.");
      await form.getByLabel('Repeat new password').fill(NEW_PASSWORD);
      await form.getByRole('button', { name: 'Change password' }).click();
      await expect(page.getByText('Password changed. Every other device is signed out.')).toBeVisible({ timeout: 10_000 });
      await expect(form).toBeHidden();

      // This browser carries on (writes too: the renewed CSRF token is in use)...
      const headers = await csrfHeaders(page.request);
      expect((await page.request.patch(`${API}/settings`, { headers, data: { hideTuition: false } })).status()).toBe(200);
      // ...the other is signed out, and only the new password signs in.
      expect((await laptop.request.get(`${API}/settings`)).status()).toBe(401);
      const tryLogin = async (password: string) => (await other.request.post(`${API}/auth/login`, { headers: await csrfHeaders(other.request), data: { email, password } })).status();
      expect(await tryLogin('Test1234!')).not.toBe(200);
      expect(await tryLogin(NEW_PASSWORD)).toBe(200);
    } finally {
      // Put the known password back so the test can run again.
      await page.request.post(`${API}/auth/change-password`, { headers: await csrfHeaders(page.request), data: { currentPassword: NEW_PASSWORD, newPassword: 'Test1234!' } });
      await other.close();
    }
  });

  test('deleting the account removes it and signs out', async ({ page }) => {
    // A throwaway account (CI creates it; locally run
    // `server/scripts/ensure-test-user.ts e2e-delete@test.com` first).
    const email = 'e2e-delete@test.com';
    await page.goto('/login');
    await page.getByPlaceholder('you@email.com').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const signedIn = await page.getByRole('tablist', { name: 'Primary navigation' }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
    test.skip(!signedIn, `No ${email} account: run server/scripts/ensure-test-user.ts ${email} first.`);
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();

    const headers = await csrfHeaders(page.request);
    await page.request.post(`${API}/expenses`, { headers, data: { title: 'Goes with the account', amount: 5, category: 'Groceries', date: '2026-11-01' } });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const form = page.getByRole('region', { name: 'Delete account' });
    const remove = form.getByRole('button', { name: 'Delete my account' });
    await form.getByLabel('Password').fill('not-my-password');
    await expect(remove).toBeDisabled(); // not before typing DELETE
    await form.getByLabel('Type DELETE to confirm').fill('DELETE');
    await remove.click();
    await expect(form.getByRole('alert')).toHaveText("That password isn't right.");

    await form.getByLabel('Password').fill('Test1234!');
    await remove.click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Your account and all its data have been deleted.')).toBeVisible();

    // Nothing of it stays in this browser (settings cache, unsent changes, …).
    expect(await page.evaluate((who) => Object.keys(localStorage).filter((k) => k.endsWith(`::${who}`)), email)).toEqual([]);

    // Gone: the address can't sign in any more.
    const csrf = (await (await page.request.get(`${API}/auth/csrf`)).json()).csrfToken;
    const login = await page.request.post(`${API}/auth/login`, { headers: { 'x-csrf-token': csrf }, data: { email, password: 'Test1234!' } });
    expect(login.status()).not.toBe(200);
  });

  test('a tuition change from a tab with an older copy is refused, and that tab shows the latest (S12)', async ({ page, context }) => {
    await signIn(page, 'e2e-restore@test.com');
    const headers = await csrfHeaders(page.request);
    // A new account's default semesters: shown, but saved only on the first edit.
    await page.request.post(`${API}/data/restore`, { headers, data: { expenses: [], incomes: [], budgets: [], semesters: [] } });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();

    // A second tab, loaded now, before either has saved anything.
    const second = await context.newPage();
    await second.goto('/app');
    await expect(second.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();
    for (const tab of [page, second]) {
      await tab.getByRole('tab', { name: 'Tuition', exact: true }).first().click();
      await tab.mouse.move(1200, 900); // the sidebar expands under the pointer
    }

    const total = async () => {
      const sems = (await allData(page.request)).semesters as { totalTuition: number }[];
      return sems.map((s) => s.totalTuition);
    };
    await page.getByLabel('Total tuition in USD').fill('30000');
    await page.getByLabel('Total tuition in USD').press('Enter');
    await expect.poll(total, { timeout: 10_000, intervals: [500, 1000] }).toContain(30000);

    // The second tab, still on the old copy, edits too: refused, not overwritten.
    await second.getByLabel('Total tuition in USD').fill('31000');
    await second.getByLabel('Total tuition in USD').press('Enter');
    await expect(second.getByText(/Tuition was changed in another tab or on another device/)).toBeVisible({ timeout: 10_000 });
    await expect(second.getByText('$30,000.00').first()).toBeVisible();
    expect(await total()).toContain(30000);
    expect(await total()).not.toContain(31000);
    await second.close();
  });

  test('a CSV export with income imports back exactly, and importing it again adds nothing (5e-1)', async ({ page }, testInfo) => {
    await signIn(page, 'e2e-restore@test.com');
    const headers = await csrfHeaders(page.request);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await page.request.post(`${API}/data/restore`, {
      headers,
      data: {
        expenses: [{ title: 'Round trip coffee', amount: 4.5, category: 'Dining Out', date: today, account: 'Discover', tags: ['daily'] }],
        incomes: [{ title: 'Round trip pay', amount: 100, category: 'Salary', date: today, account: 'USCCU' }],
        budgets: [],
        semesters: [],
      },
    });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();

    // Export: CSV, all time, expenses and income in one file.
    await page.getByRole('button', { name: 'Open data import and export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'All time', exact: true }).click();
    await dialog.getByRole('button', { name: 'CSV', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download export' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.csv$/);
    const file = testInfo.outputPath('transactions.csv');
    await download.saveAs(file);
    const lines = fs.readFileSync(file, 'utf8').split('\r\n');
    expect(lines[0].startsWith('type,date,title,amount,category')).toBe(true);
    expect(lines.slice(1).map((l) => l.split(',')[0]).sort()).toEqual(['expense', 'income']);

    // Into an empty account: everything comes back, incomes included.
    await page.request.post(`${API}/data/restore`, { headers, data: { expenses: [], incomes: [], budgets: [], semesters: [] } });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Open data import and export' }).click();
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Import CSV' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    const data = async () => (await request(page)).json();
    await expect.poll(async () => {
      const d = await data();
      return [d.expenses.map((e: Expense) => `${e.title}|${e.amount}|${e.account}|${e.tags?.join()}`), d.incomes.map((i: Income) => `${i.title}|${i.amount}|${i.account}`)];
    }, { timeout: 10_000, intervals: [500, 1000] }).toEqual([['Round trip coffee|4.5|Discover|daily'], ['Round trip pay|100|USCCU']]);

    // Again: nothing new, so nothing is added.
    await page.getByRole('button', { name: 'Open data import and export' }).click();
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Import CSV' }).click();
    await expect(dialog.getByText('Everything in this file is already in your account.')).toBeVisible();
    const after = await data();
    expect([after.expenses.length, after.incomes.length]).toEqual([1, 1]);
  });

  test('a CSV of more than 500 rows imports in full (it used to fail outright) (5e-1)', async ({ page }) => {
    await signIn(page, 'e2e-restore@test.com');
    await page.request.post(`${API}/data/restore`, { headers: await csrfHeaders(page.request), data: { expenses: [], incomes: [], budgets: [], semesters: [] } });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Primary navigation' })).toBeVisible();
    const csv = ['title,amount,category,date', ...Array.from({ length: 520 }, (_, i) => `Bulk row ${i},${(i % 40) + 1},Groceries,2026-0${(i % 9) + 1}-1${i % 10}`)].join('\n');
    await page.getByRole('button', { name: 'Open data import and export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await dialog.getByRole('button', { name: 'Import CSV' }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect.poll(async () => (await (await request(page)).json()).expenses.length, { timeout: 15_000, intervals: [500, 1000] }).toBe(520);
  });
});

