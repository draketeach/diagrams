// SPDX-License-Identifier: CC0-1.0
// Sketch graphs: a smooth curve through points, with no equation needed.
// One point per line:  x, y [, gradient] [: label]
//
//   0, -1.24
//   2, -2.35, 0        gradient 0 there (a turning point)
//   4.13, 0, 3         passes through with gradient 3
//   6, 4 : P           labelled P
//
// Points without a gradient get one automatically: a point higher or lower
// than both neighbours is a turning point; others follow the curve smoothly.

import { parseConstant } from '../lib/mathParser.js';
import { TikzBuilder, pt, mathLabel } from '../lib/tikz.js';
import { sketchSlopes, hermiteFunction } from '../lib/hermite.js';
import { parseGraphList } from '../lib/graphList.js';
import { drawExtraGraphs, extraGraphFeatures } from '../lib/extraGraphs.js';
import {
  resolveWindow,
  scaleOptions,
  fontOption,
  drawAxes,
  drawHermite,
  drawXIntercepts,
  drawYIntercept,
  drawTurningPoints,
  drawScaleTicks,
  drawCustomTicks,
  dotRadius,
  drawGrid,
  drawCurvePoints,
  drawAsymptotes,
  parseAsymptotes,
  drawNotToScale,
} from '../lib/functionGraph.js';
import { curveEndFields, basicLabelFields, moreOptions, legacyValues, GRAPH_EXAMPLES, POINT_EXAMPLES } from '../lib/graphOptions.js';

const schema = [
  {
    type: 'group',
    label: 'Sketch',
    fields: [
      {
        type: 'textarea',
        key: 'points',
        label: 'Points, one per line',
        rows: 7,
        default: '-4.6, -9\n-4, 0\n-2, 6, 0\n1, 0\n2.2, -1.5, 0\n3, 0\n3.6, 9',
        help: 'x, y — or x, y, gradient. Press ? for examples.',
        examples: POINT_EXAMPLES,
      },
      ...basicLabelFields(),
    ],
  },
  moreOptions({
    curve: [curveEndFields()],
    lines: [
      {
        type: 'textarea',
        key: 'otherGraphs',
        label: 'Other graphs, one per line',
        rows: 2,
        default: '',
        placeholder: 'e.g. y = 6 - 3x; dashed',
        examples: GRAPH_EXAMPLES,
      },
    ],
    meet: [
      { type: 'checkbox', key: 'extraDots', label: 'Dots where graphs cross', default: false },
      { type: 'checkbox', key: 'extraCrossCoords', label: 'Coordinates where graphs cross', default: false },
      { type: 'checkbox', key: 'extraIntercepts', label: "Label the other graphs' axis intercepts", default: false },
    ],
  }),
];

/** Parse "x, y [, gradient] [: label]" lines, sorted by x. */
export function parsePoints(src) {
  const pts = [];
  String(src ?? '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const colon = line.indexOf(':');
      const label = colon >= 0 ? line.slice(colon + 1).trim() : '';
      const parts = (colon >= 0 ? line.slice(0, colon) : line).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim());
      if (parts.length < 2 || parts.length > 3 || parts.some((p) => !p)) {
        throw new Error(`Line ${i + 1}: expected "x, y" or "x, y, gradient" but got "${line}"`);
      }
      const num = (t, what) => {
        try {
          return parseConstant(t.replace(/√/g, 'sqrt'));
        } catch (e) {
          throw new Error(`Line ${i + 1}: could not read the ${what} "${t}" (${e.message})`);
        }
      };
      const x = num(parts[0], 'x value');
      const y = num(parts[1], 'y value');
      const m = parts[2] !== undefined ? num(parts[2], 'gradient').value : null;
      pts.push({ x: x.value, y: y.value, xLatex: x.latex, yLatex: y.latex, gradient: m, label });
    });
  pts.sort((a, b) => a.x - b.x);
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x === pts[i - 1].x) throw new Error(`Two points have the same x value (${pts[i].xLatex}).`);
  }
  if (pts.length < 2) throw new Error('Enter at least two points.');
  return pts;
}

