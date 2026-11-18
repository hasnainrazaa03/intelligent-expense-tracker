import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal browser globals: the module only touches these.
const store: Record<string, string> = {};
let appended: { src: string; defer: boolean }[] = [];

beforeEach(() => {
  vi.resetModules(); // the module remembers this tab's choice
  for (const k of Object.keys(store)) delete store[k];
  appended = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  g.window = globalThis;
  delete g.va;
  delete g.vaq;
  g.document = {
    querySelector: (selector: string) => appended.find((s) => selector.includes(s.src)) ?? null,
    createElement: () => ({ src: '', defer: false }),
    head: { appendChild: (el: { src: string; defer: boolean }) => appended.push(el) },
  };
});

const load = () => import('./analytics');
const PROD = 'www.orbitexpense.me';
/** The beforeSend hook queued for Vercel's script. */
const beforeSend = () => {
  const queued = (globalThis as unknown as { vaq: unknown[][] }).vaq.find((args) => args[0] === 'beforeSend');
  return queued?.[1] as (event: { type: string; url: string }) => { url: string } | null;
};

describe('analytics', () => {
  it('sends only the path: never a query (an email) or a fragment', async () => {
    const { pathOnly } = await load();
    expect(pathOnly(`https://${PROD}/login?twofactor=1&email=a%40b.c#top`)).toBe(`https://${PROD}/login`);
    expect(pathOnly('not a url')).toBeNull();
  });

  it('honours Global Privacy Control and Do Not Track', async () => {
    const { browserAsksNotToTrack } = await load();
    expect(browserAsksNotToTrack({ globalPrivacyControl: true } as unknown as Navigator)).toBe(true);
    expect(browserAsksNotToTrack({ doNotTrack: '1' } as unknown as Navigator)).toBe(true);
    expect(browserAsksNotToTrack({ doNotTrack: 'unspecified' } as unknown as Navigator)).toBe(false);
  });

  it('loads nothing outside the production site', async () => {
    const { startAnalytics } = await load();
    startAnalytics('localhost');
    startAnalytics('orbit-expense-tracker-git-branch.vercel.app');
    expect(appended).toEqual([]);
  });

  it('counts the old vercel.app address too, while people move to the domain', async () => {
    const { analyticsAllowed } = await load();
    expect(analyticsAllowed('www.orbitexpense.me')).toBe(true);
    expect(analyticsAllowed('orbitexpense.me')).toBe(true);
    expect(analyticsAllowed('orbit-expense-tracker.vercel.app')).toBe(true);
    expect(analyticsAllowed('orbit-expense-tracker-git-branch.vercel.app')).toBe(false);
  });

  it("loads Vercel's script once on the production site, with the query stripped", async () => {
    const { startAnalytics } = await load();
    startAnalytics(PROD);
    startAnalytics(PROD);
    expect(appended).toEqual([{ src: '/_vercel/insights/script.js', defer: true }]);
    expect(beforeSend()({ type: 'pageview', url: `https://${PROD}/verify?email=a%40b.c` })).toEqual({ type: 'pageview', url: `https://${PROD}/verify` });
  });

  it('turning it off stops sending at once and is remembered on this device', async () => {
    const { startAnalytics, setAnalyticsOptOut, analyticsOptedOut } = await load();
    startAnalytics(PROD);
    setAnalyticsOptOut(true);
    expect(beforeSend()({ type: 'pageview', url: `https://${PROD}/app` })).toBeNull();
    expect(store.analyticsOptOut).toBe('1');

    vi.resetModules();
    appended = [];
    const fresh = await load();
    expect(fresh.analyticsOptedOut()).toBe(true);
    fresh.startAnalytics(PROD);
    expect(appended).toEqual([]);
    expect(analyticsOptedOut()).toBe(true);
  });

  it('still respects turning it off when storage is blocked', async () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const { startAnalytics, setAnalyticsOptOut } = await load();
    startAnalytics(PROD);
    setAnalyticsOptOut(true);
    expect(beforeSend()({ type: 'pageview', url: `https://${PROD}/app` })).toBeNull();
  });
});
