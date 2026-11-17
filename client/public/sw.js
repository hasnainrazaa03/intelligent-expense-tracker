// Bump CACHE_VERSION on any change to the caching strategy or shell asset list.
// (Content-hashed build assets rotate by URL, so a bump mainly clears stale
// HTML and orphaned chunks from previous deploys.)
const CACHE_VERSION = 'v3';
const CACHE_NAME = `usc-ledger-shell-${CACHE_VERSION}`;
const APP_SHELL = ['/', '/index.html', '/trojan1.png', '/trojan-logo.png'];

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

  // Navigation requests: network-first so a new deployment always reaches the
  // user. Fall back to the cached shell only when the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
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
