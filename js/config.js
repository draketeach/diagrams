// SPDX-License-Identifier: CC0-1.0
// Global configuration for the TikZ Diagrams site.
//
// TikZJax is loaded from tikzjax.com by default. The public v1 build has the
// TikZ core preloaded but does NOT ship any \usetikzlibrary files or extra
// packages, so diagram modules should generate core-TikZ-only code.
// If you later switch to a build with libraries (e.g. github.com/drgrice1/tikzjax),
// change the URLs below and set supportsLibraries to true.

export const TIKZJAX = {
  script: 'https://tikzjax.com/v1/tikzjax.js',
  fonts: 'https://tikzjax.com/v1/fonts.css',
  supportsLibraries: false,
  timeoutMs: 60000,
};

export const EXPORT_DEFAULTS = {
  dpi: 300,
  transparent: false,
  filename: 'diagram',
};
