// Bump CACHE_VERSION on any change to the caching strategy or shell asset list.
// (Content-hashed build assets rotate by URL, so a bump mainly clears stale
// HTML and orphaned chunks from previous deploys.)
const CACHE_VERSION = 'v6';
const CACHE_NAME = `usc-ledger-shell-${CACHE_VERSION}`;
const APP_SHELL = ['/', '/index.html', '/orbit-icon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only manage same-origin GETs; let cross-origin requests (FX rates, fonts,
  // CDNs) go straight to the network untouched.
  if (url.origin !== self.location.origin) return;
  // The API is same-origin when served through the site's /api rewrite. Never
  // cache it: account data would be served stale and kept in Cache Storage
  // across users, and the Google sign-in redirect (a navigation) would be
  // stored as the app shell.
  if (url.pathname.startsWith('/api/')) return;
  // Vercel Web Analytics (its script and page-view requests): always the network.
  if (url.pathname.startsWith('/_vercel/')) return;

  // Navigation requests: network-first so a new deployment always reaches the
  // user. Fall back to the cached shell only when the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a real page becomes the offline shell. Storing any response
          // here meant a 404/500 error page (or a redirect) could be what the
          // app showed next time the user was offline.
          const isHtml = (response.headers.get('content-type') || '').includes('text/html');
          if (response.ok && response.type === 'basic' && isHtml) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static assets (content-hashed JS/CSS/images): serve cached immediately when
  // present and refresh in the background; otherwise fetch from network. Never
  // substitute the HTML shell for a failed asset/JSON request — let it reject so
  // the caller can handle the failure.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          // Never store HTML under an asset URL: a missing old chunk gets the
          // SPA's index.html (200) from the host's catch-all rewrite.
          const isHtml = (response && response.headers.get('content-type') || '').includes('text/html');
          if (response && response.status === 200 && response.type === 'basic' && !isHtml) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => undefined);

      return cached || network.then((response) => response || Response.error());
    })
  );
});

// Push notifications (5e-2): budget alerts, bill reminders and the monthly
// summary, sent by the server's hourly job. The payload is
// { title, body, url, tag }; a newer one with the same tag replaces the older.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Orbit';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { url: data.url || '/app' },
    })
  );
});

// Tapping a notification focuses an open Orbit tab, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/app', self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === url.origin);
      if (open) return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url.href) : w)).catch(() => open);
      return self.clients.openWindow(url.href);
    })
  );
});
