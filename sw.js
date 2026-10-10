// MathMatrix Pro++ Service Worker — full offline support
// Bump CACHE_VERSION whenever you update the game HTML so kids get the new version.
const CACHE_VERSION = 'mathmatrix-v157';

const ASSETS = [
  './',
  './index.html',
  './criss-cross.html',
  './MultiplyMagic3.html',
  './sound-lab.html',
  './bgm-monkeys.mp3',
  './manifest.json',
  './cheat-3x3.png',
  './cheat-4x4.png',
  './cheat-5x5.png',
  './cheat-6x6.png',
  './cheat-8x8.png',
  './cheat-10x10.png',
  './cheat-3cube.png',
  './cheat-ramanujan.jpg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Install: cache everything the game needs
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// • Pages (HTML / navigations): NETWORK-FIRST — always load the newest version
//   when online, so a deploy shows on a single refresh (no double-refresh).
//   A 2.5s timeout falls back to the cached page if the network stalls
//   instead of hanging indefinitely on a slow/flaky connection — proven in
//   the beta build first.
// • Everything else (images, icons, manifest): CACHE-FIRST for instant, offline
//   loads, with a quiet background refresh.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isPage =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    /\.html(\?|$)/.test(req.url);

  if (isPage) {
    event.respondWith(
      (async () => {
        const cached = await caches
          .match(req)
          .then((c) => c || caches.match('./index.html'));

        const controller =
          typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;
        const timer = setTimeout(() => {
          try {
            if (controller) controller.abort();
          } catch (e) {}
        }, 2500);

        try {
          const response = await fetch(
            req,
            controller ? { signal: controller.signal } : undefined
          );
          clearTimeout(timer);
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return response;
        } catch (e) {
          clearTimeout(timer);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => cached); // offline: whatever we have
      return cached || networkFetch;
    })
  );
});
