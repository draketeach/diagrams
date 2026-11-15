// SPDX-License-Identifier: CC0-1.0
// 3D solids drawn as on exam papers (no shading): cylinders, cones, spheres,
// hemispheres, cuboids, triangular prisms and pyramids. Round faces are
// ellipses seen from a little above; prisms recede at an angle. Hidden edges
// are left out, or dashed.
//
// The code names every corner with \coordinate first, draws from those names,
// and places each label relative to what it labels: a node partway along the
// edge or line (midway, pos=…) or beside the corner (below left, …), so the
// code reads like the picture and is easy to adjust by hand.

import { TikzBuilder, n } from '../lib/tikz.js';
import { titleText } from './realgraph.js';

const P = (x, y) => `(${n(x)},${n(y)})`;
const TIP = '{Stealth[length=5pt]}'; // as Geometry's arrowheads
const BAR = '{Bar[width=8pt]}';

/** A length's label: blank gives "4 cm" from the value and unit; "-" gives none. */
function lengthLabel(text, value, unit) {
  const t = String(text ?? '').trim();
  if (t === '-') return '';
  if (t) return titleText(t);
  return titleText(`${n(value)}${unit ? ` ${unit}` : ''}`);
}

/** A corner's name: a letter (or letter and digits) in maths, a word upright. */
function nameText(t) {
  if (t.includes('$')) return titleText(t);
  return /^[A-Za-z]{3,}$/.test(t) ? titleText(t) : `$${t.replace(/^([A-Za-z])(\d+)$/, '$1_{$2}')}$`;
}

/** The TikZ placement (above, below left, …) for a label off towards direction (dx, dy). */
function placeFor(dx, dy) {
  const a = (((Math.atan2(dy, dx) * 180) / Math.PI + 360 + 22.5) % 360) / 45;
  return ['right', 'above right', 'above', 'above left', 'left', 'below left', 'below', 'below right'][Math.floor(a)];
}

/** Writes the picture, keeping each named corner's place for the labels. */
class Solid {
  constructor(b) {
    this.b = b;
    this.at = new Map();
  }
  /** \coordinate (id) at (x,y); */
  coord(id, x, y) {
    this.at.set(id, { x, y });
    this.b.add(`\\coordinate (${id}) at ${P(x, y)};`);
    return id;
  }
  p(id) {
    return this.at.get(id);
  }
  /** A path through named corners: (A) -- (B) -- (C) */
  path(...ids) {
    return ids.map((id) => `(${id})`).join(' -- ');
  }
  /** A label partway along the line a→b (t = 0.5 is midway), off towards the side (a direction). */
  edgeLabel(a, c, text, side, { t = 0.5, sloped = false } = {}) {
    if (!text) return;
    const pos = t === 0.5 ? 'midway' : `pos=${n(t)}`;
    let place = placeFor(side.x, side.y);
    if (sloped) {
      // above or below the line as it is turned to read along it
      const p = this.p(a);
      const q = this.p(c);
      let dx = q.x - p.x;
      let dy = q.y - p.y;
      if (dx < 0 || (dx === 0 && dy < 0)) [dx, dy] = [-dx, -dy];
      place = `sloped, ${-dy * side.x + dx * side.y >= 0 ? 'above' : 'below'}`;
    }
    this.b.add(`\\path (${a}) -- (${c}) node[${pos}, ${place}] {${text}};`);
  }
  /** A corner's name beside it, on the side away from the point `from`. */
  name(id, text, from, place) {
    if (!text || text === '-') return;
    const p = this.p(id);
    const pl = place ?? placeFor(p.x - from.x, p.y - from.y);
    this.b.add(`\\node[${pl}] at (${id}) {${nameText(text)}};`);
  }
  /** A right-angle mark at corner v between the lines to a and c (size cm), drawn from v. */
  rightAngle(v, a, c, size = 0.22) {
    const V = this.p(v);
    const u = (id) => {
      const q = this.p(id);
      const L = Math.hypot(q.x - V.x, q.y - V.y) || 1;
      return { x: ((q.x - V.x) / L) * size, y: ((q.y - V.y) / L) * size };
    };
    const p = u(a);
    const q = u(c);
    const sh = (x, y) => `([shift={${P(x, y)}}]${v})`;
    this.b.add(`\\draw ${sh(p.x, p.y)} -- ${sh(p.x + q.x, p.y + q.y)} -- ${sh(q.x, q.y)};`);
  }
  /**
   * An angle arc at corner v from the line to a round to the line to c, with
   * an arrowhead on c's line, and its label just inside the arc.
   */
  angle(v, a, c, label, r) {
    const V = this.p(v);
    const deg = (id) => {
      const q = this.p(id);
      return (Math.atan2(q.y - V.y, q.x - V.x) * 180) / Math.PI;
    };
    const a1 = deg(a);
    let a2 = deg(c);
    while (a2 - a1 > 180) a2 -= 360;
    while (a2 - a1 < -180) a2 += 360;
    // the label sits inside a wide arc, outside a small one
    const mid = (a1 + a2) / 2;
    const node = label ? ` node[midway, anchor=${n(r >= 0.8 ? mid : mid + 180, 1)}] {${label}}` : '';
    this.b.add(`\\draw[-{Stealth[length=4pt]}] ([shift={(${n(a1, 2)}:${n(r)})}]${v}) arc[start angle=${n(a1, 2)}, end angle=${n(a2, 2)}, radius=${n(r)}]${node};`);
  }
  dot(id) {
    this.b.add(`\\fill (${id}) circle[radius=1.5pt];`);
  }
}

