// SPDX-License-Identifier: CC0-1.0
// The geometry editor's drawing ("scene") and the TikZ made from it.
//
// A scene is plain JSON (it is stored in share links):
// {
//   points: [{ id, name, x, y, showLabel, dot, hidden, label: {dx, dy} | null, dep? }],
//     dep (a constructed point, kept in place as the others move):
//       { kind: 'mid', a, b }       the midpoint of a and b
//       { kind: 'foot', p, a, b }   the foot of the perpendicular from p to line ab
//       { kind: 'ray', a, b, ext }  on the line from a through b, ext cm beyond b (a ray's end)
//       { kind: 'north', a, len }   len cm straight up from a (the top of a North line)
//       { kind: 'offset', p, a, b, d } p (a or b) moved d cm square to line ab (+ = left of a→b): a measurement line's end
//   items: [
//     { id, type: 'segment', a, b, style, label, labelPos, ticks, arrows, tip, sloped },
//       tip: 'none' | 'a' | 'b' | 'both' (arrowheads at the ends); sloped: label turned along the line
//       endMode: 'none' | 'bearing' | 'custom', endText: a label beyond the b end (rays: their bearing)
//       bend: degrees (0 straight; + bends left going a→b, as TikZ's bend left)
//       gap: the label sits in a break in the line; bars: short bars across the ends (measurement lines)
//       a === b makes a loop: loopDir (degrees, null = away from the other edges), loopSize (cm)
//   bg: true on a text, angle or line gives its label a white background (to read over shading)
//   settings.scale: the drawing's size on the page (1 = 1 cm a unit); text, marks and gaps stay full size
//   settings.mode: 'geometry' or 'network' (network: dots, no lengths, edges can repeat)
//     { id, type: 'polygon', pts: [ids], fill },              (shading only: a grey, or a pattern in PATTERNS)
//     { id, type: 'angle', v, a, b, label, labelPos, arcs, radius, reflex, arrow },
//       arrow: null, or the id of the arm (a or b) the arc's arrowhead points at
//     { id, type: 'right', v, a, b, size },
//     { id, type: 'circle', c, p, style },                    (centre, a point on it)
//     { id, type: 'arc', c, a, b, style },                    (centre, from a to b anticlockwise)
//     { id, type: 'text', x, y, text },
//     { id, type: 'ticks', a, b, ticks },
//     { id, type: 'curve', pts: [ids], dirs: [degrees or null], style },  (a smooth curve through the points)                     (equal-length marks only, e.g. the halves of a midpoint)
//   ],
//   settings: { grid, snap, showGrid, lineWidth, fontSize, notToScale, firstLetter,
//               lengthDecimals, view: {x0, y0, w, h} },
// A side's or angle's label of null means "its measured size"; '' means none.
// }
// Coordinates are in cm. In the TikZ every point is a named \coordinate and
// everything else refers to the names, so editing a coordinate moves all of it.

import { smoothSections, reverseSections, sectionAt } from '../lib/smooth.js';
import { TikzBuilder, mathLabel } from '../lib/tikz.js';

export const DEFAULT_SETTINGS = {
  grid: 0.5,
  snap: true,
  showGrid: true,
  lineWidth: 'thin',
  fontSize: '',
  notToScale: false,
  firstLetter: 'A',
  lengthDecimals: 1,
  mode: 'geometry',
  unit: '',
  scale: 1,
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
      { id: 'i2', type: 'segment', a: 'p2', b: 'p3', label: '' },
      { id: 'i3', type: 'segment', a: 'p3', b: 'p1', label: '' },
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
    segment: { style: 'solid', label: '', labelPos: null, ticks: 0, arrows: 0, tip: 'none', sloped: false, endMode: 'none', endText: '', bend: 0, loopDir: null, loopSize: 0.8, gap: false, bars: false },
    curve: { pts: [], dirs: [], style: 'solid' },
    polygon: { fill: 'gray!20' },
    angle: { label: null, labelPos: null, arcs: 1, radius: 0.7, reflex: false, arrow: null },
    right: { size: 0.25 },
    circle: { style: 'solid' },
    arc: { style: 'solid' },
    text: { text: 'Text' },
    ticks: { ticks: 1 },
  }[it.type];
  return { ...base, ...it };
}

export function parseScene(text) {
  if (!text) return defaultScene();
  const s = typeof text === 'string' ? JSON.parse(text) : text;
  return resolvePoints({
    points: (s.points || []).map(normalPoint),
    items: (s.items || []).map(normalItem),
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...(s.settings || {}) },
  });
}

/** The points a constructed point is made from. */
export const depSources = (d) => (d ? [d.p, d.a, d.b].filter(Boolean) : []);
// (a North line's top depends on a only)

/** Constructed points in an order where each comes after what it's made from (cycles left out). */
export function dependentOrder(scene) {
  const byId = pointMap(scene);
  const done = new Set(scene.points.filter((p) => !p.dep).map((p) => p.id));
  const order = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of scene.points) {
      if (done.has(p.id) || !p.dep) continue;
      const src = depSources(p.dep);
      if (src.every((id) => done.has(id) && byId.has(id))) {
        done.add(p.id);
        order.push(p);
        grew = true;
      }
    }
  }
  return order;
}

