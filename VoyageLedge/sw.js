// Voyage Ledger Service Worker — Full Offline Support
const CACHE_NAME = 'voyage-ledger-v1';

const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// MESSAGE — allow page to trigger immediate activation
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// INSTALL — cache all core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can, don't fail on individual errors
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(e => console.warn('Cache miss:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ACTIVATE — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH — cache first for local assets, network first for external
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // For HTML navigation requests — cache first, revalidate in background
  if (event.request.mode === 'navigate' || url.endsWith('.html')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => null);
        return cached || networkFetch;
      })
    );
    return;
  }

  // For local app files — cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
