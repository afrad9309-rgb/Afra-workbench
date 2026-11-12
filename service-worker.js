// Service Worker - 离线缓存
const CACHE = 'dinghui-workbench-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/fonts.css',
  './css/main.css',
  './css/animations.css',
  './js/db.js',
  './js/sync.js',
  './js/app.js',
  './js/components/header.js',
  './js/components/sidebar.js',
  './js/modules/todo.js',
  './js/modules/notes.js',
  './js/modules/expense.js',
  './js/modules/ideas.js',
  './js/modules/life-account.js',
  './js/modules/lock.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
