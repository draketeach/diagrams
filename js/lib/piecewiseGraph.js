// SPDX-License-Identifier: CC0-1.0
// Drawing piecewise functions: the pieces, filled/open endpoint dots, and
// shading under a graph. Used by the Function diagram.

import { parseConstant } from './mathParser.js';
import { n, pt, arrowSpec } from './tikz.js';
import { findPieces, drawCurve } from './functionGraph.js';

export const near = (a, b) => Math.abs(a - b) < 1e-9;

export function isLinear(f, lo, hi) {
  if (!isFinite(lo) || !isFinite(hi)) {
    lo = isFinite(lo) ? lo : (isFinite(hi) ? hi : 0) - 10;
    hi = isFinite(hi) ? hi : lo + 20;
  }
  const xs = [lo, (2 * lo + hi) / 3, (lo + 2 * hi) / 3, hi];
  const ys = xs.map(f);
  if (!ys.every(isFinite)) return false;
  const m = (ys[3] - ys[0]) / (hi - lo);
  return ys.every((y, i) => Math.abs(y - (ys[0] + m * (xs[i] - lo))) < 1e-9 * (1 + Math.abs(y)));
}

/** Finite piece ends: [{ x, y, inc, piece }] */
export function pieceEnds(pieces) {
  const ends = [];
  for (const p of pieces) {
    for (const [x, inc] of [[p.a, p.aInc], [p.b, p.bInc]]) {
      if (isFinite(x)) ends.push({ x, y: p.expr.evaluate(x), inc, piece: p });
    }
  }
  return ends;
}

/**
 * Endpoint dots: filled where the end is included (≤), open where excluded (<).
 * joinDots: keep a dot where two pieces join without a gap.
 */
export function piecewiseDots(pieces, win, { joinDots = true } = {}) {
  const inWin = (x, y) => x >= win.xmin && x <= win.xmax && y >= win.ymin && y <= win.ymax;
  const dotMap = new Map();
  const addDot = (x, y, filled, source) => {
    if (!isFinite(y) || !inWin(x, y)) return;
    const key = `${n(x, 6)},${n(y, 6)}`;
    const d = dotMap.get(key) || { x, y, filled: false, sources: new Set() };
    d.filled = d.filled || filled;
    d.sources.add(source);
    dotMap.set(key, d);
  };
  pieces.forEach((p, i) => {
    if (p.point) {
      addDot(p.a, p.expr.evaluate(p.a), true, i);
      // a point defined separately leaves a hole in any piece running through it
      pieces.forEach((q, j) => {
        if (!q.point && q.a < p.a && p.a < q.b) addDot(p.a, q.expr.evaluate(p.a), false, j);
      });
      return;
    }
    if (isFinite(p.a)) addDot(p.a, p.expr.evaluate(p.a), p.aInc, i);
    if (isFinite(p.b)) addDot(p.b, p.expr.evaluate(p.b), p.bInc, i);
  });
  let dots = [...dotMap.values()];
  if (!joinDots) dots = dots.filter((d) => !(d.filled && d.sources.size > 1));
  return dots;
}

/**
 * Draw the pieces. style: { width, dash, tip } (tip = arrowhead or 'none').
 * A finite end of a piece gets no arrow (it has a dot instead).
 * Returns the number of visible parts.
 */
export function drawPieces(b, pieces, win, values, style) {
  let visible = 0;
  for (const p of pieces) {
    if (p.point) continue;
    const lo = Math.max(p.a, win.xmin);
    const hi = Math.min(p.b, win.xmax);
    if (!(hi > lo)) continue;
    const g = p.expr.evaluate;
    const subs = findPieces(g, { xmin: lo, xmax: hi, ymin: win.ymin, ymax: win.ymax }, 1000);
    for (const s of subs) {
      if (isFinite(p.a) && near(s.a, p.a)) s.startArrow = false;
      if (isFinite(p.b) && near(s.b, p.b)) s.endArrow = false;
    }
    visible += subs.length;
    const lineStyle = [style.width, style.dash].filter(Boolean).join(', ');
    if (isLinear(g, p.a, p.b)) {
      for (const s of subs) {
        const st = [lineStyle, arrowSpec(style.tip, s.startArrow, s.endArrow)].filter(Boolean).join(', ');
        b.add(`\\draw[${st}] ${pt(s.a, g(s.a))} -- ${pt(s.b, g(s.b))};`);
      }
    } else {
      drawCurve(b, subs, { ...values, curveWidth: lineStyle, curveArrow: style.tip }, {
        pgfExpr: p.expr.toPgf('\\x'),
        f: g,
        method: values.plotMethod,
        comment: false,
      });
    }
  }
  return visible;
}

/** Dots on top of the lines (open dots are white inside). */
export function drawDots(b, dots, radius, width) {
  for (const d of dots) {
    b.add(
      d.filled
        ? `\\fill ${pt(d.x, d.y)} circle[radius=${radius}];`
        : `\\draw[${width || 'thick'}, fill=white] ${pt(d.x, d.y)} circle[radius=${radius}];`
    );
  }
}

/** "1 to 2; 3 to 4" -> [[1, 2], [3, 4]] */
export function parseShades(src) {
  return String(src ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(/\s+to\s+|,/i).map((t) => t.trim());
      if (parts.length !== 2) throw new Error(`Shading "${s}" should look like "1 to 2"`);
      const [a, b] = parts.map((t) => {
        try {
          return parseConstant(t.replace(/√/g, 'sqrt')).value;
        } catch (e) {
          throw new Error(`Shading "${s}": could not read "${t}" (${e.message})`);
        }
      });
      return a < b ? [a, b] : [b, a];
    });
}

/**
 * Shade between a graph and the x-axis. parts: [{ a, b, f }] (the pieces of
 * a piecewise function, or one part for an ordinary function).
 */
export function drawShading(b, parts, shades, win, colour) {
  if (!shades.length) return;
  b.comment('shading');
  for (const [s, t] of shades) {
    const coords = [pt(s, 0)];
    for (const p of parts) {
      const lo = Math.max(s, p.a, win.xmin);
      const hi = Math.min(t, p.b, win.xmax);
      if (!(hi > lo)) continue;
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const x = lo + ((hi - lo) * i) / N;
        const y = p.f(x);
        if (isFinite(y)) coords.push(pt(x, Math.max(win.ymin, Math.min(win.ymax, y))));
      }
    }
    coords.push(pt(t, 0));
    const rows = [];
    for (let i = 0; i < coords.length; i += 6) rows.push('    ' + coords.slice(i, i + 6).join(' -- '));
    b.add(`\\fill[${colour || 'gray!25'}] ${rows.join(' --\n').trim()} -- cycle;`);
  }
}
