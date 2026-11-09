// SPDX-License-Identifier: CC0-1.0
// Renders TikZ code to an inline <svg> using TikZJax.
//
// Each render runs inside a fresh hidden iframe. TikZJax only processes
// <script type="text/tikz"> tags once, on page load, so a new iframe per
// render is the most reliable way to re-render. The resulting SVG is
// copied into the main document.

import { TIKZJAX } from '../config.js';
import { toTikzJaxSource } from './tikzDocument.js';

let active = null; // { iframe, reject, timer }

function cleanup(job) {
  if (!job) return;
  clearInterval(job.poll);
  clearTimeout(job.timer);
  job.iframe.remove();
  if (active === job) active = null;
}

/** Cancel any render in progress. */
export function cancelRender() {
  if (active) {
    const job = active;
    cleanup(job);
    job.reject(Object.assign(new Error('Render cancelled'), { cancelled: true }));
  }
}

// Errors that mean TikZJax itself didn't load (missing/blocked files),
// as opposed to TeX failing on the code. Only these try the next source.
const LOAD_FAILURE = /TIKZJAX_LOAD_FAILED|Failed to fetch|NetworkError|Load failed|CompileError|magic word|incorrect header|invalid stored block|unknown compression/i;

/**
 * @param {string} code  code from the code box
 * @returns {Promise<{ svg: SVGSVGElement, warnings: string[], ms: number, source: string }>}
 */
export async function renderTikz(code, options = {}) {
  cancelRender();
  const cfg = { ...TIKZJAX, ...options };
  const started = performance.now();
  const notes = [];
  let warnings = [];
  for (let i = 0; i < cfg.sources.length; i++) {
    const src = cfg.sources[i];
    const prepared = toTikzJaxSource(code, { supportsLibraries: src.supportsLibraries, glyphFixes: src.glyphFixes, preamble: src.preamble });
    warnings = prepared.warnings;
    try {
      const svg = await renderWith(prepared.source, src, cfg.timeoutMs);
      return {
        svg,
        warnings: [...warnings, ...notes],
        ms: Math.round(performance.now() - started),
        source: src.name,
      };
    } catch (e) {
      const last = i === cfg.sources.length - 1;
      if (e.cancelled || !e.loadFailure || last) throw e;
      notes.push(`TikZJax couldn't load from ${src.name} (${e.detail}), so ${cfg.sources[i + 1].name} was used.`);
    }
  }
}

function renderWith(source, src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      'position:absolute;left:-10000px;top:0;width:800px;height:600px;border:0;visibility:hidden;';

    const safe = source.replace(/<\/script/gi, '<\\/script');
    iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${src.fonts}">
<script>window.__tikzErrors=[];
addEventListener('error',function(e){__tikzErrors.push(String(e.message||e));});
addEventListener('unhandledrejection',function(e){var r=e.reason;__tikzErrors.push(String(r&&r.message||r));});<\/script>
</head><body><div id="tikz"><script type="text/tikz">${safe}<\/script></div>
<script src="${src.script}" onerror="__tikzErrors.push('TIKZJAX_LOAD_FAILED')"><\/script></body></html>`;

    const job = { iframe, reject };
    active = job;

    job.poll = setInterval(() => {
      let doc, win;
      try {
        doc = iframe.contentDocument;
        win = iframe.contentWindow;
      } catch (e) {
        return;
      }
      if (!doc || !win) return;
      const errors = win.__tikzErrors || [];
      if (errors.length) {
        cleanup(job);
        const msg = errors.join('; ');
        if (LOAD_FAILURE.test(msg)) {
          const err = new Error(`TikZJax could not be loaded (${msg}).`);
          err.loadFailure = true;
          err.detail = msg.replace('TIKZJAX_LOAD_FAILED', 'script not found');
          reject(err);
          return;
        }
        const hint = /sample\.dvi|unreachable/.test(msg)
          ? `TeX could not compile the code (${msg}). Check for typos, unsupported libraries or packages, or numbers too large for TikZ.`
          : msg;
        reject(new Error(hint));
        return;
      }
      const box = doc.getElementById('tikz');
      if (!box) return;
      // The benrbray build shows an error image when TeX fails.
      if (box.querySelector('img')) {
        cleanup(job);
        reject(
          new Error(
            'TeX could not compile the code. Check for typos, a missing \\usetikzlibrary, or numbers too large for TikZ.'
          )
        );
        return;
      }
      const pending = box.querySelector('script[type="text/tikz"]');
      // Ignore TikZJax's loading spinner (a small rounded rectangle).
      const svg = [...box.querySelectorAll('svg')].find((el) => !el.querySelector(':scope > rect[rx]'));
      if (!pending && svg) {
        const copy = document.importNode(svg, true);
        clearInterval(job.poll);
        clearTimeout(job.timer);
        if (active === job) active = null;
        resolve(copy);
        // Don't remove the frame yet: Chrome shares in-progress font downloads
        // between the frame and this page, and removing the frame aborts them,
        // leaving the page's fonts failed (labels in a fallback font). Wait
        // until this page has the fonts the picture uses (max 10 s).
        const families = [...new Set([...copy.querySelectorAll('[style*="font-family"], [font-family]')].map(
          (el) => (el.getAttribute('font-family') || (el.getAttribute('style').match(/font-family:\s*([^;]+)/) || [])[1] || '').replace(/['"]/g, '').trim()
        ).filter(Boolean))];
        const loaded = Promise.all(families.map((f) => document.fonts.load(`12px ${f}`).catch(() => null)));
        Promise.race([loaded, new Promise((r) => setTimeout(r, 10000))]).then(() => iframe.remove());
      }
    }, 120);

    job.timer = setTimeout(() => {
      cleanup(job);
      reject(
        new Error(
          'Rendering timed out. TikZJax cannot report TeX errors, so check the code for mistakes, ' +
            'unsupported libraries/packages, or very large numbers.'
        )
      );
    }, timeoutMs);

    document.body.append(iframe);
  });
}
