// SPDX-License-Identifier: CC0-1.0
// Service worker for the TikZ Diagrams site.
//
// - TikZJax files (vendor/tikzjax/) never change for a given version, so
//   they are served from a cache after the first download ("cache first").
//   That is ~15 MB the browser only downloads once per computer.
// - Everything else (the site's own HTML/JS/CSS) is fetched fresh from the
//   server on every visit, falling back to the cached copy when offline
//   ("network first"). This also means updates show up without Ctrl+F5.
//
// If the TikZJax files are ever replaced, change ENGINE_CACHE (and the same
// name in js/config.js) so browsers download the new copy.

const ENGINE_CACHE = 'tikzjax-engine-v3';
const SITE_CACHE = 'site-v1';
const KEEP = [ENGINE_CACHE, SITE_CACHE];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (KEEP.includes(key)) continue;
        // Files named by their hash (and the fonts) never change: carry them
        // over from an older engine cache instead of re-downloading.
        if (key.startsWith('tikzjax-engine-')) {
          const old = await caches.open(key);
          const next = await caches.open(ENGINE_CACHE);
          for (const req of await old.keys()) {
            const path = new URL(req.url).pathname;
            const immutable = /\.(wasm|gz|ttf)$/.test(path) || /-[0-9a-f]{10}\.js$/.test(path);
            if (immutable && !(await next.match(req))) {
              const res = await old.match(req);
              if (res) await next.put(req, res);
            }
          }
        }
        await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vendor/tikzjax/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(ENGINE_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SITE_CACHE);
  try {
    // "no-cache" revalidates with the server instead of trusting the
    // browser's 10-minute HTTP cache, so new versions appear immediately.
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}
