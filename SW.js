// Stream X Service Worker v1.0
const CACHE_NAME = 'streamx-v1';
const STATIC_CACHE = 'streamx-static-v1';

// Files to cache for offline
const STATIC_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// ── INSTALL ──
self.addEventListener('install', event => {
  console.log('[SW] Installing Stream X SW...');
  // skipWaiting immediately — dont block on caching
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Cache files in background — non-blocking
        STATIC_FILES.forEach(url => {
          cache.add(new Request(url, {mode:'no-cors'})).catch(()=>{});
        });
      })
      .catch(err => console.log('[SW] Cache error:', err))
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH (Network first, fallback to cache) ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip Firebase, Cloudinary, Agora requests — always go online
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('agora') ||
    url.hostname.includes('gstatic') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // For HTML (app shell) — cache first, then network
  if (event.request.destination === 'document') {
    event.respondWith(
      caches.match('./index.html')
        .then(cached => {
          const networkFetch = fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
              }
              return response;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
    );
    return;
  }

  // For fonts, icons, CSS — cache first strategy
  if (
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('fonts.gstatic') ||
    url.hostname.includes('cdnjs.cloudflare') ||
    event.request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request, {mode:'no-cors'}).then(response => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Default: network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── PUSH NOTIFICATIONS (future ready) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'Stream X', {
    body: data.body || 'You have a new notification',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
