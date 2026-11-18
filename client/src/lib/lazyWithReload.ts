import React, { lazy } from 'react';

// A dynamic-import ("chunk load") failure almost always means this browser is
// holding a stale index.html from before a new deploy — it points at hashed
// chunk filenames the server no longer serves, so the request falls back to
// index.html (text/html) and the module fails its MIME check. Force ONE reload
// to pick up the fresh index + chunks; a sessionStorage guard prevents an
// infinite reload loop if the failure is something else. On success we clear the
// guard so a future deploy can reload again.
//
// Offline is different (C15): a reload can't fetch anything new, it only throws
// away the screen the user is on, and the tab still fails afterwards. So while
// offline, wait for the connection (the Suspense skeleton stays up) and retry.
const waitUntilOnline = () =>
  new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true }));

export const lazyWithReload = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  Object.assign(
    lazy(async () => {
      const RELOAD_KEY = 'orbit:chunk-reloaded';
      try {
        const mod = await factory();
        sessionStorage.removeItem(RELOAD_KEY);
        return mod;
      } catch (err) {
        if (!navigator.onLine) {
          await waitUntilOnline();
          try { return await factory(); } catch { /* fall through to the one-time reload */ }
        }
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          window.location.reload();
          return await new Promise<{ default: T }>(() => {}); // hold until reload
        }
        throw err;
      }
    }),
    // Fetch the chunk ahead of time (the service worker caches it) so the
    // screen also opens offline. Failures are ignored; the lazy load retries.
    { preload: () => { factory().catch(() => undefined); } },
  );

export default lazyWithReload;
