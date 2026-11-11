// SPDX-License-Identifier: CC0-1.0
// Slope fields for first-order differential equations dy/dx = f(x, y):
// a segment (or arrow) at each grid point with gradient f(x, y), labelled
// points, solution curves through chosen points (Runge–Kutta), and isoclines
// (where dy/dx takes a chosen value).

import { parseExpression, parseConstant } from '../lib/mathParser.js';
import { TikzBuilder, n, pt, mathLabel, LINE_WIDTHS } from '../lib/tikz.js';
import {
  scaleOptions,
  fontOption,
  drawAxes,
  drawScaleTicks,
  drawCustomTicks,
  dotRadius,
  drawNotToScale,
  NOT_TO_SCALE_FIELD,
} from '../lib/functionGraph.js';
import { field, row, group } from '../lib/graphOptions.js';

const EQ_EXAMPLES = {
  rows: [
    ['x - y', 'dy/dx = x − y'],
    ['xy/4', 'Products: 2x, xy, x(y − 1)'],
    ['-y/2', 'Depends on y only: the same in each row'],
    ['sin(x) + cos(y)', 'sin cos tan, sqrt, ln, e^, |x|'],
    ['-sgn(y) e^(-x^2/68)', 'sgn(y) is −1, 0 or 1'],
  ],
  notes: ['Type the right-hand side of dy/dx = f(x, y), in x and y.'],
};

const POINT_EXAMPLES = {
  rows: [
    ['4.8, 5 : A', 'A dot at (4.8, 5) labelled A'],
    ['-2, -4', 'An unlabelled dot'],
  ],
  notes: ['One point per line. Solution curves can be drawn through them.'],
};

const schema = [
  {
    type: 'group',
    label: 'Differential equation',
    fields: [
      {
        type: 'text',
        key: 'equation',
        label: 'dy/dx =',
        default: 'x - y',
        placeholder: 'e.g. x - y',
        examples: EQ_EXAMPLES,
      },
      {
        type: 'textarea',
        key: 'points',
        label: 'Points, one per line',
        rows: 3,
        default: '2, 3 : A\n-3, 1 : B',
        placeholder: 'x, y : label',
        examples: POINT_EXAMPLES,
      },
      {
        type: 'select',
        key: 'solutions',
        label: 'Solution curves through the points',
        default: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
        ],
      },
      { type: 'text', key: 'isoclines', label: 'Isoclines (dotted) where dy/dx =', default: '', placeholder: 'e.g. 0, 1' },
    ],
  },
  {
    type: 'group',
    label: 'More options',
    collapsed: true,
    fields: [
      group('Field', [
        row(
          { type: 'number', key: 'dx', label: 'x spacing', default: 1, step: 0.25, min: 0.05 },
          { type: 'number', key: 'dy', label: 'y spacing', default: 1, step: 0.25, min: 0.05 }
        ),
        row(
          { type: 'number', key: 'segLength', label: 'Segment length', default: 0.7, step: 0.05, min: 0.1, max: 1, help: 'As a fraction of the spacing.' },
          { type: 'select', key: 'segWidth', label: 'Line width', default: 'thin', options: LINE_WIDTHS }
        ),
        row(
          { type: 'checkbox', key: 'arrows', label: 'Arrowheads', default: false },
          { type: 'checkbox', key: 'skipAxes', label: 'None on the axes', default: false }
        ),
        row(
          { type: 'number', key: 'fxmin', label: 'Field from x', default: -5, step: 0.5 },
          { type: 'number', key: 'fxmax', label: 'to x', default: 5, step: 0.5 }
        ),
        row(
          { type: 'number', key: 'fymin', label: 'Field from y', default: -5, step: 0.5 },
          { type: 'number', key: 'fymax', label: 'to y', default: 5, step: 0.5 }
        ),
      ]),
      group('Points & curves', [
        row(
          {
            type: 'select',
            key: 'dotSize',
            label: 'Dot size',
            default: '2pt',
            options: [
              { value: '1.3pt', label: 'Small' },
              { value: '2pt', label: 'Medium' },
              { value: '2.5pt', label: 'Large' },
            ],
          },
          {
            type: 'select',
            key: 'labelPos',
            label: 'Labels',
            default: 'above',
            options: [
              { value: 'above', label: 'Above' },
              { value: 'above right', label: 'Above right' },
              { value: 'above left', label: 'Above left' },
              { value: 'below', label: 'Below' },
            ],
          }
        ),
        row(
          { type: 'select', key: 'curveWidth', label: 'Curve width', default: 'semithick', options: LINE_WIDTHS },
          { type: 'checkbox', key: 'labelIsoclines', label: 'Label isoclines', default: false }
        ),
      ]),
      group('Axes', [
        row(field('xAxisLabel', { label: 'x label' }), field('yAxisLabel', { label: 'y label' })),
        row(field('xScaleTicks', { label: 'Scale ticks on x' }), field('yScaleTicks', { label: 'Scale ticks on y' })),
        row(
          field('xStep', { label: 'x spacing', help: undefined, showIf: (v) => v.xScaleTicks }),
          field('yStep', { label: 'y spacing', help: undefined, showIf: (v) => v.yScaleTicks })
        ),
        row(
          field('xScaleNumbers', { label: 'Numbers', showIf: (v) => v.xScaleTicks }),
          field('yScaleNumbers', { label: 'Numbers', showIf: (v) => v.yScaleTicks })
        ),
        row(field('xCustomTicks', { label: 'Ticks on x', help: undefined }), field('yCustomTicks', { label: 'Ticks on y' })),
        row(field('originLabel', { label: 'Label the origin', default: false }), field('originText', { label: 'as' })),
        NOT_TO_SCALE_FIELD,
        row(field('axisArrow', { label: 'Arrowheads' }), field('axisWidth', { label: 'Line width' })),
      ]),
      group('Size', [row(field('width', { default: 9 }), field('height', { default: 7 })), field('equalScale'), field('fontSize')]),
    ],
  },
];

