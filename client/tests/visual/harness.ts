import fs from 'fs';
import { expect, type Page, type TestInfo } from '@playwright/test';

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
const allData = fixture<{ settings: Record<string, unknown> }>('data-all.json');
const session = fixture<{ email: string }>('session.json');

// What makes a screenshot repeatable (U7):
// - the API is answered from fixtures (the seeded demo account, ids and email
//   anonymised), so the data never changes and no server is needed;
// - the clock is frozen at the date the fixtures were taken, so "this month",
//   "13 days left" and "Coming up" stay put;
// - nothing leaves the machine except the web fonts, which are awaited.

/** The day the fixtures were captured: every date in them is relative to it. */
export const FROZEN_NOW = new Date('2026-11-18T10:00:00-08:00');

const API = 'http://localhost:3001/api';
const RATES = { base: 'USD', date: '2026-11-18', rates: { EUR: 0.92, GBP: 0.79, INR: 84.4, CAD: 1.4, AUD: 1.53, JPY: 154.2, CNY: 7.24, MXN: 20.1 } };

export async function prepare(page: Page, testInfo: TestInfo, { signedIn }: { signedIn: boolean }) {
  const theme = testInfo.project.use.colorScheme === 'light' ? 'light' : 'dark';
  await page.clock.setFixedTime(FROZEN_NOW);
  await page.addInitScript(({ theme, signedIn, email, now }) => {
    localStorage.setItem('appTheme', theme);
    if (signedIn) {
      localStorage.setItem('hasSession', 'true');
      localStorage.setItem('sessionEmail', email);
      localStorage.setItem('lastActivityAt', String(now));
    }
  }, { theme, signedIn, email: session.email, now: FROZEN_NOW.getTime() });

  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: RATES }));
  await page.route(`${API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    switch (path) {
      case '/auth/csrf': return route.fulfill({ json: { csrfToken: 'visual-tests' } });
      case '/auth/session': return signedIn ? route.fulfill({ json: session }) : route.fulfill({ status: 401, json: { message: 'Not signed in' } });
      case '/data/all': return route.fulfill({ json: allData });
      case '/settings': return route.fulfill({ json: { settings: allData.settings } });
      case '/push/status': return route.fulfill({ json: { push: false, email: false } });
      case '/households': return route.fulfill({ json: { households: [], invites: [] } });
      // Anything else (an audit log, a report email…) isn't on these screens.
      default: return route.fulfill({ json: {} });
    }
  });
}

/** Wait until the page has nothing left to load or draw. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // No loading skeletons left (SectionSkeleton is a busy region).
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}
