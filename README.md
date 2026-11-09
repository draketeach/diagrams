# diagrams — TikZ Diagrams for Exams

[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](http://creativecommons.org/publicdomain/zero/1.0/)

Mathematical diagrams with TikZ. Live site (once GitHub Pages is on): https://draketeach.github.io/diagrams/

Made by [MrDrake](https://mrdrake.com) with [Claude](https://www.anthropic.com/claude) (Anthropic).

A static website for building exam-style maths diagrams. Choose options, get
editable TikZ code, see it rendered live with [TikZJax](https://tikzjax.com),
and export PNG (150/300/600 dpi, optional transparent background), SVG, or a
standalone `.tex` file.

The first diagram type is the **Polynomial graph**, which can be defined in four ways:

| Mode | Example | Labels |
|---|---|---|
| Roots + leading coefficient | `-4, 1, 3` and `a = 1` | Exact, as typed (`1/2` → ½, `sqrt(3)` → √3) |
| Typed equation | `x^3 - 7x + 6`, `2sin(x)` | Exact where possible (fractions, π, surds) |
| Coefficients | `1, 0, -13, 12` | Same as typed equation |
| Sketch through points | `x, y [, label]` per line | Uses your values or custom labels such as `a`; optional dots at the curve ends |

The **Normal distribution** type draws a bell curve with regions shaded by
inequality (`z < -1.5`, `-1 < z < 2`, `x > 62 : 0.1151`), dotted or grey;
labels as z-scores, real values (from μ and σ) or μ ± kσ; dashed boundary
lines; calculated or typed area labels; and the 68–95–99.7% empirical rule.

Function graphs can have a background grid (its own range, x/y spacing and line
shade), and in the equation-based modes the curve can be limited to a range
(e.g. from x = 0 to 1.43) so it stops there instead of running to the edge.

You can toggle x-/y-intercept labels, tick marks at the intercepts, evenly spaced
scale ticks (optionally numbered) on either axis, custom ticks at chosen values
(e.g. `3`, `5/2`, `pi`, or `3:a` for a custom label), points on the curve at chosen
x-values (e.g. `2:P` labelled P(2, −6), or dashed lines with values on the axes), turning points (coordinates, or
dashed lines to the axes), dots, the equation, the axis labels, the origin `O`,
arrowheads, line widths and font size.

## Running it

ES modules don't load from `file://`, so double-clicking `index.html` won't work.
Use either:

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The site
  will then be at `https://<username>.github.io/<repo>/`.
- **A local server** from this folder: `python -m http.server 8000` (or `npx serve`),
  then open http://localhost:8000.

You can open a diagram type directly with `?type=polynomial`.

**Copy link** (under the options) saves the diagram type, every option you've
changed, and any hand edits to the code in the page address after `#`. Opening
the link rebuilds the same diagram, so you can bookmark diagrams or share them.
Nothing is stored on a server.

## Project layout

```
index.html               page shell
css/style.css
js/config.js             TikZJax URLs and export defaults
js/app.js                wires the page together
sw.js                    service worker: keeps TikZJax cached, fetches site code fresh
js/core/                 shared by every diagram type
  registry.js            registerDiagram / getDiagram
  formBuilder.js         builds the options panel from a schema
  codeEditor.js          editable code box (Ctrl+Enter renders)
  tikzDocument.js        TikZJax input, standalone .tex, picture-only
  tikzRenderer.js        renders code to <svg> with TikZJax
  tikzjaxLoader.js       first-time TeX download with progress; registers sw.js
  shareLink.js           saves/restores a diagram in the page address (#type=…&o=…)
  exporter.js            SVG/PNG download, clipboard, font embedding, PNG dpi
js/lib/                  helpers for diagram modules
  mathParser.js          expression → value / pgfmath / LaTeX
  numeric.js             roots, turning points, exact-value labels
  functionGraph.js       window, axes, curve pieces, intercept/turning-point labels
  hermite.js             smooth sketch curves through points
  tikz.js                TikZ writing helpers
vendor/tikzjax/           local copy of TikZJax + fonts (own licences)
js/diagrams/
  index.js               list of registered diagram types
  polynomial.js          the polynomial graph module
  piecewise.js           the piecewise function module
  normal.js              the normal distribution module
tools/
  stamp-versions.mjs     adds content-hash versions to JS/CSS URLs in index.html
tests/
  run-tests.js           unit tests: node tests/run-tests.js
  compile-examples.js    compiles examples with local pdflatex (if installed)
```

## Updating the site

After changing any JS or CSS, run `node tools/stamp-versions.mjs` before
committing. It adds a content hash to each file's URL in `index.html`, so
browsers and GitHub's CDN never mix old and new files right after a deploy.
`node tests/run-tests.js` fails if this has been forgotten.

## Adding a new diagram type

1. Create `js/diagrams/<name>.js`:

   ```js
   import { TikzBuilder } from '../lib/tikz.js';

   export default {
     id: 'circle',
     name: 'Circle',
     category: 'Geometry',
     description: 'A labelled circle',
     schema: [
       { type: 'number', key: 'r', label: 'Radius', default: 2, step: 0.5 },
       { type: 'checkbox', key: 'centre', label: 'Mark centre', default: true },
     ],
     generate(values) {
       const b = new TikzBuilder();
       b.add(`\\draw (0,0) circle[radius=${values.r}];`);
       if (values.centre) b.add('\\fill (0,0) circle[radius=1.5pt] node[below] {$O$};');
       return { code: b.toString(), warnings: [] };
     },
   };
   ```

2. Add it to `js/diagrams/index.js`, then run `node tools/stamp-versions.mjs`.

That's it. The options panel, code box, preview and all exports work automatically.
For function graphs (trig, exponential, log, hyperbola…), reuse the schema
fragments and drawing helpers in `js/lib/functionGraph.js`, the same way
`polynomial.js` does.

The schema field types are `group`, `select`, `number`, `text`, `textarea` and
`checkbox`. Any field can have `help` text and a `showIf: (values) => boolean`.

## TikZJax

TikZJax is served from this site, in `vendor/tikzjax/`, so the site never
contacts tikzjax.com or Amazon S3. Some school and network filters block those.
If the local copy fails to load, the site falls back to tikzjax.com and says so.

The first visit downloads the TeX engine (~11 MB) with a progress bar. A service
worker (`sw.js`) keeps those files on the computer, so later visits load
instantly. It also fetches the site's own code fresh on every visit, so updates
appear without a hard refresh. A note in the footer says whether the current
computer has the TeX engine saved for offline use. If the TikZJax files are ever replaced, change
`ENGINE_CACHE` in `sw.js` and `engineCache` in `js/config.js`.
See `vendor/tikzjax/README.md` for where the files came from and their licences.

### Limitations

- The TikZJax v1 build has TikZ preloaded but **no `\usetikzlibrary` libraries
  and no extra packages** (no `arrows.meta`, `calc`, `pgfplots`…). The generated
  code uses core TikZ only (`stealth`, `latex` and `to` arrow tips). If a future
  diagram needs libraries, switch `js/config.js` to a build that includes them
  (e.g. [drgrice1/tikzjax](https://github.com/drgrice1/tikzjax)) and set
  `supportsLibraries: true`.
- TikZJax can't report TeX errors, so a broken edit shows as a timeout.
- TikZ maths overflows above about ±16000. For steep functions, choose
  **Plot method → Pre-computed coordinates**.
- PNG/SVG export embeds the Computer Modern fonts from the local copy.
- The original TikZJax shows some maths symbols wrongly (`-` `.` `,` `/` `√`)
  because it looks characters up in its fonts by the wrong code. The copy in
  `vendor/tikzjax/` is patched to fix this. If the site ever falls back to
  tikzjax.com, it applies TeX workarounds for `-` `.` `,` `/` instead.
- PNGs carry their dpi, so Word/Google Docs insert them at the correct physical size.

## Credits

Made by [MrDrake](https://mrdrake.com) with [Claude](https://www.anthropic.com/claude) (Anthropic).
Rendering by [TikZJax](https://tikzjax.com).

## License

[CC0 1.0 Universal](LICENSE). To the extent possible under law, the author has
waived all copyright and related rights to this work. Every source file has an
`SPDX-License-Identifier: CC0-1.0` header. The TikZ code and images this site
generates are also yours to use without restriction.

The exception is `vendor/tikzjax/`, a copy of TikZJax and the BaKoMa fonts. Those
files keep their own licences (GPL-3.0 or LPPL-1.3c for TikZJax). See
`vendor/tikzjax/README.md`.
