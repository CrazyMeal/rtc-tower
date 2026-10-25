// Network first for this site's own files, with a cached copy as the offline fallback. RTC answers (another origin) are never touched.
const CACHE = 'rtc-tower-shell';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) { const cache = await caches.open(CACHE); cache.put(request, response.clone()); }
      return response;
    } catch (error) {
      const cached = await caches.match(request, {ignoreSearch: false});
      if (cached) return cached;
      throw error;
    }
  })());
});