/** Move every constructed point to where its construction puts it (in place). */
export function resolvePoints(scene) {
  const pts = pointMap(scene);
  for (const q of dependentOrder(scene)) {
    const d = q.dep;
    const a = pts.get(d.a);
    const b = pts.get(d.b);
    if (d.kind === 'offset') {
      const p = pts.get(d.p);
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      q.x = r4(p.x - ((b.y - a.y) / L) * (d.d ?? 0.7));
      q.y = r4(p.y + ((b.x - a.x) / L) * (d.d ?? 0.7));
    } else if (d.kind === 'north') {
      q.x = a.x;
      q.y = r4(a.y + (d.len ?? 2.5));
    } else if (d.kind === 'mid') {
      q.x = r4((a.x + b.x) / 2);
      q.y = r4((a.y + b.y) / 2);
    } else if (d.kind === 'ray') {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const e = d.ext ?? 1.2;
      q.x = r4(b.x + ((b.x - a.x) / L) * e);
      q.y = r4(b.y + ((b.y - a.y) / L) * e);
    } else if (d.kind === 'foot') {
      const p = pts.get(d.p);
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = L2 ? ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2 : 0;
      q.x = r4(a.x + t * (b.x - a.x));
      q.y = r4(a.y + t * (b.y - a.y));
    }
  }
  return scene;
}

/** Ids of the points built (directly or not) from the given one. */
export function dependentsOf(scene, id) {
  const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of scene.points) {
      if (out.has(p.id) || !p.dep) continue;
      if (depSources(p.dep).some((s) => s === id || out.has(s))) {
        out.add(p.id);
        grew = true;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- geometry

const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
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
    if (it.type === 'curve') {
      it.pts.forEach((q, i) => {
        if (q !== id) return;
        if (i > 0) out.push(pts.get(it.pts[i - 1]));
        if (i + 1 < it.pts.length) out.push(pts.get(it.pts[i + 1]));
      });
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

// ---------------------------------------------------------------- curved edges and loops

const rad = (d) => (d * Math.PI) / 180;
const LOOP_SPREAD = 35; // degrees either side of a loop's direction
const LOOP_REACH = 1.6; // control-point distance per cm of loop size

/** Which way a loop at point v points by default: away from its other edges. */
export function loopAutoDir(scene, v, pts = pointMap(scene)) {
  const p = pts.get(v);
  const nb = neighbours(scene, v, pts).filter((q) => q.x !== p.x || q.y !== p.y);
  let ux = 0;
  let uy = 0;
  for (const q of nb) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    ux -= (q.x - p.x) / d;
    uy -= (q.y - p.y) / d;
  }
  if (Math.hypot(ux, uy) < 1e-6) {
    const c = centroid(scene);
    [ux, uy] = [p.x - c.x, p.y - c.y];
  }
  return Math.hypot(ux, uy) < 1e-6 ? 90 : (Math.atan2(uy, ux) * 180) / Math.PI;
}

/**
 * A line's shape: { kind: 'line' | 'curve' | 'loop', a, b, c1, c2, dir }.
 * Curves and loops are cubic Béziers with the control points TikZ uses
 * (a bend uses "out"/"in" angles with looseness 1: control points 0.3915 × the
 * distance away).
 */
export function edgeShape(it, pts, scene = null) {
  const a = pts.get(it.a);
  const b = pts.get(it.b);
  if (it.a === it.b) {
    const dir = it.loopDir ?? (scene ? loopAutoDir(scene, it.a, pts) : 90);
    const r = (it.loopSize ?? 0.8) * LOOP_REACH;
    return {
      kind: 'loop',
      a,
      b: a,
      dir,
      c1: { x: a.x + r * Math.cos(rad(dir + LOOP_SPREAD)), y: a.y + r * Math.sin(rad(dir + LOOP_SPREAD)) },
      c2: { x: a.x + r * Math.cos(rad(dir - LOOP_SPREAD)), y: a.y + r * Math.sin(rad(dir - LOOP_SPREAD)) },
    };
  }
  if (!it.bend) return { kind: 'line', a, b };
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const g = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const k = 0.3915 * d;
  return {
    kind: 'curve',
    a,
    b,
    c1: { x: a.x + k * Math.cos(rad(g + it.bend)), y: a.y + k * Math.sin(rad(g + it.bend)) },
    c2: { x: b.x + k * Math.cos(rad(g + 180 - it.bend)), y: b.y + k * Math.sin(rad(g + 180 - it.bend)) },
  };
}

/** A point part-way (t from 0 to 1) along a line's shape. */
export function shapeAt(sh, t) {
  if (sh.kind === 'line') return { x: sh.a.x + (sh.b.x - sh.a.x) * t, y: sh.a.y + (sh.b.y - sh.a.y) * t };
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: w[0] * sh.a.x + w[1] * sh.c1.x + w[2] * sh.c2.x + w[3] * sh.b.x,
    y: w[0] * sh.a.y + w[1] * sh.c1.y + w[2] * sh.c2.y + w[3] * sh.b.y,
  };
}

/** The direction of travel (unit vector) half-way along a line's shape. */
export function shapeTangent(sh) {
  const v =
    sh.kind === 'line'
      ? { x: sh.b.x - sh.a.x, y: sh.b.y - sh.a.y }
      : { x: sh.b.x + sh.c2.x - sh.c1.x - sh.a.x, y: sh.b.y + sh.c2.y - sh.c1.y - sh.a.y };
  const L = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / L, y: v.y / L };
}

/** Where a line's label is measured from: the middle of the line, or of its curve. */
export function segmentMid(it, pts, scene = null) {
  return shapeAt(edgeShape(it, pts, scene), 0.5);
}

export function centroid(scene) {
  const ps = scene.points.filter((p) => !p.hidden);
  if (!ps.length) return { x: 0, y: 0 };
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
}

