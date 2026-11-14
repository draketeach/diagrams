// SPDX-License-Identifier: CC0-1.0
// The geometry editor's drawing ("scene") and the TikZ made from it.
//
// A scene is plain JSON (it is stored in share links):
// {
//   points: [{ id, name, x, y, showLabel, dot, hidden, label: {dx, dy} | null }],
//   items: [
//     { id, type: 'segment', a, b, style, label, labelPos, ticks, arrows },
//     { id, type: 'polygon', pts: [ids], fill },              (shading only)
//     { id, type: 'angle', v, a, b, label, labelPos, arcs, radius, reflex },
//     { id, type: 'right', v, a, b, size },
//     { id, type: 'circle', c, p, style },                    (centre, a point on it)
//     { id, type: 'arc', c, a, b, style },                    (centre, from a to b anticlockwise)
//     { id, type: 'text', x, y, text },
//   ],
//   settings: { grid, snap, showGrid, lineWidth, fontSize, notToScale, view: {x0, y0, w, h} },
// }
// Coordinates are in cm. In the TikZ every point is a named \coordinate and
// everything else refers to the names, so editing a coordinate moves all of it.

import { TikzBuilder, mathLabel } from '../lib/tikz.js';

export const DEFAULT_SETTINGS = {
  grid: 0.5,
  snap: true,
  showGrid: true,
  lineWidth: 'thin',
  fontSize: '',
  notToScale: false,
  view: { x0: -1, y0: -5, w: 14, h: 8 },
};

export function emptyScene() {
  return { points: [], items: [], settings: structuredClone(DEFAULT_SETTINGS) };
}

/** A small starting drawing: triangle ABC with an angle and a side label. */
export function defaultScene() {
  return {
    points: [
      { id: 'p1', name: 'A', x: 0, y: 0 },
      { id: 'p2', name: 'B', x: 6, y: 0 },
      { id: 'p3', name: 'C', x: 2, y: 3 },
    ].map(normalPoint),
    items: [
      { id: 'i1', type: 'segment', a: 'p1', b: 'p2', label: '6' },
      { id: 'i2', type: 'segment', a: 'p2', b: 'p3' },
      { id: 'i3', type: 'segment', a: 'p3', b: 'p1' },
      { id: 'i4', type: 'angle', v: 'p1', a: 'p2', b: 'p3', label: null },
    ].map(normalItem),
    settings: { ...structuredClone(DEFAULT_SETTINGS), view: { x0: -1.5, y0: -1.5, w: 9, h: 6 } },
  };
}

export function normalPoint(p) {
  return { showLabel: true, dot: false, hidden: false, label: null, ...p };
}

export function normalItem(it) {
  const base = {
    segment: { style: 'solid', label: '', labelPos: null, ticks: 0, arrows: 0 },
    polygon: { fill: 'gray!20' },
    angle: { label: null, labelPos: null, arcs: 1, radius: 0.7, reflex: false },
    right: { size: 0.25 },
    circle: { style: 'solid' },
    arc: { style: 'solid' },
    text: { text: 'Text' },
  }[it.type];
  return { ...base, ...it };
}

export function parseScene(text) {
  if (!text) return defaultScene();
  const s = typeof text === 'string' ? JSON.parse(text) : text;
  return {
    points: (s.points || []).map(normalPoint),
    items: (s.items || []).map(normalItem),
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...(s.settings || {}) },
  };
}

// ---------------------------------------------------------------- geometry

const r3 = (v) => Math.round(v * 1000) / 1000;
export const fmt = (v) => String(r3(v) === 0 ? 0 : r3(v));
const deg = (rad) => (rad * 180) / Math.PI;
const norm360 = (a) => ((a % 360) + 360) % 360;

export function pointMap(scene) {
  return new Map(scene.points.map((p) => [p.id, p]));
}

/** Direction (degrees) from v to p. */
export function dirDeg(v, p) {
  return norm360(deg(Math.atan2(p.y - v.y, p.x - v.x)));
}

/**
 * The angle at v between arms to a and b: { start, end, size } in degrees,
 * anticlockwise from start to end. The smaller angle unless reflex.
 */
export function angleSpan(v, a, b, reflex = false) {
  let s = dirDeg(v, a);
  let e = dirDeg(v, b);
  let size = norm360(e - s);
  let first = 'a'; // the arm the angle starts from, going anticlockwise
  if ((size > 180) !== !!reflex) {
    [s, e] = [e, s];
    size = 360 - size;
    first = 'b';
  }
  return { start: s, end: e, size, first };
}

