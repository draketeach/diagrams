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

/**
 * @param {string} code  code from the code box
 * @returns {Promise<{ svg: SVGSVGElement, warnings: string[], ms: number }>}
 */
export function renderTikz(code, options = {}) {
  cancelRender();
  const cfg = { ...TIKZJAX, ...options };
  const { source, warnings } = toTikzJaxSource(code, cfg);
  const started = performance.now();

  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      'position:absolute;left:-10000px;top:0;width:800px;height:600px;border:0;visibility:hidden;';

    const safe = source.replace(/<\/script/gi, '<\\/script');
    iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${cfg.fonts}">
<script>window.__tikzErrors=[];
addEventListener('error',function(e){__tikzErrors.push(String(e.message||e));});
addEventListener('unhandledrejection',function(e){var r=e.reason;__tikzErrors.push(String(r&&r.message||r));});<\/script>
</head><body><script type="text/tikz">${safe}<\/script>
<script src="${cfg.script}"><\/script></body></html>`;

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
        const hint = /sample\.dvi/.test(msg)
          ? 'TeX could not compile the code. Check for typos, unsupported libraries or packages, or numbers too large for TikZ.'
          : msg;
        reject(new Error(hint));
        return;
      }
      const pending = doc.querySelector('script[type="text/tikz"]');
      const svg = doc.querySelector('body > div svg');
      if (!pending && svg) {
        const copy = document.importNode(svg, true);
        cleanup(job);
        resolve({ svg: copy, warnings, ms: Math.round(performance.now() - started) });
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
    }, cfg.timeoutMs);

    document.body.append(iframe);
  });
}
