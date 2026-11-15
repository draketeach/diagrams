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
| `t = 4 - p` | other single letters: the first graph's letters name the axes (p across, t up) unless you've typed your own axis labels |
| `x^2 - 1, -2 <= x < 3` | a function on a restricted domain, with filled/open end dots |
| `{ x/4, 0 <= x <= 2sqrt(2); 0, otherwise }` | a piecewise function (pieces may also go on separate lines inside the braces) |
| `x = 3` | a vertical line |
| `y^2 = x(x+2)(x-5)` | y² = f(x), drawn as y = ±√f(x): closed ovals and open branches |

Press **?** next to the box for examples. Settings go after semicolons: `dashed`, `dotted`, a line width (`thick` …),
`no arrows`, `from 0 to 4`, `label` (shows the equation) or `label: text`, e.g.
`y = 6 - 3x; dashed; label`.

The first graph gets the labels: x-intercepts, y-intercept and turning points
(coordinates, or dashed lines with values on the axes), and for piecewise
functions the endpoints on the x-axis and dot heights on the y-axis. Everything
else is under **More options**: curve ends (arrow, dot or plain), line widths
and arrowheads, tick marks and dots, the equation on the graph, decimal places
and exact values (fractions, π, surds), points on the curve at chosen x-values
(e.g. `2:P` labelled P(2, −6)), dashed or dotted **asymptotes** (`y = 5, x = -2`,
optionally `y = 5 from 0 to 10`, labelled by value, equation, both or neither),
shading under the graph (grey or dotted), dots/coordinates where graphs cross, the axes (labels,
`O`, custom ticks such as `3`, `5/2`, `pi` or `3:a`, evenly spaced scale ticks;
a tick number with the curve through it moves beside its tick, away from the
origin first (a y-axis number may move to the right of the axis), keeping clear
of the other numbers, or stays put if there's no room; Sketch graphs too),
a NOT TO SCALE note, size and range, a background grid (own range, spacing and shade), and the plot
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
labels as z-scores, real values (from μ and σ) or μ ± kσ, or your own text
(`0.6:z`); dashed or solid boundary lines; calculated or typed area labels; and the 68–95–99.7% empirical rule.
A region can be left unshaded, the axis can show only the region's boundaries,
and an area label can sit above a dashed arrow across the region, with the
boundary lines rising past the curve to meet it (`59 < x < 107 : 95%`).

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

### Slope field

Type the right-hand side of dy/dx = f(x, y) (in x and y; `sgn` is available).
Segments (or short arrows) of chosen spacing and length over a chosen range,
optionally none on the axes; labelled points (`x, y : A`); solution curves
through the points (dashed or solid, computed with the Runge–Kutta method);
dotted isoclines where dy/dx takes given values, optionally labelled; and the
usual axis labels, scale ticks and NOT TO SCALE note.

Fractions in labels are drawn full size (`\\displaystyle`), as on exam papers.

### Network (visual editor)

Networks (graphs) drawn on the geometry editor's canvas, with network tools:
Vertex, Edge, Directed edge, Label and Text. Vertices are dots with their
letter beside them (names can be hidden per vertex; a name that's a word of
three or more letters, like Start or Finish, is set upright as text). Clicking a vertex twice
with the Edge tool makes a loop; joining two vertices again makes a second
edge that curves away (0°, then 25°, −25°, 45° …). A directed edge has an arrow
at its middle. Click an edge to label it (e.g. a weight) or change its direction; drag the
handle at its middle to bend it (or a loop's far end to turn and resize it).

With nothing selected, the panel shows the network as an **edge list** you can
edit, one edge per line: `A-B`, `A->B` (directed), `A-B 5` or `A->B A, 8`
(labelled — the label is everything after the
edge, commas included, as plain text: `600 m`; `-0.09` gets a real minus sign and `$…$` is maths), `A-A`
(a loop), `A-B` on two lines (two edges), `D` (a vertex on its own). Vertices and edges still listed
keep their places; new vertices go on a circle to be dragged into place.

### Ranges typed the wrong way round

In every graph type, a range whose "from" isn't less than its "to" (e.g. 3 to 3,
when −3 to 3 was meant) is worked out automatically instead, with a warning
saying so.

### Complex plane

Regions and loci in the complex plane, one condition per line; the region where
they all hold is shaded. It understands circles and discs (`|z+2+3i| <= 1`,
`|z - 1| > 2`), straight lines in Re(z) and Im(z) (`Im(z) <= Re(z)`,
`Re(z) + Im(z) < 3`, or with x and y), perpendicular bisectors
(`|z - 1| <= |z + i|`) and arguments (`0 <= arg(z - 1) < 3pi/4`, or
`arg(z) = pi/3` for a ray). Boundaries are solid for ≤, ≥ and =, dashed for <
and >; an equation is drawn as a locus cut to the other conditions (the rest of it
dashed), with no shading. Conditions can be typed plainly or the LaTeX way
(`\le`, `\operatorname{Re}(z)`, `|z-(2+3i)|`). Centres and ray starts can be
labelled with their numbers (−2 − 3i), rays with their angles (an arc from the
real direction), and any points marked (`2i : P`). Points and lines go in their own box:
`z1 = 8` names a point (a dot labelled z₁, its label placed away from the
lines and axes, or `@ above`), `z1 -- z2 -- z3 -- cycle` joins points (names
or numbers such as `-27/8i`), `..` makes a dotted line, `->` an arrow, and
`dashed` or `dotted` after a line styles it, and `right z2 w 0` marks a right
angle at z2 between the lines to w and to 0. Unnamed ends of solid lines get a
dot (this can be switched off). Circles get a dot at their centre and rays an open dot where they
start. Axes are x and y by default (or Re and Im), with optional ticks and
numbers (a number with a circle or line through its place moves beside its
tick, away from the origin); the window fits the conditions unless you set it.

### Dot plot

Type the values (commas, spaces or new lines between them); each gets a dot,
stacked above its place on a number line. `4:3` means three dots above 4.
Dots can be filled, open or crosses, in three sizes, with the spacing between
them set in cm.

### Box plot

Box-and-whisker plots from five-number summaries, one per line: `min, Q1,
median, Q3, max`. Several lines give parallel box plots on one number line (the
first line on top); `Boys: …` names a plot, and values after a semicolon
(`10, 14, 17, 19, 24; 31, 35`) are outliers, drawn as dots, open dots or
crosses. Whiskers end in bars or plain. The number line can be left out, so a
box plot can be put together with a dot plot by hand.

Both use the same number line: from, to and the tick spacing (blank fits the
data), numbers at every tick, every second tick or none, its length in cm, a
title under it, and arrowheads at its ends. The picture's x unit is the data's
unit (`x=0.89cm`), so the code reads in the data's own numbers.

### 3D solids

Cylinders, cones, spheres, hemispheres, cuboids, triangular prisms and pyramids
(rectangular base), drawn without shading as on exam papers. Type the
measurements and a unit; each length is labelled with its value and unit
(`4 cm`) unless you type your own label (`$r$`) or `-` for none; `~a` in a
label is the vector a, drawn in the chosen vector style (tilde under, bold or arrow over). Round solids
have a dashed radius from a dot at the centre; a cylinder's height goes on a
measurement line beside it (bars, arrows, or both at its ends), and a cone's
or pyramid's height is dashed inside it, with an optional slant height label on a cone.
A hemisphere sits flat side up (a bowl) or down (a dome). A sphere can show
its whole equator as a plane through the centre, with vectors from the centre
to the equator by angle (`a: -60`, `v(θ): 240`), right-angle marks
(`right a b`) and angle arcs (`angle a v(θ) : θ`) drawn in the tilted plane,
and vector labels with a tilde under (no extra packages), bold or an arrow over. Cuboids, prisms and
pyramids can have their corners named (`A B C D E F G H`; `-` skips one). A
pyramid can show the angle between an edge and the base (at a corner) or between
a face and the base (on the right-hand side face, at the middle of its base edge), with dashed lines to the
centre of the base, a right angle there, and an arc with an arrowhead pointing at the base.
A pyramid has its own measurements, a 6 by 6 base and height 6 by default.
The code names each corner with `\coordinate` first, draws from the names, and
puts every label relative to what it labels (`node[midway, above]` on a line,
`\node[below left] at (A)` beside a corner), so it is easy to adjust by hand.
Hidden edges are left out, or drawn dashed. Under Drawing: the size, how flat
round faces look, and the angle the depth goes back at.

### Real-world graph

Graphs of real quantities (money, temperature, distance against time) drawn
through points instead of from an equation. One curve per line: points `x,y`
separated by spaces are joined by a smooth curve, `--` between two points
joins them with a straight line (`10,6.6 -- 10,5.8` is a vertical drop) and `|`
leaves a gap. After a point, `>` makes the curve level there (`0,8>`) and
`@30` sets its direction on the page in degrees (`@-90` straight down), `*`
gives a filled dot, `o` an open dot, and `:P` labels it. Settings follow `;`:
`dashed`, `dotted`, a line width, `straight` (all joins straight) and a label:
`label: text` goes right of the end; `label below: text`, `label start: text`,
`label middle above: text` and the like put it elsewhere (start or middle or
end, then above, below, left, right or a mix). Each axis can have a letter at its arrow (`t`, `A`), the grid can have darker
lines every so often over a fine one, and numbers of 10 000 and over can have
a thin space (`22 000`). Smooth sections are written as
Bézier curves (`.. controls … ..`) so the directions can be set.

The axes meet at the corner, with numbers every so often (or only the ones you
list), one 0 at the corner (or one on each axis, or none), and an optional
grid. Axis titles are text, centred under the x-axis and turned beside the
y-axis (or at the axis ends): `\\` starts a new line, `$…$` is maths, `\$` is a
dollar sign and `×` works.

### Probability tree

Trees grow left to right, with each stage's names in a column so every branch
of a stage is the same length. Enter the tree as **stages** (one line per
stage, outcomes separated by `;`, e.g. `Walk : 3/10; Not walk : 7/10`; each
stage repeats under every branch) or as an **outline** (one branch per line,
each `>` or two spaces at the start going one level deeper), which allows
uneven trees and different probabilities on each branch. Probabilities are
shown as typed (`3/10` as a full-size fraction, `0.3`, `p`, `1-p`); `?` leaves
a blank (a box, a line or space), for a probability or an outcome. An optional
outcome column lists each path and/or the product of its probabilities
(`3/10 × 9/10 = 27/100`, simplified; decimals stay decimals), and stage
headings can go above. A third field (`Walk : 3/10 : W`) gives a short name
for the outcome column.

### Geometry (visual editor)

Draw on a grid instead of filling in options. The toolbar's icons are Select, Point,
Line, Ray, North line, Curve, Measure, Polygon, Angle, Right angle, Label, Text, Midpoint, Perpendicular, Circle
and Arc (each with a
one-key shortcut while the canvas has focus), plus Undo/Redo (Ctrl+Z / Ctrl+Y),
Delete, zoom and Fit.

- Clicks snap to existing points, then onto lines, then to the grid (0.25,
  0.5 or 1 cm; snapping can be turned off).
- Angles: click two lines that meet, or three points (arm, vertex, arm). A line
  ending on another line (such as an altitude) counts as meeting it. The label
  is the measured size unless you type your own (e.g. `35^\\circ`, `\\theta`);
  angles can be reflex, have no arc (just the label) or one to three arcs, and have an arrowhead pointing
  at either arm. An angle's label can be turned to run along the angle (it then
  sits straight out from the arc rather than placing itself). Right-angle marks follow the two lines, so they slant in 3D
  drawings (see the 3D solids type for pyramids).