/** Where a side's label goes: { dx, dy } from the midpoint, away from the drawing's middle. */
export function segmentLabelOffset(scene, it, pts = pointMap(scene)) {
  if (it.labelPos) return it.labelPos;
  if (it.a === it.b || it.bend) {
    // outside the bulge of a curve or loop
    const sh = edgeShape(it, pts, scene);
    const m = shapeAt(sh, 0.5);
    const base = sh.kind === 'loop' ? sh.a : { x: (sh.a.x + sh.b.x) / 2, y: (sh.a.y + sh.b.y) / 2 };
    const L = Math.hypot(m.x - base.x, m.y - base.y) || 1;
    return { dx: r3(((m.x - base.x) / L) * 0.3), dy: r3(((m.y - base.y) / L) * 0.3) };
  }
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
  // a curved edge between the same two points: the straight one's label goes the other side
  const twin = scene.items.find(
    (o) => o !== it && o.type === 'segment' && o.bend && ((o.a === it.a && o.b === it.b) || (o.a === it.b && o.b === it.a))
  );
  if (twin) {
    const bulge = shapeAt(edgeShape(twin, pts, scene), 0.5);
    if (nx * (bulge.x - m.x) + ny * (bulge.y - m.y) > 0) {
      nx = -nx;
      ny = -ny;
    }
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

/** A side's label: its own text, or its measured length (null), or nothing (''). */
export function segmentText(it, pts, settings = DEFAULT_SETTINGS) {
  if (it.label !== null && it.label !== undefined) return it.label;
  const a = pts.get(it.a);
  const b = pts.get(it.b);
  if (!a || !b) return '';
  const d = Math.max(0, Math.min(4, Number(settings.lengthDecimals ?? 1)));
  const unit = String(settings.unit ?? '').trim();
  // (a scaled copy of a drawing measures in the drawing's own units)
  const len = Math.hypot(b.x - a.x, b.y - a.y) * (settings.lengthFactor ?? 1);
  return String(Number(len.toFixed(d))) + (unit ? `\\ \\mathrm{${unit}}` : '');
}

export function angleText(it, pts) {
  if (it.label !== null && it.label !== undefined) return it.label;
  const { size } = angleSpan(pts.get(it.v), pts.get(it.a), pts.get(it.b), it.reflex);
  return `${Math.round(size)}^\\circ`;
}

// ---------------------------------------------------------------- spacing labels out

/** Rough printed size of a label (cm): about 0.19 cm a character, 0.36 cm tall. */
function labelBox(text) {
  const shown = String(text ?? '')
    .replace(/\^\{?\\circ\}?/g, '°')
    .replace(/\\(?:frac|dfrac)\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[${}_^]/g, '');
  return { w: Math.max(1, shown.length) * 0.19 + 0.08, h: 0.38 };
}

/**
 * Where every label goes, as { dx, dy } from its anchor (cm), keyed
 * 'p:<point id>', 's:<segment id>' and 'a:<angle id>'.
 *
 * Each label tries a few places near its default one: a side's length on
 * either side of its line and slid along it, an angle's size further in or
 * out along the bisector, a point's name around the point. It takes the place
 * that clashes least with lines, arcs, points and the labels already placed,
 * preferring places nearest its default. Labels placed by hand stay put.
 */
export function labelPositions(scene, pts = pointMap(scene)) {
  const S = scene.settings || DEFAULT_SETTINGS;
  const placed = []; // boxes: { x, y, w, h }
  const out = new Map();

  // ---- what labels keep clear of: points, lines, arcs, free text
  const dots = scene.points.filter((p) => !p.hidden).map((p) => ({ x: p.x, y: p.y }));
  const samples = []; // { x, y, seg }
  const sampleLine = (a, b, seg = null) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.08));
    for (let i = 0; i <= n; i++) samples.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, seg });
  };
  for (const it of scene.items) {
    if (it.type === 'segment' && pts.get(it.a) && pts.get(it.b)) {
      const sh = edgeShape(it, pts, scene);
      if (sh.kind === 'line') sampleLine(sh.a, sh.b, it.id);
      else for (let t = 0; t <= 1.0001; t += 0.04) samples.push({ ...shapeAt(sh, t), seg: it.id });
    }
    if (it.type === 'angle' && pts.get(it.v) && pts.get(it.a) && pts.get(it.b)) {
      const v = pts.get(it.v);
      const sp = angleSpan(v, pts.get(it.a), pts.get(it.b), it.reflex);
      const r = (it.radius ?? 0.7) + ((it.arcs || 1) - 1) * 0.08;
      for (let t = 0; t <= sp.size; t += 6) {
        const g = ((sp.start + t) * Math.PI) / 180;
        samples.push({ x: v.x + r * Math.cos(g), y: v.y + r * Math.sin(g) });
      }
    }
    if (it.type === 'curve') {
      const cs = curveSections(it, pts);
      if (cs) {
        let a = cs.start;
        for (const sec of cs.sections) {
          for (let t = 0; t <= 1.0001; t += 0.1) samples.push(sectionAt(a, sec, t));
          a = sec.p;
        }
      }
    }
    if (it.type === 'right' && pts.get(it.v) && pts.get(it.a) && pts.get(it.b)) {
      const v = pts.get(it.v);
      const sp = angleSpan(v, pts.get(it.a), pts.get(it.b), false);
      const z = it.size ?? 0.25;
      const u = (sp.start * Math.PI) / 180;
      const w = u + Math.PI / 2;
      const p1 = { x: v.x + z * Math.cos(u), y: v.y + z * Math.sin(u) };
      const p3 = { x: v.x + z * Math.cos(w), y: v.y + z * Math.sin(w) };
      const p2 = { x: p1.x + p3.x - v.x, y: p1.y + p3.y - v.y };
      sampleLine(p1, p2);
      sampleLine(p2, p3);
      samples.push({ x: (v.x + p2.x) / 2, y: (v.y + p2.y) / 2 });
    }
    if (it.type === 'circle' && pts.get(it.c) && pts.get(it.p)) {
      const c = pts.get(it.c);
      const r = Math.hypot(pts.get(it.p).x - c.x, pts.get(it.p).y - c.y);
      const n = Math.max(24, Math.ceil((2 * Math.PI * r) / 0.1));
      for (let i = 0; i < n; i++) samples.push({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) });
    }
    if (it.type === 'text' && String(it.text ?? '').trim()) {
      const lines = String(it.text).split(/\n|\\\\/);
      const box = labelBox(lines.reduce((m, l) => (l.length > m.length ? l : m), ''));
      placed.push({ x: it.x, y: it.y, w: box.w, h: lines.length * 0.42 });
    }
  }

  /** How badly a box at (x, y) clashes with what's there. */
  const clash = (x, y, box, ownSeg, ownPoint) => {
    let c = 0;
    const hw = box.w / 2;
    const hh = box.h / 2;
    for (const q of placed) {
      const ox = hw + q.w / 2 + 0.04 - Math.abs(x - q.x);
      const oy = hh + q.h / 2 + 0.04 - Math.abs(y - q.y);
      if (ox > 0 && oy > 0) c += 6 + 40 * ox * oy;
    }
    for (const sm of samples) {
      if (sm.seg && sm.seg === ownSeg) continue;
      if (Math.abs(sm.x - x) < hw + 0.02 && Math.abs(sm.y - y) < hh + 0.02) c += 1.5;
    }
    for (const d of dots) {
      if (ownPoint && d.x === ownPoint.x && d.y === ownPoint.y) continue;
      if (Math.abs(d.x - x) < hw + 0.08 && Math.abs(d.y - y) < hh + 0.08) c += 5;
    }
    return c;
  };

  /** Take the cheapest candidate: cost = clash + how far it is from the default. */
  const choose = (key, anchor, box, cands, own = {}) => {
    let best = null;
    for (const cd of cands) {
      const cost = clash(anchor.x + cd.dx, anchor.y + cd.dy, box, own.seg, own.point) + cd.penalty;
      if (!best || cost < best.cost - 1e-9) best = { ...cd, cost };
    }
    out.set(key, { dx: r3(best.dx), dy: r3(best.dy) });
    placed.push({ x: anchor.x + best.dx, y: anchor.y + best.dy, ...box });
  };

  // text beyond the ends of lines (bearings) is fixed; the rest avoid it
  for (const it of scene.items) {
    const t = it.type === 'segment' && pts.get(it.a) && pts.get(it.b) ? endText(it, pts) : '';
    if (!t) continue;
    const o = endOffset(it, pts, t);
    placed.push({ x: pts.get(it.b).x + o.dx, y: pts.get(it.b).y + o.dy, ...labelBox(t) });
  }

  // labels placed by hand first: they don't move, and the rest avoid them
  const later = [];
  for (const p of scene.points) {
    if (p.hidden || !p.showLabel || !p.name) continue;
    if (p.label) {
      out.set(`p:${p.id}`, p.label);
      placed.push({ x: p.x + p.label.dx, y: p.y + p.label.dy, ...labelBox(p.name) });
    } else later.push(['point', p]);
  }
  for (const it of scene.items) {
    if (it.type === 'angle') {
      const v = pts.get(it.v);
      if (!v || !pts.get(it.a) || !pts.get(it.b)) continue;
      const text = angleText(it, pts);
      if (!text) continue;
      if (it.labelPos) {
        out.set(`a:${it.id}`, it.labelPos);
        placed.push({ x: v.x + it.labelPos.dx, y: v.y + it.labelPos.dy, ...labelBox(text) });
      } else later.push(['angle', it, text]);
    } else if (it.type === 'segment') {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      const text = a && b ? segmentText(it, pts, S) : '';
      if (!text) continue;
      if (labelGap(it, pts, text)) {
        // in the line's own gap
        out.set(`s:${it.id}`, { dx: 0, dy: 0 });
        placed.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ...labelBox(text) });
        continue;
      }
      if (it.labelPos) {
        out.set(`s:${it.id}`, it.labelPos);
        const m = segmentMid(it, pts, scene);
        placed.push({ x: m.x + it.labelPos.dx, y: m.y + it.labelPos.dy, ...labelBox(text) });
      } else later.push(['segment', it, text]);
    }
  }
  const order = { point: 0, angle: 1, segment: 2 };
  later.sort((x, y) => order[x[0]] - order[y[0]]);

  for (const [kind, it, text] of later) {
    if (kind === 'point') {
      const box = labelBox(it.name);
      const d0 = pointLabelOffset(scene, it, pts);
      const g0 = Math.atan2(d0.dy, d0.dx);
      const cands = [];
      for (let k = 0; k < 12; k++) {
        const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1); // 0, 1, -1, 2, -2, …
        const g = g0 + (step * Math.PI) / 6;
        const dist = 0.24 + box.w / 2 * Math.abs(Math.cos(g)) * 0.6 + 0.04;
        cands.push({ dx: Math.cos(g) * Math.max(0.32, dist), dy: Math.sin(g) * Math.max(0.32, dist), penalty: Math.abs(step) * 0.35 });
      }
      choose(`p:${it.id}`, it, box, cands, { point: it });
    } else if (kind === 'angle') {
      const v = pts.get(it.v);
      const box = labelBox(text);
      const d0 = angleLabelOffset(it, pts);
      const d = Math.hypot(d0.dx, d0.dy) || 1;
      const u = { x: d0.dx / d, y: d0.dy / d };
      const r = (it.radius ?? 0.7) + ((it.arcs || 1) - 1) * 0.08;
      const cands = [];
      for (const extra of [0, 0.15, 0.3, 0.5, 0.75, 1]) cands.push({ dx: u.x * (d + extra), dy: u.y * (d + extra), penalty: extra * 1.2 });
      // just inside the arc, if that's where it isn't already
      if (d > r) cands.push({ dx: u.x * r * 0.6, dy: u.y * r * 0.6, penalty: 0.8 });
      choose(`a:${it.id}`, v, box, cands);
    } else {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      // along the line, or along a curve where its label sits (slides stay short there)
      const sh = edgeShape(it, pts, scene);
      const mid = shapeAt(sh, 0.5);
      const tan = shapeTangent(sh);
      const len = sh.kind === 'line' ? Math.hypot(b.x - a.x, b.y - a.y) || 1 : 1.1;
      const ux = tan.x;
      const uy = tan.y;
      const flat = labelBox(text);
      // a label turned along the line takes up a slanted box: use the box around it
      const box = it.sloped
        ? { w: flat.w * Math.abs(ux) + flat.h * Math.abs(uy), h: flat.w * Math.abs(uy) + flat.h * Math.abs(ux) }
        : flat;
      const d0 = segmentLabelOffset(scene, it, pts);
      // the default side, then the other one
      let nx = -uy;
      let ny = ux;
      if (nx * d0.dx + ny * d0.dy < 0) [nx, ny] = [-nx, -ny];
      const reach = it.sloped ? flat.h / 2 + 0.07 : (box.w / 2) * Math.abs(nx) + (box.h / 2) * Math.abs(ny) + 0.07;
      const along0 = d0.dx * ux + d0.dy * uy;
      const cands = [];
      for (const side of [1, -1]) {
        for (const off of [0, 0.15, 0.3]) {
          const dist = Math.max(0.26, reach) + off;
          for (const t of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2]) {
            const along = along0 + t;
            if (Math.abs(along) > len / 2 - 0.1) continue;
            cands.push({
              dx: nx * side * dist + ux * along,
              dy: ny * side * dist + uy * along,
              penalty: (side < 0 ? 1 : 0) + Math.abs(t) * 0.9 + off * 2,
            });
          }
        }
      }
      if (!cands.length) cands.push({ ...d0, penalty: 0 });
      choose(`s:${it.id}`, mid, box, cands, { seg: it.id });
    }
  }
  return out;
}

