// SPDX-License-Identifier: CC0-1.0
// A network as typed text, and back — one edge per line:
//   A-B          an edge AB
//   B->C 5       a directed edge from B to C, labelled 5 (labels may hold commas: "A->B A, 8")
//   C-C          a loop at C
//   D            a vertex D on its own

import { normalPoint, normalItem, pointMap } from './scene.js';

const NAME = "[A-Za-z0-9_']+";
const EDGE = new RegExp(`^(${NAME})\\s*(<->|->|<-|--|-)\\s*(${NAME})\\s*(?::\\s*|\\s+)?(.*)$`);
const VERTEX = new RegExp(`^(${NAME})$`);

/** Parse an edge list into { vertices: [names in order], edges: [{ a, b, directed, label }] }. */
export function parseEdgeList(text) {
  const vertices = [];
  const edges = [];
  const see = (v) => {
    if (!vertices.includes(v)) vertices.push(v);
  };
  const entries = String(text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const e of entries) {
    let m = e.match(EDGE);
    if (m) {
      let [, a, op, b, label] = m;
      if (op === '<-') [a, b] = [b, a];
      see(a);
      see(b);
      edges.push({ a, b, directed: op === '->' || op === '<-', label: (label || '').trim() });
      continue;
    }
    m = e.match(VERTEX);
    if (m) {
      see(m[1]);
      continue;
    }
    throw new Error(`"${e}" isn't an edge or a vertex. Put one on each line: A-B, A->B (directed), A-B 5 (labelled), or a vertex on its own like D.`);
  }
  return { vertices, edges };
}

/** The scene's network as an edge list (one entry per line). */
export function sceneToEdgeList(scene) {
  const pts = pointMap(scene);
  const used = new Set();
  const lines = [];
  for (const it of scene.items) {
    if (it.type !== 'segment' || !pts.get(it.a) || !pts.get(it.b)) continue;
    const a = pts.get(it.a);
    const b = pts.get(it.b);
    if (a.hidden || b.hidden) continue;
    used.add(it.a).add(it.b);
    const label = it.label ? ` ${it.label}` : '';
    lines.push(`${a.name}${it.arrows ? '->' : '-'}${b.name}${label}`);
  }
  for (const p of scene.points) if (!p.hidden && !used.has(p.id)) lines.push(p.name);
  return lines.join('\n');
}

/** Bend for the next edge between a and b, so repeated edges fan out: 0, 25, -25, 45, -45 … */
export function nextBend(scene, a, b) {
  const taken = scene.items
    .filter((i) => i.type === 'segment' && ((i.a === a && i.b === b) || (i.a === b && i.b === a)))
    .map((i) => (i.a === a ? i.bend || 0 : -(i.bend || 0)));
  for (const k of [0, 25, -25, 45, -45, 65, -65]) if (!taken.some((t) => Math.abs(t - k) < 1)) return k;
  return 0;
}

/**
 * Make the scene's network match an edge list. Vertices and edges that are
 * still listed keep their places and settings; new vertices go on a circle
 * round the others; anything no longer listed is removed.
 */
export function applyEdgeList(scene, text, newId) {
  const { vertices, edges } = parseEdgeList(text);
  const byName = new Map(scene.points.filter((p) => !p.hidden).map((p) => [p.name, p]));

  // new vertices: evenly round a circle, centred on the existing ones
  const fresh = vertices.filter((v) => !byName.has(v));
  const old = vertices.filter((v) => byName.has(v)).map((v) => byName.get(v));
  const cx = old.length ? old.reduce((s, p) => s + p.x, 0) / old.length : 0;
  const cy = old.length ? old.reduce((s, p) => s + p.y, 0) / old.length : 0;
  const R = Math.max(2.5, 0.6 * vertices.length);
  fresh.forEach((v, i) => {
    const g = Math.PI / 2 - (2 * Math.PI * i) / fresh.length;
    const p = normalPoint({ id: newId('p'), name: v, x: round2(cx + R * Math.cos(g)), y: round2(cy + R * Math.sin(g)), dot: true });
    scene.points.push(p);
    byName.set(v, p);
  });

  // keep listed edges that already exist (with their bends and label places); add the rest
  const keep = new Set();
  const pending = [];
  for (const e of edges) {
    const a = byName.get(e.a).id;
    const b = byName.get(e.b).id;
    const match = scene.items.find(
      (i) =>
        i.type === 'segment' &&
        !keep.has(i.id) &&
        !!i.arrows === e.directed &&
        ((i.a === a && i.b === b) || (!e.directed && i.a === b && i.b === a))
    );
    if (match) {
      keep.add(match.id);
      match.label = e.label;
    } else pending.push({ ...e, a, b });
  }
  const listedIds = new Set(vertices.map((v) => byName.get(v).id));
  scene.items = scene.items.filter((i) => {
    if (i.type !== 'segment') return true;
    const ends = [i.a, i.b].map((id) => scene.points.find((p) => p.id === id));
    if (ends.some((p) => !p || p.hidden)) return true; // rays and the like aren't part of the network
    return keep.has(i.id);
  });
  for (const e of pending) {
    scene.items.push(
      normalItem({ id: newId('i'), type: 'segment', a: e.a, b: e.b, label: e.label, arrows: e.directed ? 1 : 0, bend: e.a === e.b ? 0 : nextBend(scene, e.a, e.b) })
    );
  }
  // vertices no longer listed go, with anything attached to them
  const gone = new Set(scene.points.filter((p) => !p.hidden && !p.dep && !listedIds.has(p.id)).map((p) => p.id));
  if (gone.size) {
    scene.points = scene.points.filter((p) => !gone.has(p.id));
    scene.items = scene.items.filter((i) => i.type === 'text' || ![i.a, i.b, i.v, i.c, i.p, ...(i.pts || [])].some((x) => gone.has(x)));
  }
  return scene;
}

const round2 = (v) => Math.round(v * 100) / 100;
