// SPDX-License-Identifier: CC0-1.0
// Polynomial graph diagram module.
//
// Four ways to define the curve:
//   roots        y = a(x - r1)(x - r2)...   (exact labels from what you type)
//   expression   any formula in x, e.g. x^3 - 2x + 1 (works for non-polynomials too)
//   coefficients a_n, ..., a_1, a_0 (highest power first)
//   sketch       smooth curve through labelled points — no equation needed

import { parseExpression, parseConstant, splitList, formatPgfNumber } from '../lib/mathParser.js';
import { findRoots, findTurningPoints, fmt, clean } from '../lib/numeric.js';
import { TikzBuilder, n, pt, mathLabel } from '../lib/tikz.js';
import { monotoneSlopes, hermiteFunction } from '../lib/hermite.js';
import {
  windowFields,
  axesFields,
  curveStyleFields,
  labelFields,
  autoWindow,
  resolveWindow,
  scaleOptions,
  fontOption,
  findPieces,
  drawAxes,
  drawCurve,
  drawHermite,
  drawXIntercepts,
  drawYIntercept,
  drawTurningPoints,
  drawEquation,
  drawScaleTicks,
  drawCustomTicks,
  dotRadius,
  gridFields,
  drawGrid,
  curvePointFields,
  drawCurvePoints,
  asymptoteFields,
  drawAsymptotes,
  parseAsymptotes,
} from '../lib/functionGraph.js';
import { extraGraphFields, drawExtraGraphs, extraGraphFeatures } from '../lib/extraGraphs.js';

const MODES = [
  { value: 'roots', label: 'Roots and leading coefficient' },
  { value: 'expression', label: 'Typed equation' },
  { value: 'coefficients', label: 'Coefficients' },
  { value: 'sketch', label: 'Sketch through points' },
];

const isMode = (...m) => (v) => m.includes(v.mode);

const schema = [
  {
    type: 'group',
    label: 'Curve',
    fields: [
      { type: 'select', key: 'mode', label: 'Define the curve by', default: 'roots', options: MODES },
      {
        type: 'text',
        key: 'roots',
        label: 'Roots (x-intercepts)',
        default: '-4, 1, 3',
        help: 'Comma separated. Repeat a root for a touching point, e.g. 2, 2, -1. Fractions/surds OK: 1/2, sqrt(3).',
        showIf: isMode('roots'),
      },
      {
        type: 'text',
        key: 'leading',
        label: 'Leading coefficient a',
        default: '1',
        help: 'y = a(x - r₁)(x - r₂)…  Use a negative value to flip the curve.',
        showIf: isMode('roots'),
      },
      {
        type: 'text',
        key: 'expression',
        label: 'y =',
        default: 'x^3 - 7x + 6',
        help: 'e.g. 2x^3 - 3x^2 + 1, (x+2)^2(x-3), -x^4 + 5x^2 - 4. Trig uses radians.',
        showIf: isMode('expression'),
      },
      {
        type: 'text',
        key: 'coefficients',
        label: 'Coefficients (highest power first)',
        default: '1, 0, -13, 12',
        help: '1, 0, -13, 12 means x³ + 0x² - 13x + 12.',
        showIf: isMode('coefficients'),
      },
      {
        type: 'textarea',
        key: 'points',
        label: 'Points, one per line: x, y [, label]',
        rows: 8,
        default: '-4.6, -9\n-4, 0\n-2, 6\n1, 0\n2.2, -1.5\n3, 0\n3.6, 9',
        help:
          'Include the two curve ends and every turning point. A point higher/lower than both neighbours becomes a turning point. ' +
          'Points with y = 0 are labelled as x-intercepts; x = 0 as the y-intercept. Add a third value to set a custom label, e.g. 2, 0, a.',
        showIf: isMode('sketch'),
      },
      {
        type: 'select',
        key: 'endDots',
        label: 'Dots at curve ends',
        default: 'none',
        options: [
          { value: 'none', label: 'None (arrows, if turned on)' },
          { value: 'right', label: 'Right end' },
          { value: 'left', label: 'Left end' },
          { value: 'both', label: 'Both ends' },
        ],
        help: 'A dot replaces the arrow at that end.',
      },
      {
        type: 'select',
        key: 'plainEnds',
        label: 'Plain curve ends (no arrow or dot)',
        default: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'left', label: 'Left end' },
          { value: 'right', label: 'Right end' },
          { value: 'both', label: 'Both ends' },
        ],
        help: 'The curve simply stops at that end, e.g. a curve that starts on the y-axis.',
      },
      {
        type: 'text',
        key: 'domainFrom',
        label: 'Draw the curve from x =',
        default: '',
        placeholder: 'blank = left edge',
        showIf: isMode('roots', 'expression', 'coefficients'),
      },
      {
        type: 'text',
        key: 'domainTo',
        label: 'to x =',
        default: '',
        placeholder: 'blank = right edge',
        help: 'The curve stops here with no arrow, e.g. 0 to 1.43.',
        showIf: isMode('roots', 'expression', 'coefficients'),
      },
    ],
  },
  windowFields(),
  axesFields(),
  gridFields(),
  curveStyleFields(),
  labelFields(),
  curvePointFields(),
  asymptoteFields(),
  extraGraphFields(),
];