/** Points joined to p by segments (for placing p's label). */
function neighbours(scene, id, pts) {
  const out = [];
  for (const it of scene.items) {
    if (it.type === 'segment') {
      if (it.a === id) out.push(pts.get(it.b));
      if (it.b === id) out.push(pts.get(it.a));
    }
    if (it.type === 'circle' || it.type === 'arc') {
      if (it.c === id) out.push(...[it.p, it.a, it.b].filter(Boolean).map((q) => pts.get(q)));
    }
  }
  return out.filter(Boolean);
}

/** Where a point's label goes: { dx, dy } from the point (cm). */
export function pointLabelOffset(scene, p, pts = pointMap(scene)) {
  if (p.label) return p.label;
  const nb = neighbours(scene, p.id, pts).filter((q) => q.x !== p.x || q.y !== p.y);
  let ux = 0;
  let uy = 0;
  for (const q of nb) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    ux += (q.x - p.x) / d;
    uy += (q.y - p.y) / d;
  }
  let len = Math.hypot(ux, uy);
  if (len < 1e-6) {
    // no neighbours, or they balance: away from the middle of the drawing
    const c = centroid(scene);
    ux = c.x - p.x;
    uy = c.y - p.y;
    len = Math.hypot(ux, uy);
    if (len < 1e-6) return { dx: -0.25, dy: 0.25 };
  }
  return { dx: r3((-ux / len) * 0.32), dy: r3((-uy / len) * 0.32) };
}

export function centroid(scene) {
  const ps = scene.points.filter((p) => !p.hidden);
  if (!ps.length) return { x: 0, y: 0 };
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
}

/** Where a side's label goes: { dx, dy } from the midpoint, away from the drawing's middle. */
export function segmentLabelOffset(scene, it, pts = pointMap(scene)) {
  if (it.labelPos) return it.labelPos;
  const a = pts.get(it.a);
  const b = pts.get(it.b);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / len;
  let ny = (b.x - a.x) / len;
  const c = centroid(scene);
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (nx * (c.x - m.x) + ny * (c.y - m.y) > 0) {
    nx = -nx;
    ny = -ny;
  }
  // slide along the line, away from a point near the middle (lines meet there)
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  let along = 0;
  for (const p of scene.points) {
    if (p.id === it.a || p.id === it.b) continue;
    const t = (p.x - m.x) * ux + (p.y - m.y) * uy;
    const off = Math.abs((p.x - m.x) * uy - (p.y - m.y) * ux);
    if (off < 0.05 && Math.abs(t) < 0.6) along = t <= 0 ? t + 0.75 : t - 0.75;
  }
  return { dx: r3(nx * 0.3 + ux * along), dy: r3(ny * 0.3 + uy * along) };
}

/** Where an angle's label goes: { dx, dy } from the vertex, along the bisector. */
export function angleLabelOffset(it, pts) {
  if (it.labelPos) return it.labelPos;
  const v = pts.get(it.v);
  const { start, size } = angleSpan(v, pts.get(it.a), pts.get(it.b), it.reflex);
  const mid = ((start + size / 2) * Math.PI) / 180;
  // inside a big enough arc of a wide enough angle, otherwise just outside it
  const r = it.radius ?? 0.7;
  const dist = size >= 40 && r >= 0.9 ? r * 0.62 : r + 0.32;
  return { dx: r3(Math.cos(mid) * dist), dy: r3(Math.sin(mid) * dist) };
}

export function angleText(it, pts) {
  if (it.label !== null && it.label !== undefined) return it.label;
  const { size } = angleSpan(pts.get(it.v), pts.get(it.a), pts.get(it.b), it.reflex);
  return `${Math.round(size)}^\\circ`;
}

// ---------------------------------------------------------------- TikZ

const STYLE = { solid: '', dashed: 'dashed', dotted: 'dotted' };

/** Where tick and arrow marks sit, in pt along the line from its middle. */
export function markOffsets(it) {
  const k = it.ticks || 0;
  const n = it.arrows || 0;
  const tickW = (k - 1) * 2.5;
  const arrowW = (n - 1) * 3.5;
  // with both, the ticks go just before the arrows
  const tickC = n ? -(arrowW / 2 + 4) : 0;
  const arrowC = k ? tickW / 2 + 4 : 0;
  return {
    ticks: Array.from({ length: k }, (_, i) => tickC + (i - (k - 1) / 2) * 2.5),
    arrows: Array.from({ length: n }, (_, i) => arrowC + (i - (n - 1) / 2) * 3.5),
  };
}

