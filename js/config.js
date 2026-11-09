// SPDX-License-Identifier: CC0-1.0
// Global configuration for the TikZ Diagrams site.
//
// TikZJax is served from this site, so nothing is loaded from tikzjax.com or
// Amazon S3 unless both local copies fail to load. Sources are tried in order
// (only when one fails to *load*; a TeX error in the code is reported instead).
//
//   1. vendor/tikzjax-benrbray/  github.com/benrbray/tikzjax build: nearly all
//      TikZ libraries (patterns, arrows.meta, calc, …) and packages (amsmath,
//      pgfplots, …), correct maths symbols. The main renderer.
//   2. vendor/tikzjax/v1/        the original TikZJax v1 (core TikZ only),
//      patched to show symbols correctly. Fallback.
//   3. tikzjax.com               the original, unpatched. Last resort.
//
// File names that end in a hash are named after their contents, so a changed
// file can never be served from an old cache (tests check the names).

const benrbray = (path) => new URL(`../vendor/tikzjax-benrbray/${path}`, import.meta.url).href;
const v1 = (path) => new URL(`../vendor/tikzjax/${path}`, import.meta.url).href;

// The benrbray build's SVG driver (PGF's pgfsys-common-svg.def) breaks
// "pattern=…" fills in two ways, fixed here:
//  1. it never writes the pattern definitions, so fills came out blank —
//     writing them as a raw SVG <defs> block (which the converter handles)
//     fixes that;
//  2. a pattern tile ignores the lower-left corner of its bounding box, so a
//     drawing centred on the origin (each patterns.meta dot, hatch lines)
//     was cut to a quarter — the drawing is now moved into the tile.
// Only sent to TikZJax; the code you copy stays standard.
const PATTERN_ATTRS =
  'patternUnits="userSpaceOnUse" ' +
  'width="\\pgf@sys@tonumber\\pgf@xc" height="\\pgf@sys@tonumber\\pgf@yc" ' +
  'patternTransform="matrix(#2 #3 #4 #5 \\pgf@sys@tonumber\\pgfutil@tempdima\\space\\pgf@sys@tonumber\\pgfutil@tempdimb)"';
const PATTERN_DEFS_FIX = [
  '\\makeatletter',
  '\\def\\pgf@sys@svg@make@defs#1#2{{\\let\\#\\pgf@sys@svg@hash\\special{dvisvgm:raw <defs>#2</defs>}}}',
  '\\def\\pgfsys@@declarepattern#1#2#3#4#5#6#7#8#9{\\pgfutil@tempdima=#6\\relax\\pgfutil@tempdimb=#7\\relax\\pgf@xa=-\\pgf@xa\\pgf@ya=-\\pgf@ya',
  `\\ifnum#9=1\\relax\\pgf@sys@svg@make@defs{#1}{<pattern id="pgfpat#1" ${PATTERN_ATTRS}><g transform="translate(\\pgf@sys@tonumber\\pgf@xa\\space\\pgf@sys@tonumber\\pgf@ya)">#8</g></pattern>}`,
  `\\else\\pgf@sys@svg@make@defs{#1}{<pattern id="pgfpat#1" ${PATTERN_ATTRS}/><symbol id="pgfsym#1" overflow="visible"><g transform="translate(\\pgf@sys@tonumber\\pgf@xa\\space\\pgf@sys@tonumber\\pgf@ya)">#8</g></symbol>}\\fi}`,
  '\\makeatother',
].join('');

export const TIKZJAX = {
  sources: [
    {
      name: 'this site',
      script: benrbray('tikzjax-3f7757b04d.js'),
      fonts: benrbray('fonts-a7d4964e6d.css'),
      supportsLibraries: true,
      glyphFixes: false,
      preamble: PATTERN_DEFS_FIX,
    },
    {
      name: 'this site (older TikZJax)',
      script: v1('v1/tikzjax-b33ac02c99.js'),
      fonts: v1('v1/fonts.css'),
      supportsLibraries: false,
      glyphFixes: false, // this copy is patched (see vendor/tikzjax/README.md)
    },
    {
      name: 'tikzjax.com',
      script: 'https://tikzjax.com/v1/tikzjax.js',
      fonts: 'https://tikzjax.com/v1/fonts.css',
      supportsLibraries: false,
      glyphFixes: true, // TeX workarounds for - . , / (see js/core/tikzDocument.js)
    },
  ],
  // fonts.css used for the page preview and when embedding fonts in exports
  fonts: benrbray('fonts-a7d4964e6d.css'),
  // Large files downloaded up front (with a progress bar) and kept in this
  // Cache Storage cache by the service worker. Must match ENGINE_CACHE in sw.js.
  engineCache: 'tikzjax-engine-v4',
  engineFiles: [
    { url: benrbray('tikzjax-3f7757b04d.js'), bytes: 4307582 },
    { url: benrbray('fonts-a7d4964e6d.css'), bytes: 4791051 },
  ],
  timeoutMs: 60000,
};

export const EXPORT_DEFAULTS = {
  dpi: 300,
  transparent: false,
  filename: 'diagram',
};
