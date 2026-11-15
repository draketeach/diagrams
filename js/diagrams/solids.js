// SPDX-License-Identifier: CC0-1.0
// 3D solids drawn as on exam papers (no shading): cylinders, cones, spheres,
// hemispheres, cuboids, triangular prisms and pyramids. Round faces are
// ellipses seen from a little above; prisms recede at an angle. Hidden edges
// are left out, or dashed. Lengths are labelled with a radius from a centre
// dot, a measurement line for a height, and labels on edges.

import { TikzBuilder, n } from '../lib/tikz.js';
import { titleText } from './realgraph.js';

const P = (x, y) => `(${n(x)},${n(y)})`;
const DOT = (x, y) => `\\fill ${P(x, y)} circle[radius=1.5pt];`;
const TIP = '{Stealth[length=5pt]}'; // as Geometry's arrowheads

/** A length's label: blank gives "4 cm" from the value and unit; "-" gives none. */
function lengthLabel(text, value, unit) {
  const t = String(text ?? '').trim();
  if (t === '-') return '';
  if (t) return titleText(t);
  return titleText(`${n(value)}${unit ? ` ${unit}` : ''}`);
}

/** An elliptical arc from angle a to b (degrees) round centre (cx, cy). */
function arc(cx, cy, rx, ry, a, b, style = '') {
  const x = cx + rx * Math.cos((a * Math.PI) / 180);
  const y = cy + ry * Math.sin((a * Math.PI) / 180);
  return `\\draw${style ? `[${style}]` : ''} ${P(x, y)} arc[start angle=${n(a)}, end angle=${n(b)}, x radius=${n(rx)}, y radius=${n(ry)}];`;
}

/**
 * A measurement line from p to q with its label in a gap in the middle:
 * ends are 'bars' (short bars across), 'arrows', or 'both'.
 */
function measure(b, p, q, label, ends = 'bars') {
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  const ux = (q.x - p.x) / L;
  const uy = (q.y - p.y) / L;
  const nx = -uy * 0.15;
  const ny = ux * 0.15;
  const tips = ends !== 'bars';
  const a1 = tips ? `[${TIP}-]` : '';
  const a2 = tips ? `[-${TIP}]` : '';
  const chars = label.replace(/\$[^$]*\$/g, 'xx').replace(/\\[a-z]+/gi, '').length;
  const w = Math.max(1, chars) * 0.19 + 0.1;
  const half = Math.min(L / 2 - 0.15, (w / 2) * Math.abs(ux) + 0.22 * Math.abs(uy) + 0.08);
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  if (label && half > 0.05) {
    b.add(`\\draw${a1} ${P(p.x, p.y)} -- ${P(m.x - ux * half, m.y - uy * half)};`);
    b.add(`\\draw${a2} ${P(m.x + ux * half, m.y + uy * half)} -- ${P(q.x, q.y)};`);
    b.add(`\\node at ${P(m.x, m.y)} {${label}};`);
  } else b.add(`\\draw${tips ? `[${TIP}-${TIP}]` : ''} ${P(p.x, p.y)} -- ${P(q.x, q.y)};`);
  if (ends !== 'arrows') for (const e of [p, q]) b.add(`\\draw ${P(e.x + nx, e.y + ny)} -- ${P(e.x - nx, e.y - ny)};`);
}

/** A label beside the middle of an edge p→q, pushed off it by 0.3 cm towards `side` (a direction). */
function edgeLabel(b, p, q, text, side, sloped = false) {
  if (!text) return;
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const L = Math.hypot(side.x, side.y) || 1;
  let rot = '';
  if (sloped) {
    let g = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
    if (g > 90) g -= 180;
    if (g <= -90) g += 180;
    rot = `, rotate=${n(g)}`;
  }
  // far enough off the edge for the label's own size in that direction
  const d = 0.12 + (sloped ? 0.2 : 0.2 + 0.1 * Math.abs(side.x / L) * Math.max(1, text.length / 4));
  b.add(`\\node[inner sep=1pt${rot}] at ${P(m.x + (side.x / L) * d, m.y + (side.y / L) * d)} {${text}};`);
}

