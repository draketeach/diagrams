// SPDX-License-Identifier: CC0-1.0
// Global configuration for the TikZ Diagrams site.
//
// TikZJax is served from this site (vendor/tikzjax/), so nothing is loaded
// from tikzjax.com or Amazon S3. If the local copy fails to load, the
// renderer falls back to the next source in the list.
//
// The TikZJax v1 build has the TikZ core preloaded but does NOT ship any
// \usetikzlibrary files or extra packages, so diagram modules should
// generate core-TikZ-only code. If you later switch to a build with
// libraries (e.g. github.com/drgrice1/tikzjax), update the sources below
// and set supportsLibraries to true.

const local = (path) => new URL(`../vendor/tikzjax/${path}`, import.meta.url).href;

export const TIKZJAX = {
  sources: [
    // glyphFixes: work around TikZJax showing - . , / √ as the wrong symbol.
    // The local copy is patched to fix this properly; tikzjax.com is not.
    { name: 'this site', script: local('v1/tikzjax-b33ac02c99.js'), fonts: local('v1/fonts.css'), glyphFixes: false },
    { name: 'tikzjax.com', script: 'https://tikzjax.com/v1/tikzjax.js', fonts: 'https://tikzjax.com/v1/fonts.css', glyphFixes: true },
  ],
  // fonts.css used for the page preview and when embedding fonts in exports
  fonts: local('v1/fonts.css'),
  // The TikZJax script's file name includes a hash of its contents, so a changed
  // script can never be served from an old cache (see vendor/tikzjax/README.md).
  // Large files downloaded up front (with a progress bar) and kept in this
  // Cache Storage cache by the service worker. Must match ENGINE_CACHE in sw.js.
  engineCache: 'tikzjax-engine-v3',
  engineFiles: [
    { url: local('v1/tikzjax-b33ac02c99.js'), bytes: 459525 },
    { url: local('v1/3f69afb974a1e83f66a36f7618f88a38c254034b.wasm'), bytes: 612530 },
    { url: local('v1/b565ab0b474e8e557d954694b7379a57db669ac9.gz'), bytes: 9785967 },
  ],
  supportsLibraries: false,
  timeoutMs: 60000,
};

export const EXPORT_DEFAULTS = {
  dpi: 300,
  transparent: false,
  filename: 'diagram',
};
