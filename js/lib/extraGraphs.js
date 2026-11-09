// SPDX-License-Identifier: CC0-1.0
// "Extra graphs": more lines or curves drawn on a function graph, e.g. the
// straight line y = 6 - 3x crossing a parabola. Shared by the function-graph
// diagram types.
//
// Each line of the text box is one graph: an equation, then any options after
// semicolons:
//
//   y = 6 - 3x
//   y = x/2 + 1; dashed; thick; no arrows; from -1 to 4; label
//   x = 3; dotted; label: x = a
//
// Options: solid | dashed | dotted, a line width (very thin … very thick),
// arrows | no arrows, from <a> to <b> (x-range; y-range for x = c),
// label (shows its equation) or label: <text>.

import { parseExpression, parseConstant } from './mathParser.js';
import { findRoots, derivative, niceLatex } from './numeric.js';
import { n, pt, arrowSpec, mathLabel, LINE_WIDTHS } from './tikz.js';
import { findPieces, drawCurve, dotRadius } from './functionGraph.js';

const DASHES = ['solid', 'dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted'];
const WIDTHS = LINE_WIDTHS.map((w) => w.value);

export function extraGraphFields() {
  return {
    type: 'group',
    label: 'Extra graphs',
    collapsed: true,
    fields: [
      {
        type: 'textarea',
        key: 'extraGraphs',
        label: 'Lines or curves, one per line',
        rows: 3,
        default: '',
        placeholder: 'e.g. y = 6 - 3x',
        help:
          'An equation, then options after semicolons, e.g. "y = x/2 + 1; dashed; thick; no arrows; from -1 to 4; label". ' +
          'Options: dashed or dotted, a line width (thin, thick…), no arrows, from a to b, ' +
          'label (shows the equation) or label: text. "x = 3" draws a vertical line.',
      },
      { type: 'checkbox', key: 'extraDots', label: 'Dots where graphs cross', default: false },
      { type: 'checkbox', key: 'extraCrossCoords', label: 'Coordinates where graphs cross', default: false },
      { type: 'checkbox', key: 'extraIntercepts', label: "Label the extra graphs' axis intercepts", default: false },
    ],
  };
}

const constant = (text, what) => {
  try {
    return parseConstant(String(text).trim().replace(/√/g, 'sqrt'));
  } catch (e) {
    throw new Error(`${what}: could not read "${text}" (${e.message})`);
  }
};

/** Parse the text box into graph descriptions. */
export function parseExtraGraphs(src) {
  const graphs = [];
  String(src ?? '')
    .split(/\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const where = `Extra graph ${i + 1}`;
      const [eq, ...opts] = line.split(';').map((s) => s.trim());
      const g = { dash: '', width: '', arrows: null, from: null, to: null, label: null };
      const m = eq.match(/^([xy])\s*=\s*(.+)$/i);
      if (m && m[1].toLowerCase() === 'x') {
        const c = constant(m[2], where);
        Object.assign(g, { vertical: true, value: c.value, latex: `x = ${c.latex}` });
      } else {
        const body = m ? m[2] : eq;
        let e;
        try {
          e = parseExpression(body.replace(/√/g, 'sqrt'));
        } catch (err) {
          throw new Error(`${where}: could not read "${eq}" (${err.message})`);
        }
        Object.assign(g, { vertical: false, f: e.evaluate, pgf: e.toPgf('\\x'), latex: `y = ${e.toLatex()}` });
      }
      for (const opt of opts) {
        if (!opt) continue;
        const low = opt.toLowerCase().replace(/\s+/g, ' ');
        const range = opt.match(/^from\s+(.+?)\s+to\s+(.+)$/i);
        const label = opt.match(/^label\s*(?:[:=]\s*(.*))?$/i);
        if (DASHES.includes(low)) g.dash = low === 'solid' ? '' : low;
        else if (WIDTHS.includes(low)) g.width = low;
        else if (/^no arrows?$/.test(low)) g.arrows = false;
        else if (/^arrows?$/.test(low)) g.arrows = true;
        else if (range) {
          g.from = constant(range[1], where).value;
          g.to = constant(range[2], where).value;
          if (g.from >= g.to) throw new Error(`${where}: "from" must be less than "to".`);
        } else if (label) g.label = label[1] ? label[1].trim() : g.latex;
        else throw new Error(`${where}: didn't understand "${opt}".`);
      }
      graphs.push(g);
    });
  return graphs;
}