// ------------------------------------------------------------------ helpers

const plainAt = (values, side) => values.plainEnds === side || values.plainEnds === 'both';

function polyFromRoots(roots, a) {
  // coefficients highest power first
  let c = [a];
  for (const r of roots) {
    const next = new Array(c.length + 1).fill(0);
    for (let i = 0; i < c.length; i++) {
      next[i] += c[i];
      next[i + 1] -= r * c[i];
    }
    c = next;
  }
  return c;
}

function horner(coeffs) {
  return (x) => coeffs.reduce((acc, c) => acc * x + c, 0);
}

function hornerPgf(coeffs) {
  // ((a*\x + b)*\x + c)... avoids pgfmath powers of negative numbers
  let s = formatPgfNumber(coeffs[0]);
  for (let i = 1; i < coeffs.length; i++) {
    const c = coeffs[i];
    s = `(${s})*(\\x)`;
    if (c !== 0) s += `${c < 0 ? '-' : '+'}${formatPgfNumber(Math.abs(c))}`;
  }
  return s;
}

function termLatex(coeff, power, first) {
  if (coeff === 0) return '';
  const sign = coeff < 0 ? '-' : '+';
  const abs = Math.abs(coeff);
  const num = abs === 1 && power > 0 ? '' : fmt(abs, 6);
  const v = power === 0 ? '' : power === 1 ? 'x' : `x^{${power}}`;
  const body = num + v;
  if (first) return (coeff < 0 ? '-' : '') + body;
  return ` ${sign} ${body}`;
}

function polyLatex(coeffs) {
  const deg = coeffs.length - 1;
  let s = '';
  coeffs.forEach((c, i) => {
    s += termLatex(c, deg - i, s === '');
  });
  return s || '0';
}

function rootsLatex(rootInfo, a) {
  // group repeated roots: (x - 1)^2
  const groups = [];
  for (const r of rootInfo) {
    const g = groups.find((g) => Math.abs(g.value - r.value) < 1e-12);
    if (g) g.count++;
    else groups.push({ ...r, count: 1 });
  }
  let s = '';
  for (const g of groups) {
    let factor;
    if (g.value === 0) factor = 'x';
    else if (g.negative) factor = `(x + ${g.absLatex})`;
    else factor = `(x - ${g.latex})`;
    if (g.count > 1) factor = factor === 'x' ? `x^{${g.count}}` : `${factor}^{${g.count}}`;
    s += factor;
  }
  if (a.value === 1) return s || '1';
  if (a.value === -1) return `-${s}`;
  return `${a.latex}${s}`;
}

function rootsPgf(roots, a) {
  const factors = roots.map((r) =>
    r === 0 ? '(\\x)' : `(\\x${r < 0 ? '+' : '-'}${formatPgfNumber(Math.abs(r))})`
  );
  const lead = a === 1 ? '' : `${formatPgfNumber(a)}*`;
  return lead + (factors.join('*') || '1');
}

function parseList(src, what) {
  const items = splitList(src);
  if (!items.length) throw new Error(`Enter at least one ${what}.`);
  return items.map((s) => {
    try {
      return parseConstant(s);
    } catch (e) {
      throw new Error(`Could not read ${what} "${s}": ${e.message}`);
    }
  });
}

