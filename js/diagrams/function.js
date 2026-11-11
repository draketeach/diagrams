// SPDX-License-Identifier: CC0-1.0
// Function graphs: one or more graphs typed in the "Graphs" box (see
// lib/graphList.js), e.g.
//
//   y = x^3 - 7x + 6
//   { x/4, 0 <= x <= 2sqrt(2); 0, otherwise }
//   y = 6 - 3x; dashed; label
//
// The first graph gets the labels (intercepts, turning points, endpoints);
// the others are drawn with their own settings.

import { parseGraphList } from '../lib/graphList.js';
import { findRoots, findTurningPoints, niceLatex } from '../lib/numeric.js';
import { TikzBuilder, pt, mathLabel } from '../lib/tikz.js';
import { drawExtraGraphs, extraGraphFeatures } from '../lib/extraGraphs.js';
import {
  near,
  pieceEnds,
  piecewiseDots,
  drawPieces,
  drawDots,
  parseShades,
  drawShading,
} from '../lib/piecewiseGraph.js';
import {
  autoWindow,
  resolveWindow,
  scaleOptions,
  fontOption,
  findPieces,
  drawAxes,
  drawCurve,
  drawXIntercepts,
  drawYIntercept,
  drawTurningPoints,
  drawEquation,
  drawScaleTicks,
  drawCustomTicks,
  dotRadius,
  drawGrid,
  drawCurvePoints,
  drawAsymptotes,
  parseAsymptotes,
} from '../lib/functionGraph.js';
import { row, curveEndFields, basicLabelFields, moreOptions, legacyValues, GRAPH_EXAMPLES } from '../lib/graphOptions.js';

// what the first graph is, from the text of the box (for showing options)
const firstLine = (v) => String(v.graphs ?? '').split('\n').map((l) => l.trim()).find(Boolean) || '';
const isPiecewise = (v) => {
  const t = firstLine(v).split(';')[0];
  return t.startsWith('{') || /,|\bfor\b|\bif\b|\bwhen\b/.test(t);
};
const isFormula = (v) => !isPiecewise(v);
const manyGraphs = (v) => {
  try {
    return parseGraphList(v.graphs).length > 1;
  } catch {
    return true;
  }
};

const schema = [
  {
    type: 'group',
    label: 'Function',
    fields: [
      {
        type: 'textarea',
        key: 'graphs',
        label: 'Graphs, one per line',
        rows: 4,
        default: 'y = x^3 - 7x + 6',
        placeholder: 'y = x^3 - 7x + 6',
        help: 'Press ? for piecewise functions, domains, vertical lines and settings such as dashed.',
        examples: GRAPH_EXAMPLES,
      },
      ...basicLabelFields(),
      row(
        { type: 'checkbox', key: 'labelEnds', label: 'Endpoints on x-axis', default: true, showIf: isPiecewise },
        { type: 'checkbox', key: 'labelHeights', label: 'Dot heights on y-axis', default: true, showIf: isPiecewise }
      ),
    ],
  },
  moreOptions({
    curve: [
      curveEndFields(isFormula),
      { type: 'checkbox', key: 'joinDots', label: 'Dots where pieces join', default: true, showIf: isPiecewise },
    ],
    labels: [
      { type: 'checkbox', key: 'guideLines', label: 'Dashed lines from endpoint dots to the axes', default: false, showIf: isPiecewise },
    ],
    lines: [
      row(
        { type: 'text', key: 'shade', label: 'Shade under from … to …', default: '', placeholder: 'e.g. 1 to 2' },
        {
          type: 'select',
          key: 'shadeColour',
          label: 'Shade',
          default: 'gray!25',
          options: [
            { value: 'gray!15', label: 'Light grey' },
            { value: 'gray!25', label: 'Grey' },
            { value: 'gray!45', label: 'Dark grey' },
          ],
        }
      ),
    ],
    meet: [
      { type: 'checkbox', key: 'extraDots', label: 'Dots where graphs cross', default: false, showIf: manyGraphs },
      { type: 'checkbox', key: 'extraCrossCoords', label: 'Coordinates where graphs cross', default: false, showIf: manyGraphs },
      { type: 'checkbox', key: 'extraIntercepts', label: "Label the other graphs' axis intercepts", default: false, showIf: manyGraphs },
    ],
  }),
];

