// SPDX-License-Identifier: CC0-1.0
// Regions in the complex plane (Argand diagrams): one condition per line, the
// region where they all hold shaded. Conditions:
//   |z - a| <= r              discs, circles (=) and outside a circle (>, >=)
//   Im(z) <= Re(z)            straight lines in Re(z) and Im(z) (or x and y)
//   |z - a| <= |z - b|        perpendicular bisectors and their half-planes
//   0 <= arg(z - a) <= pi/4   rays (=) and sectors, from a (left open)
// Boundaries are solid for <=, >= and =, dashed for < and >. An equation (=)
// is drawn as a thicker locus, cut to the other conditions, with no shading.

import { TikzBuilder, n, ARROW_TIPS, LINE_WIDTHS, FONT_SIZES, mathLabel } from '../lib/tikz.js';

const EXAMPLES = {
  rows: [
    ['|z+2+3i| <= 1', 'A disc: centre −2 − 3i, radius 1'],
    ['|z - 1| > 2', 'Outside a circle (dashed: not on it)'],
    ['Im(z) <= Re(z)', 'Below the line y = x (also: y <= x)'],
    ['Re(z) + Im(z) < 3', 'Any straight line in Re(z) and Im(z)'],
    ['|z - 1| <= |z + i|', 'The side of the perpendicular bisector nearer 1'],
    ['0 <= arg(z) <= pi/4', 'A sector from 0 (also arg(z - 1) = 2pi/3 for a ray)'],
  ],
  notes: ['Each line is a condition; the shaded region is where they all hold. ≤ and ≥ can be typed as <= and >=.'],
};

// ---------------------------------------------------------------- parsing

/** A complex number from text such as "2+3i", "-i", "3 - 2i", "4" (or "" for 0). */
export function parseComplex(text) {
  const t = String(text).replace(/\s+/g, '').replace(/−/g, '-');
  if (!t) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  const terms = t.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== t) return null;
  for (const term of terms) {
    const m = term.match(/^([+-]?)(\d*\.?\d*)(\*?i)?$/);
    if (!m || (!m[2] && !m[3])) return null;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) y += sign * (m[2] ? Number(m[2]) : 1);
    else x += sign * Number(m[2]);
  }
  return isFinite(x) && isFinite(y) ? { x, y } : null;
}

/** The centre a in |z - a| from the text between the bars ("z+2+3i" → −2 − 3i). */
function modCentre(inner) {
  const m = inner.replace(/\s+/g, '').match(/^z(.*)$/);
  if (!m) return null;
  const w = parseComplex(m[1]);
  return w && { x: -w.x + 0, y: -w.y + 0 };
}

/** An angle in radians from "pi/4", "3pi/4", "-π/2", "2π/3", "0" or "0.5". */
export function parseAngle(text) {
  const t = String(text).replace(/\s+/g, '').replace(/π/g, 'pi').replace(/−/g, '-');
  const m = t.match(/^([+-]?)(\d*\.?\d*)(pi)?(?:\/(\d+\.?\d*))?$/);
  if (!m || (!m[2] && !m[3])) return null;
  let v = m[2] ? Number(m[2]) : 1;
  if (m[3]) v *= Math.PI;
  if (m[4]) v /= Number(m[4]);
  return m[1] === '-' ? -v : v;
}

/** A linear expression in Re(z) and Im(z) (or x and y): { a, b, c } for a·x + b·y + c. */
function parseLinear(text) {
  const t = String(text).replace(/\s+/g, '').replace(/−/g, '-').replace(/Re\(z\)/gi, 'X').replace(/Im\(z\)/gi, 'Y').replace(/x/g, 'X').replace(/y/g, 'Y');
  if (!t) return null;
  const terms = t.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== t) return null;
  let a = 0;
  let b = 0;
  let c = 0;
  for (const term of terms) {
    const m = term.match(/^([+-]?)(\d*\.?\d*)\*?([XY]?)$/);
    if (!m || (!m[2] && !m[3])) return null;
    const k = (m[1] === '-' ? -1 : 1) * (m[2] ? Number(m[2]) : 1);
    if (m[3] === 'X') a += k;
    else if (m[3] === 'Y') b += k;
    else c += k;
  }
  return { a, b, c };
}