// ------------------------------------------------------------------ helpers

function parseEquation(src) {
  const text = String(src ?? '').replace(/^\s*(dy\s*\/\s*dx|y')\s*=\s*/i, '').replace(/√/g, 'sqrt');
  try {
    return parseExpression(text, { variables: ['x', 'y'] });
  } catch (e) {
    throw new Error(`Could not read dy/dx = "${src}" (${e.message})`);
  }
}

export function parsePoints(src) {
  return String(src ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const colon = line.indexOf(':');
      const label = colon >= 0 ? line.slice(colon + 1).trim() : '';
      const parts = (colon >= 0 ? line.slice(0, colon) : line).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim());
      if (parts.length !== 2) throw new Error(`Point on line ${i + 1}: expected "x, y" or "x, y : label"`);
      const [x, y] = parts.map((p) => {
        try {
          return parseConstant(p.replace(/√/g, 'sqrt')).value;
        } catch (e) {
          throw new Error(`Point on line ${i + 1}: could not read "${p}" (${e.message})`);
        }
      });
      return { x, y, label };
    });
}

/** Solution through (x0, y0) by RK4, both ways, until it leaves the box. */
export function solutionCurve(f, x0, y0, box) {
  const h = (box.xmax - box.xmin) / 600;
  const slope = (x, y) => f({ x, y });
  const run = (dir) => {
    const pts = [];
    let x = x0;
    let y = y0;
    const s = dir * h;
    for (let i = 0; i < 4000; i++) {
      const k1 = slope(x, y);
      const k2 = slope(x + s / 2, y + (s / 2) * k1);
      const k3 = slope(x + s / 2, y + (s / 2) * k2);
      const k4 = slope(x + s, y + s * k3);
      const ny = y + (s / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      const nx = x + s;
      if (!isFinite(ny) || nx < box.xmin - 1e-9 || nx > box.xmax + 1e-9) break;
      if (ny < box.ymin || ny > box.ymax) {
        // stop exactly at the edge
        const edge = ny > box.ymax ? box.ymax : box.ymin;
        const t = (edge - y) / (ny - y);
        pts.push([x + t * s, edge]);
        break;
      }
      x = nx;
      y = ny;
      pts.push([x, y]);
    }
    return pts;
  };
  const back = run(-1).reverse();
  return [...back, [x0, y0], ...run(1)];
}

/** Contour h(x, y) = 0 by marching squares, chained into polylines. */
export function contour(h, box, N = 120) {
  const xs = Array.from({ length: N + 1 }, (_, i) => box.xmin + ((box.xmax - box.xmin) * i) / N);
  const ys = Array.from({ length: N + 1 }, (_, j) => box.ymin + ((box.ymax - box.ymin) * j) / N);
  const v = xs.map((x) => ys.map((y) => h(x, y)));
  const segs = [];
  const lerp = (a, b, va, vb) => a + ((b - a) * va) / (va - vb);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const c = [v[i][j], v[i + 1][j], v[i + 1][j + 1], v[i][j + 1]];
      if (!c.every(isFinite)) continue;
      const P = [
        [xs[i], ys[j]],
        [xs[i + 1], ys[j]],
        [xs[i + 1], ys[j + 1]],
        [xs[i], ys[j + 1]],
      ];
      const cross = [];
      for (let k = 0; k < 4; k++) {
        const a = c[k];
        const b = c[(k + 1) % 4];
        if ((a < 0) !== (b < 0)) {
          const [p, q] = [P[k], P[(k + 1) % 4]];
          cross.push([lerp(p[0], q[0], a, b), lerp(p[1], q[1], a, b)]);
        }
      }
      // a jump (e.g. sgn) is not a contour: skip cells whose values change too much
      const big = Math.max(...c.map(Math.abs));
      if (cross.length === 2 && !(big > 1e3)) segs.push(cross);
      else if (cross.length === 4) segs.push([cross[0], cross[1]], [cross[2], cross[3]]);
    }
  }
  // chain segments sharing end points
  const key = ([x, y]) => `${x.toFixed(9)},${y.toFixed(9)}`;
  const ends = new Map();
  segs.forEach((s, idx) => {
    for (const p of s) {
      const k = key(p);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(idx);
    }
  });
  const used = new Set();
  const lines = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used.has(s0)) continue;
    used.add(s0);
    let line = [...segs[s0]];
    for (const atEnd of [true, false]) {
      for (;;) {
        const p = atEnd ? line[line.length - 1] : line[0];
        const next = (ends.get(key(p)) || []).find((i) => !used.has(i));
        if (next === undefined) break;
        used.add(next);
        const [a, b] = segs[next];
        const q = key(a) === key(p) ? b : a;
        if (atEnd) line.push(q);
        else line.unshift(q);
      }
    }
    lines.push(line);
  }
  return lines;
}

