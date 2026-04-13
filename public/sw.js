const CACHE_NAME = 'ruta-motera-v4';
const TILE_CACHE = 'map-tiles-v2';
const CORE_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const allowlist = new Set([CACHE_NAME, TILE_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !allowlist.has(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  const isTileRequest =
    requestUrl.hostname.includes('basemaps.cartocdn.com') ||
    requestUrl.hostname.includes('tile.openstreetmap.org');

  // For app routes, prefer network then fallback to cached shell.
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', cloned));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache map tiles (cross-origin) so zoom/movement stays smooth and survives short offline periods.
  if (isTileRequest) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          fetch(event.request)
            .then((res) => {
              if (res && res.ok) cache.put(event.request, res.clone());
            })
            .catch(() => {});
          return cached;
        }

        const response = await fetch(event.request);
        if (response) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  // Cache-first for same-origin static assets (except manifest to avoid stale installability metadata).
  if (isSameOrigin && (requestUrl.pathname.startsWith('/assets/') || requestUrl.pathname.endsWith('.png')) && !requestUrl.pathname.endsWith('manifest.json') && !requestUrl.pathname.endsWith('manifest.webmanifest')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        });
      })
    );
  }
});