// ------------------------------------------------------------------ curve models

function buildModel(values) {
  switch (values.mode) {
    case 'roots': {
      const roots = parseList(values.roots, 'root');
      let a;
      try {
        a = parseConstant(values.leading || '1');
      } catch (e) {
        throw new Error(`Could not read the leading coefficient: ${e.message}`);
      }
      if (a.value === 0) throw new Error('The leading coefficient cannot be 0.');
      const rv = roots.map((r) => r.value);
      const coeffs = polyFromRoots(rv, a.value);
      const f = horner(coeffs);
      const uniq = [];
      for (const r of roots) if (!uniq.some((u) => Math.abs(u.value - r.value) < 1e-12)) uniq.push(r);
      return {
        f,
        pgf: roots.every((r) => r.simple) && a.simple ? rootsPgf(rv, a.value) : hornerPgf(coeffs),
        latex: rootsLatex(roots, a),
        roots: uniq.map((r) => ({ x: r.value, latex: r.latex })),
        exactRoots: true,
      };
    }
    case 'coefficients': {
      const cs = parseList(values.coefficients, 'coefficient').map((c) => c.value);
      while (cs.length > 1 && cs[0] === 0) cs.shift();
      return { f: horner(cs), pgf: hornerPgf(cs), latex: polyLatex(cs) };
    }
    case 'expression': {
      let e;
      try {
        e = parseExpression(values.expression);
      } catch (err) {
        throw new Error(`Could not read the equation: ${err.message}`);
      }
      return { f: e.evaluate, pgf: e.toPgf('\\x'), latex: e.toLatex() };
    }
  }
  throw new Error(`Unknown mode "${values.mode}"`);
}

// ------------------------------------------------------------------ generate

