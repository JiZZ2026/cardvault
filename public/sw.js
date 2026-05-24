const CACHE = "cardvault-v2";

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.includes("/api/")) return;

  const isDocument = e.request.mode === "navigate" || e.request.destination === "document";

  // 带 hash 的静态资源不可变 → 缓存优先
  if (!isDocument && e.request.url.includes("/_next/static/")) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(response => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // 页面文档及其它资源 → 网络优先，离线时回退缓存
  // 这样每次部署都能立即拿到最新 HTML（指向最新 JS bundle），不再被旧缓存卡住
  e.respondWith(
    fetch(e.request).then(response => {
      if (response.ok && response.type === "basic") {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match("/")))
  );
});
