// Page-view counts with Vercel Web Analytics (5f-3). No cookies and no
// identifier: Vercel counts visitors with a hash of the request that it
// discards within a day. Vercel's own script is loaded from this site
// (/_vercel/insights/script.js), so the CSP needs nothing new.
//
// Only the page's path is sent. The script would send the whole address, and
// a query can hold an email (the Google two-factor redirect is
// /login?twofactor=1&email=…).
//
// Off unless this is the production site, the browser doesn't ask sites not to
// track (Global Privacy Control or Do Not Track), and the user hasn't turned it
// off in Settings (this device only).

declare global {
  interface Window {
    va?: (event: string, payload?: unknown) => void;
    vaq?: unknown[][];
  }
}

/**
 * Where Orbit is served in production; previews and local builds send nothing.
 * The old vercel.app address stays counted while people move to the domain.
 */
export const ANALYTICS_HOSTS: readonly string[] = ['www.orbitexpense.me', 'orbitexpense.me', 'orbit-expense-tracker.vercel.app'];
const OPT_OUT_KEY = 'analyticsOptOut';
const SCRIPT_SRC = '/_vercel/insights/script.js';
// The choice made in this tab, which wins even when storage is blocked.
let optOutThisTab: boolean | null = null;

export const analyticsOptedOut = (): boolean => {
  if (optOutThisTab !== null) return optOutThisTab;
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
};

/** Global Privacy Control or Do Not Track. */
export const browserAsksNotToTrack = (nav: Navigator = navigator): boolean =>
  (nav as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || nav.doNotTrack === '1';

/** The address without its query or fragment, or null when it can't be parsed. */
export const pathOnly = (url: string): string | null => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
};

export const analyticsAllowed = (host: string = location.hostname): boolean =>
  ANALYTICS_HOSTS.includes(host) && !browserAsksNotToTrack() && !analyticsOptedOut();

/** Loads Vercel's script once, if allowed. Safe to call again (Settings does). */
export const startAnalytics = (host: string = location.hostname): void => {
  if (!analyticsAllowed(host) || document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
  // The queue Vercel's script reads when it loads.
  window.va = window.va || ((...args: unknown[]) => { (window.vaq = window.vaq || []).push(args); });
  window.va('beforeSend', (event: { url: string }) => {
    // Turning it off in Settings stops sending at once, without a reload.
    if (analyticsOptedOut()) return null;
    const url = pathOnly(event.url);
    return url ? { ...event, url } : null;
  });
  const script = document.createElement('script');
  script.defer = true;
  script.src = SCRIPT_SRC;
  document.head.appendChild(script);
};

export const setAnalyticsOptOut = (optOut: boolean): void => {
  optOutThisTab = optOut;
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* storage blocked: the choice holds for this tab only */
  }
  if (!optOut) startAnalytics();
};
