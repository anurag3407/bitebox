/* BiteBox service worker.
 *
 * Caching rules (deliberately conservative for a payments app):
 *  - /_next/static/*            cache-first (content-hashed, immutable)
 *  - images                     stale-while-revalidate, bounded
 *  - public catalog GET APIs    network-first, cached copy when offline
 *  - page navigations           network-first, cached page or /offline when offline
 *  - anything authenticated, any non-GET, checkout/payment/order APIs: never cached
 */
const VERSION = "v3";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const IMAGE_CACHE = `images-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/badge-96.png", "/manifest.webmanifest"];
const MAX_IMAGES = 80;
const MAX_API = 40;
const PUBLIC_API = [/^\/api\/v1\/restaurants(\/[^/]+)?$/, /^\/api\/v1\/config$/, /^\/api\/v1\/coupons$/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE, IMAGE_CACHE, API_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC_CACHE)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") {
        cache.put(request, response.clone());
        trim(IMAGE_CACHE, MAX_IMAGES);
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      trim(cacheName, max);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Personal data must never be served from a shared cache
  if (request.headers.has("authorization")) return;
  if (request.headers.get("accept")?.includes("text/event-stream")) return;

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    if (PUBLIC_API.some((re) => re.test(url.pathname))) {
      event.respondWith(networkFirst(request, API_CACHE, MAX_API));
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, PAGE_CACHE, 30).catch(async () => (await caches.match("/offline")) || Response.error())
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "BiteBox", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "BiteBox";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      requireInteraction: Boolean(payload.requireInteraction),
      vibrate: payload.requireInteraction ? [200, 100, 200, 100, 400] : [120],
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      for (const client of windows) {
        if ("navigate" in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