// ---------------------------------------------------------------- TikZ

const STYLE = { solid: '', dashed: 'dashed', dotted: 'dotted' };

/** Pattern fills (patterns.meta), the same stipples as the normal distribution's shading. */
export const PATTERNS = {
  dots: 'Dots[radius=0.33pt, distance=1.5pt, angle=45]',
  'dots-sparse': 'Dots[radius=0.42pt, distance=3pt, angle=45]',
  hatch: 'Hatch[angle=45, distance=3pt, line width=0.3pt]',
};

const TIP = '{Stealth[length=5pt]}';
/** A white patch behind a label, so it reads over shading. */
const BG = 'fill=white, inner sep=1.5pt';
function tipOption(it) {
  return { a: `${TIP}-`, b: `-${TIP}`, both: `${TIP}-${TIP}` }[it.tip] || '';
}

/** The bearing (degrees clockwise from north, 0–360) from a to b. */
export function bearingDeg(a, b) {
  return norm360(90 - (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}
/** A bearing as exams write it: three digits and a degree sign, e.g. 056^\circ. */
export function bearingText(deg) {
  const n = Math.round(norm360(deg)) % 360;
  return `${String(n).padStart(3, '0')}^\\circ`;
}

/** The text beyond a line's b end, or '' for none. */
export function endText(it, pts) {
  if (it.type !== 'segment' || !it.endMode || it.endMode === 'none') return '';
  if (it.endMode === 'custom') return it.endText || '';
  // a ray's bearing runs from its start through the point it passes
  const a = pts.get(it.a);
  const b = pts.get(it.b);
  if (!a || !b) return '';
  return bearingText(bearingDeg(a, b));
}
/** Where that text goes: { dx, dy } from the b end, just past it along the line. */
export function endOffset(it, pts, text) {
  const a = pts.get(it.a);
  const b = pts.get(it.b);
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  const box = labelBox(text);
  const reach = (box.w / 2) * Math.abs(ux) + (box.h / 2) * Math.abs(uy) + 0.12;
  return { dx: r3(ux * reach), dy: r3(uy * reach) };
}

/** A curve item's sections (smooth through its points), or null if a point is missing. */
export function curveSections(it, pts) {
  const P = it.pts.map((id, i) => {
    const p = pts.get(id);
    return p ? { x: p.x, y: p.y, dir: it.dirs?.[i] ?? null } : null;
  });
  if (P.length < 2 || P.some((p) => !p)) return null;
  return { start: P[0], sections: smoothSections(P, 0.5) };
}

/** Where a gap in a line for its label starts and ends (cm along the line from a), or null. */
export function labelGap(it, pts, text) {
  if (!it.gap || !text || it.a === it.b || it.bend) return null;
  const a = pts.get(it.a);
  const b = pts.get(it.b);
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return null;
  const ux = Math.abs(b.x - a.x) / L;
  const uy = Math.abs(b.y - a.y) / L;
  const box = labelBox(text);
  const half = it.sloped ? box.w / 2 + 0.1 : (box.w / 2) * ux + (box.h / 2) * uy + 0.1;
  if (2 * half >= L - 0.2) return null;
  return { from: L / 2 - half, to: L / 2 + half, L };
}

/**
 * A polygon's outline for shading: straight from corner to corner, except
 * where a curve runs from one corner to the next — then along the curve.
 */
export function polygonEdges(scene, it, pts) {
  const n = it.pts.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = it.pts[i];
    const b = it.pts[(i + 1) % n];
    const curve = scene.items.find((c) => c.type === 'curve' && c.pts.length >= 2 && ((c.pts[0] === a && c.pts[c.pts.length - 1] === b) || (c.pts[0] === b && c.pts[c.pts.length - 1] === a)));
    const cs = curve && curveSections(curve, pts);
    if (cs) edges.push({ a, b, sections: curve.pts[0] === a ? cs.sections : reverseSections(cs.start, cs.sections) });
    else edges.push({ a, b, sections: null });
  }
  return edges;
}
function fillPath(scene, it, pts, name) {
  let out = `(${name(it.pts[0])})`;
  for (const e of polygonEdges(scene, it, pts)) {
    if (!e.sections) out += ` -- (${name(e.b)})`;
    else e.sections.forEach((sec, i) => {
      const end = i === e.sections.length - 1 ? `(${name(e.b)})` : `(${fmt(sec.p.x)},${fmt(sec.p.y)})`;
      out += ` .. controls (${fmt(sec.c1.x)},${fmt(sec.c1.y)}) and (${fmt(sec.c2.x)},${fmt(sec.c2.y)}) .. ${end}`;
    });
  }
  return out.replace(/ -- \([^)]*\)$/, '') + ' -- cycle';
}