/** An elliptical arc round corner c from angle a to b (degrees). */
function arc(c, rx, ry, a, b, style = '') {
  const x = rx * Math.cos((a * Math.PI) / 180);
  const y = ry * Math.sin((a * Math.PI) / 180);
  return `\\draw${style ? `[${style}]` : ''} ([shift={${P(x, y)}}]${c}) arc[start angle=${n(a)}, end angle=${n(b)}, x radius=${n(rx)}, y radius=${n(ry)}];`;
}

/** Corner ids from the typed names where they make good TikZ names, otherwise the defaults. */
function cornerIds(names, defaults) {
  const used = new Set();
  return defaults.map((d, i) => {
    const t = names[i];
    const id = t && /^[A-Za-z][A-Za-z0-9]*$/.test(t) && !used.has(t) ? t : d;
    const free = used.has(id) ? `${d}${i}` : id;
    used.add(free);
    return free;
  });
}

// ---------------------------------------------------------------- the solids

function generate(v) {
  const warnings = [];
  const b = new TikzBuilder();
  const S = new Solid(b);
  const unit = String(v.unit ?? '').trim();
  const hid = v.hidden === 'dashed';
  const k = Math.max(0.1, Math.min(0.8, Number(v.ellipse) || 0.3)); // how flat round faces look
  const num = (key, d) => (Number(v[key]) > 0 ? Number(v[key]) : d);
  const pyr = v.solid === 'pyramid';
  const r = num('r', 4);
  const h = pyr ? num('ph', 6) : num('h', 10);
  const w = pyr ? num('pw', 6) : num('w', 6);
  const d = pyr ? num('pd', 6) : num('d', 4);
  // drawn size: the biggest dimension comes out `size` cm across
  const big = { cylinder: Math.max(2 * r, h), cone: Math.max(2 * r, h), sphere: 2 * r, hemisphere: 2 * r }[v.solid] ?? Math.max(w, h, d * 0.6);
  const s = (Number(v.size) || 5) / big;
  const R = r * s;
  const Hh = h * s;
  const W = w * s;
  const D = d * s;
  const ry = R * k;

  const rLab = lengthLabel(v.rLabel, r, unit);
  const hLab = lengthLabel(v.hLabel, h, unit);
  const wLab = lengthLabel(v.wLabel, w, unit);
  const dLab = lengthLabel(v.dLabel, d, unit);
  const sLab = String(v.sLabel ?? '').trim() && String(v.sLabel).trim() !== '-' ? titleText(v.sLabel) : '';
  const names = String(v.names ?? '').trim().split(/[\s,]+/).filter(Boolean);

  if (v.solid === 'cylinder') {
    b.comment(`cylinder: radius ${n(r)}, height ${n(h)}`);
    S.coord('O', 0, 0); // centre of the base
    S.coord('T', 0, Hh); // centre of the top
    b.add(`\\draw (T) ellipse [x radius=${n(R)}, y radius=${n(ry)}];`);
    b.add(`\\draw ([xshift=-${n(R)}cm]O) -- ([xshift=-${n(R)}cm]T) ([xshift=${n(R)}cm]O) -- ([xshift=${n(R)}cm]T);`);
    b.add(arc('O', R, ry, 180, 360));
    if (hid) b.add(arc('O', R, ry, 0, 180, 'dashed'));
    if (v.radius !== 'none') {
      b.comment('radius');
      S.dot('T');
      b.add(`\\draw[dashed] (T) -- ([xshift=${n(R)}cm]T)${rLab ? ` node[midway, above] {${rLab}}` : ''};`);
    }
    if (hLab) {
      b.comment('height, on a line beside the cylinder');
      const ends = v.ends === 'arrows' ? `${TIP}-${TIP}` : v.ends === 'both' ? '{Bar[width=8pt]Stealth[length=5pt]}-{Stealth[length=5pt]Bar[width=8pt]}' : `${BAR}-${BAR}`;
      const x = n(R + 0.6);
      b.add(`\\draw[${ends}] ([xshift=${x}cm]O) -- ([xshift=${x}cm]T) node[midway, fill=white] {${hLab}};`);
    }
  } else if (v.solid === 'cone') {
    b.comment(`cone: radius ${n(r)}, height ${n(h)}`);
    // the sides touch the base where lines from the apex are tangent to it
    const t0 = (Math.asin(Math.min(0.99, ry / Hh)) * 180) / Math.PI;
    const tx = R * Math.cos((t0 * Math.PI) / 180);
    const ty = ry * Math.sin((t0 * Math.PI) / 180);
    S.coord('O', 0, 0); // centre of the base
    S.coord('T', 0, Hh); // the top
    S.coord('L', -tx, ty);
    S.coord('R', tx, ty);
    b.add(`\\draw ${S.path('L', 'T', 'R')};`);
    b.add(arc('O', R, ry, 180 - t0, 360 + t0));
    if (hid) b.add(arc('O', R, ry, t0, 180 - t0, 'dashed'));
    if (v.radius !== 'none') {
      b.comment('radius');
      S.dot('O');
      b.add(`\\draw[dashed] (O) -- ([xshift=${n(R)}cm]O)${rLab ? ` node[midway, above] {${rLab}}` : ''};`);
    }
    if (hLab) {
      b.comment('height');
      b.add(`\\draw[dashed] (O) -- (T) node[pos=0.45, left] {${hLab}};`);
      b.add(`\\draw ([shift={(-0.22,0)}]O) -- ([shift={(-0.22,0.22)}]O) -- ([shift={(0,0.22)}]O);`);
    }
    if (sLab) {
      b.comment('slant height');
      S.edgeLabel('R', 'T', sLab, { x: Hh, y: tx }, { sloped: true });
    }
  } else if (v.solid === 'sphere' || v.solid === 'hemisphere') {
    const half = v.solid === 'hemisphere';
    const bowl = half && v.flat !== 'down'; // flat face on top, curved side below
    b.comment(`${v.solid}${half ? (bowl ? ', flat side up' : ', flat side down') : ''}: radius ${n(r)}`);
    S.coord('O', 0, 0); // the centre
    if (bowl) {
      b.add(`\\draw (O) ellipse [x radius=${n(R)}, y radius=${n(ry)}];`);
      b.add(`\\draw ([xshift=-${n(R)}cm]O) arc[start angle=180, end angle=360, radius=${n(R)}];`);
    } else {
      if (half) b.add(`\\draw ([xshift=-${n(R)}cm]O) arc[start angle=180, end angle=0, radius=${n(R)}];`);
      else b.add(`\\draw (O) circle[radius=${n(R)}];`);
      // the flat face (hemisphere) or the equator (sphere)
      b.add(arc('O', R, ry, 180, 360));
      // the back half is behind the dome or the ball
      if (hid) b.add(arc('O', R, ry, 0, 180, 'dashed'));
    }
    if (v.radius !== 'none') {
      b.comment('radius');
      S.dot('O');
      b.add(`\\draw[dashed] (O) -- ([xshift=${n(R)}cm]O)${rLab ? ` node[midway, above] {${rLab}}` : ''};`);
    }
  } else {
    // prisms and pyramids: the front face flat on the page, depth going back at an angle
    const g = ((Number(v.depthAngle) || 35) * Math.PI) / 180;
    const o = { x: D * 0.6 * Math.cos(g), y: D * 0.6 * Math.sin(g) };
    const dSide = { x: o.y, y: -o.x }; // off the depth edge, outwards
    if (v.solid === 'cuboid') {
      b.comment(`cuboid: ${n(w)} by ${n(d)} by ${n(h)}`);
      // front face from the bottom left going round, then the back face
      const [A, B, C, E, A2, B2, C2, E2] = cornerIds(names, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
      S.coord(A, 0, 0);
      S.coord(B, W, 0);
      S.coord(C, W, Hh);
      S.coord(E, 0, Hh);
      S.coord(A2, o.x, o.y);
      S.coord(B2, W + o.x, o.y);
      S.coord(C2, W + o.x, Hh + o.y);
      S.coord(E2, o.x, Hh + o.y);
      b.add(`\\draw ${S.path(A, B, C, E)} -- cycle;`);
      b.add(`\\draw ${S.path(E, E2, C2, C)} ${S.path(C2, B2, B)};`);
      if (hid) b.add(`\\draw[dashed] ${S.path(A, A2, B2)} ${S.path(A2, E2)};`);
      b.comment('labels');
      S.edgeLabel(A, B, wLab, { x: 0, y: -1 });
      S.edgeLabel(A, E, hLab, { x: -1, y: 0 });
      S.edgeLabel(B, B2, dLab, dSide);
      const mid = { x: W / 2 + o.x / 2, y: Hh / 2 + o.y / 2 };
      [A, B, C, E, A2, B2, C2, E2].forEach((id, i) => S.name(id, names[i], mid));
    } else if (v.solid === 'prism') {
      const ax = Math.max(0, Math.min(1, Number(v.apex ?? 0.5))) * W;
      b.comment(`triangular prism: base ${n(w)}, height ${n(h)}, length ${n(d)}`);
      // front: left, right, top; then the back
      const [A, B, T, A2, B2, T2] = cornerIds(names, ['A', 'B', 'C', 'D', 'E', 'F']);
      S.coord(A, 0, 0);
      S.coord(B, W, 0);
      S.coord(T, ax, Hh);
      S.coord(A2, o.x, o.y);
      S.coord(B2, W + o.x, o.y);
      S.coord(T2, ax + o.x, Hh + o.y);
      b.add(`\\draw ${S.path(A, B, T)} -- cycle;`);
      b.add(`\\draw ${S.path(T, T2, B2, B)};`);
      if (hid) b.add(`\\draw[dashed] ${S.path(A, A2, B2)} ${S.path(A2, T2)};`);
      b.comment('labels');
      S.edgeLabel(A, B, wLab, { x: 0, y: -1 });
      S.edgeLabel(B, B2, dLab, dSide);
      if (hLab) {
        if (ax < 1e-6) S.edgeLabel(A, T, hLab, { x: -1, y: 0 });
        else {
          // the triangle's height, dashed inside the front face, square to its base
          S.coord('foot', ax, 0);
          b.add(`\\draw[dashed] (foot) -- (${T}) node[pos=0.4, ${ax < W / 2 ? 'right' : 'left'}] {${hLab}};`);
          S.rightAngle('foot', T, ax < W / 2 ? B : A, 0.2);
        }
      }
      const mid = { x: W / 2 + o.x / 2, y: Hh / 3 + o.y / 2 };
      [A, B, T, A2, B2, T2].forEach((id, i) => S.name(id, names[i], mid));
    } else if (pyr) {
      b.comment(`pyramid: base ${n(w)} by ${n(d)}, height ${n(h)}`);
      // front left, front right, back right, back left, the top, the centre of the base,
      // the middle of the right-hand edge of the base
      const [A, B, C, E, T, O, N] = cornerIds(names, ['A', 'B', 'C', 'D', 'M', 'O', 'N']);
      S.coord(A, 0, 0);
      S.coord(B, W, 0);
      S.coord(C, W + o.x, o.y);
      S.coord(E, o.x, o.y);
      S.coord(O, W / 2 + o.x / 2, o.y / 2);
      S.coord(T, W / 2 + o.x / 2, o.y / 2 + Hh);
      b.add(`\\draw ${S.path(A, B, C)} ${S.path(A, T, B)} ${S.path(T, C)};`);
      if (hid) b.add(`\\draw[dashed] ${S.path(A, E, C)} ${S.path(E, T)};`);
      const aLab = String(v.aLabel ?? '').trim();
      const ang = ['corner', 'face'].includes(v.angle) ? v.angle : '';
      if (ang === 'face') S.coord(N, W + o.x / 2, o.y / 2);
      const foot = ang === 'face' ? N : A; // where the angle is
      if (hLab || ang) {
        b.comment('height');
        b.add(`\\draw[dashed] (${O}) -- (${T})${hLab ? ` node[pos=0.45, right] {${hLab}}` : ''};`);
        if (ang) S.rightAngle(O, T, foot, 0.25);
        else S.dot(O);
      }
      if (ang) {
        b.comment(ang === 'face' ? 'angle between a face and the base' : 'angle between an edge and the base');
        b.add(`\\draw[dashed] ${S.path(foot, O)};`);
        if (ang === 'face') b.add(`\\draw[dashed] ${S.path(N, T)};`);
        const F = S.p(foot);
        const Op = S.p(O);
        const r0 = Math.max(0.4, Math.min(ang === 'face' ? 0.6 : 1, Math.hypot(Op.x - F.x, Op.y - F.y) * 0.35));
        S.angle(foot, T, O, aLab && aLab !== '-' ? titleText(aLab) : '', r0);
      }
      b.comment('labels');
      S.edgeLabel(A, B, wLab, { x: 0, y: -1 });
      // the depth label moves along for the name of the middle of that edge
      S.edgeLabel(B, C, dLab, dSide, { t: ang === 'face' && names[6] && names[6] !== '-' ? 0.8 : 0.5 });
      if (sLab) S.edgeLabel(A, T, sLab, { x: -1, y: 1 });
      const base = S.p(O);
      S.name(A, names[0], base, 'below left');
      S.name(B, names[1], base, 'below');
      S.name(C, names[2], base);
      S.name(E, names[3], base);
      S.name(T, names[4], base, 'above');
      S.name(O, names[5], base, ang === 'face' ? 'below left' : 'below right');
      if (ang === 'face') S.name(N, names[6], base, 'below');
    }
  }

  if (v.notToScale) b.add(`\\node[anchor=north west, align=center] at ([xshift=0.3cm]current bounding box.north east) {NOT TO \\\\ SCALE};`);
  if (b.lines.some((l) => l.includes('Stealth') || l.includes('Bar['))) b.usePreamble('\\usetikzlibrary{arrows.meta}');
  const opts = [v.lineWidth && v.lineWidth !== 'thin' ? v.lineWidth : '', v.fontSize ? `font=${v.fontSize}` : ''];
  return { code: b.toString(opts), warnings };
}

// ---------------------------------------------------------------- options

const round = (v) => ['cylinder', 'cone', 'sphere', 'hemisphere'].includes(v.solid);
const ball = (v) => v.solid === 'sphere' || v.solid === 'hemisphere';
const is = (...names) => (v) => names.includes(v.solid);
const box = is('cuboid', 'prism'); // width, depth and height shared by these two
const pyramid = is('pyramid');
const num = (key, label, d) => ({ type: 'number', key, label, default: d, step: 0.5, min: 0 });

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
      { value: 'pyramid', label: 'Pyramid' },
    ],
  },
  {
    type: 'group',
    label: 'Measurements',
    fields: [
      {
        type: 'row',
        fields: [
          { ...num('r', 'Radius', 4), showIf: round },
          { ...num('w', 'Width', 6), showIf: box },
          { ...num('d', 'Depth', 4), showIf: box },
          // a pyramid's own measurements: a square base by default
          { ...num('pw', 'Width', 6), showIf: pyramid },
          { ...num('pd', 'Depth', 6), showIf: pyramid },
          { ...num('h', 'Height', 10), showIf: (v) => !ball(v) && !pyramid(v) },
          { ...num('ph', 'Height', 6), showIf: pyramid },
          { type: 'text', key: 'unit', label: 'Unit', default: 'cm' },
        ],
      },
      {
        type: 'number',
        key: 'apex',
        label: 'Top of the triangle',
        default: 0.5,
        step: 0.25,
        min: 0,
        max: 1,
        help: '0 is above the left corner, 0.5 the middle, 1 above the right corner.',
        showIf: is('prism'),
      },
      {
        type: 'select',
        key: 'flat',
        label: 'Flat side',
        default: 'up',
        options: [
          { value: 'up', label: 'Up (a bowl)' },
          { value: 'down', label: 'Down (a dome)' },
        ],
        showIf: is('hemisphere'),
      },
    ],
  },
  {
    type: 'group',
    label: 'Labels',
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'select', key: 'radius', label: 'Radius', default: 'line', options: [{ value: 'line', label: 'Dashed line' }, { value: 'none', label: 'Not shown' }], showIf: round },
          { type: 'text', key: 'rLabel', label: 'Radius label', default: '', placeholder: 'auto', showIf: (v) => round(v) && v.radius !== 'none' },
        ],
        showIf: round,
      },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'wLabel', label: 'Width label', default: '', placeholder: 'auto' },
          { type: 'text', key: 'dLabel', label: 'Depth label', default: '', placeholder: 'auto' },
        ],
        showIf: (v) => !round(v),
      },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'hLabel', label: 'Height label', default: '', placeholder: 'auto' },
          { type: 'text', key: 'sLabel', label: 'Slant edge label', default: '', placeholder: 'none', showIf: is('cone', 'pyramid') },
        ],
        showIf: (v) => !ball(v),
      },
      { type: 'note', text: 'A blank label shows the length and unit (e.g. 4 cm). Type your own, or - for none.' },
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
        showIf: is('cylinder'),
      },
      {
        type: 'row',
        fields: [
          { type: 'select', key: 'angle', label: 'Angle', default: 'none', options: [{ value: 'none', label: 'None' }, { value: 'corner', label: 'Edge to base' }, { value: 'face', label: 'Face to base' }] },
          { type: 'text', key: 'aLabel', label: 'Angle label', default: '$\\theta$', showIf: (v) => v.angle === 'corner' || v.angle === 'face' },
        ],
        showIf: pyramid,
      },
      {
        type: 'text',
        key: 'names',
        label: 'Corner names',
        default: '',
        placeholder: 'e.g. A B C D',
        showIf: is('pyramid', 'cuboid', 'prism'),
      },
      { type: 'note', text: 'Front left, front right, back right, back left, the top, the centre of the base, then the middle of the right-hand base edge (for a face angle). - skips one.', showIf: pyramid },
      { type: 'note', text: 'The front face from the bottom left going round, then the back face the same way. - skips one.', showIf: is('cuboid') },
      { type: 'note', text: 'Front left, front right, the top, then the back the same way. - skips one.', showIf: is('prism') },
      { type: 'checkbox', key: 'notToScale', label: 'NOT TO SCALE', default: true },
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
          { type: 'number', key: 'size', label: 'Size (cm)', default: 5, step: 0.5, min: 1 },
        ],
      },
      { type: 'note', text: 'Size: how long the biggest measurement is drawn.' },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'ellipse', label: 'Flatness of round faces', default: 0.3, step: 0.05, min: 0.1, max: 0.8, showIf: round },
          { type: 'number', key: 'depthAngle', label: 'Depth angle (°)', default: 35, step: 5, min: 10, max: 80, showIf: (v) => !round(v) },
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
