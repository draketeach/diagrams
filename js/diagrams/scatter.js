// SPDX-License-Identifier: CC0-1.0
// Scatterplots: points from "x, y" lines (or two columns pasted from a
// spreadsheet), an optional least-squares or typed line, a grid, axis titles,
// and zig-zag axis breaks when an axis starts well away from 0.
// Points can also be added by clicking the preview (see `click` below).

import { parseExpression } from '../lib/mathParser.js';
import { TikzBuilder, n, pt, mathLabel, arrowSpec, LINE_WIDTHS, ARROW_TIPS, FONT_SIZES } from '../lib/tikz.js';
import { niceStep } from '../lib/functionGraph.js';
import { row, group } from '../lib/graphOptions.js';

const auto = (v) => v === null || v === undefined || v === '' || !isFinite(v);
const manual = (v) => v.windowMode === 'manual';

const DATA_EXAMPLES = {
  rows: [
    ['7.1, 6.7', 'One point per line: x, y'],
    ['7.1    6.7', 'Two columns pasted from a spreadsheet (tabs or spaces)'],
    ["Critics' score, Public's score", 'A first line of words is a header: it becomes the axis titles if those are blank'],
  ],
  notes: ['Click the preview to add a point there; Shift+click removes the nearest point.'],
};

const schema = [
  {
    type: 'group',
    label: 'Data',
    fields: [
      {
        type: 'textarea',
        key: 'data',
        label: 'Points, one per line',
        rows: 7,
        default:
          '7.1, 6.7\n7.3, 7.0\n7.4, 6.1\n7.5, 7.2\n7.5, 6.7\n7.9, 7.1\n8.0, 7.2\n8.8, 7.4\n9.0, 7.6\n9.1, 7.4\n9.2, 7.2\n9.3, 7.5\n' +
          '9.4, 7.2\n9.5, 8.4\n9.6, 8.1\n9.7, 8.4\n9.7, 8.0\n9.7, 7.6\n9.8, 8.3\n9.8, 8.1\n9.9, 8.2\n10.0, 8.3\n10.0, 7.9',
        help: 'x, y — or paste two columns. Click the preview to add a point (Shift+click removes one).',
        examples: DATA_EXAMPLES,
      },
      {
        type: 'select',
        key: 'line',
        label: 'Line',
        default: 'lsr',
        options: [
          { value: 'none', label: 'No line' },
          { value: 'lsr', label: 'Least-squares regression line' },
          { value: 'typed', label: 'Typed line' },
        ],
      },
      {
        type: 'text',
        key: 'lineEquation',
        label: 'y =',
        default: '0.5x + 3',
        placeholder: 'e.g. 0.54x + 2.7',
        showIf: (v) => v.line === 'typed',
      },
      { type: 'checkbox', key: 'showEquation', label: 'Show the equation (and r)', default: false, showIf: (v) => v.line !== 'none' },
      row(
        { type: 'text', key: 'xTitle', label: 'x-axis title', default: "Critics' score" },
        { type: 'text', key: 'yTitle', label: 'y-axis title', default: "Public's score" }
      ),
    ],
  },
  {
    type: 'group',
    label: 'More options',
    collapsed: true,
    fields: [
      group('Points & line', [
        row(
          {
            type: 'select',
            key: 'pointStyle',
            label: 'Points',
            default: 'dot',
            options: [
              { value: 'dot', label: 'Dots' },
              { value: 'circle', label: 'Open circles' },
              { value: 'cross', label: 'Crosses' },
            ],
          },
          {
            type: 'select',
            key: 'pointSize',
            label: 'Size',
            default: '1.6pt',
            options: [
              { value: '1.2pt', label: 'Small' },
              { value: '1.6pt', label: 'Medium' },
              { value: '2.2pt', label: 'Large' },
            ],
          }
        ),
        row(
          { type: 'select', key: 'lineWidth', label: 'Line width', default: 'thin', options: LINE_WIDTHS },
          {
            type: 'select',
            key: 'lineExtent',
            label: 'Line drawn',
            default: 'data',
            options: [
              { value: 'data', label: 'Across the data' },
              { value: 'axes', label: 'Across the axes' },
            ],
          }
        ),
        row(
          { type: 'number', key: 'eqDp', label: 'Equation decimals', default: 2, min: 0, max: 6, step: 1 },
          { type: 'number', key: 'rDp', label: 'r decimals', default: 3, min: 0, max: 6, step: 1 }
        ),
      ]),
      group('Axes', [
        row(
          { type: 'text', key: 'xAxisLabel', label: 'x label', default: 'x' },
          { type: 'text', key: 'yAxisLabel', label: 'y label', default: 'y' }
        ),
        row(
          { type: 'number', key: 'xStep', label: 'x tick spacing', default: null, step: 0.1, min: 0 },
          { type: 'number', key: 'yStep', label: 'y tick spacing', default: null, step: 0.1, min: 0 }
        ),
        row(
          { type: 'number', key: 'xDp', label: 'x decimals', default: null, min: 0, max: 6, step: 1 },
          { type: 'number', key: 'yDp', label: 'y decimals', default: null, min: 0, max: 6, step: 1 }
        ),
        {
          type: 'select',
          key: 'axisBreak',
          label: 'Zig-zag axis breaks',
          default: 'auto',
          options: [
            { value: 'auto', label: 'Automatic (axis starts far from 0)' },
            { value: 'on', label: 'Always' },
            { value: 'off', label: 'Never' },
          ],
        },
        row(
          { type: 'select', key: 'axisArrow', label: 'Arrowheads', default: 'latex', options: ARROW_TIPS },
          { type: 'select', key: 'fontSize', label: 'Font size', default: '', options: FONT_SIZES }
        ),
      ]),
      group('Size & range', [
        row(
          { type: 'number', key: 'width', label: 'Width (cm)', default: 8, step: 0.5, min: 2 },
          { type: 'number', key: 'height', label: 'Height (cm)', default: 5.5, step: 0.5, min: 2 }
        ),
        {
          type: 'select',
          key: 'windowMode',
          label: 'Axes range',
          default: 'auto',
          options: [
            { value: 'auto', label: 'Automatic (fit the data)' },
            { value: 'manual', label: 'Manual' },
          ],
        },
        row(
          { type: 'number', key: 'xmin', label: 'x from', default: 0, step: 0.5, showIf: manual },
          { type: 'number', key: 'xmax', label: 'x to', default: 10, step: 0.5, showIf: manual }
        ),
        row(
          { type: 'number', key: 'ymin', label: 'y from', default: 0, step: 0.5, showIf: manual },
          { type: 'number', key: 'ymax', label: 'y to', default: 10, step: 0.5, showIf: manual }
        ),
      ]),
      group('Grid', [
        { type: 'checkbox', key: 'showGrid', label: 'Grid', default: true },
        row(
          { type: 'number', key: 'gridX', label: 'x spacing', default: null, step: 0.1, min: 0, showIf: (v) => v.showGrid },
          { type: 'number', key: 'gridY', label: 'y spacing', default: null, step: 0.1, min: 0, showIf: (v) => v.showGrid }
        ),
        {
          type: 'select',
          key: 'gridShade',
          label: 'Grid lines',
          default: 'black',
          options: [
            { value: 'gray!30', label: 'Light grey' },
            { value: 'gray!60', label: 'Grey' },
            { value: 'black', label: 'Black' },
          ],
          showIf: (v) => v.showGrid,
        },
      ]),
    ],
  },
];

