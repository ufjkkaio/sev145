const CACHE_NAME = 'shelf-cleaning-simple-v42';
const OFFLINE_ONLY = [
  '../icons/icon-192.png',
  '../icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ONLY)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// HTML/JS/CSS は常にネットワーク優先（古いキャッシュを返さない）
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request)),
  );
});