function isLinear(f, lo, hi) {
  const xs = [lo, (2 * lo + hi) / 3, (lo + 2 * hi) / 3, hi];
  const ys = xs.map(f);
  if (!ys.every(isFinite)) return false;
  const m = (ys[3] - ys[0]) / (hi - lo);
  return ys.every((y, i) => Math.abs(y - (ys[0] + m * (xs[i] - lo))) < 1e-9 * (1 + Math.abs(y)));
}

// ---------------------------------------------------------------- label placement

const COMPASS = ['east', 'north east', 'north', 'north west', 'west', 'south west', 'south', 'south east'];
function compass(deg) {
  const k = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS[k];
}

const ANCHORS = [
  // [anchor, direction the label sits in from the point]
  ['south west', 1, 1],
  ['north west', 1, -1],
  ['south east', -1, 1],
  ['north east', -1, -1],
  ['south', 0, 1],
  ['north', 0, -1],
  ['west', 1, 0],
  ['east', -1, 0],
];

/**
 * Choose where a label goes so that it covers as little as possible of the
 * graphs and axes: try each anchor, estimate the label's box in cm, and count
 * how much of each graph passes through it.
 * ctx: { graphs: [{ vertical, f, value }], xUnit, yUnit, win }
 */
function placeLabel(x, y, latex, ctx) {
  const { graphs, xUnit, yUnit, win } = ctx;
  const plain = String(latex).replace(/\\(frac|sqrt)/g, '').replace(/\\[a-z]+|[{}^_$\\]/gi, '');
  const w = Math.max(0.3, plain.length * 0.19);
  const h = 0.42;
  const gap = 0.1;
  const px = x * xUnit;
  const py = y * yUnit;
  let best = null;
  ANCHORS.forEach(([anchor, dx, dy], rank) => {
    const cx = px + dx * (w / 2 + gap);
    const cy = py + dy * (h / 2 + gap);
    const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
    let cost = rank * 0.01; // small preference for the diagonal places
    const inBox = (X, Y) => X > box.x0 && X < box.x1 && Y > box.y0 && Y < box.y1;
    for (const g of graphs) {
      for (let i = 0; i <= 24; i++) {
        if (g.vertical) {
          if (inBox(g.value * xUnit, box.y0 + ((box.y1 - box.y0) * i) / 24)) cost += 1;
        } else {
          const X = box.x0 + ((box.x1 - box.x0) * i) / 24;
          const Y = g.f(X / xUnit) * yUnit;
          if (isFinite(Y) && inBox(X, Y)) cost += 1;
        }
      }
    }
    if (box.y0 < 0 && box.y1 > 0 && win.ymin <= 0 && win.ymax >= 0) cost += 8; // x-axis
    if (box.x0 < 0 && box.x1 > 0 && win.xmin <= 0 && win.xmax >= 0) cost += 8; // y-axis
    if (!best || cost < best.cost) best = { cost, anchor };
  });
  return best.anchor;
}

/**
 * "x, y" for a label. Each value is exact (\sqrt{10}, \frac{1}{3}) where
 * possible; if only one of them can be, both are given as decimals rather
 * than mixing, e.g. (5.16, -9.49) rather than (5.16, -3\sqrt{10}).
 */
function coordPair(x, y, dp, exact) {
  const shown = (v) => {
    const r = Math.round(v * 10 ** dp) / 10 ** dp;
    return Math.abs(v - r) < 1e-9 || niceLatex(v, dp, true) !== niceLatex(v, dp, false);
  };
  const ex = exact && shown(x) && shown(y);
  return `${niceLatex(x, dp, ex)}, ${niceLatex(y, dp, ex)}`;
}

// ---------------------------------------------------------------- drawing

/** Where each graph is drawn: [{ g, lo, hi }] in x (or y for vertical lines). */
function extents(graphs, win) {
  return graphs.map((g) => {
    const [min, max] = g.vertical ? [win.ymin, win.ymax] : [win.xmin, win.xmax];
    return { g, lo: Math.max(min, g.from ?? -Infinity), hi: Math.min(max, g.to ?? Infinity) };
  });
}