/** Slopes: the given gradients, and smooth automatic ones elsewhere. */
export function pointSlopes(pts) {
  const auto = sketchSlopes(pts);
  return pts.map((p, i) => (p.gradient !== null ? p.gradient : auto[i]));
}

function generate(input) {
  const values = legacyValues(input);
  const warnings = [];
  const pts = parsePoints(values.points);
  const slopes = pointSlopes(pts);
  const f = hermiteFunction(pts, slopes);
  const others = parseGraphList(values.otherGraphs);

  const win = resolveWindow(values, () => {
    const asy = parseAsymptotes(values.asymptotes);
    const extra = extraGraphFeatures(others, f);
    const xs = [...pts.map((p) => p.x), ...asy.filter((a) => a.axis === 'x').map((a) => a.value), ...extra.xs];
    const ys = [...pts.map((p) => p.y), ...asy.filter((a) => a.axis === 'y').map((a) => a.value), ...extra.ys];
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

  // what each point is: a root, the y-intercept, a turning point, or labelled
  const roots = [];
  const tps = [];
  const custom = [];
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    const next = pts[i + 1];
    const extreme = prev && next && ((p.y > prev.y && p.y > next.y) || (p.y < prev.y && p.y < next.y));
    const isTp = extreme && Math.abs(slopes[i]) < 1e-12;
    const kind = isTp ? (p.y > prev.y ? 'max' : 'min') : null;
    if (p.label) custom.push({ ...p, kind, slope: slopes[i] });
    else if (Math.abs(p.y) < 1e-12) roots.push({ x: p.x, latex: p.xLatex, slope: slopes[i] });
    else if (isTp) tps.push({ x: p.x, y: p.y, kind, xLatex: p.xLatex, yLatex: p.yLatex });
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
    startDot: values.leftEnd === 'dot',
    endDot: values.rightEnd === 'dot',
    startArrow: values.leftEnd === 'arrow' || !values.leftEnd,
    endArrow: values.rightEnd === 'arrow' || !values.rightEnd,
  });
  drawXIntercepts(b, roots, f, values, win);
  if (yPoint) drawYIntercept(b, f, values, win, { latex: yPoint.yLatex, slope: slopes[pts.indexOf(yPoint)] });
  drawTurningPoints(b, tps, values, win, { xUnit, yUnit });
  warnings.push(...drawCurvePoints(b, f, win, values, { xUnit, yUnit }));
  warnings.push(
    ...drawExtraGraphs(b, win, values, {
      graphs: others,
      main: { f, lo: pts[0].x, hi: pts[pts.length - 1].x },
      xUnit,
      yUnit,
    })
  );

  if (custom.length) {
    b.comment('labelled points');
    for (const p of custom) {
      let anchor;
      if (p.kind === 'max') anchor = 'south';
      else if (p.kind === 'min') anchor = 'north';
      else if (Math.abs(p.y) < 1e-12) anchor = p.slope > 0 ? 'north west' : p.slope < 0 ? 'north east' : 'north';
      else if (Math.abs(p.x) < 1e-12) anchor = p.slope < 0 ? 'south west' : 'south east';
      else anchor = p.slope >= 0 ? 'south east' : 'south west';
      if (Math.abs(p.y) < 1e-12 && values.ticks) b.add(`\\draw[${values.axisWidth || 'thin'}] ${pt(p.x, 0)} -- ++(0,-3pt);`);
      if (values.pointDots) b.add(`\\fill ${pt(p.x, p.y)} circle[radius=${dotRadius(values)}];`);
      b.add(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(p.x, p.y)} {${mathLabel(p.label)}};`);
    }
  }

  drawNotToScale(b, win, values);
  return { code: b.toString([...options, fontOption(values)]), warnings };
}

export default {
  id: 'sketch',
  name: 'Sketch graph',
  category: 'Function graphs',
  description: 'A smooth curve through points (with optional gradients), when there is no equation.',
  schema,
  generate,
};
