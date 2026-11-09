// SPDX-License-Identifier: CC0-1.0
// Downloads the large TikZJax files (TeX engine + memory dump) up front,
// with progress, and stores them in the cache that the service worker
// (sw.js) serves them from. Later renders, and later visits, use the
// cached copies, so the ~10 MB download only happens once per computer.
//
// If anything here fails, rendering still works: TikZJax then simply
// downloads the files itself.

import { TIKZJAX } from '../config.js';

let ready = null; // Promise once loaded (or loading)

/** Register the service worker (safe to call more than once). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const url = new URL('../../sw.js', import.meta.url);
  navigator.serviceWorker.register(url, { scope: new URL('../../', import.meta.url).pathname }).catch(() => {});
}

async function cachedOrNull(url) {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(TIKZJAX.engineCache);
    return await cache.match(url, { ignoreSearch: true });
  } catch (e) {
    return null;
  }
}

async function download(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const reader = res.body.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.length);
  }
  const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'application/octet-stream' });
  try {
    const cache = await caches.open(TIKZJAX.engineCache);
    await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }));
  } catch (e) {
    /* no Cache Storage (e.g. private mode): the browser's HTTP cache still helps */
  }
}

/**
 * Make sure the TikZJax engine files are downloaded.
 * @param {(p: { loaded: number, total: number }) => void} onProgress
 * @returns {Promise<boolean>} true if a download happened (first time)
 */
export function ensureTikzJax(onProgress = () => {}) {
  if (!ready) {
    ready = (async () => {
      const assets = TIKZJAX.engineFiles;
      const missing = [];
      for (const a of assets) if (!(await cachedOrNull(a.url))) missing.push(a);
      if (!missing.length) return false;
      const total = missing.reduce((s, a) => s + a.bytes, 0);
      let loaded = 0;
      onProgress({ loaded, total });
      await Promise.all(
        missing.map((a) =>
          download(a.url, (n) => {
            loaded += n;
            onProgress({ loaded: Math.min(loaded, total), total });
          })
        )
      );
      return true;
    })().catch((e) => {
      ready = null; // try again next time; rendering continues without it
      console.warn('TikZJax preload failed:', e);
      return false;
    });
  }
  return ready;
}
