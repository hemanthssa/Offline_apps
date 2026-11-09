// Expense Tracker Service Worker — Full Offline Support
// Bump CACHE_NAME whenever you want every device to drop its old cached files.
const CACHE_NAME = 'expense-tracker-v1';

const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
  ...FIREBASE_SDK
];

// MESSAGE — allow page to trigger immediate activation
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// INSTALL — cache all core assets (never fail on individual errors)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(e => console.warn('Cache miss:', url, e)))
      )
    ).then(() => self.skipWaiting())
  );
});

// ACTIVATE — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Cache first; fetch + store when missing (used for fonts and the Firebase SDK files)
function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response && (response.status === 200 || response.type === 'opaque')) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
      }
      return response;
    });
  });
}

// FETCH
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = request.url;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Google Fonts — cache first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request).catch(() => caches.match(request)));
    return;
  }

  // Firebase SDK scripts — cache first so the app starts offline
  if (url.includes('www.gstatic.com/firebasejs/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Google Sign-In / Firebase Auth / Firestore traffic always goes to the network
  if (
    url.includes('accounts.google.com') ||
    url.includes('googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('firebaseapp.com') ||
    url.includes('firestore.googleapis.com')
  ) {
    return;
  }

  // HTML navigation — cache first, revalidate in the background
  if (request.mode === 'navigate' || url.endsWith('.html')) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => null);
        return cached || networkFetch.then(res => res || caches.match('./index.html'));
      })
    );
    return;
  }

  // Other local app files — cache first, fall back to network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