// ------------------------------------------------------------------ generate

function generate(input) {
  const values = legacyValues(input);
  const graphs = parseGraphList(values.graphs);
  if (!graphs.length) throw new Error('Type a graph, e.g. y = x^3 - 7x + 6');
  const [main, ...others] = graphs;
  if (main.kind === 'vertical') throw new Error('The first graph should be a function of x, e.g. y = x^2 (put x = … lines after it).');

  // the first graph's own settings override the style options
  const style = {
    width: main.width || values.curveWidth || 'semithick',
    dash: main.dash,
    tip: main.arrows === false ? 'none' : values.curveArrow,
  };
  const v = { ...values, curveWidth: [style.width, style.dash].filter(Boolean).join(', '), curveArrow: style.tip };
  return main.kind === 'piecewise' ? generatePiecewise(v, main, others, style) : generateFormula(v, main, others, style);
}

/** Things every function graph draws before the curve. Returns { asym, skip-ready lists }. */
function background(b, win, values, f, shadeParts) {
  const warnings = [];
  warnings.push(...drawGrid(b, win, values));
  drawShading(b, shadeParts, parseShades(values.shade), win, values.shadeColour);
  const asym = drawAsymptotes(b, win, values, f);
  warnings.push(...asym.warnings, ...drawAxes(b, win, values));
  return { asym, warnings };
}

function ticks(b, win, values, skipX, skipY) {
  return [...drawScaleTicks(b, win, values, { skipX, skipY }), ...drawCustomTicks(b, win, values, { skipX, skipY })];
}

function featureWindow(values, f, xs, ys, others, { fallbackF = null } = {}) {
  const extra = extraGraphFeatures(others, f);
  for (const a of parseAsymptotes(values.asymptotes)) (a.axis === 'x' ? extra.xs : extra.ys).push(a.value);
  for (const [s, t] of parseShades(values.shade)) extra.xs.push(s, t);
  return resolveWindow(values, () =>
    autoWindow({ xs: [...xs, ...extra.xs], ys: [...ys, ...extra.ys].filter(isFinite), f: fallbackF })
  );
}

// ---- an ordinary function of x
function generateFormula(values, main, others, style) {
  const warnings = [];
  const { f } = main;

  const R = 50;
  const pre = {
    roots: findRoots(f, Math.max(-R, main.from ?? -R), Math.min(R, main.to ?? R)),
    tps: findTurningPoints(f, Math.max(-R, main.from ?? -R), Math.min(R, main.to ?? R)),
  };
  const win = featureWindow(
    values,
    f,
    [...pre.roots, ...pre.tps.map((t) => t.x), ...[main.from, main.to].filter((x) => x !== null)],
    [...pre.tps.map((t) => t.y), f(0)],
    others,
    { fallbackF: pre.tps.length ? null : f }
  );

  const lo = Math.max(win.xmin, main.from ?? -Infinity);
  const hi = Math.min(win.xmax, main.to ?? Infinity);
  const inRange = (x) => x >= lo && x <= hi;
  const roots = findRoots(f, win.xmin, win.xmax).filter(inRange).map((x) => ({ x }));
  const tps = hi > lo ? findTurningPoints(f, lo, hi) : [];
  const pieces = hi > lo ? findPieces(f, { ...win, xmin: lo, xmax: hi }) : [];
  const endDots = [];
  if (pieces.length) {
    const first = pieces[0];
    const last = pieces[pieces.length - 1];
    if (values.leftEnd !== 'arrow' && values.leftEnd) first.startArrow = false;
    if (values.rightEnd !== 'arrow' && values.rightEnd) last.endArrow = false;
    if (values.leftEnd === 'dot') endDots.push(first.a);
    if (values.rightEnd === 'dot') endDots.push(last.b);
  } else warnings.push('The curve is not visible in this window.');

  if (values.plotMethod === 'pgf' && Math.max(Math.abs(win.ymin), Math.abs(win.ymax)) > 8000) {
    warnings.push('Large y-values can overflow TikZ maths. Choose "Pre-computed coordinates" under More options → Advanced if rendering fails.');
  }

  const { options, xUnit, yUnit } = scaleOptions(win, values);
  const b = new TikzBuilder();
  b.comment(`y = ${main.latex}`);
  const bg = background(b, win, values, f, [{ a: lo, b: hi, f }]);
  warnings.push(...bg.warnings);
  warnings.push(
    ...ticks(
      b,
      win,
      values,
      [...(values.labelX ? roots.map((r) => r.x) : []), ...bg.asym.skipX],
      [...(values.labelY ? [f(0)] : []), ...bg.asym.skipY]
    )
  );
  drawCurve(b, pieces, values, { pgfExpr: main.pgf, f, method: values.plotMethod });
  if (endDots.length) {
    b.comment('dots at curve ends');
    for (const x of endDots) b.add(`\\fill ${pt(x, f(x))} circle[radius=${dotRadius(values)}];`);
  }
  drawXIntercepts(b, roots, f, values, win);
  if (inRange(0)) drawYIntercept(b, f, values, win);
  drawTurningPoints(b, tps, values, win, { xUnit, yUnit });
  warnings.push(...drawCurvePoints(b, f, win, values, { xUnit, yUnit }));
  if (main.label) drawMainLabel(b, f, pieces, main.label);
  else drawEquation(b, main.latex, f, pieces, values);
  warnings.push(...drawExtraGraphs(b, win, values, { graphs: others, main: { f, lo, hi }, xUnit, yUnit }));

  return { code: b.toString([...options, fontOption(values)]), warnings };
}

