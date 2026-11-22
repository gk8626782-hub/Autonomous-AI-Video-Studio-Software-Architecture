/*
 * Service worker: keeps the app usable offline.
 * It only handles same-origin GET requests. Calls to AI providers and Google
 * are cross-origin, so they never pass through this cache.
 */
const VERSION = "v1";
const STATIC_CACHE = `avs-static-${VERSION}`;
const PAGE_CACHE = `avs-pages-${VERSION}`;
const KNOWN_CACHES = [STATIC_CACHE, PAGE_CACHE];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("avs-") && !KNOWN_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

/** Pages: always try the network, so updates show at once; fall back to the cache when offline. */
async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // The project page is one HTML file for every project id, so the query string is ignored.
    const cached =
      (await cache.match(request, { ignoreSearch: true })) || (await cache.match("/"));
    if (cached) {
      return cached;
    }
    throw error;
  }
}

/** Built files have content hashes in their names, so a cached copy never goes stale. */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

/** Everything else (icons, manifest): answer from the cache and refresh it in the background. */
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }

  const response = await refresh;
  return response || Response.error();
}
