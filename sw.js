/* Only the offline notice is cached. Prices, customer data and API calls stay online. */
const OFFLINE_CACHE = 'nudema-offline-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html', '/assets/pwa/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nudema-offline-') && key !== OFFLINE_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin) return;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return; }
  if (/^\/(api(?:\/|$)|admin(?:\/|$)|login(?:\/|$)|signup(?:\/|$)|account(?:\/|$))|Nudema.*(?:Admin|Login|Signup|Account)\.dc/i.test(pathname)) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || new Response('Сүлжээ тасарсан байна.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
