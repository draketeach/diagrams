// SPDX-License-Identifier: CC0-1.0
// Piecewise function diagram module.
//
// Pieces are typed in exam notation, one per line (see lib/piecewiseParser.js):
//   x/4, 0 <= x <= 2sqrt(2)
//   0, otherwise
// Endpoints get filled dots for ≤ / ≥ and open dots for < / >. Also supports
// shading under the graph and dashed asymptotes.

import { parsePiecewise, piecewiseFunction } from '../lib/piecewiseParser.js';
import { parseConstant } from '../lib/mathParser.js';
import { findTurningPoints, niceLatex } from '../lib/numeric.js';
import { TikzBuilder, n, pt, mathLabel, arrowSpec, FONT_SIZES } from '../lib/tikz.js';
import {
  windowFields,
  axesFields,
  curveStyleFields,
  curvePointFields,
  autoWindow,
  resolveWindow,
  scaleOptions,
  fontOption,
  findPieces,
  drawAxes,
  drawCurve,
  drawScaleTicks,
  drawCustomTicks,
  drawCurvePoints,
} from '../lib/functionGraph.js';

/** Copy a schema group with some field defaults changed. */
function withDefaults(group, defaults) {
  return {
    ...group,
    fields: group.fields.map((f) => (f.key in defaults ? { ...f, default: defaults[f.key] } : f)),
  };
}

const schema = [
  {
    type: 'group',
    label: 'Function',
    fields: [
      {
        type: 'textarea',
        key: 'pieces',
        label: 'Pieces, one per line',
        rows: 5,
        default: 'x/4, 0 <= x <= 2sqrt(2)\n0, otherwise',
        help:
          'Write each piece as "formula, condition", e.g. "x^2, 0 <= x < 2", "3, x = 2", "1/x, x > 0" or "0, otherwise". ' +
          '≤ gives a filled dot, < an open dot. Interval notation works too: "x in [0, 2)".',
      },
    ],
  },
  withDefaults(windowFields(), { width: 9, height: 4 }),
  withDefaults(axesFields(), { xCustomTicks: '2' }),
  withDefaults(curveStyleFields(), { curveWidth: 'thick' }),
  {
    type: 'group',
    label: 'Dots & labels',
    collapsed: true,
    fields: [
      {
        type: 'select',
        key: 'dotSize',
        label: 'Dot size',
        default: '2pt',
        options: [
          { value: '1.5pt', label: 'Small' },
          { value: '2pt', label: 'Medium' },
          { value: '2.5pt', label: 'Large' },
        ],
      },
      {
        type: 'checkbox',
        key: 'joinDots',
        label: 'Dots where pieces join without a gap',
        default: true,
        help: 'Untick to draw a continuous join (like at O) as one smooth line with no dot.',
      },
      { type: 'checkbox', key: 'labelEnds', label: 'Label endpoints on the x-axis', default: true },
      { type: 'checkbox', key: 'labelHeights', label: 'Label dot heights on the y-axis', default: true },
      { type: 'checkbox', key: 'endTicks', label: 'Tick marks for these labels', default: true },
      { type: 'checkbox', key: 'guideLines', label: 'Dashed lines from dots to the axes', default: false },
      { type: 'number', key: 'dp', label: 'Decimal places', default: 2, min: 0, max: 6, step: 1 },
      { type: 'checkbox', key: 'exact', label: 'Exact values where possible', default: true },
      { type: 'select', key: 'fontSize', label: 'Label font size', default: '', options: FONT_SIZES },
    ],
  },
  {
    type: 'group',
    label: 'Shading',
    collapsed: true,
    fields: [
      {
        type: 'text',
        key: 'shade',
        label: 'Shade under the graph from … to …',
        default: '',
        placeholder: 'e.g. 1 to 2  (several: 0 to 1; 2 to 3)',
        help: 'Shades between the graph and the x-axis, e.g. for a probability P(1 ≤ X ≤ 2).',
      },
      {
        type: 'select',
        key: 'shadeColour',
        label: 'Shade',
        default: 'gray!25',
        options: [
          { value: 'gray!15', label: 'Very light grey' },
          { value: 'gray!25', label: 'Light grey' },
          { value: 'gray!45', label: 'Mid grey' },
        ],
      },
    ],
  },
  {
    type: 'group',
    label: 'Asymptotes',
    collapsed: true,
    fields: [
      {
        type: 'text',
        key: 'asymptotes',
        label: 'Dashed asymptotes',
        default: '',
        placeholder: 'e.g. x = 0, y = 1',
      },
      { type: 'checkbox', key: 'labelAsymptotes', label: 'Label asymptotes (e.g. x = 2)', default: false },
    ],
  },
  curvePointFields(),
];