- New points are named from a chosen letter onwards (A, B, C… by default;
  lower case gives a, b, c…).
- Lines show their measured length (to 0, 1 or 2 decimal places) unless you
  type your own label or choose none; the label can be turned to run along the
  line; type `~a` for a vector a with a tilde under it. Lines can be dashed, dotted or thick, with arrowheads at either or both ends
  (bearings, a North line), equal-length ticks or parallel arrows. Polygons can
  be shaded grey, dotted (the exam-paper stipple) or hatched; between two
  corners on a circle (with no line joining them), or at the ends of a curve or
  arc, the shading follows it. A point can be labelled with its own text instead of its name (e.g.
  `A\,(4, 5, 2)` for its coordinates). NOT TO SCALE can be dragged to where you want it
  (and put back in its automatic place from the Drawing panel).
- Midpoint (click a line, or two points; equal-length ticks go on both halves)
  and Perpendicular (click a point and a line: a dashed line to the foot, with
  a right angle there, and the line extended dashed if the foot is beyond its
  end) make constructed
  points, which stay in place as the other points move. In the TikZ they are
  `\\coordinate (M) at ($(A)!0.5!(B)$);` and `($(A)!(P)!(B)$)` (calc library).
  "Make it free" turns one into an ordinary point.
- Ray: click the start, then a point it passes through. It runs on past that
  point with an arrowhead and stays in line as things move (its hidden end is
  `($(B)!-1.2cm!(A)$)`). In its settings, type a bearing to swing it to exactly
  that direction, set how far it runs past the point, and choose what goes at
  its end: nothing, its bearing (e.g. 056°) or your own text. Rays have no
  length label.
