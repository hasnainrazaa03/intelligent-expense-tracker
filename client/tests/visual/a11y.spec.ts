import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, settle } from './harness';

// Accessibility on every screen (U7), in all four projects: laptop and phone,
// dark and light, so contrast (4.5:1 for text) is checked in both themes and
// the phone's own controls (bottom bar, More, sheets) are covered. The
// end-to-end a11y spec covers the forms in depth on a laptop against the real
// API; this one is about breadth, on the fixture data.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const axe = async (page: Page, include?: string) => {
  // Away from the sidebar: its labels fade in on hover, and axe would measure
  // their contrast mid-fade.
  await page.mouse.move(5, 895);
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

const isPhone = (projectName: string) => projectName.startsWith('phone');

const APP_SCREENS = [
  '/app',
  '/app/transactions',
  '/app/transactions/expenses',
  '/app/transactions/income',
  '/app/budgets',
  '/app/budgets/edit',
  '/app/insights/reports',
  '/app/insights/breakdown',
  '/app/insights/income',
  '/app/insights/ask',
  '/app/tuition',
  '/app/settings',
  '/app/settings/categories',
  '/app/settings/data',
  '/app/settings/households',
];
const PUBLIC_SCREENS = ['/', '/login', '/login?mode=signup', '/privacy', '/terms', '/knowledge'];

test.describe('every screen passes axe', () => {
  for (const path of APP_SCREENS) {
    test(`app ${path}`, async ({ page }, testInfo) => {
      await prepare(page, testInfo, { signedIn: true });
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      await settle(page);
      expect(await axe(page)).toEqual([]);
    });
  }
  for (const path of PUBLIC_SCREENS) {
    test(`public ${path}`, async ({ page }, testInfo) => {
      await prepare(page, testInfo, { signedIn: false });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).or(page.getByRole('heading', { level: 2 })).first()).toBeVisible();
      await settle(page);
      expect(await axe(page)).toEqual([]);
    });
  }
});

test.describe('dialogs, menus and sheets', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await prepare(page, testInfo, { signedIn: true });
    await page.goto('/app');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await settle(page);
  });

  /** Open with the keyboard, check it, close it with Escape, and expect focus back on the opener. */
  const roundTrip = async (page: Page, opener: Locator, popup: Locator, label: string, { focusReturns = true } = {}) => {
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(popup, `${label} opens`).toBeVisible();
    await settle(page);
    expect(await axe(page), label).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(popup, `Escape closes ${label}`).toBeHidden();
    if (focusReturns) await expect(opener, `focus returns from ${label}`).toBeFocused();
  };

  test('each passes axe, Escape closes it, and focus goes back', async ({ page }, testInfo) => {
    const add = page.getByRole('button', { name: 'Add new entry' }).filter({ visible: true }).first();
    await roundTrip(page, add, page.getByRole('menu', { name: 'Add' }), 'add menu');

    // Quick add (expense and income), from the Add menu.
    for (const [item, label] of [['+ Add expense', 'quick add'], ['+ Add income', 'quick add income']]) {
      await add.click();
      await page.getByRole('menuitem', { name: item }).click();
      const dialog = page.getByRole('dialog').last();
      await expect(dialog, `${label} opens`).toBeVisible();
      await settle(page);
      expect(await axe(page), label).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog'), `Escape closes ${label}`).toHaveCount(0);
    }

    // The statement importer is a full page on purpose (Escape mustn't throw
    // away a half-reviewed import), closed with its Cancel button.
    await add.click();
    await page.getByRole('menuitem', { name: 'Scan a statement (CSV / PDF)' }).click();
    const importer = page.getByRole('region', { name: 'Import bank statement' });
    await expect(importer).toBeVisible();
    await settle(page);
    expect(await axe(page), 'statement import').toEqual([]);
    await importer.getByRole('button', { name: 'Cancel' }).click();
    await expect(importer).toBeHidden();

    await roundTrip(page, page.getByRole('region', { name: 'Recurring charges due' }).getByRole('button', { name: 'Review' }),
      page.getByRole('dialog', { name: 'Recurring charges due' }), 'recurring review');
    await roundTrip(page, page.getByRole('button', { name: 'Account and preferences' }),
      page.getByRole('dialog', { name: 'Account and preferences' }), 'profile menu');

    if (isPhone(testInfo.project.name)) {
      await roundTrip(page, page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More' }),
        page.getByRole('dialog', { name: 'More' }), 'More sheet');
    } else {
      const search = page.getByRole('combobox', { name: 'Search transactions' });
      await search.fill('co');
      const results = page.getByRole('listbox', { name: 'Matching transactions' });
      await expect(results).toBeVisible();
      expect(await axe(page), 'search results').toEqual([]);
      await page.keyboard.press('Escape');
      await expect(results).toBeHidden();
    }
  });
});

test('keyboard: Tab starts at the skip link, goes header → navigation → page, and every stop shows focus', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'A laptop walk-through; phones are checked with the dialogs above.');
  await prepare(page, testInfo, { signedIn: true });
  await page.goto('/app');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await settle(page);

  const ORDER = ['skip link', 'header', 'navigation', 'main'];
  const stops: { name: string; area: string }[] = [];
  for (let i = 0; i < 28; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate((n) => {
      const el = document.activeElement as HTMLElement;
      el.dataset.walk = String(n);
      const style = getComputedStyle(el);
      // What focus looks like, to compare with the same element unfocused.
      el.dataset.focusedLook = [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.backgroundColor, style.borderColor].join('|');
      const area = el.matches('a[href="#main-content"]') ? 'skip link'
        : el.closest('header') ? 'header'
        : el.closest('nav') ? 'navigation'
        : el.closest('main') ? 'main' : 'elsewhere';
      return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40), area };
    }, i));
  }

  expect(stops[0].area, 'first stop').toBe('skip link');
  // Never back to an earlier area: the order on screen is the order in the page.
  const areas = stops.map((s) => ORDER.indexOf(s.area));
  expect(areas.every((a) => a >= 0), `stops outside the expected areas: ${JSON.stringify(stops.filter((s) => !ORDER.includes(s.area)))}`).toBe(true);
  expect(areas.every((a, i) => i === 0 || a >= areas[i - 1]), `tab order: ${stops.map((s) => `${s.area}:${s.name}`).join(' → ')}`).toBe(true);
  expect(stops.some((s) => s.area === 'main'), 'reaches the page').toBe(true);

  // Every stop looked different when focused (an outline, a ring, a fill).
  const noFocusStyle = await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    return [...document.querySelectorAll<HTMLElement>('[data-walk]')]
      .filter((el) => {
        const style = getComputedStyle(el);
        const look = [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.backgroundColor, style.borderColor].join('|');
        return look === el.dataset.focusedLook;
      })
      .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40));
  });
  expect(noFocusStyle, 'stops with no visible focus style').toEqual([]);
});