const path = (pts) => {
  const c = pts.map(([x, y]) => pt(x, y));
  const rows = [];
  for (let i = 0; i < c.length; i += 8) rows.push(c.slice(i, i + 8).join(' -- '));
  return rows.join(' --\n    ');
};

// ------------------------------------------------------------------ generate

function generate(values) {
  const warnings = [];
  const eq = parseEquation(values.equation);
  const f = eq.evaluate;
  const points = parsePoints(values.points);
  const fx0 = values.fxmin ?? -5;
  const fx1 = values.fxmax ?? 5;
  const fy0 = values.fymin ?? -5;
  const fy1 = values.fymax ?? 5;
  if (!(fx1 > fx0) || !(fy1 > fy0)) throw new Error('The field range is empty: "to" must be bigger than "from".');
  const dx = values.dx > 0 ? values.dx : 1;
  const dy = values.dy > 0 ? values.dy : 1;
  if ((fx1 - fx0) / dx > 80 || (fy1 - fy0) / dy > 80) throw new Error('The spacing is too small for this range (more than 80 segments across).');

  // the axes reach a little past the field, with room for the arrows
  const win = {
    xmin: Math.min(0, fx0 - 0.8 * dx),
    xmax: Math.max(0, fx1 + 1.6 * dx),
    ymin: Math.min(0, fy0 - 0.8 * dy),
    ymax: Math.max(0, fy1 + 1.2 * dy),
  };
  const { options, xUnit, yUnit } = scaleOptions(win, values);
  const b = new TikzBuilder();
  b.comment(`dy/dx = ${eq.toLatex()}`);

  // ---- slope field
  const half = ((values.segLength ?? 0.7) * Math.min(dx * xUnit, dy * yUnit)) / 2; // cm
  const segs = [];
  let undefinedAt = 0;
  for (let i = Math.ceil((fx0 - 1e-9) / dx); i * dx <= fx1 + 1e-9; i++) {
    for (let j = Math.ceil((fy0 - 1e-9) / dy); j * dy <= fy1 + 1e-9; j++) {
      const x = Number((i * dx).toPrecision(12));
      const y = Number((j * dy).toPrecision(12));
      if (values.skipAxes && (Math.abs(x) < 1e-12 || Math.abs(y) < 1e-12)) continue;
      const m = f({ x, y });
      let ux;
      let uy;
      if (isFinite(m)) {
        // direction in cm, then back to graph units
        const len = Math.hypot(xUnit, m * yUnit);
        ux = (half * xUnit) / len / xUnit;
        uy = (half * m * yUnit) / len / yUnit;
      } else if (Math.abs(m) === Infinity) {
        ux = 0;
        uy = half / yUnit; // vertical
      } else {
        undefinedAt++;
        continue;
      }
      segs.push(`${pt(x - ux, y - uy)} -- ${pt(x + ux, y + uy)}`);
    }
  }
  if (undefinedAt) warnings.push(`dy/dx is undefined at ${undefinedAt} grid point${undefinedAt > 1 ? 's' : ''}, so no segment was drawn there.`);
  b.comment('slope field');
  const segStyle = [values.segWidth || 'thin', values.arrows ? '-{Stealth[length=3pt]}' : ''].filter(Boolean).join(', ');
  if (values.arrows) b.usePreamble('\\usetikzlibrary{arrows.meta}');
  for (let k = 0; k < segs.length; k += 4) b.add(`\\draw[${segStyle}] ${segs.slice(k, k + 4).join(' ')};`);

  // ---- axes and scales (on top of the field)
  warnings.push(...drawAxes(b, win, values));
  warnings.push(...drawScaleTicks(b, win, values));
  warnings.push(...drawCustomTicks(b, win, values));

  // ---- isoclines
  const box = { xmin: fx0, xmax: fx1, ymin: fy0, ymax: fy1 };
  const levels = String(values.isoclines ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return parseConstant(s);
      } catch (e) {
        throw new Error(`Isocline value "${s}": ${e.message}`);
      }
    });
  for (const c of levels) {
    const lines = contour((x, y) => f({ x, y }) - c.value, box).filter((l) => l.length > 2);
    if (!lines.length) {
      warnings.push(`dy/dx is never ${c.latex} inside the field.`);
      continue;
    }
    b.comment(`isocline dy/dx = ${c.latex}`);
    // dotted, so isoclines stand apart from (dashed) solution curves
    for (const l of lines) b.add(`\\draw[densely dotted, ${values.curveWidth || 'semithick'}] ${path(l)};`);
    if (values.labelIsoclines) {
      const longest = lines.reduce((a, l) => (l.length > a.length ? l : a));
      // at the right-hand end of the longest piece
      const [p0, p1] = [longest[0], longest[longest.length - 1]];
      const end = p1[0] >= p0[0] ? p1 : p0;
      b.add(`\\node[anchor=south west, inner sep=2pt, fill=white] at ${pt(end[0], end[1])} {${mathLabel(`\\frac{dy}{dx} = ${c.latex}`)}};`);
    }
  }

  // ---- solution curves through the points
  if (values.solutions && values.solutions !== 'none' && points.length) {
    b.comment('solution curves');
    for (const p of points) {
      const curve = solutionCurve(f, p.x, p.y, box).filter(([, y]) => isFinite(y));
      if (curve.length < 3) {
        warnings.push(`No solution curve could be drawn through (${n(p.x)}, ${n(p.y)}).`);
        continue;
      }
      const st = [values.curveWidth || 'semithick', values.solutions === 'dashed' ? 'dashed' : ''].filter(Boolean).join(', ');
      b.add(`\\draw[${st}] ${path(curve.filter((_, i) => i % 4 === 0 || i === curve.length - 1))};`);
    }
  }

  // ---- points
  if (points.length) {
    b.comment('points');
    const r = dotRadius(values);
    for (const p of points) {
      if (p.x < win.xmin || p.x > win.xmax || p.y < win.ymin || p.y > win.ymax) {
        warnings.push(`The point (${n(p.x)}, ${n(p.y)}) is outside the axes.`);
        continue;
      }
      b.add(`\\fill ${pt(p.x, p.y)} circle[radius=${r}];`);
      if (p.label) {
        const anchor = { above: 'south', 'above right': 'south west', 'above left': 'south east', below: 'north' }[values.labelPos] || 'south';
        b.add(`\\node[anchor=${anchor}, inner sep=2.5pt] at ${pt(p.x, p.y)} {${mathLabel(p.label)}};`);
      }
    }
  }

  drawNotToScale(b, win, values);
  return { code: b.toString([...options, fontOption(values)]), warnings };
}

export default {
  id: 'slopefield',
  name: 'Slope field',
  category: 'Calculus',
  description: 'Slope fields for dy/dx = f(x, y), with labelled points, solution curves and isoclines.',
  schema,
  generate,
};
