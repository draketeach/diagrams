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
    { name: 'this site', script: local('v1/tikzjax.js'), fonts: local('v1/fonts.css') },
    { name: 'tikzjax.com', script: 'https://tikzjax.com/v1/tikzjax.js', fonts: 'https://tikzjax.com/v1/fonts.css' },
  ],
  // fonts.css used for the page preview and when embedding fonts in exports
  fonts: local('v1/fonts.css'),
  supportsLibraries: false,
  timeoutMs: 60000,
};

export const EXPORT_DEFAULTS = {
  dpi: 300,
  transparent: false,
  filename: 'diagram',
};