- Curve: click points for a smooth curve through them (click the last point
  again or press Enter to finish); drag the points to reshape it, and set its
  direction at any point (0 = level) in its settings. A polygon whose corners
  are the two ends of a curve follows the curve on that side, so shading can
  fill the area between a curve and straight sides.
- Measure: click the two ends of what you're measuring for a dashed line with
  arrowheads, bars across its ends and its length in a gap in the line, set
  0.7 cm away from the shape (change the distance, or flip it to the other
  side, in its settings). Any line can have its label in a gap or bars at its
  ends. Give the drawing a unit (e.g. m) and measured lengths read "16 m".
- Text, angle labels and line labels can have a white background (a tick box
  in their settings), so they read clearly over shading.
- Scale on the page (drawing settings): 1 cm a unit by default; × 0.5 draws a
  16-unit side 8 cm long. Text, arrowheads, angle arcs, gaps and how far a
  measurement line stands off stay full size, and measured lengths stay in the
  drawing's units. The code's coordinates are on the page; edit them there and
  they're read back at the drawing's scale.
- North line: click a point for a dashed arrow straight up from it with a
  bold N at the top (`($(O)+(0,2.5)$)`); it moves with the point, and its
  length and top label can be changed.
- Labels place themselves: each side length, angle size and point name tries
  a few spots near its usual place and takes the one clear of other labels,
  lines, arcs and points. Drag a label to place it yourself (Reset label
  position puts it back).
