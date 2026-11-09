/* Palabra a Palabra — service worker
   Makes the app work offline after the first visit.
   - App shell (the HTML page): cached on install, served cache-first, refreshed in the background.
   - Google Fonts (Fraunces / Work Sans): cached the first time they load, then served from cache.
   Bump CACHE_VERSION whenever you publish a new version of the app so users get the update. */
const CACHE_VERSION = 'palabra-a-palabra-v1';
const FONT_CACHE = 'palabra-a-palabra-fonts-v1';

// Pages to pre-cache. Both spellings are listed so it works whether the file is served
// as index.html (./) or under its own name. Missing entries are skipped, not fatal.
const APP_SHELL = ['./', './palabra-a-palabra.html', './index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION && k !== FONT_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: stylesheet + font files. Cache on first load, reuse afterwards.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(hit => {
          const fetched = fetch(req).then(res => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || fetched;
        })
      )
    );
    return;
  }

  // Everything else on this site (the page itself): cache-first, update in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(req, { ignoreSearch: true }).then(hit => {
          const fetched = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => null);
          if (hit) return hit;
          return fetched.then(res => {
            if (res) return res;
            // Offline and not cached: fall back to the app page for navigations.
            if (req.mode === 'navigate') {
              return cache.match('./palabra-a-palabra.html')
                .then(r => r || cache.match('./'))
                .then(r => r || cache.match('./index.html'));
            }
            return Response.error();
          });
        })
      )
    );
  }
});
