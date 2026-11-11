// SPDX-License-Identifier: CC0-1.0
// Curves of the form y^2 = f(x), e.g. y^2 = x(x + 2)(x - 5): the graph is
// y = ±√f(x) wherever f(x) ≥ 0. Each such interval gives
//   - a closed oval, when f is 0 at both ends (e.g. −2 ≤ x ≤ 0),
//   - an open branch with two arms, when it runs off the axes (e.g. x ≥ 5),
//   - two separate curves, when f > 0 across the whole window.
// The curve is vertical where it meets the x-axis, so points are packed
// closely near the ends (x = a + (b − a)(1 − cos t)/2).

import { findRoots, findTurningPoints, derivative } from './numeric.js';
import { pt, arrowSpec } from './tikz.js';

const N = 60; // points per half

/** Intervals of the window where f ≥ 0: [{ a, b, rootA, rootB }] */
export function positiveIntervals(f, win) {
  const roots = findRoots(f, win.xmin, win.xmax);
  const cuts = [win.xmin, ...roots, win.xmax];
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (!(b - a > 1e-9)) continue;
    if (!(f((a + b) / 2) > 0)) continue;
    out.push({ a, b, rootA: i > 0, rootB: i + 1 < cuts.length - 1 });
  }
  return out;
}

/** The pieces to draw: [{ points: [[x, y], …], closed, arrows: [start, end] }] */
export function ySquaredPaths(f, win) {
  const r = (x) => Math.sqrt(Math.max(0, f(x)));
  // the arms stop where they leave the axes (top or bottom)
  const limit = Math.min(win.ymax, -win.ymin);
  const paths = [];
  for (const { a, b, rootA, rootB } of positiveIntervals(f, win)) {
    // where an arm reaches the edge of the axes before the window edge
    const exit = (from, to) => {
      const n = 400;
      for (let i = 1; i <= n; i++) {
        const x = from + ((to - from) * i) / n;
        if (r(x) >= limit) {
          // refine between the last two samples
          let lo = from + ((to - from) * (i - 1)) / n;
          let hi = x;
          for (let k = 0; k < 40; k++) {
            const m = (lo + hi) / 2;
            if (r(m) >= limit) hi = m;
            else lo = m;
          }
          return hi;
        }
      }
      return to;
    };
    const sample = (p, q, clusterP, clusterQ) => {
      const xs = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        let s;
        if (clusterP && clusterQ) s = (1 - Math.cos(Math.PI * t)) / 2;
        else if (clusterP) s = 1 - Math.cos((Math.PI / 2) * t);
        else if (clusterQ) s = Math.sin((Math.PI / 2) * t);
        else s = t;
        xs.push(p + (q - p) * s);
      }
      return xs;
    };
    if (rootA && rootB) {
      // closed oval: along the top from a to b, back along the bottom
      const xs = sample(a, b, true, true);
      const top = xs.map((x) => [x, r(x)]);
      const bottom = xs.slice(1, -1).reverse().map((x) => [x, -r(x)]);
      paths.push({ points: [...top, ...bottom], closed: true, arrows: [false, false] });
    } else if (rootA) {
      // opens to the right: bottom arm in to the vertex at a, then out along the top
      const end = exit(a, b);
      const xs = sample(a, end, true, false);
      const pts = [...xs.slice(1).reverse().map((x) => [x, -r(x)]), [a, 0], ...xs.slice(1).map((x) => [x, r(x)])];
      paths.push({ points: pts, closed: false, arrows: [true, true] });
    } else if (rootB) {
      // opens to the left
      const start = exit(b, a);
      const xs = sample(start, b, false, true);
      const pts = [...xs.slice(0, -1).map((x) => [x, r(x)]), [b, 0], ...xs.slice(0, -1).reverse().map((x) => [x, -r(x)])];
      paths.push({ points: pts, closed: false, arrows: [true, true] });
    } else {
      // f > 0 across the window: two separate curves
      const xs = sample(a, b, false, false);
      paths.push({ points: xs.map((x) => [x, r(x)]), closed: false, arrows: [true, true] });
      paths.push({ points: xs.map((x) => [x, -r(x)]), closed: false, arrows: [true, true] });
    }
  }
  return paths;
}

/** Draw the curve. style: { width, dash, tip }. Returns the number of pieces. */
export function drawYSquared(b, f, win, style) {
  const paths = ySquaredPaths(f, win);
  for (const p of paths) {
    const tips = p.closed ? '' : arrowSpec(style.tip, p.arrows[0], p.arrows[1]);
    const st = [style.width, style.dash, tips].filter(Boolean).join(', ');
    const coords = p.points.filter(([, y]) => isFinite(y)).map(([x, y]) => pt(x, y));
    const rows = [];
    for (let i = 0; i < coords.length; i += 8) rows.push(coords.slice(i, i + 8).join(' -- '));
    b.add(`\\draw[${st}] ${rows.join(' --\n    ')}${p.closed ? ' -- cycle' : ''};`);
  }
  return paths.length;
}

/**
 * Turning points of y = ±√f: where f′ = 0 and f > 0. The top half has a
 * maximum where f has one (and the bottom half a minimum), and vice versa.
 */
export function ySquaredTurningPoints(f, lo, hi) {
  const out = [];
  for (const t of findTurningPoints(f, lo, hi)) {
    if (!(t.y > 1e-12)) continue;
    const y = Math.sqrt(t.y);
    const curv = derivative((x) => derivative(f, x), t.x);
    const topMax = curv < 0;
    out.push({ x: t.x, y, kind: topMax ? 'max' : 'min' });
    out.push({ x: t.x, y: -y, kind: topMax ? 'min' : 'max' });
  }
  return out;
}