/** TikZ for a line's path: "(A) -- (B)", "(A) to[bend left=30] (B)" or a loop; `node` goes at its middle. */
export function segPath(it, pts, nameOf, scene, node = '') {
  const A = `(${nameOf(it.a)})`;
  const B = `(${nameOf(it.b)})`;
  const sp = node ? ` ${node}` : '';
  if (it.a === it.b) {
    const sh = edgeShape(it, pts, scene);
    const r = (it.loopSize ?? 0.8) * LOOP_REACH;
    return `${A} .. controls +(${fmt(sh.dir + LOOP_SPREAD)}:${fmt(r)}) and +(${fmt(sh.dir - LOOP_SPREAD)}:${fmt(r)}) .. ${A}${sp}`;
  }
  if (it.bend) return `${A} to[bend ${it.bend > 0 ? 'left' : 'right'}=${fmt(Math.abs(it.bend))}]${sp} ${B}`;
  return `${A} -- ${B}${sp}`;
}

/** The angle (degrees) to turn a label so it runs along a line, kept upright. */
export function slopeDeg(a, b) {
  let g = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (g > 90) g -= 180;
  if (g <= -90) g += 180;
  return g;
}

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

/**
 * The drawing at its scale: positions shrink (or grow), while sizes on the
 * page — text, label offsets, arrowheads, angle arcs, gaps, how far a
 * measurement line stands off — stay as they are.
 */