function generateFormula(values) {
  const warnings = [];
  const model = buildModel(values);
  const { f } = model;

  // features over a generous range for auto window
  const probe = () => {
    const R = 50;
    const roots = model.roots ?? findRoots(f, -R, R).map((x) => ({ x }));
    const xs = roots.map((r) => r.x);
    const tps = findTurningPoints(f, -R, R);
    return { roots, tps, xs: [...xs, ...tps.map((t) => t.x)] };
  };
  const pre = probe();
  const extra = extraGraphFeatures(values, f);
  for (const a of parseAsymptotes(values.asymptotes)) (a.axis === 'x' ? extra.xs : extra.ys).push(a.value);

  const win = resolveWindow(values, () =>
    autoWindow({
      xs: [...pre.xs, ...extra.xs],
      ys: [...pre.tps.map((t) => t.y), f(0), ...extra.ys].filter(isFinite),
      f: pre.tps.length ? null : f,
    })
  );

  // optional range for the curve ("Draw the curve from x = … to …")
  const bound = (text, name) => {
    if (String(text ?? '').trim() === '') return null;
    try {
      return parseConstant(String(text).replace(/√/g, 'sqrt')).value;
    } catch (e) {
      throw new Error(`Could not read "${text}" for the curve's ${name}: ${e.message}`);
    }
  };
  const from = bound(values.domainFrom, 'start');
  const to = bound(values.domainTo, 'end');
  if (from !== null && to !== null && from >= to) throw new Error('The curve must start before it ends.');
  const lo = Math.max(win.xmin, from ?? -Infinity);
  const hi = Math.min(win.xmax, to ?? Infinity);
  const inRange = (x) => x >= lo && x <= hi;

  const roots = (model.roots ?? findRoots(f, win.xmin, win.xmax).map((x) => ({ x }))).filter((r) => inRange(r.x));
  const tps = hi > lo ? findTurningPoints(f, lo, hi) : [];
  const pieces = hi > lo ? findPieces(f, { ...win, xmin: lo, xmax: hi }) : [];
  for (const p of pieces) {
    // the curve deliberately stops at a chosen end: no arrow there
    if (from !== null && Math.abs(p.a - from) < 1e-9) p.startArrow = false;
    if (to !== null && Math.abs(p.b - to) < 1e-9) p.endArrow = false;
  }
  const endDots = [];
  if (pieces.length) {
    if (plainAt(values, 'left')) pieces[0].startArrow = false;
    if (plainAt(values, 'right')) pieces[pieces.length - 1].endArrow = false;
    if (values.endDots === 'left' || values.endDots === 'both') {
      pieces[0].startArrow = false;
      endDots.push(pieces[0].a);
    }
    if (values.endDots === 'right' || values.endDots === 'both') {
      pieces[pieces.length - 1].endArrow = false;
      endDots.push(pieces[pieces.length - 1].b);
    }
  }
  if (!pieces.length) warnings.push('The curve is not visible in this window.');

  const maxAbs = Math.max(Math.abs(win.ymin), Math.abs(win.ymax));
  const method = values.plotMethod;
  if (method === 'pgf' && maxAbs > 8000) {
    warnings.push('Large y-values can overflow TikZ maths. Switch "Plot method" to pre-computed coordinates if rendering fails.');
  }

  const { options, xUnit, yUnit } = scaleOptions(win, values);
  const b = new TikzBuilder();
  b.comment(`y = ${model.latex}`);
  warnings.push(...drawGrid(b, win, values));
  const asym = drawAsymptotes(b, win, values, f);
  warnings.push(...asym.warnings);
  warnings.push(...drawAxes(b, win, values));
  const skip = {
    skipX: [...(values.labelX ? roots.map((r) => r.x) : []), ...asym.skipX],
    skipY: [...(values.labelY ? [f(0)] : []), ...asym.skipY],
  };
  warnings.push(...drawScaleTicks(b, win, values, skip));
  warnings.push(...drawCustomTicks(b, win, values, skip));
  drawCurve(b, pieces, values, { pgfExpr: model.pgf, f, method });
  if (endDots.length) {
    b.comment('dots at curve ends');
    for (const x of endDots) b.add(`\\fill ${pt(x, f(x))} circle[radius=${dotRadius(values)}];`);
  }
  drawXIntercepts(b, roots, f, values, win);
  if (inRange(0)) drawYIntercept(b, f, values, win);
  drawTurningPoints(b, tps, values, win, { xUnit, yUnit });
  warnings.push(...drawCurvePoints(b, f, win, values, { xUnit, yUnit }));
  drawEquation(b, model.latex, f, pieces, values);
  warnings.push(...drawExtraGraphs(b, win, values, { main: { f, lo, hi }, xUnit, yUnit }));

  return { code: b.toString([...options, fontOption(values)]), warnings };
}

function parsePoints(src) {
  const pts = [];
  String(src ?? '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim());
      if (parts.length < 2) throw new Error(`Line ${i + 1}: expected "x, y" but got "${line}"`);
      let x, y;
      try {
        x = parseConstant(parts[0]);
        y = parseConstant(parts[1]);
      } catch (e) {
        throw new Error(`Line ${i + 1}: ${e.message}`);
      }
      pts.push({ x: x.value, y: y.value, xLatex: x.latex, yLatex: y.latex, label: parts.slice(2).join(',').trim() });
    });
  pts.sort((a, b) => a.x - b.x);
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x === pts[i - 1].x) throw new Error(`Two points have the same x value (${pts[i].xLatex}).`);
  }
  if (pts.length < 2) throw new Error('Enter at least two points.');
  return pts;
}