/** Points where two graphs cross (both drawn there). */
function crossings(A, B) {
  if (A.g.vertical && B.g.vertical) return [];
  if (A.g.vertical || B.g.vertical) {
    const [V, F] = A.g.vertical ? [A, B] : [B, A];
    const x = V.g.value;
    if (x < F.lo || x > F.hi) return [];
    const y = F.g.f(x);
    return isFinite(y) && y >= V.lo && y <= V.hi ? [{ x, y }] : [];
  }
  const lo = Math.max(A.lo, B.lo);
  const hi = Math.min(A.hi, B.hi);
  if (!(hi > lo)) return [];
  return findRoots((x) => A.g.f(x) - B.g.f(x), lo, hi)
    .map((x) => ({ x, y: A.g.f(x) }))
    .filter((p) => isFinite(p.y));
}

/**
 * Draw the extra graphs, plus the chosen dots and labels.
 * main: { f, lo, hi } for the diagram's own curve (optional).
 */
export function drawExtraGraphs(b, win, values, { main = null, xUnit = 1, yUnit = 1 } = {}) {
  const graphs = parseExtraGraphs(values.extraGraphs);
  if (!graphs.length) return [];
  const warnings = [];
  const ext = extents(graphs, win);
  const tangent = (g, x) => (g.vertical ? Math.PI / 2 : Math.atan2(derivative(g.f, x) * yUnit, xUnit));
  const inWin = (x, y) => x >= win.xmin - 1e-9 && x <= win.xmax + 1e-9 && y >= win.ymin - 1e-9 && y <= win.ymax + 1e-9;
  const labels = [];

  ext.forEach(({ g, lo, hi }, i) => {
    b.comment(`extra graph: ${g.latex}`);
    const width = g.width || values.curveWidth || 'semithick';
    const tip = g.arrows === false ? 'none' : values.curveArrow;
    if (!(hi > lo)) {
      warnings.push(`Extra graph ${i + 1} (${g.latex}) is outside the axes range.`);
      return;
    }
    if (g.vertical) {
      const x = g.value;
      if (x < win.xmin || x > win.xmax) {
        warnings.push(`Extra graph ${i + 1} (${g.latex}) is outside the axes range.`);
        return;
      }
      const style = [width, g.dash, arrowSpec(tip, true, true)].filter(Boolean).join(', ');
      b.add(`\\draw[${style}] ${pt(x, lo)} -- ${pt(x, hi)};`);
      if (g.label) labels.push(`\\node[anchor=south, inner sep=2pt] at ${pt(x, hi)} {${mathLabel(g.label)}};`);
      return;
    }
    const pieces = findPieces(g.f, { ...win, xmin: lo, xmax: hi }, 1000);
    if (!pieces.length) {
      warnings.push(`Extra graph ${i + 1} (${g.latex}) is not visible in this window.`);
      return;
    }
    if (isLinear(g.f, lo, hi)) {
      for (const p of pieces) {
        const style = [width, g.dash, arrowSpec(tip, p.startArrow, p.endArrow)].filter(Boolean).join(', ');
        b.add(`\\draw[${style}] ${pt(p.a, g.f(p.a))} -- ${pt(p.b, g.f(p.b))};`);
      }
    } else {
      drawCurve(b, pieces, { ...values, curveWidth: [width, g.dash].filter(Boolean).join(', '), curveArrow: tip }, {
        pgfExpr: g.pgf,
        f: g.f,
        method: values.plotMethod,
        comment: false,
      });
    }
    if (g.label) {
      // just beyond the right-hand end, in the direction the graph is heading
      const x = pieces[pieces.length - 1].b;
      const dir = (tangent(g, x) * 180) / Math.PI;
      labels.push(`\\node[anchor=${compass(dir + 180)}, inner sep=3pt] at ${pt(x, g.f(x))} {${mathLabel(g.label)}};`);
    }
  });

  const place = {
    graphs: [...(main ? [{ vertical: false, f: (x) => (x >= main.lo && x <= main.hi ? main.f(x) : NaN) }] : []), ...graphs],
    xUnit,
    yUnit,
    win,
  };
  if (labels.length) {
    b.comment('extra graph labels');
    labels.forEach((l) => b.add(l));
  }

  // ---- axis intercepts of the extra graphs
  if (values.extraIntercepts) {
    const lines = [];
    const tickWidth = values.axisWidth || 'thin';
    const ticks = values.ticks ?? values.endTicks ?? true;
    const nearAxisX = (y) => Math.abs(y * yUnit) < 0.05;
    const mainHas = (x, y) => main && Math.abs(main.f(x) - y) < 1e-9 && x >= main.lo && x <= main.hi;
    for (const { g, lo, hi } of ext) {
      if (!(hi > lo)) continue;
      const xs = g.vertical ? (0 >= lo && 0 <= hi ? [g.value] : []) : findRoots(g.f, lo, hi);
      for (const x of xs) {
        if (Math.abs(x) < 1e-9 || x < win.xmin || x > win.xmax || win.ymin > 0 || win.ymax < 0) continue;
        if (values.labelX && mainHas(x, 0)) continue; // already labelled as the curve's root
        const text = niceLatex(x, values.dp ?? 2, values.exact);
        const anchor = placeLabel(x, 0, text, place);
        const below = anchor.startsWith('north');
        if (ticks) lines.push(`\\draw[${tickWidth}] ${pt(x, 0)} -- ++(0,${below ? '-' : ''}3pt);`);
        lines.push(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(x, 0)} {${mathLabel(text)}};`);
      }
      if (!g.vertical && 0 >= lo && 0 <= hi && win.xmin <= 0 && win.xmax >= 0) {
        const y = g.f(0);
        if (!isFinite(y) || nearAxisX(y) || y < win.ymin || y > win.ymax) continue;
        if (values.labelY && mainHas(0, y)) continue;
        const text = niceLatex(y, values.dp ?? 2, values.exact);
        const anchor = placeLabel(0, y, text, place);
        const right = anchor.endsWith('west');
        if (ticks) lines.push(`\\draw[${tickWidth}] ${pt(0, y)} -- ++(${right ? '' : '-'}3pt,0);`);
        lines.push(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(0, y)} {${mathLabel(text)}};`);
      }
    }
    if (lines.length) {
      b.comment('extra graph intercepts');
      lines.forEach((l) => b.add(l));
    }
  }

  // ---- where graphs cross
  if (values.extraDots || values.extraCrossCoords) {
    const all = [...ext];
    if (main) all.unshift({ g: { vertical: false, f: main.f }, lo: Math.max(win.xmin, main.lo), hi: Math.min(win.xmax, main.hi) });
    const found = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (!(all[i].hi > all[i].lo) || !(all[j].hi > all[j].lo)) continue;
        for (const p of crossings(all[i], all[j])) {
          if (!inWin(p.x, p.y)) continue;
          const seen = found.find((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6);
          if (!seen) found.push(p);
        }
      }
    }
    if (found.length) {
      b.comment('where the graphs cross');
      for (const p of found) {
        if (values.extraDots) b.add(`\\fill ${pt(p.x, p.y)} circle[radius=${dotRadius(values)}];`);
        if (values.extraCrossCoords) {
          const text = `(${coordPair(p.x, p.y, values.dp ?? 2, values.exact)})`;
          b.add(`\\node[anchor=${placeLabel(p.x, p.y, text, place)}, inner sep=3pt] at ${pt(p.x, p.y)} {${mathLabel(text)}};`);
        }
      }
    }
  }
  return warnings;
}

/**
 * x and y values of the extra graphs' crossings and intercepts, so the
 * automatic window can include them.
 */
export function extraGraphFeatures(values, mainF = null, R = 50) {
  let graphs;
  try {
    graphs = parseExtraGraphs(values.extraGraphs);
  } catch {
    return { xs: [], ys: [] }; // the error is reported when drawing
  }
  const xs = [];
  const ys = [];
  for (const g of graphs) {
    if (g.vertical) {
      xs.push(g.value);
      if (mainF) ys.push(mainF(g.value));
      continue;
    }
    const lo = Math.max(-R, g.from ?? -R);
    const hi = Math.min(R, g.to ?? R);
    if (g.from !== null) xs.push(g.from);
    if (g.to !== null) xs.push(g.to);
    if (!(hi > lo)) continue;
    ys.push(g.f(0));
    if (mainF) {
      for (const x of findRoots((x) => mainF(x) - g.f(x), lo, hi)) {
        xs.push(x);
        ys.push(g.f(x));
      }
    }
  }
  return { xs: xs.filter(isFinite), ys: ys.filter(isFinite) };
}

export const _internal = { placeLabel, compass, n };
