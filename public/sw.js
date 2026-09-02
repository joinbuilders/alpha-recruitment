/**
 * Offline shell for the recruitment site.
 *
 * The QR code gets scanned on congested venue Wi-Fi, so the page itself has to
 * survive a dead network: after one successful visit, a reload works with no
 * connection at all. Applicants' answers are handled separately by the outbox
 * (see lib/outbox.ts) — nothing here touches /api.
 *
 * Bump VERSION when the precached assets below change; it drops every old
 * cache on activate. Hashed /_next/static files are content-addressed and need
 * no bump. Navigations are network-first, so a stale shell self-heals as soon
 * as the device has signal.
 */

const VERSION = "bld-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// Everything the first screens need. The film is deliberately absent — see below.
const PRECACHE = ["/", "/night-sky.png", "/rooftop.jpg", "/builders-logo.svg", "/icon.svg"];

/** How long a navigation waits for the network before falling back to cache. */
const NAV_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 can't fail the whole install the way addAll would.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch {
            // Precache is best-effort; runtime caching picks these up later.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/* ---------- strategies ---------- */

// Only ever stores a real 200. cache.put rejects on partial and opaque
// responses, so it is always guarded — an unhandled rejection here would kill
// the fetch handler for the whole page.
function store(cache, request, res) {
  if (!res.ok) return;
  cache.put(request, res.clone()).catch(() => {});
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  store(cache, request, res);
  return res;
}

// A <link rel=stylesheet> is a no-cors request, and a no-cors response is
// opaque: status 0, indistinguishable from a 404, so it can't be cached
// safely. use.typekit.net sends `access-control-allow-origin: *`, so a
// cross-origin no-cors request is re-issued as CORS to get a status we can
// actually trust. Font files under that host are already CORS requests.
function refetch(request) {
  return request.mode === "no-cors" && new URL(request.url).origin !== self.location.origin
    ? fetch(request.url, { mode: "cors", credentials: "omit" })
    : fetch(request);
}

// Cached copy immediately, fresh copy into the cache for next time. waitUntil
// keeps the worker alive for that background write — without it the browser is
// free to shut us down the moment we return the cached response, and the entry
// never updates.
async function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);

  const fetching = refetch(request)
    .then((res) => {
      store(cache, request, res);
      return res;
    })
    .catch(() => null);

  if (hit) {
    event.waitUntil(fetching);
    return hit;
  }
  // A CORS retry can be refused where the browser's own no-cors request would
  // have succeeded, so that request is still worth making before giving up.
  return (await fetching) || fetch(request);
}

// Fresh HTML whenever the network can produce it quickly, the cached shell
// whenever it can't. The timeout is what keeps a half-connected phone — the
// one that's associated to the AP but getting no traffic through — from
// staring at a white screen.
//
// The timeout only ever applies when there is a shell to fall back to. A
// first-time visitor on a slow-but-working connection waits for the network
// exactly as they would without a worker; cutting them off at 3.5s with
// nothing cached would turn "slow" into "broken".
async function navigate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request).then((res) => {
    // Always keyed as "/" — this is a one-page site, and a visit to
    // /?reset=1 should still refresh the shell every other visit falls back to.
    store(cache, "/", res);
    return res;
  });

  const cached = (await cache.match(request)) || (await cache.match("/"));
  if (!cached) return network;

  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  return (await Promise.race([network.catch(() => null), timeout])) || cached;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The claim and hand-out must never be answered from a cache, and must never
  // be retried by anything other than the outbox.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // The film is 25 MB and streams over range requests, which the Cache API
  // can't store (a 206 is not a cacheable response). Left entirely to the
  // browser; when it can't load, the app skips straight to the application.
  if (url.pathname === "/film.mp4") return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  if (url.origin === self.location.origin) {
    // Hashed build output — the URL changes when the content does.
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(cacheFirst(request, ASSET_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(event, ASSET_CACHE));
    return;
  }

  // The Typekit stylesheet and font files carrying the serif headline face.
  // Typekit itself allows only 10 minutes of browser caching, so without this
  // every visit blocks first paint on a third-party round trip.
  if (url.hostname.endsWith("typekit.net")) {
    event.respondWith(staleWhileRevalidate(event, ASSET_CACHE));
  }
});