const OPS = /(<=|>=|<|>|=)/;
const normOps = (s) =>
  String(s)
    .replace(/≤|=</g, '<=')
    .replace(/≥|=>/g, '>=')
    .replace(/\\le(q)?\b/g, '<=')
    .replace(/\\ge(q)?\b/g, '>=');
const flip = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' };

/**
 * One condition from a line of text:
 *   { kind: 'circle', c, r, op }                    |z - c| op r
 *   { kind: 'half', a, b, c, op }                   a·x + b·y + c op 0
 *   { kind: 'arg', v, lo, hi, loStrict, hiStrict }  lo ≤ arg(z - v) ≤ hi (or eq for a ray)
 */
export function parseCondition(line) {
  const s = normOps(line).trim();
  // arg, possibly between two angles
  const argM = s.match(/arg\s*\(([^)]*)\)/i);
  if (argM) {
    const v = modCentre(argM[1]);
    if (!v) return { error: `can't read the point in arg(${argM[1]})` };
    const [left, right] = [s.slice(0, argM.index), s.slice(argM.index + argM[0].length)];
    let lo = -Math.PI;
    let hi = Math.PI;
    let loStrict = true; // the principal argument is > -π
    let hiStrict = false;
    let eq = null;
    const side = (txt, before) => {
      const m = before ? txt.match(/^(.*?)(<=|>=|<|>|=)\s*$/) : txt.match(/^\s*(<=|>=|<|>|=)(.*)$/);
      if (!m) return txt.trim() ? 'bad' : null;
      let [angleText, op] = before ? [m[1], m[2]] : [m[2], m[1]];
      if (before) op = flip[op]; // θ < arg  is  arg > θ
      const th = parseAngle(angleText);
      if (th === null) return 'bad';
      if (op === '=') eq = th;
      else if (op[0] === '<') {
        hi = th;
        hiStrict = op === '<';
      } else {
        lo = th;
        loStrict = op === '>';
      }
      return 'ok';
    };
    if (side(left, true) === 'bad' || side(right, false) === 'bad') return { error: 'can\'t read the angles (e.g. 0 <= arg(z) <= pi/4)' };
    if (eq !== null) return { kind: 'arg', v, eq };
    return { kind: 'arg', v, lo, hi, loStrict, hiStrict };
  }
  const parts = s.split(OPS);
  if (parts.length !== 3) return { error: 'needs one comparison: <, <=, >, >= or =' };
  let [L, op, R] = parts.map((p) => p.trim());
  const mod = (t) => {
    const m = t.match(/^\|(.*)\|$/);
    return m ? modCentre(m[1]) : null;
  };
  const mL = mod(L);
  const mR = mod(R);
  if (mL && mR) {
    // |z - a| op |z - b|  ⇔  2(b - a)·z op |b|² - |a|²
    return { kind: 'half', a: 2 * (mR.x - mL.x), b: 2 * (mR.y - mL.y), c: -(mR.x ** 2 + mR.y ** 2 - mL.x ** 2 - mL.y ** 2), op };
  }
  if (mR && !mL) {
    [L, R] = [R, L];
    op = flip[op];
  }
  const m = mod(L);
  if (m) {
    const r = Number(R);
    if (!(r >= 0)) return { error: `the radius ${R} should be a number` };
    return { kind: 'circle', c: m, r, op };
  }
  const l = parseLinear(L);
  const r = parseLinear(R);
  if (!l || !r) return { error: 'can\'t read it (try |z - a| <= r, Im(z) <= Re(z), or arg(z) <= pi/4)' };
  const h = { a: l.a - r.a, b: l.b - r.b, c: l.c - r.c };
  if (!h.a && !h.b) return { error: 'has no Re(z) or Im(z) in it' };
  return { kind: 'half', ...h, op };
}

// ---------------------------------------------------------------- geometry

/** Keeps the part of a polygon where a·x + b·y + c ≤ 0. */
function clipPolygon(poly, a, b, c) {
  const out = [];
  const f = (p) => a * p.x + b * p.y + c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = f(p);
    const fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/** The part of the line a·x + b·y + c = 0 inside a box, as two points (or null). */
function lineInBox(a, b, c, box) {
  const pts = [];
  const add = (x, y) => {
    if (x >= box.x0 - 1e-9 && x <= box.x1 + 1e-9 && y >= box.y0 - 1e-9 && y <= box.y1 + 1e-9 && !pts.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-9)) pts.push({ x, y });
  };
  if (Math.abs(b) > 1e-12) {
    add(box.x0, -(a * box.x0 + c) / b);
    add(box.x1, -(a * box.x1 + c) / b);
  }
  if (Math.abs(a) > 1e-12) {
    add(-(b * box.y0 + c) / a, box.y0);
    add(-(b * box.y1 + c) / a, box.y1);
  }
  return pts.length >= 2 ? [pts[0], pts[1]] : null;
}

