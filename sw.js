// Офлайн: всё приложение лежит в кэше и открывается без сети.
// После любой правки файлов подними VERSION — телефон скачает новую версию при следующем запуске.

const VERSION = 'gym-v4';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/nav.js',
  'js/ui.js',
  'js/util.js',
  'js/db.js',
  'js/store.js',
  'js/seed.js',
  'js/planner.js',
  'js/progression.js',
  'js/device.js',
  'js/screens/today.js',
  'js/screens/workout.js',
  'js/screens/stats.js',
  'js/screens/library.js',
  'js/screens/settings.js',
  'js/screens/measure.js',
  'js/screens/common.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
      req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