/** A right-angle mark at v between the directions to a and c (size cm). */
function rightAngle(b, v, a, c, size = 0.22, style = '') {
  const u = (p) => {
    const L = Math.hypot(p.x - v.x, p.y - v.y) || 1;
    return { x: ((p.x - v.x) / L) * size, y: ((p.y - v.y) / L) * size };
  };
  const p = u(a);
  const q = u(c);
  b.add(`\\draw${style ? `[${style}]` : ''} ${P(v.x + p.x, v.y + p.y)} -- ${P(v.x + p.x + q.x, v.y + p.y + q.y)} -- ${P(v.x + q.x, v.y + q.y)};`);
}

// ---------------------------------------------------------------- the solids

function generate(v) {
  const warnings = [];
  const b = new TikzBuilder();
  const unit = String(v.unit ?? '').trim();
  const hid = v.hidden === 'dashed';
  const H = (s) => (hid ? s() : null); // hidden edges, only when shown
  const k = Math.max(0.1, Math.min(0.8, Number(v.ellipse) || 0.3)); // how flat round faces look
  const num = (key, d) => (Number(v[key]) > 0 ? Number(v[key]) : d);
  const r = num('r', 4);
  const h = num('h', 10);
  const w = num('w', 6);
  const d = num('d', 4);
  // drawn size: the biggest dimension comes out `size` cm across
  const big = { cylinder: Math.max(2 * r, h), cone: Math.max(2 * r, h), sphere: 2 * r, hemisphere: 2 * r }[v.solid] ?? Math.max(w, h, d * 0.6);
  const s = (Number(v.size) || 5) / big;
  const R = r * s;
  const Hh = h * s;
  const W = w * s;
  const D = d * s;
  const ry = R * k;
  const ext = []; // drawn points, for NOT TO SCALE's place

  const rLab = lengthLabel(v.rLabel, r, unit);
  const hLab = lengthLabel(v.hLabel, h, unit);
  const wLab = lengthLabel(v.wLabel, w, unit);
  const dLab = lengthLabel(v.dLabel, d, unit);

  if (v.solid === 'cylinder') {
    b.comment(`cylinder: radius ${n(r)}, height ${n(h)}`);
    b.add(`\\draw (0,${n(Hh)}) ellipse [x radius=${n(R)}, y radius=${n(ry)}];`);
    b.add(`\\draw ${P(-R, 0)} -- ${P(-R, Hh)} ${P(R, 0)} -- ${P(R, Hh)};`);
    b.add(arc(0, 0, R, ry, 180, 360));
    H(() => b.add(arc(0, 0, R, ry, 0, 180, 'dashed')));
    if (v.radius !== 'none') {
      b.comment('radius');
      b.add(DOT(0, Hh));
      b.add(`\\draw[dashed] ${P(0, Hh)} -- ${P(R, Hh)};`);
      if (rLab) b.add(`\\node[above, inner sep=2pt] at ${P(R / 2, Hh)} {${rLab}};`);
    }
    if (hLab) {
      b.comment('height');
      measure(b, { x: R + 0.6, y: 0 }, { x: R + 0.6, y: Hh }, hLab, v.ends);
    }
    ext.push({ x: R + 0.6 + 0.5, y: Hh + ry });
  } else if (v.solid === 'cone') {
    b.comment(`cone: radius ${n(r)}, height ${n(h)}`);
    // the sides touch the base where lines from the apex are tangent to it
    const t0 = (Math.asin(Math.min(0.99, ry / Hh)) * 180) / Math.PI;
    const tx = R * Math.cos((t0 * Math.PI) / 180);
    const ty = ry * Math.sin((t0 * Math.PI) / 180);
    b.add(`\\draw ${P(-tx, ty)} -- ${P(0, Hh)} -- ${P(tx, ty)};`);
    b.add(arc(0, 0, R, ry, 180 - t0, 360 + t0));
    H(() => b.add(arc(0, 0, R, ry, t0, 180 - t0, 'dashed')));
    if (v.radius !== 'none') {
      b.comment('radius');
      b.add(DOT(0, 0));
      b.add(`\\draw[dashed] ${P(0, 0)} -- ${P(R, 0)};`);
      if (rLab) b.add(`\\node[above, inner sep=2pt] at ${P(R / 2, 0)} {${rLab}};`);
    }
    if (hLab) {
      b.comment('height');
      b.add(`\\draw[dashed] ${P(0, 0)} -- ${P(0, Hh)};`);
      rightAngle(b, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, 0.22);
      b.add(`\\node[left, inner sep=2pt] at ${P(0, Hh * 0.45)} {${hLab}};`);
    }
    const sLab = String(v.sLabel ?? '').trim();
    if (sLab && sLab !== '-') {
      b.comment('slant height');
      edgeLabel(b, { x: tx, y: ty }, { x: 0, y: Hh }, titleText(sLab), { x: Hh, y: tx }, true);
    }
    ext.push({ x: R + 0.8, y: Hh });
  } else if (v.solid === 'sphere' || v.solid === 'hemisphere') {
    const half = v.solid === 'hemisphere';
    b.comment(`${v.solid}: radius ${n(r)}`);
    if (half) b.add(`\\draw ${P(-R, 0)} arc[start angle=180, end angle=0, radius=${n(R)}];`);
    else b.add(`\\draw (0,0) circle[radius=${n(R)}];`);
    // the flat face (hemisphere) or the equator (sphere)
    b.add(arc(0, 0, R, ry, 180, 360));
    // the back half is behind the dome or the ball
    H(() => b.add(arc(0, 0, R, ry, 0, 180, 'dashed')));
    if (v.radius !== 'none') {
      b.comment('radius');
      b.add(DOT(0, 0));
      b.add(`\\draw[dashed] ${P(0, 0)} -- ${P(R, 0)};`);
      if (rLab) b.add(`\\node[above, inner sep=2pt] at ${P(R / 2, 0)} {${rLab}};`);
    }
    ext.push({ x: R + 0.8, y: R });
  } else {
    // prisms and pyramids: the front face flat on the page, depth going back at an angle
    const g = ((Number(v.depthAngle) || 35) * Math.PI) / 180;
    const o = { x: D * 0.6 * Math.cos(g), y: D * 0.6 * Math.sin(g) };
    const add = (p, q = o) => ({ x: p.x + q.x, y: p.y + q.y });
    const line = (...ps) => ps.map((p) => P(p.x, p.y)).join(' -- ');
    const A = { x: 0, y: 0 };
    const B = { x: W, y: 0 };
    if (v.solid === 'cuboid') {
      b.comment(`cuboid: ${n(w)} by ${n(d)} by ${n(h)}`);
      const C = { x: W, y: Hh };
      const E = { x: 0, y: Hh };
      b.add(`\\draw ${line(A, B, C, E)} -- cycle;`);
      b.add(`\\draw ${line(E, add(E), add(C), C)} ${line(add(C), add(B), B)};`);
      H(() => b.add(`\\draw[dashed] ${line(A, add(A), add(B))} ${line(add(A), add(E))};`));
      b.comment('labels');
      edgeLabel(b, A, B, wLab, { x: 0, y: -1 });
      edgeLabel(b, A, E, hLab, { x: -1, y: 0 });
      edgeLabel(b, B, add(B), dLab, { x: o.y, y: -o.x });
      ext.push(add(C));
    } else if (v.solid === 'prism') {
      const ax = Math.max(0, Math.min(1, Number(v.apex ?? 0.5))) * W;
      const T = { x: ax, y: Hh };
      b.comment(`triangular prism: base ${n(w)}, height ${n(h)}, length ${n(d)}`);
      b.add(`\\draw ${line(A, B, T)} -- cycle;`);
      b.add(`\\draw ${line(T, add(T), add(B), B)};`);
      H(() => b.add(`\\draw[dashed] ${line(A, add(A), add(B))} ${line(add(A), add(T))};`));
      b.comment('labels');
      edgeLabel(b, A, B, wLab, { x: 0, y: -1 });
      edgeLabel(b, B, add(B), dLab, { x: o.y, y: -o.x });
      if (hLab) {
        if (ax < 1e-6) edgeLabel(b, A, T, hLab, { x: -1, y: 0 });
        else {
          // the triangle's height, dashed inside the front face, square to its base
          const F = { x: ax, y: 0 };
          b.add(`\\draw[dashed] ${line(T, F)};`);
          rightAngle(b, F, T, ax < W / 2 ? B : A, 0.2);
          b.add(`\\node[${ax < W / 2 ? 'right' : 'left'}, inner sep=2pt] at ${P(ax, Hh * 0.4)} {${hLab}};`);
        }
      }
      ext.push(add(T), add(B));
    } else if (v.solid === 'pyramid') {
      b.comment(`pyramid: base ${n(w)} by ${n(d)}, height ${n(h)}`);
      const C2 = add(B);
      const A2 = add(A);
      const O = { x: W / 2 + o.x / 2, y: o.y / 2 };
      const T = { x: O.x, y: O.y + Hh };
      b.add(`\\draw ${line(A, B, C2)} ${line(A, T, B)} ${line(T, C2)};`);
      H(() => b.add(`\\draw[dashed] ${line(A, A2, C2)} ${line(A2, T)};`));
      if (hLab) {
        b.comment('height');
        b.add(`\\draw[dashed] ${line(T, O)};`);
        b.add(DOT(O.x, O.y));
        b.add(`\\node[right, inner sep=2pt] at ${P(O.x, O.y + Hh * 0.45)} {${hLab}};`);
      }
      b.comment('labels');
      edgeLabel(b, A, B, wLab, { x: 0, y: -1 });
      edgeLabel(b, B, C2, dLab, { x: o.y, y: -o.x });
      ext.push(C2, T);
    }
  }

  if (v.notToScale) {
    const x = Math.max(...ext.map((p) => p.x)) + 0.4;
    const y = Math.max(...ext.map((p) => p.y));
    b.add(`\\node[anchor=north west, align=center] at ${P(x, y)} {NOT TO \\\\ SCALE};`);
  }
  if (b.lines.some((l) => l.includes(TIP))) b.usePreamble('\\usetikzlibrary{arrows.meta}');
  const opts = [v.lineWidth && v.lineWidth !== 'thin' ? v.lineWidth : '', v.fontSize ? `font=${v.fontSize}` : ''];
  return { code: b.toString(opts), warnings };
}

