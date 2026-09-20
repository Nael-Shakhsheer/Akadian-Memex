// Memex service worker: caches the app shell so the app opens (and captures ideas) offline.
const CACHE = 'memex-v11';
// Cache prefix left over from the release this app was renamed from; listed only so the stale
// shell is evicted on upgrade. Remove once no client is still serving it.
const RETIRED_CACHE_PREFIX = 'ember-';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'storage.js', 'appearance.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => (k.startsWith('memex-') || k.startsWith(RETIRED_CACHE_PREFIX)) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs so updates show up immediately when online; the cached copy is
// used only when offline. API calls (cross-origin) go straight to the network.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });   // revalidate, don't trust the HTTP cache
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
      }
    })
  );
});