function markings(it) {
  const { ticks, arrows } = markOffsets(it);
  const draws = [
    ...ticks.map((x) => `\\draw (${fmt(x)}pt,-3pt) -- (${fmt(x)}pt,3pt);`),
    // an arrow tip ends at the mark, so shift it on by half its length
    ...arrows.map((x) => `\\arrow[xshift=${fmt(x + 2)}pt]{Stealth[length=4pt]}`),
  ];
  const marks = draws.length ? [`mark=at position 0.5 with {${draws.join(' ')}}`] : [];
  return marks.length ? `postaction={decorate}, decoration={markings, ${marks.join(', ')}}` : '';
}

/** Join plain segments that share end points and style into longer paths. */
function chainSegments(segs) {
  const left = [...segs];
  const chains = [];
  while (left.length) {
    const s = left.shift();
    const chain = [s.a, s.b];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const t = left[i];
        if (t.style !== s.style) continue;
        const end = chain[chain.length - 1];
        const startPt = chain[0];
        if (t.a === end) chain.push(t.b);
        else if (t.b === end) chain.push(t.a);
        else if (t.b === startPt) chain.unshift(t.a);
        else if (t.a === startPt) chain.unshift(t.b);
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push({ style: s.style, pts: chain });
  }
  return chains;
}

// free text: plain text (use $…$ for maths); new lines become \\
const textNode = (t) => String(t ?? '').replace(/\n/g, '\\\\');