- Drag points, labels and text to move them; drag empty space to pan.
- Click something to edit it in the properties panel; with nothing selected
  the panel holds the drawing settings (grid, line width, font size, NOT TO
  SCALE).

Each point is a named `\\coordinate` at the top of the TikZ code, and
everything else refers to the names. Change the numbers there and click outside
the code box to move the points in the drawing too. The drawing is saved in
share links like any other diagram.

## Panel widths

Drag the handles between the options, code and preview panels to resize them
(or focus a handle and use the arrow keys). The widths are kept in your
browser, separately for the geometry editor and the other types; double-click
a handle (or press Home) to go back to the standard widths.

## Running it

ES modules don't load from `file://`, so double-clicking `index.html` won't work.
Use either:

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The site
  will then be at `https://<username>.github.io/<repo>/`.
- **A local server** from this folder: `python -m http.server 8000` (or `npx serve`),
  then open http://localhost:8000.

You can open a diagram type directly, e.g. `?type=function`, `?type=sketch`,
`?type=blank`, `?type=normal`, `?type=scatter`, `?type=slopefield`, `?type=geometry`, `?type=network`, `?type=probtree` or `?type=realgraph`.

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
  columnSplitters.js     drag handles to resize the three panels
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
vendor/fonts/latin-modern-sans/  interface font, Computer Modern Sans design (GUST Font License)
js/diagrams/
  index.js               list of registered diagram types
  function.js            function graphs (plain, piecewise, several graphs)
  sketch.js              smooth curves through points with optional gradients
  normal.js              the normal distribution module
  blank.js               blank axes
  scatter.js             scatterplots (click the preview to add points)
  slopefield.js          slope fields, solution curves, isoclines
  geometry.js            geometry drawn in the visual editor
  realgraph.js           real-world graphs drawn through points
  network.js             networks, drawn in the geometry editor
  probtree.js            probability trees
js/geometry/
  scene.js               the drawing's data, label placement, and TikZ output
  editor.js              the editor: canvas, toolbar, snapping, properties, undo
  edgeList.js            networks as typed edge lists, and back
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

A type can replace the options panel with its own editor: give it
`mountEditor(container, { onChange, defaults })`, returning
`{ getValues, setValues, reset, destroy }` like the built-in form, and
`wideLayout: true` to give it more room. `onCodeEdit(values, code)` may return
`{ values, message }` to take changes typed into the code box back into the
editor (see `geometry.js`).

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
TikZJax and its fonts, and `vendor/fonts/latin-modern-sans/`, the interface font
(GUST Font License). Those files keep their own licences (GPL-3.0 for the
benrbray build; GPL-3.0 or LPPL-1.3c for TikZJax v1). See the README in each folder.
