// Při každé změně souborů appky zvyš verzi, ať si telefon stáhne novou kopii.
const CACHE = 'reformer-v0.6.0';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'js/util.js',
  'js/store.js',
  'js/model.js',
  'js/workout.js',
  'js/summary.js',
  'js/body-map.js',
  'js/strava.js',
  'js/media.js',
  'vendor/htm-preact.module.js',
  'vendor/html-to-image.js',
  // obrázek do Stravy: šablona a fonty (musí jít i offline)
  'design/workout-summary-ember/template/summary.html',
  'design/workout-summary-ember/fonts/fonts.css',
  ...['inter-tight-latin', 'inter-tight-latin-ext'].flatMap((f) => [400, 500, 600, 700].map((w) => `design/workout-summary-ember/fonts/${f}-${w}-normal.woff2`)),
  ...['jetbrains-mono-latin', 'jetbrains-mono-latin-ext'].flatMap((f) => [500, 700].map((w) => `design/workout-summary-ember/fonts/${f}-${w}-normal.woff2`)),
  ...['unbounded-latin', 'unbounded-latin-ext'].flatMap((f) => [600, 700].map((w) => `design/workout-summary-ember/fonts/${f}-${w}-normal.woff2`)),
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
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) return cached;
      // Bez signálu: stránka, která v mezipaměti není, dostane úvod appky
      const res = await fresh;
      return res || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    })
  );
});
