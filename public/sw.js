const CACHE_NAME = "momentum-journal-v2";

// Both variants are listed because the server build serves "/lite" while the
// static export (trailingSlash) serves "/lite/".
const APP_SHELL = [
  "/",
  "/lite",
  "/lite/",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individual puts so one missing path cannot fail the whole install.
      Promise.all(
        APP_SHELL.map((path) =>
          cache.add(path).catch(() => {
            /* variant not present in this build */
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Cache lookup that tolerates trailing-slash and query-string differences. */
async function matchCached(request) {
  const cache = await caches.open(CACHE_NAME);

  const direct = await cache.match(request, { ignoreSearch: true });
  if (direct) {
    return direct;
  }

  const url = new URL(request.url);
  const alternates =
    url.pathname.endsWith("/") && url.pathname !== "/"
      ? [url.pathname.slice(0, -1)]
      : [`${url.pathname}/`];

  for (const path of alternates) {
    const hit = await cache.match(path, { ignoreSearch: true });
    if (hit) {
      return hit;
    }
  }

  return null;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await matchCached(request);
      if (cached) {
        return cached;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone()).catch(() => {
            /* opaque or uncacheable response */
          });
        }
        return networkResponse;
      } catch (error) {
        // Offline: serve the cached app shell for page navigations so the app
        // still opens instead of showing a browser error page.
        if (request.mode === "navigate") {
          const cache = await caches.open(CACHE_NAME);
          const fallback =
            (await cache.match("/lite/")) ??
            (await cache.match("/lite")) ??
            (await cache.match("/"));
          if (fallback) {
            return fallback;
          }
        }
        throw error;
      }
    })(),
  );
});