// ------------------------------------------------------------------ helpers

const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function isLinear(f, a, b) {
  const lo = isFinite(a) ? a : (isFinite(b) ? b : 0) - 10;
  const hi = isFinite(b) ? b : lo + 10;
  if (!(hi > lo)) return false;
  const xs = [lo, (2 * lo + hi) / 3, (lo + 2 * hi) / 3, hi];
  const ys = xs.map(f);
  if (!ys.every(isFinite)) return false;
  const m = (ys[3] - ys[0]) / (hi - lo);
  return ys.every((y, i) => Math.abs(y - (ys[0] + m * (xs[i] - lo))) < 1e-9 * (1 + Math.abs(y)));
}

function parseShades(src) {
  return String(src ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(/\s+to\s+|,/i).map((t) => t.trim());
      if (parts.length !== 2) throw new Error(`Shading "${s}" should look like "1 to 2"`);
      const [a, b] = parts.map((t) => parseConstant(t.replace(/√/g, 'sqrt')).value);
      return a < b ? [a, b] : [b, a];
    });
}

function parseAsymptotes(src) {
  return String(src ?? '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^([xy])\s*=\s*(.+)$/i);
      if (!m) throw new Error(`Asymptote "${s}" should look like "x = 2" or "y = 1"`);
      const c = parseConstant(m[2].replace(/√/g, 'sqrt'));
      return { axis: m[1].toLowerCase(), value: c.value, latex: c.latex };
    });
}

// ------------------------------------------------------------------ generate