export function scaledScene(scene) {
  const k = Number(scene.settings.scale) || 1;
  if (k === 1) return scene;
  const out = structuredClone(scene);
  for (const p of out.points) {
    p.x = r4(p.x * k);
    p.y = r4(p.y * k);
    if (p.dep?.kind === 'north') p.dep.len = (p.dep.len ?? 2.5) * k;
    if (p.dep?.kind === 'ray') p.dep.ext = (p.dep.ext ?? 1.2) * k;
  }
  for (const it of out.items) {
    if (it.type === 'text') {
      it.x = r4(it.x * k);
      it.y = r4(it.y * k);
    }
  }
  out.settings = { ...out.settings, scale: 1, lengthFactor: 1 / k };
  return resolvePoints(out);
}

export function sceneToTikz(sceneIn) {
  const warnings = [];
  resolvePoints(sceneIn);
  const scaleNote = (Number(sceneIn.settings.scale) || 1) !== 1 ? Number(sceneIn.settings.scale) : null;
  const scene = scaledScene(sceneIn);
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
    b.comment(scaleNote ? `points (at scale ${fmt(scaleNote)}: these are page cm, the drawing's units × ${fmt(scaleNote)})` : 'points');
    for (const p of scene.points) if (!p.dep) b.add(`\\coordinate (${p.name}) at (${fmt(p.x)},${fmt(p.y)});`);
    const deps = dependentOrder(scene);
    for (const p of deps) {
      usedLibs.add('calc');
      const d = p.dep;
      const expr =
        d.kind === 'mid'
          ? `$(${name(d.a)})!0.5!(${name(d.b)})$`
          : d.kind === 'ray'
            ? `$(${name(d.b)})!-${fmt(d.ext ?? 1.2)}cm!(${name(d.a)})$`
            : d.kind === 'north'
              ? `$(${name(d.a)})+(0,${fmt(d.len ?? 2.5)})$`
              : d.kind === 'offset'
                ? d.p === d.a
                  ? `$(${name(d.a)})!${fmt(d.d ?? 0.7)}cm!90:(${name(d.b)})$`
                  : `$(${name(d.b)})!${fmt(d.d ?? 0.7)}cm!-90:(${name(d.a)})$`
            : `$(${name(d.a)})!(${name(d.p)})!(${name(d.b)})$`;
      const note = { mid: 'midpoint', ray: `end of ray ${name(d.a)}${name(d.b)}`, north: `north of ${name(d.a)}`, foot: 'foot of perpendicular', offset: `measuring ${name(d.a)}${name(d.b)}` }[d.kind];
      b.add(`\\coordinate (${p.name}) at (${expr}); % ${note}`);
    }
    for (const p of scene.points) {
      if (p.dep && !deps.includes(p)) {
        warnings.push(`${p.name} is built from points that are missing.`);
        b.add(`\\coordinate (${p.name}) at (${fmt(p.x)},${fmt(p.y)});`);
      }
    }
  }

  // ---- shading
  const fills = scene.items.filter((it) => it.type === 'polygon' && it.fill && it.fill !== 'none' && known(...it.pts));
  if (fills.length) {
    b.comment('shading');
    for (const it of fills) {
      const pat = PATTERNS[it.fill];
      if (pat) usedLibs.add('patterns.meta');
      b.add(`\\fill[${pat ? `pattern={${pat}}` : it.fill}] ${fillPath(scene, it, pts, name)};`);
    }
  }

  // ---- lines: plain ones chained into paths, marked ones on their own
  const segs = scene.items.filter((it) => it.type === 'segment' && known(it.a, it.b));
  const special = (s) => s.ticks || s.arrows || (s.tip && s.tip !== 'none') || s.bend || s.a === s.b || s.gap || s.bars;
  const plain = segs.filter((s) => !special(s));
  const marked = segs.filter(special);
  if (segs.length) b.comment('lines');
  for (const ch of chainSegments(plain)) {
    const closed = ch.pts.length > 3 && ch.pts[0] === ch.pts[ch.pts.length - 1];
    const ids = closed ? ch.pts.slice(0, -1) : ch.pts;
    const opts = [lw, STYLE[ch.style]].filter(Boolean).join(', ');
    b.add(`\\draw${opts ? `[${opts}]` : ''} ${ids.map((id) => `(${name(id)})`).join(' -- ')}${closed ? ' -- cycle' : ''};`);
  }
  for (const s of marked) {
    if (s.ticks || s.arrows) usedLibs.add('decorations.markings');
    if (s.arrows || tipOption(s)) usedLibs.add('arrows.meta');
    const gap = labelGap(s, pts, segmentText(s, pts, S));
    if (gap) {
      // two pieces either side of the label, each with its own end's arrowhead
      const A = pts.get(s.a);
      const B = pts.get(s.b);
      const at = (t) => `(${fmt(A.x + ((B.x - A.x) * t) / gap.L)},${fmt(A.y + ((B.y - A.y) * t) / gap.L)})`;
      const tipA = s.tip === 'a' || s.tip === 'both' ? `${TIP}-` : '';
      const tipB = s.tip === 'b' || s.tip === 'both' ? `-${TIP}` : '';
      const o1 = [tipA, lw, STYLE[s.style]].filter(Boolean).join(', ');
      const o2 = [tipB, lw, STYLE[s.style]].filter(Boolean).join(', ');
      b.add(`\\draw${o1 ? `[${o1}]` : ''} (${name(s.a)}) -- ${at(gap.from)};`);
      b.add(`\\draw${o2 ? `[${o2}]` : ''} ${at(gap.to)} -- (${name(s.b)});`);
    } else {
      const opts = [tipOption(s), lw, STYLE[s.style], markings(s)].filter(Boolean).join(', ');
      b.add(`\\draw${opts ? `[${opts}]` : ''} ${segPath(s, pts, name, scene)};`);
    }
    if (s.bars && s.a !== s.b) {
      // short bars square across both ends
      const A = pts.get(s.a);
      const B = pts.get(s.b);
      const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const nx = (-(B.y - A.y) / L) * 0.15;
      const ny = ((B.x - A.x) / L) * 0.15;
      for (const P of [A, B]) b.add(`\\draw${lw ? `[${lw}]` : ''} (${fmt(P.x + nx)},${fmt(P.y + ny)}) -- (${fmt(P.x - nx)},${fmt(P.y - ny)});`);
    }
  }

  // ---- smooth curves through points
  const smooths = scene.items.filter((it) => it.type === 'curve' && known(...it.pts) && it.pts.length >= 2);
  if (smooths.length) b.comment('curves');
  for (const c of smooths) {
    const cs = curveSections(c, pts);
    let path = `(${name(c.pts[0])})`;
    cs.sections.forEach((sec, i) => {
      path += ` .. controls (${fmt(sec.c1.x)},${fmt(sec.c1.y)}) and (${fmt(sec.c2.x)},${fmt(sec.c2.y)}) .. (${name(c.pts[i + 1])})`;
    });
    const opts = [lw, STYLE[c.style]].filter(Boolean).join(', ');
    b.add(`\\draw${opts ? `[${opts}]` : ''} ${path};`);
  }

  // ---- equal-length marks on their own (the line itself is drawn elsewhere)
  const tickMarks = scene.items.filter((it) => it.type === 'ticks' && it.ticks > 0 && known(it.a, it.b));
  if (tickMarks.length) {
    usedLibs.add('decorations.markings');
    b.comment('equal lengths');
    for (const it of tickMarks) b.add(`\\path[${[lw, markings({ ticks: it.ticks })].filter(Boolean).join(', ')}] (${name(it.a)}) -- (${name(it.b)});`);
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
  const placed = labelPositions(scene, pts);
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
    // an arrowhead on the outer arc, pointing at the chosen arm
    let tip = '';
    if (it.arrow === it.a || it.arrow === it.b) {
      usedLibs.add('arrows.meta');
      tip = pts.get(it.arrow) === q ? ', -{Stealth[length=4pt]}' : ', {Stealth[length=4pt]}-';
    }
    const n = it.arcs || 1;
    for (let k = 0; k < n; k++) {
      b.add(`\\pic[draw${lw ? `, ${lw}` : ''}${k === n - 1 ? tip : ''}, angle radius=${fmt(r + k * 0.08)}cm] {angle = ${p.name}--${v.name}--${q.name}};`);
    }
    const text = angleText(it, pts);
    if (text) {
      const off = placed.get(`a:${it.id}`) ?? angleLabelOffset(it, pts);
      labels.push(`\\path (${v.name}) ++(${fmt(off.dx)},${fmt(off.dy)}) node${it.bg ? `[${BG}]` : ''} {${mathLabel(text)}};`);
    }
  }

  // ---- text beyond the ends of lines (a ray's bearing)
  for (const s of segs) {
    const t = endText(s, pts);
    if (!t) continue;
    const o = endOffset(s, pts, t);
    labels.push(`\\path (${name(s.b)}) ++(${fmt(o.dx)},${fmt(o.dy)}) node {${mathLabel(t)}};`);
  }

  // ---- labels: side lengths, angle sizes, point names, text
  for (const s of segs) {
    const text = segmentText(s, pts, S);
    if (!text) continue;
    const off = placed.get(`s:${s.id}`) ?? segmentLabelOffset(scene, s, pts);
    const tan = shapeTangent(edgeShape(s, pts, scene));
    const turn = s.sloped ? `, rotate=${fmt(slopeDeg({ x: 0, y: 0 }, tan))}` : '';
    labels.push(`\\path ${segPath(s, pts, name, scene, `node[midway, xshift=${fmt(off.dx)}cm, yshift=${fmt(off.dy)}cm${turn}${s.bg ? `, ${BG}` : ''}] {${mathLabel(text)}}`)};`);
  }
  for (const p of scene.points) {
    if (p.hidden || !p.showLabel || !p.name) continue;
    const off = placed.get(`p:${p.id}`) ?? pointLabelOffset(scene, p, pts);
    labels.push(`\\path (${p.name}) ++(${fmt(off.dx)},${fmt(off.dy)}) node {${mathLabel(p.name)}};`);
  }
  const dots = scene.points.filter((p) => p.dot && !p.hidden);
  for (const it of scene.items.filter((i) => i.type === 'text')) {
    if (!String(it.text ?? '').trim()) continue;
    labels.push(`\\node[align=center${it.bg ? `, ${BG}` : ''}] at (${fmt(it.x)},${fmt(it.y)}) {${textNode(it.text)}};`);
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
    const { x, y } = notToScalePlace(scene);
    b.comment('note');
    b.add(`\\node[anchor=north west, align=center] at (${fmt(x)},${fmt(y)}) {NOT TO\\\\SCALE};`);
  }

  if (usedLibs.size) b.usePreamble(`\\usetikzlibrary{${[...usedLibs].sort().join(', ')}}`);
  const opts = S.fontSize ? [`font=${S.fontSize}`] : [];
  return { code: b.toString(opts), warnings };
}

