# diagrams — TikZ Diagrams for Exams

[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](http://creativecommons.org/publicdomain/zero/1.0/)

Mathematical diagrams with TikZ. Live site (once GitHub Pages is on): https://draketeach.github.io/diagrams/

Made by [MrDrake](https://mrdrake.com) with [Claude](https://www.anthropic.com/claude) (Anthropic).

A static website for building exam-style maths diagrams. Choose options, get
editable TikZ code, see it rendered live with [TikZJax](https://tikzjax.com),
and export PNG (150/300/600 dpi, optional transparent background), SVG, or a
standalone `.tex` file.

### Function graph

Type one graph per line in the **Graphs** box:

| Line | Draws |
|---|---|
| `y = x^3 - 7x + 6` | a function of x (`y =` is optional; `2sin(x)`, `1/x`, `e^x` … work too) |
| `x^2 - 1, -2 <= x < 3` | a function on a restricted domain, with filled/open end dots |
| `{ x/4, 0 <= x <= 2sqrt(2); 0, otherwise }` | a piecewise function (pieces may also go on separate lines inside the braces) |
| `x = 3` | a vertical line |

Press **?** next to the box for examples. Settings go after semicolons: `dashed`, `dotted`, a line width (`thick` …),
`no arrows`, `from 0 to 4`, `label` (shows the equation) or `label: text`, e.g.
`y = 6 - 3x; dashed; label`.

The first graph gets the labels: x-intercepts, y-intercept and turning points
(coordinates, or dashed lines with values on the axes), and for piecewise
functions the endpoints on the x-axis and dot heights on the y-axis. Everything
else is under **More options**: curve ends (arrow, dot or plain), line widths
and arrowheads, tick marks and dots, the equation on the graph, decimal places
and exact values (fractions, π, surds), points on the curve at chosen x-values
(e.g. `2:P` labelled P(2, −6)), dashed **asymptotes** (`y = 5, x = -2`,
optionally `y = 5 from 0 to 10`, labelled by value, equation, both or neither),
shading under the graph, dots/coordinates where graphs cross, the axes (labels,
`O`, custom ticks such as `3`, `5/2`, `pi` or `3:a`, evenly spaced scale ticks),
size and range, a background grid (own range, spacing and shade), and the plot
method.

### Sketch graph

A smooth curve through points when there is no equation, one per line:
`x, y`, optionally a gradient `x, y, gradient` (e.g. `2, -2.35, 0` for a
turning point), and a label after a colon (`1, 0 : a`). Points without a
gradient get one automatically. It has the same labels and More options as the
Function graph, plus an **Other graphs** box (same notation) for lines or
asymptote-like curves drawn with the sketch.

### Normal distribution

The **Normal distribution** type draws a bell curve with regions shaded by
inequality (`z < -1.5`, `-1 < z < 2`, `x > 62 : 0.1151`), dotted like exam
papers (`patterns.meta` dots in three densities), crosshatched or grey;
labels as z-scores, real values (from μ and σ) or μ ± kσ; dashed boundary
lines; calculated or typed area labels; and the 68–95–99.7% empirical rule.

### Blank axes

The **Blank axes** type draws labelled axes with tick marks and no curve, for
"sketch the graph" questions: type the ticks (`2, 5`, `pi/3, 2pi/3`, `3:a`) or
use a trig preset (π/2 … 2π, or 90° … 360°), with an optional grid.

### Scatterplot

Points as `x, y` lines, or two columns pasted from a spreadsheet (a first row
of words becomes the axis titles). **Click the preview to add a point**, and
Shift+click to remove the nearest one. Optional least-squares regression line
(or a typed line), with its equation and/or r (separate options); axis titles (the y title is
rotated); a grid with roughly square cells; scale numbers to the data's
decimals; and zig-zag axis breaks, with 0 at the corner, when an axis starts
far from 0 (automatic, always or never). With a grid, each break is exactly
one grid square (squares up to 8 mm), so the axes sit on grid lines and the
zig-zag is centred in the square.

A diagram type can take clicks on its preview: its `generate` returns
`click: { area, decimals, scale }` and the module has `onPreviewClick`. The
app finds that area in the rendered picture with an invisible marker
rectangle added to the code sent to TikZJax only (never to the code box or
exports).

Fractions in labels are drawn full size (`\\displaystyle`), as on exam papers.

## Running it

ES modules don't load from `file://`, so double-clicking `index.html` won't work.
Use either:

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The site
  will then be at `https://<username>.github.io/<repo>/`.
- **A local server** from this folder: `python -m http.server 8000` (or `npx serve`),
  then open http://localhost:8000.

You can open a diagram type directly, e.g. `?type=function`, `?type=sketch`,
`?type=blank`, `?type=normal` or `?type=scatter`.

The **Gallery** (`gallery.html`, linked from the top bar) shows example
diagrams made with the site, grouped by type; each opens in the editor with
its settings filled in. The examples live in `js/galleryEntries.js` and their
images in `gallery/`. After changing an entry, or how diagrams are drawn,
regenerate the images with the site served locally:

```
python -m http.server 8765
node tools/build-gallery.mjs            # all entries
node tools/build-gallery.mjs blank-trig # just one
```

This needs [Playwright](https://playwright.dev) (`npm i -g playwright`, then
`npx playwright install chromium`). The tests check that every entry
generates without warnings and has an image.

**Copy link** (under the options) saves the diagram type, every option you've
changed, and any hand edits to the code in the page address after `#`. Opening
the link rebuilds the same diagram, so you can bookmark diagrams or share them.
Nothing is stored on a server.

## Project layout

```
index.html               page shell (the editor)
gallery.html             example diagrams, linked to the editor
gallery/                 gallery images (made by tools/build-gallery.mjs)
css/style.css
js/config.js             TikZJax URLs and export defaults
js/app.js                wires the page together
js/gallery.js            builds the gallery page
js/galleryEntries.js     the gallery's diagrams and their settings
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
  graphList.js           the Function graph's "Graphs" box (one graph per line)
  graphOptions.js        options layout shared by Function and Sketch
  piecewiseGraph.js      piecewise pieces, end dots, shading
  extraGraphs.js         graphs after the first, crossings
  piecewiseParser.js     piecewise pieces in exam notation
  hermite.js             smooth sketch curves through points
  tikz.js                TikZ writing helpers
vendor/tikzjax-benrbray/  TikZJax build used by the site (own licence)
vendor/tikzjax/           older TikZJax v1 copy, used as a fallback (own licences)
js/diagrams/
  index.js               list of registered diagram types
  function.js            function graphs (plain, piecewise, several graphs)
  sketch.js              smooth curves through points with optional gradients
  normal.js              the normal distribution module
  blank.js               blank axes
  scatter.js             scatterplots (click the preview to add points)
tools/
  stamp-versions.mjs     adds content-hash versions to JS/CSS URLs in index.html and gallery.html
  build-gallery.mjs      renders the gallery images with the site in a headless browser
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
`function.js` does.

The schema field types are `group` (groups can nest), `row` (fields side by
side), `select`, `number`, `text`, `textarea` and `checkbox`. A field can also
have `examples` (`{ rows: [[code, description], …], notes }`), shown in a box
opened by a "?" button next to its label. Any field can have `help` text and a `showIf: (values) => boolean`.

## TikZJax

TikZJax is served from this site, so the site never contacts tikzjax.com or
Amazon S3. Some school and network filters block those. It tries, in order:

1. `vendor/tikzjax-benrbray/`: a build of [benrbray/tikzjax](https://github.com/benrbray/tikzjax),
   with TikZ libraries (such as `patterns.meta`) and packages. TeX runs in a
   background worker, and finished pictures are cached in the browser.
2. `vendor/tikzjax/`: the older TikZJax v1 copy (core TikZ only).
3. tikzjax.com, with a message saying so.

The site moves to the next one only if a file fails to load.

The first visit downloads the TeX engine and fonts (~9 MB) with a progress bar.
A service worker (`sw.js`) keeps those files on the computer, so later visits
load instantly. It also fetches the site's own code fresh on every visit, so
updates appear without a hard refresh. A note in the footer says whether the
current computer has the TeX engine saved for offline use. The TikZJax files
are named after their contents (tests check this), so a replaced file is never
served from an old cache.
See the README in each `vendor/` folder for where the files came from and their licences.

### Limitations

- PGF's SVG output has two bugs with `pattern=` fills: the pattern definitions
  are never written, and each tile is cut to its positive corner, so a dot
  shows as a quarter. `js/config.js` adds a small TeX fix for both, sent only
  to TikZJax. The code you copy is unchanged and compiles normally in LaTeX.
- If TeX can't compile an edit, the preview says so. It can't say which line.
- TikZ maths overflows above about ±16000. For steep functions, choose
  **Plot method → Pre-computed coordinates**.
- PNG/SVG export embeds the Computer Modern fonts.
- The original TikZJax v1 shows some maths symbols wrongly (`-` `.` `,` `/` `√`).
  The fallback copy in `vendor/tikzjax/` is patched to fix this. If the site
  ever falls back to tikzjax.com, it applies TeX workarounds for `-` `.` `,` `/` instead.
- PNGs carry their dpi, so Word/Google Docs insert them at the correct physical size.

## Credits

Made by [MrDrake](https://mrdrake.com) with [Claude](https://www.anthropic.com/claude) (Anthropic).
Rendering by [TikZJax](https://tikzjax.com) ([benrbray's build](https://github.com/benrbray/tikzjax)).

## License

[CC0 1.0 Universal](LICENSE). To the extent possible under law, the author has
waived all copyright and related rights to this work. Every source file has an
`SPDX-License-Identifier: CC0-1.0` header. The TikZ code and images this site
generates are also yours to use without restriction.

The exceptions are `vendor/tikzjax-benrbray/` and `vendor/tikzjax/`, copies of
TikZJax and its fonts. Those files keep their own licences (GPL-3.0 for the
benrbray build; GPL-3.0 or LPPL-1.3c for TikZJax v1). See the README in each folder.