function generate(values) {
  const warnings = [];
  const pieces = parsePiecewise(values.pieces);
  const f = piecewiseFunction(pieces);
  const asymptotes = parseAsymptotes(values.asymptotes);
  const shades = parseShades(values.shade);

  // ---- key points for the automatic window
  const ends = [];
  for (const p of pieces) {
    for (const [x, inc] of [[p.a, p.aInc], [p.b, p.bInc]]) {
      if (isFinite(x)) ends.push({ x, y: p.expr.evaluate(x), inc, piece: p });
    }
  }
  const xs = [...ends.map((e) => e.x), ...asymptotes.filter((a) => a.axis === 'x').map((a) => a.value)];
  const ys = [...ends.map((e) => e.y), ...asymptotes.filter((a) => a.axis === 'y').map((a) => a.value)].filter(isFinite);
  for (const p of pieces) {
    if (p.point) continue;
    const lo = Math.max(p.a, -50);
    const hi = Math.min(p.b, 50);
    if (hi > lo) ys.push(...findTurningPoints(p.expr.evaluate, lo, hi, 1000).map((t) => t.y));
  }
  const win = resolveWindow(values, () => autoWindow({ xs, ys, f: ys.length < 3 ? f : null }));
  const inWin = (x, y) => x >= win.xmin && x <= win.xmax && y >= win.ymin && y <= win.ymax;

  // ---- dots: filled for included ends, open for excluded ends
  const R = values.dotSize || '2pt';
  const dotMap = new Map();
  const addDot = (x, y, filled, source) => {
    if (!isFinite(y) || !inWin(x, y)) return;
    const key = `${n(x, 6)},${n(y, 6)}`;
    const d = dotMap.get(key) || { x, y, filled: false, sources: new Set() };
    d.filled = d.filled || filled;
    d.sources.add(source);
    dotMap.set(key, d);
  };
  pieces.forEach((p, i) => {
    if (p.point) {
      const y = p.expr.evaluate(p.a);
      addDot(p.a, y, true, i);
      // a point defined separately leaves a hole in any piece running through it
      pieces.forEach((q, j) => {
        if (!q.point && q.a < p.a && p.a < q.b) addDot(p.a, q.expr.evaluate(p.a), false, j);
      });
      return;
    }
    if (isFinite(p.a)) addDot(p.a, p.expr.evaluate(p.a), p.aInc, i);
    if (isFinite(p.b)) addDot(p.b, p.expr.evaluate(p.b), p.bInc, i);
  });
  let dots = [...dotMap.values()];
  if (!values.joinDots) {
    // a continuous join between two pieces needs no dot
    dots = dots.filter((d) => !(d.filled && d.sources.size > 1));
  }

  // ---- build the picture
  const { options, xUnit, yUnit } = scaleOptions(win, values);
  const b = new TikzBuilder();

  if (shades.length) {
    b.comment('shading');
    for (const [s, t] of shades) {
      const coords = [pt(s, 0)];
      for (const p of pieces) {
        if (p.point) continue;
        const lo = Math.max(s, p.a, win.xmin);
        const hi = Math.min(t, p.b, win.xmax);
        if (!(hi > lo)) continue;
        const N = 60;
        for (let i = 0; i <= N; i++) {
          const x = lo + ((hi - lo) * i) / N;
          const y = p.expr.evaluate(x);
          if (isFinite(y)) coords.push(pt(x, Math.max(win.ymin, Math.min(win.ymax, y))));
        }
      }
      coords.push(pt(t, 0));
      const rows = [];
      for (let i = 0; i < coords.length; i += 6) rows.push('    ' + coords.slice(i, i + 6).join(' -- '));
      b.add(`\\fill[${values.shadeColour || 'gray!25'}] ${rows.join(' --\n').trim()} -- cycle;`);
    }
  }

  if (asymptotes.length) {
    b.comment('asymptotes');
    for (const a of asymptotes) {
      if (a.axis === 'x') {
        if (a.value < win.xmin || a.value > win.xmax) continue;
        // label at the bottom of the line, clear of the axis label at the top
        const label = values.labelAsymptotes ? ` node[pos=0, anchor=south west, inner sep=2pt] {$x = ${a.latex}$}` : '';
        b.add(`\\draw[dashed, ${values.axisWidth || 'thin'}] ${pt(a.value, win.ymin)} -- ${pt(a.value, win.ymax)}${label};`);
      } else {
        if (a.value < win.ymin || a.value > win.ymax) continue;
        // label at the left end, above the line
        const label = values.labelAsymptotes ? ` node[pos=0, anchor=south west, inner sep=2pt] {$y = ${a.latex}$}` : '';
        b.add(`\\draw[dashed, ${values.axisWidth || 'thin'}] ${pt(win.xmin, a.value)} -- ${pt(win.xmax, a.value)}${label};`);
      }
    }
  }

  warnings.push(...drawAxes(b, win, values));

  // ---- labels on the axes for endpoints and dot heights
  const labelX = [];
  const labelY = [];
  const tickWidth = values.axisWidth || 'thin';
  const labelLines = [];
  if (values.labelEnds && win.ymin <= 0 && win.ymax >= 0) {
    const seen = [];
    for (const e of ends) {
      if (near(e.x, 0) || seen.some((s) => near(s, e.x)) || e.x < win.xmin || e.x > win.xmax) continue;
      seen.push(e.x);
      const latex = e.x === e.piece.a ? e.piece.aLatex : e.piece.bLatex;
      const dotsHere = dots.filter((d) => near(d.x, e.x));
      const above = dotsHere.length > 0 && dotsHere.every((d) => d.y < 0);
      const onAxis = dotsHere.some((d) => near(d.y, 0));
      const shift = onAxis ? `, yshift=${above ? '' : '-'}${R}` : '';
      if (values.endTicks) labelLines.push(`\\draw[${tickWidth}] ${pt(e.x, 0)} -- ++(0,${above ? '' : '-'}3pt);`);
      labelLines.push(`\\node[anchor=${above ? 'south' : 'north'}, inner sep=2pt${shift}] at ${pt(e.x, 0)} {${mathLabel(latex)}};`);
      labelX.push(e.x);
    }
  }
  if (values.labelHeights && win.xmin <= 0 && win.xmax >= 0) {
    const seen = [];
    for (const d of dots) {
      if (near(d.y, 0) || seen.some((s) => near(s, d.y))) continue;
      seen.push(d.y);
      const right = dots.filter((e) => near(e.y, d.y)).every((e) => e.x < 0);
      if (values.endTicks) labelLines.push(`\\draw[${tickWidth}] ${pt(0, d.y)} -- ++(${right ? '' : '-'}3pt,0);`);
      labelLines.push(
        `\\node[anchor=${right ? 'west' : 'east'}, inner sep=2pt, xshift=${right ? '' : '-'}2pt] at ${pt(0, d.y)} {${mathLabel(niceLatex(d.y, values.dp ?? 2, values.exact))}};`
      );
      labelY.push(d.y);
    }
  }
  if (values.guideLines) {
    for (const d of dots) {
      if (near(d.y, 0) && near(d.x, 0)) continue;
      const path = near(d.y, 0) ? '' : near(d.x, 0) ? '' : `${pt(d.x, 0)} -- ${pt(d.x, d.y)} -- ${pt(0, d.y)}`;
      if (path) labelLines.unshift(`\\draw[dashed, ${tickWidth}] ${path};`);
    }
  }
  if (labelLines.length) {
    b.comment('endpoint labels');
    labelLines.forEach((l) => b.add(l));
  }
  warnings.push(...drawScaleTicks(b, win, values, { skipX: labelX, skipY: labelY }));
  warnings.push(...drawCustomTicks(b, win, values, { skipX: labelX, skipY: labelY }));

  // ---- the pieces
  b.comment('pieces');
  let visible = 0;
  for (const p of pieces) {
    if (p.point) continue;
    const lo = Math.max(p.a, win.xmin);
    const hi = Math.min(p.b, win.xmax);
    if (!(hi > lo)) continue;
    const g = p.expr.evaluate;
    const subs = findPieces(g, { xmin: lo, xmax: hi, ymin: win.ymin, ymax: win.ymax }, 1000);
    for (const s of subs) {
      // a finite end of the piece gets a dot, not an arrow
      if (isFinite(p.a) && near(s.a, p.a)) s.startArrow = false;
      if (isFinite(p.b) && near(s.b, p.b)) s.endArrow = false;
    }
    visible += subs.length;
    if (isLinear(g, p.a, p.b)) {
      for (const s of subs) {
        const style = [values.curveWidth, arrowSpec(values.curveArrow, s.startArrow, s.endArrow)].filter(Boolean).join(', ');
        b.add(`\\draw[${style}] ${pt(s.a, g(s.a))} -- ${pt(s.b, g(s.b))};`);
      }
    } else {
      drawCurve(b, subs, values, { pgfExpr: p.expr.toPgf('\\x'), f: g, method: values.plotMethod });
    }
  }
  if (!visible && !dots.length) warnings.push('None of the pieces are visible in this window.');

  // ---- dots on top of the lines (open dots are white inside)
  if (dots.length) {
    b.comment('endpoint dots');
    for (const d of dots) {
      b.add(
        d.filled
          ? `\\fill ${pt(d.x, d.y)} circle[radius=${R}];`
          : `\\draw[${values.curveWidth || 'thick'}, fill=white] ${pt(d.x, d.y)} circle[radius=${R}];`
      );
    }
  }

  warnings.push(...drawCurvePoints(b, f, win, values, { xUnit, yUnit }));

  return { code: b.toString([...options, fontOption(values)]), warnings };
}

export default {
  id: 'piecewise',
  name: 'Piecewise function',
  category: 'Function graphs',
  description: 'Hybrid functions, probability density functions and step functions, with open and closed endpoints.',
  schema,
  generate,
};