/** Where a ray from v at angle θ leaves the box. */
function rayEnd(v, th, box) {
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  let t = Infinity;
  if (dx > 1e-12) t = Math.min(t, (box.x1 - v.x) / dx);
  if (dx < -1e-12) t = Math.min(t, (box.x0 - v.x) / dx);
  if (dy > 1e-12) t = Math.min(t, (box.y1 - v.y) / dy);
  if (dy < -1e-12) t = Math.min(t, (box.y0 - v.y) / dy);
  return t > 0 && isFinite(t) ? { x: v.x + dx * t, y: v.y + dy * t } : null;
}

const niceUp = (v) => Math.ceil(v - 1e-9);
const niceDown = (v) => Math.floor(v + 1e-9);

// ---------------------------------------------------------------- the picture

const schema = [
  {
    type: 'group',
    label: 'Conditions',
    fields: [
      {
        type: 'textarea',
        key: 'conditions',
        label: 'One per line; the region where they all hold is shaded',
        rows: 4,
        default: '|z+2+3i| <= 1\nIm(z) <= Re(z)',
        examples: EXAMPLES,
      },
      {
        type: 'row',
        fields: [
          {
            type: 'select',
            key: 'shade',
            label: 'Shading',
            default: 'gray!35',
            options: [
              { value: 'gray!20', label: 'Light grey' },
              { value: 'gray!35', label: 'Grey' },
              { value: 'gray!55', label: 'Dark grey' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            type: 'select',
            key: 'dashing',
            label: 'Boundaries',
            default: 'strict',
            options: [
              { value: 'strict', label: 'Dashed if strict' },
              { value: 'solid', label: 'All solid' },
            ],
          },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'checkbox', key: 'centres', label: 'Dot at each circle\'s centre', default: true },
          { type: 'checkbox', key: 'vertices', label: 'Open dot where a ray starts', default: true },
        ],
      },
    ],
  },
  {
    type: 'group',
    label: 'Axes',
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'xLabel', label: 'Real axis label', default: 'x', placeholder: 'x or Re' },
          { type: 'text', key: 'yLabel', label: 'Imaginary axis label', default: 'y', placeholder: 'y or Im' },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'xmin', label: 'x from', default: '', placeholder: 'auto' },
          { type: 'text', key: 'xmax', label: 'x to', default: '', placeholder: 'auto' },
          { type: 'text', key: 'ymin', label: 'y from', default: '', placeholder: 'auto' },
          { type: 'text', key: 'ymax', label: 'y to', default: '', placeholder: 'auto' },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'checkbox', key: 'scales', label: 'Ticks and numbers', default: false },
          { type: 'checkbox', key: 'originLabel', label: 'Label the origin O', default: false },
        ],
      },
      { type: 'number', key: 'step', label: 'Ticks every', default: 1, step: 0.5, min: 0.1, showIf: (v) => v.scales },
    ],
  },
  {
    type: 'group',
    label: 'Drawing',
    collapsed: true,
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'size', label: 'Size (cm)', default: 6, step: 0.5, min: 2 },
          { type: 'select', key: 'axisArrow', label: 'Arrowheads', default: 'latex', options: ARROW_TIPS },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'select', key: 'lineWidth', label: 'Line width', default: 'thin', options: LINE_WIDTHS },
          { type: 'select', key: 'fontSize', label: 'Font size', default: '', options: FONT_SIZES },
        ],
      },
    ],
  },
];