export function sceneToTikz(scene) {
  const warnings = [];
  const pts = pointMap(scene);
  const S = scene.settings;
  const b = new TikzBuilder();
  const lw = S.lineWidth && S.lineWidth !== 'thin' ? S.lineWidth : '';
  const name = (id) => {
    const p = pts.get(id);
    return p ? p.name : null;
  };
  const known = (...ids) => ids.every((id) => pts.has(id));
  const usedLibs = new Set();

  // names must be unique and usable as TikZ coordinate names
  const seen = new Set();
  for (const p of scene.points) {
    if (!p.name || /[(),.:]/.test(p.name)) warnings.push(`Point name "${p.name}" can't be used in TikZ: avoid ( ) , . :`);
    if (seen.has(p.name)) warnings.push(`Two points are called ${p.name}; give them different names.`);
    seen.add(p.name);
  }

  if (scene.points.length) {
    b.comment('points');
    for (const p of scene.points) b.add(`\\coordinate (${p.name}) at (${fmt(p.x)},${fmt(p.y)});`);
  }

  // ---- shading
  const fills = scene.items.filter((it) => it.type === 'polygon' && it.fill && it.fill !== 'none' && known(...it.pts));
  if (fills.length) {
    b.comment('shading');
    for (const it of fills) b.add(`\\fill[${it.fill}] ${it.pts.map((id) => `(${name(id)})`).join(' -- ')} -- cycle;`);
  }

  // ---- lines: plain ones chained into paths, marked ones on their own
  const segs = scene.items.filter((it) => it.type === 'segment' && known(it.a, it.b));
  const plain = segs.filter((s) => !s.ticks && !s.arrows);
  const marked = segs.filter((s) => s.ticks || s.arrows);
  if (segs.length) b.comment('lines');
  for (const ch of chainSegments(plain)) {
    const closed = ch.pts.length > 3 && ch.pts[0] === ch.pts[ch.pts.length - 1];
    const ids = closed ? ch.pts.slice(0, -1) : ch.pts;
    const opts = [lw, STYLE[ch.style]].filter(Boolean).join(', ');
    b.add(`\\draw${opts ? `[${opts}]` : ''} ${ids.map((id) => `(${name(id)})`).join(' -- ')}${closed ? ' -- cycle' : ''};`);
  }
  for (const s of marked) {
    usedLibs.add('decorations.markings');
    if (s.arrows) usedLibs.add('arrows.meta');
    const opts = [lw, STYLE[s.style], markings(s)].filter(Boolean).join(', ');
    b.add(`\\draw[${opts}] (${name(s.a)}) -- (${name(s.b)});`);
  }

  // ---- circles and arcs
  const curves = scene.items.filter((it) => (it.type === 'circle' && known(it.c, it.p)) || (it.type === 'arc' && known(it.c, it.a, it.b)));
  if (curves.length) b.comment('circles and arcs');
  for (const it of curves) {
    const c = pts.get(it.c);
    const opts = [lw, STYLE[it.style]].filter(Boolean).join(', ');
    if (it.type === 'circle') {
      const r = Math.hypot(pts.get(it.p).x - c.x, pts.get(it.p).y - c.y);
      b.add(`\\draw${opts ? `[${opts}]` : ''} (${c.name}) circle[radius=${fmt(r)}];`);
    } else {
      const a = pts.get(it.a);
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const s = dirDeg(c, a);
      let e = dirDeg(c, pts.get(it.b));
      if (e <= s) e += 360;
      b.add(`\\draw${opts ? `[${opts}]` : ''} ([shift={(${fmt(s)}:${fmt(r)})}]${c.name}) arc[start angle=${fmt(s)}, end angle=${fmt(e)}, radius=${fmt(r)}];`);
    }
  }

  // ---- angles and right angles (pics follow the named points)
  const angles = scene.items.filter((it) => (it.type === 'angle' || it.type === 'right') && known(it.v, it.a, it.b));
  if (angles.length) {
    usedLibs.add('angles');
    b.comment('angles');
  }
  const labels = [];
  for (const it of angles) {
    const v = pts.get(it.v);
    const A = pts.get(it.a);
    const B = pts.get(it.b);
    if ((A.x === v.x && A.y === v.y) || (B.x === v.x && B.y === v.y)) {
      warnings.push(`An angle at ${v.name} has an arm of length 0.`);
      continue;
    }
    if (it.type === 'right') {
      const sp = angleSpan(v, A, B, false);
      const [p, q] = sp.first === 'a' ? [A, B] : [B, A];
      b.add(`\\pic[draw${lw ? `, ${lw}` : ''}, angle radius=${fmt(it.size ?? 0.25)}cm] {right angle = ${p.name}--${v.name}--${q.name}};`);
      continue;
    }
    const sp = angleSpan(v, A, B, it.reflex);
    // TikZ's angle = P--V--Q goes anticlockwise from VP to VQ
    const [p, q] = sp.first === 'a' ? [A, B] : [B, A];
    const r = it.radius ?? 0.7;
    for (let k = 0; k < (it.arcs || 1); k++) {
      b.add(`\\pic[draw${lw ? `, ${lw}` : ''}, angle radius=${fmt(r + k * 0.08)}cm] {angle = ${p.name}--${v.name}--${q.name}};`);
    }
    const text = angleText(it, pts);
    if (text) {
      const off = angleLabelOffset(it, pts);
      labels.push(`\\path (${v.name}) ++(${fmt(off.dx)},${fmt(off.dy)}) node {${mathLabel(text)}};`);
    }
  }

  // ---- labels: side lengths, angle sizes, point names, text
  for (const s of segs) {
    if (!s.label) continue;
    const off = segmentLabelOffset(scene, s, pts);
    labels.push(`\\path (${name(s.a)}) -- (${name(s.b)}) node[midway, xshift=${fmt(off.dx)}cm, yshift=${fmt(off.dy)}cm] {${mathLabel(s.label)}};`);
  }
  for (const p of scene.points) {
    if (p.hidden || !p.showLabel || !p.name) continue;
    const off = pointLabelOffset(scene, p, pts);
    labels.push(`\\path (${p.name}) ++(${fmt(off.dx)},${fmt(off.dy)}) node {${mathLabel(p.name)}};`);
  }
  const dots = scene.points.filter((p) => p.dot && !p.hidden);
  for (const it of scene.items.filter((i) => i.type === 'text')) {
    if (!String(it.text ?? '').trim()) continue;
    labels.push(`\\node[align=center] at (${fmt(it.x)},${fmt(it.y)}) {${textNode(it.text)}};`);
  }
  if (dots.length) {
    b.comment('dots');
    for (const p of dots) b.add(`\\fill (${p.name}) circle[radius=1.5pt];`);
  }
  if (labels.length) {
    b.comment('labels');
    labels.forEach((l) => b.add(l));
  }
  if (S.notToScale) {
    // to the right of the drawing, near the top
    const xs = scene.points.map((p) => p.x);
    const ys = scene.points.map((p) => p.y);
    const x = xs.length ? Math.max(...xs) + 0.8 : 0;
    const y = ys.length ? Math.max(...ys) : 0;
    b.comment('note');
    b.add(`\\node[anchor=north west, align=center] at (${fmt(x)},${fmt(y)}) {NOT TO\\\\SCALE};`);
  }

  if (usedLibs.size) b.usePreamble(`\\usetikzlibrary{${[...usedLibs].sort().join(', ')}}`);
  const opts = S.fontSize ? [`font=${S.fontSize}`] : [];
  return { code: b.toString(opts), warnings };
}

/** Read "\coordinate (NAME) at (x,y);" lines from code: Map name -> {x, y}. */
export function coordinatesFromCode(code) {
  const out = new Map();
  const re = /\\coordinate\s*\(([^)]+)\)\s*at\s*\(\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*,\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*\)/gi;
  let m;
  while ((m = re.exec(code))) out.set(m[1].trim(), { x: Number(m[2]), y: Number(m[3]) });
  return out;
}
