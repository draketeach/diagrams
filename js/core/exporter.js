// SPDX-License-Identifier: CC0-1.0
// Export a rendered TikZJax SVG as SVG / PNG files or to the clipboard.
//
// TikZJax draws text with Computer Modern web fonts referenced from its
// fonts.css. An SVG loaded as an image (which is how we rasterise to PNG)
// cannot use the page's fonts, so we fetch the fonts that the SVG actually
// uses and embed them as base64 @font-face rules.

import { TIKZJAX } from '../config.js';

const fontCache = new Map(); // family -> css rule (or null if failed)
let fontRulesPromise = null;

async function loadFontRules() {
  if (!fontRulesPromise) {
    fontRulesPromise = fetch(TIKZJAX.fonts)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((css) => {
        const rules = new Map();
        for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
          const fam = m[1].match(/font-family\s*:\s*['"]?([^;'"]+)['"]?/);
          const url = m[1].match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
          if (fam && url) rules.set(fam[1].trim(), new URL(url[1], TIKZJAX.fonts).href);
        }
        return rules;
      })
      .catch((e) => {
        fontRulesPromise = null; // allow retry later
        throw e;
      });
  }
  return fontRulesPromise;
}

function usedFontFamilies(svg) {
  const families = new Set();
  for (const el of svg.querySelectorAll('*')) {
    const attr = el.getAttribute('font-family');
    if (attr) families.add(attr.trim());
    const style = el.getAttribute('style');
    const m = style && style.match(/font-family\s*:\s*([^;]+)/);
    if (m) families.add(m[1].trim().replace(/['"]/g, ''));
  }
  return [...families];
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Returns { css, failed[] } with base64-embedded @font-face rules. */
export async function embeddedFontCss(svg) {
  const families = usedFontFamilies(svg);
  const failed = [];
  let rules;
  try {
    rules = await loadFontRules();
  } catch (e) {
    return { css: '', failed: families };
  }
  const parts = [];
  for (const fam of families) {
    if (!fontCache.has(fam)) {
      const url = rules.get(fam);
      if (!url) {
        fontCache.set(fam, null);
      } else if (url.startsWith('data:')) {
        // already embedded in fonts.css (benrbray build)
        const fmt = /woff2/.test(url) ? 'woff2' : /woff/.test(url) ? 'woff' : 'truetype';
        fontCache.set(fam, `@font-face{font-family:${fam};src:url(${url}) format('${fmt}');}`);
      } else {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const b64 = arrayBufferToBase64(await res.arrayBuffer());
          const fmt = url.endsWith('.woff2') ? 'woff2' : url.endsWith('.woff') ? 'woff' : 'truetype';
          const mime = fmt === 'truetype' ? 'font/ttf' : `font/${fmt}`;
          fontCache.set(fam, `@font-face{font-family:${fam};src:url(data:${mime};base64,${b64}) format('${fmt}');}`);
        } catch (e) {
          fontCache.set(fam, null);
        }
      }
    }
    const rule = fontCache.get(fam);
    if (rule) parts.push(rule);
    else failed.push(fam);
  }
  return { css: parts.join('\n'), failed };
}

/** Size of the SVG in points (TikZJax sets width/height in pt). */
export function svgSizePt(svg) {
  const parse = (v) => {
    const m = String(v || '').match(/^([\d.]+)\s*(pt|px|cm|mm|in)?$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = m[2] || 'px';
    return { pt: n, px: n * 0.75, cm: (n * 72) / 2.54, mm: (n * 72) / 25.4, in: n * 72 }[unit];
  };
  let w = parse(svg.getAttribute('width'));
  let h = parse(svg.getAttribute('height'));
  if (!w || !h) {
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (vb.length === 4) [w, h] = [vb[2], vb[3]];
  }
  return { width: w || 100, height: h || 100 };
}

/**
 * Serialise to a standalone SVG string.
 * @param {object} opts { fontCss, widthPx, heightPx, background }
 */
export function serializeSvg(svg, { fontCss = '', width, height, background } = {}) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.removeAttribute('style');
  clone.setAttribute('overflow', 'visible');
  if (width) clone.setAttribute('width', width);
  if (height) clone.setAttribute('height', height);
  if (fontCss) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = fontCss;
    clone.insertBefore(style, clone.firstChild);
  }
  if (background) {
    const vb = (clone.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (vb.length === 4) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', vb[0]);
      rect.setAttribute('y', vb[1]);
      rect.setAttribute('width', vb[2]);
      rect.setAttribute('height', vb[3]);
      rect.setAttribute('fill', background);
      clone.insertBefore(rect, clone.firstChild);
    }
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export async function svgToSvgBlob(svg, { transparent = true } = {}) {
  const { css, failed } = await embeddedFontCss(svg);
  const { width, height } = svgSizePt(svg);
  const text = serializeSvg(svg, {
    fontCss: css,
    width: `${width}pt`,
    height: `${height}pt`,
    background: transparent ? null : '#ffffff',
  });
  return { blob: new Blob([text], { type: 'image/svg+xml' }), failedFonts: failed };
}

/** Rasterise to PNG. Returns { blob, failedFonts, widthPx, heightPx }. */
export async function svgToPngBlob(svg, { dpi = 300, transparent = false } = {}) {
  const { css, failed } = await embeddedFontCss(svg);
  const { width, height } = svgSizePt(svg);
  const scale = dpi / 72;
  const wPx = Math.max(1, Math.ceil(width * scale));
  const hPx = Math.max(1, Math.ceil(height * scale));
  const text = serializeSvg(svg, { fontCss: css, width: wPx, height: hPx });
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Could not load SVG for rasterising'));
      img.src = url;
    });
    // Give embedded fonts a moment to be applied in some browsers.
    await new Promise((r) => setTimeout(r, 50));
    const canvas = document.createElement('canvas');
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, wPx, hPx);
    }
    ctx.drawImage(img, 0, 0, wPx, hPx);
    const raw = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png')
    );
    const blob = await setPngDpi(raw, dpi);
    return { blob, failedFonts: failed, widthPx: wPx, heightPx: hPx };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- PNG pHYs chunk so Word/Docs insert the image at its true physical size

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function setPngDpi(blob, dpi) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Insert after IHDR (8-byte signature + 25-byte IHDR chunk).
  const at = 33;
  const out = new Uint8Array(data.length + chunk.length);
  out.set(data.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(data.subarray(at), at + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

// ---- Delivery helpers

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), filename);
}

/** Copy a PNG to the clipboard. Accepts a Blob or a Promise<Blob> (Safari needs the promise form). */
export async function copyPngToClipboard(blobOrPromise) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('This browser does not support copying images to the clipboard.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOrPromise })]);
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}