function generateSketch(values) {
  const warnings = [];
  const pts = parsePoints(values.points);
  const slopes = monotoneSlopes(pts);
  const f = hermiteFunction(pts, slopes);

  const win = resolveWindow(values, () => {
    const asy = parseAsymptotes(values.asymptotes);
    const xs = [...pts.map((p) => p.x), ...asy.filter((a) => a.axis === 'x').map((a) => a.value)];
    const ys = [...pts.map((p) => p.y), ...asy.filter((a) => a.axis === 'y').map((a) => a.value)];
    const pad = (arr) => {
      const lo = Math.min(0, ...arr);
      const hi = Math.max(0, ...arr);
      const s = Math.max(hi - lo, 1) * 0.12;
      return [Math.floor((lo - s) * 10) / 10, Math.ceil((hi + s) * 10) / 10];
    };
    const [xmin, xmax] = pad(xs);
    const [ymin, ymax] = pad(ys);
    return { xmin, xmax, ymin, ymax };
  });
  if (pts.some((p) => p.x < win.xmin || p.x > win.xmax || p.y < win.ymin || p.y > win.ymax)) {
    warnings.push('Some points are outside the axes range.');
  }

  const roots = [];
  const tps = [];
  const custom = [];
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    const next = pts[i + 1];
    const isTp = prev && next && ((p.y > prev.y && p.y > next.y) || (p.y < prev.y && p.y < next.y));
    if (p.label) custom.push({ ...p, kind: isTp ? (p.y > prev.y ? 'max' : 'min') : null, slope: slopes[i] });
    else if (Math.abs(p.y) < 1e-12) roots.push({ x: p.x, latex: p.xLatex, slope: slopes[i] });
    else if (isTp) tps.push({ x: p.x, y: p.y, kind: p.y > prev.y ? 'max' : 'min', xLatex: p.xLatex, yLatex: p.yLatex });
  });
  const yPoint = pts.find((p) => Math.abs(p.x) < 1e-12 && !p.label);

  const { options, xUnit, yUnit } = scaleOptions(win, values);
  const b = new TikzBuilder();
  warnings.push(...drawGrid(b, win, values));
  const asym = drawAsymptotes(b, win, values, f);
  warnings.push(...asym.warnings);
  warnings.push(...drawAxes(b, win, values));
  const skip = {
    skipX: [
      ...(values.labelX ? roots.map((r) => r.x) : []),
      ...custom.filter((p) => Math.abs(p.y) < 1e-12).map((p) => p.x),
      ...asym.skipX,
    ],
    skipY: [...(yPoint && values.labelY ? [yPoint.y] : []), ...asym.skipY],
  };
  warnings.push(...drawScaleTicks(b, win, values, skip));
  warnings.push(...drawCustomTicks(b, win, values, skip));
  drawHermite(b, pts, slopes, values, {
    startDot: values.endDots === 'left' || values.endDots === 'both',
    endDot: values.endDots === 'right' || values.endDots === 'both',
    startArrow: !plainAt(values, 'left'),
    endArrow: !plainAt(values, 'right'),
  });
  drawXIntercepts(b, roots, f, values, win);
  if (yPoint) drawYIntercept(b, f, values, win, { latex: yPoint.yLatex, slope: slopes[pts.indexOf(yPoint)] });
  drawTurningPoints(b, tps, values, win, { xUnit, yUnit });
  warnings.push(...drawCurvePoints(b, f, win, values, { xUnit, yUnit }));
  warnings.push(
    ...drawExtraGraphs(b, win, values, { main: { f, lo: pts[0].x, hi: pts[pts.length - 1].x }, xUnit, yUnit })
  );

  if (custom.length) {
    b.comment('custom labels');
    for (const p of custom) {
      let anchor;
      if (p.kind === 'max') anchor = 'south';
      else if (p.kind === 'min') anchor = 'north';
      else if (Math.abs(p.y) < 1e-12) anchor = p.slope > 0 ? 'north west' : p.slope < 0 ? 'north east' : 'north';
      else if (Math.abs(p.x) < 1e-12) anchor = p.slope < 0 ? 'south west' : 'south east';
      else anchor = p.slope >= 0 ? 'south east' : 'south west';
      if (Math.abs(p.y) < 1e-12 && values.ticks) b.add(`\\draw[${values.axisWidth || 'thin'}] ${pt(p.x, 0)} -- ++(0,-3pt);`);
      if (values.interceptDots || values.tpDots) b.add(`\\fill ${pt(p.x, p.y)} circle[radius=${dotRadius(values)}];`);
      b.add(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(p.x, p.y)} {${mathLabel(p.label)}};`);
    }
  }

  return { code: b.toString([...options, fontOption(values)]), warnings };
}

export default {
  id: 'polynomial',
  name: 'Polynomial graph',
  category: 'Function graphs',
  description: 'Cubic, quartic and other polynomial curves with labelled intercepts and turning points.',
  schema,
  generate(values) {
    return values.mode === 'sketch' ? generateSketch(values) : generateFormula(values);
  },
};

// exported for tests
export const _internal = { polyFromRoots, hornerPgf, polyLatex, rootsLatex, parsePoints, buildModel, n, clean };
