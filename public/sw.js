const CACHE_NAME = 'ruta-motera-v4';
/** Mismo nombre que MAP_TILE_CACHE_NAME en src/lib/mapTileCache.ts */
const TILE_CACHE = 'map-tiles-v3';
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
    requestUrl.hostname.endsWith('.cartocdn.com') ||
    requestUrl.hostname.includes('tile.openstreetmap.org') ||
    requestUrl.hostname.includes('tilecache.rainviewer.com');

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
        if (response && response.ok) cache.put(event.request, response.clone());
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

// Firebase Cloud Messaging (notificaciones con la app en segundo plano o cerrada en navegadores compatibles).
try {
  importScripts(
    'https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js'
  );
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp({
      apiKey: 'AIzaSyBhUECw8bsPJV-dXcKwYrcZv52vmZMjUSE',
      authDomain: 'motoapp-3e6c6.firebaseapp.com',
      projectId: 'motoapp-3e6c6',
      storageBucket: 'motoapp-3e6c6.firebasestorage.app',
      messagingSenderId: '769937663281',
      appId: '1:769937663281:web:37c5c4f97b08dd7400fc10',
    });
  }
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title =
      (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'MotoRide';
    const body =
      (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || '';
    const url =
      (payload.fcmOptions && payload.fcmOptions.link) ||
      (payload.data && payload.data.url) ||
      self.location.origin + '/';
    return self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
      tag: (payload.data && payload.data.tag) || 'motoride',
    });
  });
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url =
      (event.notification && event.notification.data && event.notification.data.url) || self.location.origin + '/';
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const c of clientList) {
          if (c.url && 'focus' in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
    );
  });
} catch (e) {
  console.warn('[sw] FCM init skipped:', e);
}
