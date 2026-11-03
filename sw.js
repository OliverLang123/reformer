// Při každé změně souborů appky zvyš verzi, ať si telefon stáhne novou kopii.
const CACHE = 'reformer-v0.2.1';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'js/util.js',
  'js/store.js',
  'js/model.js',
  'js/workout.js',
  'vendor/htm-preact.module.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Soubory appky: nejdřív z mezipaměti, na pozadí se obnoví. Požadavky na skript (jiný původ) se nechávají být.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
      const fresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