/**
 * Where the NOT TO SCALE note goes (its top-left corner): to the right of
 * everything drawn, including free text, level with the top of the visible points.
 */
export function notToScalePlace(scene) {
  const pts = pointMap(scene);
  const xs = [];
  for (const p of scene.points) xs.push(p.x);
  for (const it of scene.items) {
    if (it.type === 'text' && String(it.text ?? '').trim()) {
      const longest = String(it.text).split(/\n|\\\\/).reduce((m, l) => (l.length > m.length ? l : m), '');
      xs.push(it.x + labelBox(longest).w / 2);
    }
    if (it.type === 'circle' && pts.get(it.c) && pts.get(it.p)) {
      const c = pts.get(it.c);
      xs.push(c.x + Math.hypot(pts.get(it.p).x - c.x, pts.get(it.p).y - c.y));
    }
    const t = it.type === 'segment' && pts.get(it.a) && pts.get(it.b) ? endText(it, pts) : '';
    if (t) xs.push(pts.get(it.b).x + endOffset(it, pts, t).dx + labelBox(t).w / 2);
  }
  const shown = scene.points.filter((p) => !p.hidden);
  const ys = (shown.length ? shown : scene.points).map((p) => p.y);
  return { x: xs.length ? Math.max(...xs) + 0.6 : 0, y: ys.length ? Math.max(...ys) : 0 };
}

/** Read "\coordinate (NAME) at (x,y);" lines from code: Map name -> {x, y}. */
export function coordinatesFromCode(code) {
  const out = new Map();
  const re = /\\coordinate\s*\(([^)]+)\)\s*at\s*\(\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*,\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*\)/gi;
  let m;
  while ((m = re.exec(code))) out.set(m[1].trim(), { x: Number(m[2]), y: Number(m[3]) });
  return out;
}
