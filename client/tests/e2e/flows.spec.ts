import { test, expect, type Page, type APIRequestContext, type Download } from '@playwright/test';
import fs from 'fs';

// End-to-end flows: CSV and statement import, tuition, PDF export, AI chat and
// backup restore. Most run as the shared demo account (see auth.setup.ts); the restore
// test uses its own account because it replaces all of that account's data.

const API = 'http://localhost:3001/api';

/** The signed-in user's data, read straight from the API. */
const allData = async (request: APIRequestContext) => (await request.get(`${API}/data/all`)).json();
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

    // Delete it from the list (paging until its row shows), past the undo window.
    await page.getByRole('tab', { name: 'Expenses', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Transactions' }).click();
    const del = page.getByRole('button', { name: `Delete expense ${title}` });
    for (let i = 0; i < 12 && !(await del.isVisible()); i++) {
      const next = page.getByRole('button', { name: 'Next page' });
      if (!(await next.isEnabled())) break;
      await next.click();
    }
    await del.click();
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
    expect(auditPdf).toContain('(USC Financial Audit Report) Tj');
    expect(auditPdf).toContain('(Total Expenditure) Tj');
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

  test('AI chat answers a question', async ({ page }) => {
    test.skip(!process.env.E2E_MOCK_AI, 'Needs the API pointed at the mock Gemini (CI sets E2E_MOCK_AI).');
    await page.getByRole('tab', { name: 'AI Analyst', exact: true }).first().click();
    await page.getByLabel('Ask the AI analyst').fill('How is my spending this month?');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Mock analyst reply: your spending is on track this month.')).toBeVisible({ timeout: 15_000 });
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