function generate(v) {
  const warnings = [];
  const conds = [];
  String(v.conditions ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const c = parseCondition(line);
      if (c.error) warnings.push(`Line ${i + 1} (${line}): ${c.error}.`);
      else conds.push({ ...c, text: line });
    });

  // ---- the window: the origin, every circle and every ray's start, with room around them
  const xs = [0];
  const ys = [0];
  for (const c of conds) {
    if (c.kind === 'circle') {
      xs.push(c.c.x - c.r, c.c.x + c.r);
      ys.push(c.c.y - c.r, c.c.y + c.r);
    }
    if (c.kind === 'arg') {
      xs.push(c.v.x);
      ys.push(c.v.y);
    }
  }
  const pad = 1;
  const auto = (t) => String(t ?? '').trim() === '' || !isFinite(Number(t));
  let x0 = auto(v.xmin) ? niceDown(Math.min(...xs) - pad) : Number(v.xmin);
  let x1 = auto(v.xmax) ? niceUp(Math.max(...xs) + pad) : Number(v.xmax);
  let y0 = auto(v.ymin) ? niceDown(Math.min(...ys) - pad) : Number(v.ymin);
  let y1 = auto(v.ymax) ? niceUp(Math.max(...ys) + pad) : Number(v.ymax);
  if (x1 <= x0) [x0, x1] = [x0, x0 + 1];
  if (y1 <= y0) [y0, y1] = [y0, y0 + 1];
  const box = { x0, x1, y0, y1 };
  const unit = (Number(v.size) > 0 ? Number(v.size) : 6) / Math.max(x1 - x0, y1 - y0);
  const P = (p) => `(${n(p.x)},${n(p.y)})`;

  const b = new TikzBuilder();
  const dash = (strict) => (strict && v.dashing !== 'solid' ? 'dashed' : '');
  const eqs = conds.filter((c) => c.op === '=' || (c.kind === 'arg' && c.eq !== undefined));
  const ineqs = conds.filter((c) => !eqs.includes(c));
  const big = 4 * Math.max(x1 - x0, y1 - y0) + 10;

  // clip paths stay inside the picture's box (a clip path counts towards the picture's size)
  const boxPoly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const toBox = (poly) => [[-1, 0, x0], [1, 0, -x1], [0, -1, y0], [0, 1, -y1]].reduce((q, [a, bb, cc]) => clipPolygon(q, a, bb, cc), poly);
  const polyClip = (poly) => (poly.length >= 3 ? `\\clip ${poly.map(P).join(' -- ')} -- cycle;` : `\\clip ${P({ x: x0, y: y0 })} rectangle ${P({ x: x0, y: y0 })};`);

  /** The clip path for the region an inequality allows. */
  const clipFor = (c) => {
    if (c.kind === 'circle') {
      if (c.op[0] === '<') return `\\clip ${P(c.c)} circle[radius=${n(c.r)}];`;
      // outside: a box drawn clockwise with the (anticlockwise) circle cut out of it
      return `\\clip (${n(x0)},${n(y0)}) -- (${n(x0)},${n(y1)}) -- (${n(x1)},${n(y1)}) -- (${n(x1)},${n(y0)}) -- cycle ${P(c.c)} circle[radius=${n(c.r)}];`;
    }
    if (c.kind === 'half') {
      const s = c.op[0] === '<' ? 1 : -1;
      return polyClip(clipPolygon(boxPoly, s * c.a, s * c.b, s * c.c));
    }
    // a sector from v between the angles
    const steps = Math.max(2, Math.ceil(((c.hi - c.lo) * 180) / Math.PI / 10));
    const ring = [];
    for (let k = 0; k <= steps; k++) {
      const t = c.lo + ((c.hi - c.lo) * k) / steps;
      ring.push({ x: c.v.x + big * Math.cos(t), y: c.v.y + big * Math.sin(t) });
    }
    return polyClip(toBox([c.v, ...ring]));
  };

  // ---- the shaded region
  if (!eqs.length && ineqs.length && v.shade !== 'none') {
    b.comment('the region where every condition holds');
    b.add('\\begin{scope}');
    for (const c of ineqs) b.add(`  ${clipFor(c)}`);
    b.add(`  \\fill[${v.shade || 'gray!35'}] (${n(x0)},${n(y0)}) rectangle (${n(x1)},${n(y1)});`);
    b.add('\\end{scope}');
  }

  // ---- axes
  const tip = v.axisArrow && v.axisArrow !== 'none' ? `-${v.axisArrow}` : '';
  const xl = String(v.xLabel ?? '').trim();
  const yl = String(v.yLabel ?? '').trim();
  const lab = (t) => (/^(Re|Im)$/.test(t) ? `$\\mathrm{${t}}$` : mathLabel(t));
  b.comment('axes');
  b.add(`\\draw${tip ? `[${tip}]` : ''} (${n(x0)},0) -- (${n(x1)},0)${xl ? ` node[below left, inner sep=2pt] {${lab(xl)}}` : ''};`);
  b.add(`\\draw${tip ? `[${tip}]` : ''} (0,${n(y0)}) -- (0,${n(y1)})${yl ? ` node[left, inner sep=3pt] {${lab(yl)}}` : ''};`);
  if (v.scales) {
    const st = Number(v.step) > 0 ? Number(v.step) : 1;
    const xt = [];
    const yt = [];
    for (let t = Math.ceil(x0 / st) * st; t < x1 - st * 0.4; t += st) if (Math.abs(t) > 1e-9) xt.push(n(t));
    for (let t = Math.ceil(y0 / st) * st; t < y1 - st * 0.4; t += st) if (Math.abs(t) > 1e-9) yt.push(n(t));
    if (xt.length) b.add(`\\foreach \\x in {${xt.join(',')}} \\draw (\\x,0.08) -- (\\x,-0.08) node[below] {$\\x$};`);
    if (yt.length) b.add(`\\foreach \\y in {${yt.join(',')}} \\draw (0.08,\\y) -- (-0.08,\\y) node[left] {$\\y$};`);
  }
  if (v.originLabel) b.add('\\node[below left, inner sep=2pt] at (0,0) {$O$};');

  // ---- boundaries of the inequalities (right across the picture), then the equations
  const inside = { x0: x0 + 0.15, x1: x1 - 0.15, y0: y0 + 0.15, y1: y1 - 0.15 }; // short of the arrowheads
  const boundary = (c, style) => {
    if (c.kind === 'circle') return `\\draw${style ? `[${style}]` : ''} ${P(c.c)} circle[radius=${n(c.r)}];`;
    if (c.kind === 'half') {
      const seg = lineInBox(c.a, c.b, c.c, inside);
      return seg ? `\\draw${style ? `[${style}]` : ''} ${P(seg[0])} -- ${P(seg[1])};` : '';
    }
    const rays = c.eq !== undefined ? [[c.eq, false]] : [[c.lo, c.loStrict], [c.hi, c.hiStrict]].filter(([t]) => Math.abs(Math.abs(t) - Math.PI) > 1e-9);
    return rays
      .map(([t, strict]) => {
        const e = rayEnd(c.v, t, inside);
        const st = [style, c.eq === undefined ? dash(strict) : ''].filter(Boolean).join(', ');
        return e ? `\\draw${st ? `[${st}]` : ''} ${P(c.v)} -- ${P(e)};` : '';
      })
      .filter(Boolean)
      .join('\n');
  };
  if (ineqs.length) b.comment('boundaries');
  for (const c of ineqs) {
    const line = c.kind === 'arg' ? boundary(c, '') : boundary(c, dash(c.op === '<' || c.op === '>'));
    if (line) line.split('\n').forEach((l) => b.add(l));
  }
  if (eqs.length) {
    b.comment('the locus: each equation, cut to the other conditions');
    b.add('\\begin{scope}');
    for (const c of ineqs) b.add(`  ${clipFor(c)}`);
    for (const c of eqs) boundary(c, 'semithick').split('\n').filter(Boolean).forEach((l) => b.add(`  ${l}`));
    b.add('\\end{scope}');
  }

  // ---- marked points
  const circles = conds.filter((c) => c.kind === 'circle');
  if (v.centres !== false && circles.length) {
    b.comment('centres');
    for (const c of circles) b.add(`\\fill ${P(c.c)} circle[radius=1.5pt];`);
  }
  const args = conds.filter((c) => c.kind === 'arg');
  if (v.vertices !== false && args.length) {
    b.comment('where the rays start (not included)');
    for (const c of args) b.add(`\\draw[fill=white] ${P(c.v)} circle[radius=2pt];`);
  }

  const opts = [`x=${n(unit)}cm`, `y=${n(unit)}cm`, v.lineWidth && v.lineWidth !== 'thin' ? v.lineWidth : '', v.fontSize ? `font=${v.fontSize}` : ''];
  if (!conds.length && !warnings.length) warnings.push('Type a condition, e.g. |z - 1| <= 2.');
  return { code: b.toString(opts), warnings };
}

export default {
  id: 'complex',
  name: 'Complex plane',
  category: 'Complex numbers',
  description: 'Regions and loci in the complex plane: circles, lines, perpendicular bisectors and arguments, shaded where every condition holds.',
  schema,
  generate,
};