// ------------------------------------------------------------------ data

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** Parse the data box: { points: [{x, y}], header: [xTitle, yTitle] | null } */
export function parseData(src) {
  const points = [];
  let header = null;
  String(src ?? '')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trim().replace(/^\(|\)$/g, '');
      if (!line) return;
      const parts = (line.includes('\t') ? line.split('\t') : line.includes(',') || line.includes(';') ? line.split(/[,;]/) : line.split(/\s+/))
        .map((s) => s.trim())
        .filter((s) => s !== '');
      if (parts.length === 2 && parts.every((p) => NUM.test(p))) {
        const dec = (t) => (t.split(/e/i)[0].split('.')[1] || '').length;
        points.push({ x: Number(parts[0]), y: Number(parts[1]), dx: dec(parts[0]), dy: dec(parts[1]) });
      } else if (!points.length && !header && parts.length === 2 && !parts.some((p) => NUM.test(p))) {
        header = parts;
      } else {
        throw new Error(`Line ${i + 1}: expected two numbers "x, y" but got "${raw.trim()}"`);
      }
    });
  return { points, header };
}

/** Least squares y on x: { a, b, r } with y = a + bx. */
export function regression(points) {
  const k = points.length;
  if (k < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / k;
  const my = points.reduce((s, p) => s + p.y, 0) / k;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { b, a: my - b * mx, r: syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy) };
}