/** "label: text" on the first graph: at the right-hand end of the curve. */
function drawMainLabel(b, f, pieces, text) {
  if (!pieces.length) return;
  const x = pieces[pieces.length - 1].b;
  b.comment('label');
  b.add(`\\node[anchor=south east, inner sep=3pt] at ${pt(x, f(x))} {${mathLabel(text)}};`);
}

// ---- a piecewise function
function generatePiecewise(values, main, others, style) {
  const warnings = [];
  const { pieces, f } = main;
  const ends = pieceEnds(pieces);
  const spans = pieces.filter((p) => !p.point);

  // turning points and x-intercepts inside each (non-constant) piece
  const inside = (lo0, hi0, fn) => {
    const out = [];
    for (const p of spans) {
      const lo = Math.max(p.a, lo0);
      const hi = Math.min(p.b, hi0);
      if (!(hi > lo)) continue;
      const g = p.expr.evaluate;
      if (Math.abs(g(lo) - g(hi)) < 1e-12 && Math.abs(g((lo + hi) / 2) - g(lo)) < 1e-12) continue; // constant
      out.push(...fn(g, lo, hi).filter((t) => !near(t.x ?? t, p.a) && !near(t.x ?? t, p.b)));
    }
    return out;
  };
  const preTps = inside(-50, 50, (g, lo, hi) => findTurningPoints(g, lo, hi, 1000));
  const win = featureWindow(
    values,
    f,
    [...ends.map((e) => e.x), ...preTps.map((t) => t.x)],
    [...ends.map((e) => e.y), ...preTps.map((t) => t.y)],
    others,
    { fallbackF: ends.length + preTps.length < 3 ? f : null }
  );

  const dots = piecewiseDots(pieces, win, { joinDots: values.joinDots });
  const R = dotRadius(values);
  const { options, xUnit, yUnit } = scaleOptions(win, values);
  const b = new TikzBuilder();
  const bg = background(b, win, values, f, spans.map((p) => ({ a: p.a, b: p.b, f: p.expr.evaluate })));
  warnings.push(...bg.warnings);

  // ---- endpoint values on the axes
  const labelX = [];
  const labelY = [];
  const tickWidth = values.axisWidth || 'thin';
  const lines = [];
  if (values.labelEnds && win.ymin <= 0 && win.ymax >= 0) {
    const seen = [];
    for (const e of ends) {
      if (near(e.x, 0) || seen.some((s) => near(s, e.x)) || e.x < win.xmin || e.x > win.xmax) continue;
      seen.push(e.x);
      const latex = e.x === e.piece.a ? e.piece.aLatex : e.piece.bLatex;
      const dotsHere = dots.filter((d) => near(d.x, e.x));
      const above = dotsHere.length > 0 && dotsHere.every((d) => d.y < 0);
      const onAxis = dotsHere.some((d) => near(d.y, 0));
      const shift = onAxis ? `, yshift=${above ? '' : '-'}${R}` : '';
      if (values.ticks) lines.push(`\\draw[${tickWidth}] ${pt(e.x, 0)} -- ++(0,${above ? '' : '-'}3pt);`);
      lines.push(`\\node[anchor=${above ? 'south' : 'north'}, inner sep=2pt${shift}] at ${pt(e.x, 0)} {${mathLabel(latex)}};`);
      labelX.push(e.x);
    }
  }
  if (values.labelHeights && win.xmin <= 0 && win.xmax >= 0) {
    const seen = [];
    for (const d of dots) {
      if (near(d.y, 0) || seen.some((s) => near(s, d.y))) continue;
      seen.push(d.y);
      const right = dots.filter((e) => near(e.y, d.y)).every((e) => e.x < 0);
      if (values.ticks) lines.push(`\\draw[${tickWidth}] ${pt(0, d.y)} -- ++(${right ? '' : '-'}3pt,0);`);
      lines.push(
        `\\node[anchor=${right ? 'west' : 'east'}, inner sep=2pt, xshift=${right ? '' : '-'}2pt] at ${pt(0, d.y)} {${mathLabel(niceLatex(d.y, values.dp ?? 2, values.exact))}};`
      );
      labelY.push(d.y);
    }
  }
  if (values.guideLines) {
    for (const d of dots) {
      if (near(d.y, 0) || near(d.x, 0)) continue;
      lines.unshift(`\\draw[dashed, ${tickWidth}] ${pt(d.x, 0)} -- ${pt(d.x, d.y)} -- ${pt(0, d.y)};`);
    }
  }
  if (lines.length) {
    b.comment('endpoint labels');
    lines.forEach((l) => b.add(l));
  }

  // ---- x-intercepts, y-intercept, turning points inside the pieces
  const roots = values.labelX
    ? inside(win.xmin, win.xmax, (g, lo, hi) => findRoots(g, lo, hi))
        .filter((x) => !labelX.some((s) => near(s, x)))
        .map((x) => ({ x }))
    : [];
  const yHere = f(0);
  const labelYHere = values.labelY && isFinite(yHere) && !labelY.some((s) => near(s, yHere)) && !near(yHere, 0);
  warnings.push(
    ...ticks(
      b,
      win,
      values,
      [...labelX, ...roots.map((r) => r.x), ...bg.asym.skipX],
      [...labelY, ...(labelYHere ? [yHere] : []), ...bg.asym.skipY]
    )
  );

  b.comment('pieces');
  const visible = drawPieces(b, pieces, win, values, style);
  if (!visible && !dots.length) warnings.push('None of the pieces are visible in this window.');
  if (dots.length) {
    b.comment('endpoint dots');
    drawDots(b, dots, R, style.width);
  }
  if (roots.length) drawXIntercepts(b, roots, f, values, win);
  if (labelYHere) drawYIntercept(b, f, values, win);
  const tps = inside(win.xmin, win.xmax, (g, lo, hi) => findTurningPoints(g, lo, hi, 1000));
  drawTurningPoints(b, tps, values, win, { xUnit, yUnit });
  warnings.push(...drawCurvePoints(b, f, win, values, { xUnit, yUnit }));
  if (main.label) {
    const last = spans[spans.length - 1];
    const x = Math.min(last.b, win.xmax);
    if (isFinite(f(x - 1e-9))) b.add(`\\node[anchor=south east, inner sep=3pt] at ${pt(x, last.expr.evaluate(x))} {${mathLabel(main.label)}};`);
  }
  warnings.push(
    ...drawExtraGraphs(b, win, values, { graphs: others, main: { f, lo: win.xmin, hi: win.xmax }, xUnit, yUnit })
  );

  return { code: b.toString([...options, fontOption(values)]), warnings };
}

export default {
  id: 'function',
  name: 'Function graph',
  category: 'Function graphs',
  description: 'Graphs of y = f(x), piecewise functions and several graphs together, with labelled features.',
  schema,
  generate,
};