// ---------------------------------------------------------------- options

const round = (v) => ['cylinder', 'cone', 'sphere', 'hemisphere'].includes(v.solid);
const flat = (v) => !round(v);
const LABEL_HELP = 'Blank: the length and unit (e.g. 4 cm). Type your own, or - for none.';

const schema = [
  {
    type: 'select',
    key: 'solid',
    label: 'Solid',
    default: 'cylinder',
    options: [
      { value: 'cylinder', label: 'Cylinder' },
      { value: 'cone', label: 'Cone' },
      { value: 'sphere', label: 'Sphere' },
      { value: 'hemisphere', label: 'Hemisphere' },
      { value: 'cuboid', label: 'Cuboid' },
      { value: 'prism', label: 'Triangular prism' },
      { value: 'pyramid', label: 'Pyramid (rectangular base)' },
    ],
  },
  {
    type: 'group',
    label: 'Measurements',
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'r', label: 'Radius', default: 4, step: 0.5, min: 0, showIf: round },
          { type: 'number', key: 'w', label: 'Width', default: 6, step: 0.5, min: 0, showIf: flat },
          { type: 'number', key: 'd', label: 'Depth', default: 4, step: 0.5, min: 0, showIf: flat },
          { type: 'number', key: 'h', label: 'Height', default: 10, step: 0.5, min: 0, showIf: (v) => v.solid !== 'sphere' && v.solid !== 'hemisphere' },
          { type: 'text', key: 'unit', label: 'Unit', default: 'cm' },
        ],
      },
      {
        type: 'number',
        key: 'apex',
        label: 'Top of the triangle (0 = above the left corner, 0.5 = middle, 1 = right)',
        default: 0.5,
        step: 0.25,
        min: 0,
        max: 1,
        showIf: (v) => v.solid === 'prism',
      },
    ],
  },
  {
    type: 'group',
    label: 'Labels',
    fields: [
      { type: 'select', key: 'radius', label: 'Radius', default: 'line', options: [{ value: 'line', label: 'Dashed from a centre dot' }, { value: 'none', label: 'Not shown' }], showIf: round },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'rLabel', label: 'Radius label', default: '', placeholder: 'auto', help: LABEL_HELP, showIf: (v) => round(v) && v.radius !== 'none' },
          { type: 'text', key: 'hLabel', label: 'Height label', default: '', placeholder: 'auto', showIf: (v) => v.solid !== 'sphere' && v.solid !== 'hemisphere' },
          { type: 'text', key: 'sLabel', label: 'Slant height label', default: '', placeholder: 'none', showIf: (v) => v.solid === 'cone' },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'wLabel', label: 'Width label', default: '', placeholder: 'auto', help: LABEL_HELP },
          { type: 'text', key: 'dLabel', label: 'Depth label', default: '', placeholder: 'auto' },
        ],
        showIf: flat,
      },
      {
        type: 'select',
        key: 'ends',
        label: 'Height line ends',
        default: 'bars',
        options: [
          { value: 'bars', label: 'Bars' },
          { value: 'both', label: 'Arrows and bars' },
          { value: 'arrows', label: 'Arrows' },
        ],
        showIf: (v) => v.solid === 'cylinder',
      },
      { type: 'checkbox', key: 'notToScale', label: 'NOT TO SCALE', default: true },
    ],
  },
  {
    type: 'group',
    label: 'Drawing',
    collapsed: true,
    fields: [
      {
        type: 'select',
        key: 'hidden',
        label: 'Hidden edges',
        default: 'none',
        options: [
          { value: 'none', label: 'Left out' },
          { value: 'dashed', label: 'Dashed' },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'size', label: 'Size (cm, biggest dimension)', default: 5, step: 0.5, min: 1 },
          { type: 'number', key: 'ellipse', label: 'Round faces: flatness', default: 0.3, step: 0.05, min: 0.1, max: 0.8, showIf: round },
          { type: 'number', key: 'depthAngle', label: 'Depth angle (°)', default: 35, step: 5, min: 10, max: 80, showIf: flat },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            type: 'select',
            key: 'lineWidth',
            label: 'Line width',
            default: 'thin',
            options: [
              { value: 'thin', label: 'Thin' },
              { value: 'semithick', label: 'Semithick' },
              { value: 'thick', label: 'Thick' },
            ],
          },
          {
            type: 'select',
            key: 'fontSize',
            label: 'Font size',
            default: '',
            options: [
              { value: '', label: 'Normal' },
              { value: '\\small', label: 'Small' },
              { value: '\\large', label: 'Large' },
            ],
          },
        ],
      },
    ],
  },
];

export default {
  id: 'solids',
  name: '3D solids',
  category: 'Geometry',
  description: 'Cylinders, cones, spheres, hemispheres, cuboids, prisms and pyramids, labelled, without shading.',
  schema,
  generate,
};