const dpOf = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
const fixed = (v, dp) => {
  const s = v.toFixed(dp);
  return s === `-${(0).toFixed(dp)}` ? (0).toFixed(dp) : s;
};
const tex = (s) => String(s).replace(/([&%$#_{}])/g, '\\$1').replace(/'/g, '\u2019');

/** One axis: ticks, grid range and whether it has a zig-zag break. */
function axisPlan(lo, hi, { step, gridStep, dp, dataDp = 0, mode, sizeCm, isManual }) {
  const span = Math.max(hi - lo, 1e-9);
  const s = auto(step) || step <= 0 ? niceStep(span, 5) : step;
  let start = isManual ? lo : Math.floor((lo + 1e-9) / s) * s;
  let end = isManual ? hi : Math.ceil((hi - 1e-9) / s) * s;
  if (end - start < s) end = start + s;
  start = Number(start.toPrecision(12));
  end = Number(end.toPrecision(12));
  // break when 0 is far below the first tick
  const brk = mode === 'on' ? start > 0 : mode === 'off' ? false : start > 0 && start > 0.35 * end;
  // where the axis line is drawn (the other axis crosses here)
  const cross = brk ? null : start <= 0 && end >= 0 ? 0 : start;
  const ticks = [];
  for (let k = Math.ceil((start - 1e-9) / s); k * s <= end + 1e-9; k++) ticks.push(Number((k * s).toPrecision(12)));
  // the plotting area, plus room for the arrow (~0.7 cm) and the break (0.55 cm)
  const unit = (sizeCm - 0.7 - (brk ? 0.55 : 0)) / (end - start);
  const gap = brk ? 0.55 / unit : 0;
  // grid: a division of the tick step giving cells of about 5 mm
  let g = gridStep;
  if (auto(g) || g <= 0) {
    g = s;
    let best = Infinity;
    for (const d of [1, 2, 4, 5, 10]) {
      const cm = (s / d) * unit;
      if (Math.abs(Math.log(cm / 0.5)) < best) {
        best = Math.abs(Math.log(cm / 0.5));
        g = s / d;
      }
    }
  }
  return { step: s, start, end, ticks, grid: g, dp: auto(dp) ? Math.max(dpOf(s), Math.min(dataDp, 3)) : dp, brk, gap, cross, unit };
}

// ------------------------------------------------------------------ generate

function generate(values) {
  const warnings = [];
  const { points, header } = parseData(values.data);
  if (!points.length) warnings.push('Type some points, or click the preview to add them.');
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const isManual = values.windowMode === 'manual';
  const [xlo, xhi] = isManual ? [values.xmin, values.xmax] : xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 10];
  const [ylo, yhi] = isManual ? [values.ymin, values.ymax] : ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 10];
  if (!(xhi > xlo) && isManual) throw new Error('"x to" must be bigger than "x from".');
  if (!(yhi > ylo) && isManual) throw new Error('"y to" must be bigger than "y from".');
  const pad = (lo, hi) => (hi > lo ? [lo, hi] : [lo - 1, hi + 1]);
  const X = axisPlan(...pad(xlo, xhi), {
    step: values.xStep, gridStep: values.gridX, dp: values.xDp, dataDp: Math.max(0, ...points.map((p) => p.dx)), mode: values.axisBreak, sizeCm: values.width || 8, isManual,
  });
  const Y = axisPlan(...pad(ylo, yhi), {
    step: values.yStep, gridStep: values.gridY, dp: values.yDp, dataDp: Math.max(0, ...points.map((p) => p.dy)), mode: values.axisBreak, sizeCm: values.height || 5.5, isManual,
  });

  // corner where the axes meet, and the far ends of the arrows
  const cx = X.brk ? X.start - X.gap : Y.cross === null ? X.start : X.cross ?? X.start;
  const cy = Y.brk ? Y.start - Y.gap : Y.cross ?? Y.start;
  const yAxisX = X.brk ? cx : X.cross ?? X.start;
  const xAxisY = Y.brk ? cy : Y.cross ?? Y.start;
  const xEnd = X.end + 0.8 / X.unit;
  const yEnd = Y.end + 0.6 / Y.unit;
  const out = points.filter((p) => p.x < X.start - 1e-9 || p.x > X.end + 1e-9 || p.y < Y.start - 1e-9 || p.y > Y.end + 1e-9);
  if (out.length) warnings.push(`${out.length} point${out.length > 1 ? 's are' : ' is'} outside the axes range.`);

  const b = new TikzBuilder();
  const w = 'thin';

  // ---- grid
  if (values.showGrid) {
    const ex = (X.end - X.start) * 1e-4;
    const ey = (Y.end - Y.start) * 1e-4;
    b.comment(`grid every ${n(X.grid)} by ${n(Y.grid)}`);
    b.add(
      `\\draw[${values.gridShade || 'black'}, very thin, xstep=${n(X.grid * X.unit, 4)}cm, ystep=${n(Y.grid * Y.unit, 4)}cm, ` +
        `shift={${pt(X.start, Y.start)}}] ${pt(-ex, -ey)} grid ${pt(X.end - X.start + ex, Y.end - Y.start + ey)};`
    );
  }

  // ---- axes (with zig-zag breaks)
  const tip = arrowSpec(values.axisArrow, false, true);
  b.comment('axes');
  const zigX = (x0) => `-- ${pt(x0, xAxisY)} -- ++(1.5pt,2.5pt) -- ++(3pt,-5pt) -- ++(1.5pt,2.5pt)`;
  const zigY = (y0) => `-- ${pt(yAxisX, y0)} -- ++(2.5pt,1.5pt) -- ++(-5pt,3pt) -- ++(2.5pt,1.5pt)`;
  const xAxisFrom = X.brk ? cx : Math.min(X.start, yAxisX);
  const yAxisFrom = Y.brk ? cy : Math.min(Y.start, xAxisY);
  b.add(
    `\\draw[${w}${tip ? `, ${tip}` : ''}] ${pt(xAxisFrom, xAxisY)} ` +
      (X.brk ? `${zigX(cx + X.gap * 0.35)} ` : '') +
      `-- ${pt(xEnd, xAxisY)} node[anchor=north east, inner sep=2pt] {${mathLabel(values.xAxisLabel ?? 'x')}};`
  );
  b.add(
    `\\draw[${w}${tip ? `, ${tip}` : ''}] ${pt(yAxisX, yAxisFrom)} ` +
      (Y.brk ? `${zigY(cy + Y.gap * 0.35)} ` : '') +
      `-- ${pt(yAxisX, yEnd)} node[anchor=north east, inner sep=2pt] {${mathLabel(values.yAxisLabel ?? 'y')}};`
  );

  // ---- tick labels (0 at the corner when an axis is broken)
  b.comment('scales');
  for (const t of X.ticks) {
    b.add(`\\draw[${w}] ${pt(t, xAxisY)} -- ++(0,-3pt) node[anchor=north, inner sep=2pt] {$${fixed(t, X.dp)}$};`);
  }
  for (const t of Y.ticks) {
    b.add(`\\draw[${w}] ${pt(yAxisX, t)} -- ++(-3pt,0) node[anchor=east, inner sep=2pt] {$${fixed(t, Y.dp)}$};`);
  }
  if (X.brk) b.add(`\\node[anchor=north, inner sep=2pt, yshift=-3pt] at ${pt(cx, xAxisY)} {$0$};`);
  if (Y.brk) b.add(`\\node[anchor=east, inner sep=2pt, xshift=-3pt] at ${pt(yAxisX, cy)} {$0$};`);

  // ---- axis titles
  const xTitle = values.xTitle || header?.[0] || '';
  const yTitle = values.yTitle || header?.[1] || '';
  const yLabelChars = Math.max(1, ...Y.ticks.map((t) => fixed(t, Y.dp).length));
  if (xTitle || yTitle) b.comment('axis titles');
  // below the scale numbers / left of them (distances in cm turned into graph units)
  if (xTitle) b.add(`\\node[anchor=north] at ${pt((X.start + X.end) / 2, xAxisY - 0.6 / Y.unit)} {${tex(xTitle)}};`);
  if (yTitle) {
    const off = (0.3 + 0.2 * yLabelChars) / X.unit;
    b.add(`\\node[anchor=south, rotate=90] at ${pt(yAxisX - off, (Y.start + Y.end) / 2)} {${tex(yTitle)}};`);
  }

  // ---- line
  let line = null;
  if (values.line === 'lsr') {
    const reg = regression(points);
    if (!reg) {
      if (points.length) warnings.push('The regression line needs at least two points with different x values.');
    } else {
      const dp = values.eqDp ?? 2;
      line = {
        f: (x) => reg.a + reg.b * x,
        latex: `y = ${fixed(reg.b, dp)}x ${reg.a < 0 ? '-' : '+'} ${fixed(Math.abs(reg.a), dp)}`,
        extra: isFinite(reg.r) ? `r = ${fixed(reg.r, values.rDp ?? 3)}` : '',
      };
    }
  } else if (values.line === 'typed') {
    let e;
    try {
      e = parseExpression(String(values.lineEquation || '').replace(/^\s*y\s*=\s*/i, '').replace(/√/g, 'sqrt'));
    } catch (err) {
      throw new Error(`Could not read the line "${values.lineEquation}" (${err.message})`);
    }
    line = { f: e.evaluate, latex: `y = ${e.toLatex()}`, extra: '' };
  }
  if (line) {
    const [a, c] = values.lineExtent === 'axes' || !xs.length ? [X.start, X.end] : [Math.min(...xs), Math.max(...xs)];
    // keep it inside the plotting area
    const clip = (x) => Math.min(Y.end, Math.max(Y.start, line.f(x)));
    b.comment('line');
    b.add(`\\draw[${values.lineWidth || 'thin'}] ${pt(a, clip(a))} -- ${pt(c, clip(c))};`);
    if (values.showEquation) {
      const text = [line.latex, line.extra].filter(Boolean).join(',\\quad ');
      b.add(`\\node[anchor=north west, fill=white, inner sep=2pt] at ${pt(X.start, Y.end)} [xshift=2pt, yshift=-2pt] {$${text}$};`);
    }
  }

  // ---- points (on top)
  if (points.length) {
    b.comment('points');
    const r = values.pointSize || '1.6pt';
    for (const p of points) {
      if (values.pointStyle === 'circle') b.add(`\\draw[thin, fill=white] ${pt(p.x, p.y)} circle[radius=${r}];`);
      else if (values.pointStyle === 'cross') {
        b.add(`\\draw[thin] ${pt(p.x, p.y)} +(-${r},-${r}) -- +(${r},${r}) +(-${r},${r}) -- +(${r},-${r});`);
      } else b.add(`\\fill ${pt(p.x, p.y)} circle[radius=${r}];`);
    }
  }

  // picture units so the plotting area fills width × height
  const opts = [`x=${n(X.unit, 4)}cm`, `y=${n(Y.unit, 4)}cm`];
  if (values.fontSize) opts.push(`font=${values.fontSize}`);

  return {
    code: b.toString(opts),
    warnings,
    // the preview can turn clicks into points (see js/app.js)
    click: {
      area: { x0: X.start, x1: X.end, y0: Y.start, y1: Y.end },
      decimals: [X.dp + 1, Y.dp + 1],
      scale: { x: X.unit, y: Y.unit }, // cm per unit, for "nearest point"

    },
  };
}

/** A click on the preview at (x, y): add a point there, or remove the nearest. */
function onPreviewClick(values, { x, y, remove, decimals, scale }) {
  const { points } = parseData(values.data);
  const lines = String(values.data ?? '').split('\n');
  if (remove) {
    if (!points.length) return null;
    // nearest point on the page (cm), so both axes count the same
    let best = -1;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.hypot((p.x - x) * scale.x, (p.y - y) * scale.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (bestD > 0.5) return null; // more than 5 mm away: nothing to remove
    let k = -1;
    const kept = lines.filter((l) => {
      const t = l.trim();
      if (!t) return true;
      try {
        if (parseData(t).points.length) k++;
      } catch {
        return true;
      }
      return k !== best || !parseData(t).points.length;
    });
    return { ...values, data: kept.join('\n') };
  }
  const text = `${fixed(x, decimals[0])}, ${fixed(y, decimals[1])}`;
  const data = String(values.data ?? '').replace(/\s+$/, '');
  return { ...values, data: data ? `${data}\n${text}` : text };
}

export default {
  id: 'scatter',
  name: 'Scatterplot',
  category: 'Statistics',
  description: 'Bivariate data with a least-squares or typed line, grid and axis breaks. Click the preview to add points.',
  schema,
  generate,
  onPreviewClick,
};
