// SPDX-License-Identifier: CC0-1.0
// Shared toolkit for "function graph" diagram modules (polynomials now;
// trig, exponential, log, hyperbola, ... later).
//
// It provides reusable schema fragments (window, axes, style, labels) and
// drawing helpers so each module mainly has to supply f(x), its pgfmath
// expression and any exact labels.

import { bisect, derivative, niceLatex, niceRound } from './numeric.js';
import { n, pt, arrowSpec, mathLabel, LINE_WIDTHS, ARROW_TIPS, FONT_SIZES } from './tikz.js';
import { parseConstant } from './mathParser.js';

/** Radius for dots (filled points), from the "Dot size" option. */
export function dotRadius(values) {
  return values.dotSize || '1.3pt';
}

// ---------------------------------------------------------------- schema

export function windowFields() {
  return {
    type: 'group',
    label: 'Window & size',
    collapsed: true,
    fields: [
      {
        type: 'select',
        key: 'windowMode',
        label: 'Axes range',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Automatic (fit key points)' },
          { value: 'manual', label: 'Manual' },
        ],
      },
      { type: 'number', key: 'xmin', label: 'x min', default: -6, step: 0.5, showIf: (v) => v.windowMode === 'manual' },
      { type: 'number', key: 'xmax', label: 'x max', default: 6, step: 0.5, showIf: (v) => v.windowMode === 'manual' },
      { type: 'number', key: 'ymin', label: 'y min', default: -10, step: 0.5, showIf: (v) => v.windowMode === 'manual' },
      { type: 'number', key: 'ymax', label: 'y max', default: 10, step: 0.5, showIf: (v) => v.windowMode === 'manual' },
      { type: 'number', key: 'width', label: 'Width (cm)', default: 8, step: 0.5, min: 1 },
      { type: 'number', key: 'height', label: 'Height (cm)', default: 6, step: 0.5, min: 1, showIf: (v) => !v.equalScale },
      { type: 'checkbox', key: 'equalScale', label: 'Same scale on both axes', default: false },
    ],
  };
}

export function axesFields() {
  return {
    type: 'group',
    label: 'Axes',
    collapsed: true,
    fields: [
      { type: 'select', key: 'axisArrow', label: 'Axis arrowheads', default: 'latex', options: ARROW_TIPS },
      { type: 'select', key: 'axisWidth', label: 'Axis line width', default: 'thin', options: LINE_WIDTHS },
      { type: 'text', key: 'xAxisLabel', label: 'x-axis label', default: 'x' },
      {
        type: 'select',
        key: 'xAxisLabelPos',
        label: 'x-axis label position',
        default: 'below',
        options: [
          { value: 'below', label: 'Below the arrow' },
          { value: 'right', label: 'Right of the arrow' },
        ],
      },
      { type: 'text', key: 'yAxisLabel', label: 'y-axis label', default: 'y' },
      {
        type: 'select',
        key: 'yAxisLabelPos',
        label: 'y-axis label position',
        default: 'left',
        options: [
          { value: 'left', label: 'Left of the arrow' },
          { value: 'above', label: 'Above the arrow' },
        ],
      },
      { type: 'checkbox', key: 'originLabel', label: 'Label origin "O"', default: true },
      { type: 'checkbox', key: 'xScaleTicks', label: 'Scale ticks on x-axis', default: false },
      {
        type: 'number',
        key: 'xStep',
        label: 'x tick spacing',
        default: null,
        step: 0.5,
        min: 0,
        help: 'Leave blank for automatic spacing.',
        showIf: (v) => v.xScaleTicks,
      },
      { type: 'checkbox', key: 'xScaleNumbers', label: 'Number the x ticks', default: true, showIf: (v) => v.xScaleTicks },
      { type: 'checkbox', key: 'yScaleTicks', label: 'Scale ticks on y-axis', default: false },
      {
        type: 'number',
        key: 'yStep',
        label: 'y tick spacing',
        default: null,
        step: 0.5,
        min: 0,
        help: 'Leave blank for automatic spacing.',
        showIf: (v) => v.yScaleTicks,
      },
      { type: 'checkbox', key: 'yScaleNumbers', label: 'Number the y ticks', default: true, showIf: (v) => v.yScaleTicks },
      {
        type: 'text',
        key: 'xCustomTicks',
        label: 'Custom x ticks',
        default: '',
        placeholder: 'e.g. 3, 5/2, pi',
        help: 'Comma separated. Add a label after a colon, e.g. 3:a or 2pi:2\\pi.',
      },
      {
        type: 'text',
        key: 'yCustomTicks',
        label: 'Custom y ticks',
        default: '',
        placeholder: 'e.g. 12, -4',
      },
      {
        type: 'checkbox',
        key: 'customTickLabels',
        label: 'Label custom ticks',
        default: true,
        showIf: (v) => !!(v.xCustomTicks || v.yCustomTicks),
      },
    ],
  };
}

export function gridFields() {
  const on = (v) => v.showGrid;
  return {
    type: 'group',
    label: 'Grid',
    collapsed: true,
    fields: [
      { type: 'checkbox', key: 'showGrid', label: 'Background grid', default: false },
      { type: 'number', key: 'gridXStep', label: 'x spacing', default: null, step: 0.25, min: 0, help: 'Blank = automatic.', showIf: on },
      { type: 'number', key: 'gridYStep', label: 'y spacing', default: null, step: 0.25, min: 0, help: 'Blank = automatic.', showIf: on },
      { type: 'number', key: 'gridXmin', label: 'Grid from x', default: null, step: 0.25, help: 'Leave the range blank to fill the axes.', showIf: on },
      { type: 'number', key: 'gridXmax', label: 'Grid to x', default: null, step: 0.25, showIf: on },
      { type: 'number', key: 'gridYmin', label: 'Grid from y', default: null, step: 0.25, showIf: on },
      { type: 'number', key: 'gridYmax', label: 'Grid to y', default: null, step: 0.25, showIf: on },
      {
        type: 'select',
        key: 'gridShade',
        label: 'Grid lines',
        default: 'gray!50',
        options: [
          { value: 'gray!30', label: 'Light grey' },
          { value: 'gray!50', label: 'Grey' },
          { value: 'black', label: 'Black' },
        ],
        showIf: on,
      },
    ],
  };
}

/**
 * Background grid using TikZ's grid command, e.g.
 *   \draw[gray!50, very thin, xstep=1.0714cm, ystep=0.9cm] (0,-0.25) grid (1.5,1);
 * TikZ draws grid lines at whole multiples of the step measured from the
 * origin, so with the picture's x/y units the lines land on multiples of the
 * chosen spacing (in graph units). The corners are nudged out by a hair so
 * lines lying exactly on the range's edges aren't lost to rounding.
 */
export function drawGrid(b, win, values) {
  if (!values.showGrid) return [];
  const warnings = [];
  const pick = (v, d) => (v === null || v === undefined || v === '' || !isFinite(v) ? d : v);
  const x0 = pick(values.gridXmin, win.xmin);
  const x1 = pick(values.gridXmax, win.xmax);
  const y0 = pick(values.gridYmin, win.ymin);
  const y1 = pick(values.gridYmax, win.ymax);
  if (!(x1 > x0) || !(y1 > y0)) return ['The grid range is empty.'];
  let sx = pick(values.gridXStep, 0) > 0 ? values.gridXStep : niceStep(x1 - x0, 10);
  let sy = pick(values.gridYStep, 0) > 0 ? values.gridYStep : niceStep(y1 - y0, 10);
  if ((x1 - x0) / sx > 200 || (y1 - y0) / sy > 200) {
    warnings.push('Grid spacing is very small, so it was increased.');
    sx = niceStep(x1 - x0, 50);
    sy = niceStep(y1 - y0, 50);
  }
  // the same (rounded) unit lengths the picture uses, so the steps line up exactly
  const { xUnit, yUnit } = scaleOptions(win, values);
  const xu = Number(n(xUnit, 4));
  const yu = Number(n(yUnit, 4));
  const ex = (x1 - x0) * 1e-4;
  const ey = (y1 - y0) * 1e-4;
  b.comment(`grid every ${n(sx)} by ${n(sy)} (corners nudged a hair so edge lines aren't lost to rounding)`);
  b.add(
    `\\draw[${values.gridShade || 'gray!50'}, very thin, xstep=${n(sx * xu, 4)}cm, ystep=${n(sy * yu, 4)}cm] ` +
      `${pt(x0 - ex, y0 - ey)} grid ${pt(x1 + ex, y1 + ey)};`
  );
  return warnings;
}

export function curveStyleFields({ includeMethod = true } = {}) {
  const fields = [
    { type: 'select', key: 'curveWidth', label: 'Curve line width', default: 'semithick', options: LINE_WIDTHS },
    { type: 'select', key: 'curveArrow', label: 'Arrows at curve ends', default: 'to', options: ARROW_TIPS },
  ];
  if (includeMethod) {
    fields.push(
      {
        type: 'select',
        key: 'plotMethod',
        label: 'Plot method',
        default: 'pgf',
        options: [
          { value: 'pgf', label: 'TikZ plot of the formula' },
          { value: 'coordinates', label: 'Pre-computed coordinates' },
        ],
        help: 'Pre-computed coordinates avoid TikZ\'s number limits for steep or unusual functions.',
      },
      { type: 'number', key: 'samples', label: 'Samples', default: 100, min: 10, max: 400, step: 10 }
    );
  }
  return { type: 'group', label: 'Curve style', collapsed: true, fields };
}

export function curvePointFields() {
  return {
    type: 'group',
    label: 'Points on curve',
    collapsed: true,
    fields: [
      {
        type: 'text',
        key: 'curvePoints',
        label: 'x-values of points',
        default: '',
        placeholder: 'e.g. 3, -1:P, 1/2:Q',
        help: 'Each point is drawn on the curve at that x-value. Add a name after a colon, e.g. 3:P.',
      },
      {
        type: 'select',
        key: 'curvePointLabel',
        label: 'Label',
        default: 'coords',
        options: [
          { value: 'coords', label: 'Coordinates, e.g. (3, 12)' },
          { value: 'nameCoords', label: 'Name and coordinates, e.g. P(3, 12)' },
          { value: 'name', label: 'Name only, e.g. P' },
          { value: 'axes', label: 'Dashed lines, values on the axes' },
          { value: 'none', label: 'No label' },
        ],
      },
      {
        type: 'checkbox',
        key: 'curvePointLines',
        label: 'Dashed lines to the axes',
        default: false,
        showIf: (v) => v.curvePointLabel !== 'axes',
      },
      { type: 'checkbox', key: 'curvePointDots', label: 'Dots', default: true },
    ],
  };
}

export function labelFields() {
  return {
    type: 'group',
    label: 'Labels',
    collapsed: true,
    fields: [
      { type: 'checkbox', key: 'labelX', label: 'Label x-intercepts', default: true },
      {
        type: 'select',
        key: 'xLabelPlacement',
        label: 'x-intercept label placement',
        default: 'smart',
        options: [
          { value: 'smart', label: 'Smart (away from curve)' },
          { value: 'below', label: 'Directly below' },
        ],
        showIf: (v) => v.labelX,
      },
      { type: 'checkbox', key: 'ticks', label: 'Tick marks at x-intercepts', default: true, showIf: (v) => v.labelX },
      { type: 'checkbox', key: 'labelY', label: 'Label y-intercept', default: false },
      { type: 'checkbox', key: 'yTick', label: 'Tick mark at y-intercept', default: false },
      {
        type: 'select',
        key: 'yLabelFormat',
        label: 'y-intercept format',
        default: 'value',
        options: [
          { value: 'value', label: 'Value, e.g. 12' },
          { value: 'coords', label: 'Coordinates, e.g. (0, 12)' },
        ],
        showIf: (v) => v.labelY,
      },
      { type: 'checkbox', key: 'interceptDots', label: 'Dots on intercepts', default: false },
      {
        type: 'select',
        key: 'tpLabel',
        label: 'Turning points',
        default: 'none',
        options: [
          { value: 'none', label: 'No labels' },
          { value: 'coords', label: 'Coordinates at the point' },
          { value: 'axes', label: 'Dashed lines to axes, values on axes' },
        ],
      },
      { type: 'checkbox', key: 'tpDots', label: 'Dots on turning points', default: false },
      {
        type: 'select',
        key: 'dotSize',
        label: 'Dot size',
        default: '1.3pt',
        options: [
          { value: '1.3pt', label: 'Small' },
          { value: '2pt', label: 'Medium' },
          { value: '2.5pt', label: 'Large' },
        ],
      },
      { type: 'number', key: 'dp', label: 'Decimal places', default: 2, min: 0, max: 6, step: 1 },
      {
        type: 'checkbox',
        key: 'exact',
        label: 'Exact values where possible',
        default: true,
        help: 'Shows simple fractions, multiples of π and surds (e.g. ½, −2π, √3) instead of decimals.',
      },
      { type: 'checkbox', key: 'showEquation', label: 'Show equation on graph', default: false },
      { type: 'select', key: 'fontSize', label: 'Label font size', default: '', options: FONT_SIZES },
    ],
  };
}

// ---------------------------------------------------------------- window

/**
 * Choose a window that shows the key features.
 * @param xs important x values (roots, turning points ...)
 * @param ys important y values (turning point heights, y-intercept ...)
 * @param f  optional function, used when there are too few y features
 */
export function autoWindow({ xs = [], ys = [], f = null, padX = 0.3, padY = 0.3 }) {
  const X = [0, ...xs].filter(isFinite);
  let xlo = Math.min(...X);
  let xhi = Math.max(...X);
  let span = Math.max(xhi - xlo, 2);
  const xmin = xlo - padX * span;
  const xmax = xhi + padX * span;

  const Y = [0, ...ys].filter(isFinite);
  if (f && Y.length < 3) {
    // not enough features: look at the curve a little inside the window
    for (const x of [xlo - 0.15 * span, xhi + 0.15 * span, (xlo + xhi) / 2]) {
      const y = f(x);
      if (isFinite(y)) Y.push(y);
    }
  }
  let ylo = Math.min(...Y);
  let yhi = Math.max(...Y);
  let spanY = yhi - ylo;
  if (spanY < 1e-9) spanY = 2;
  return {
    xmin: niceRound(xmin),
    xmax: niceRound(xmax),
    ymin: niceRound(Math.min(ylo - padY * spanY, -0.1 * spanY)),
    ymax: niceRound(Math.max(yhi + padY * spanY, 0.1 * spanY)),
  };
}

export function resolveWindow(values, auto) {
  if (values.windowMode === 'manual') {
    const w = { xmin: values.xmin, xmax: values.xmax, ymin: values.ymin, ymax: values.ymax };
    for (const [k, v] of Object.entries(w)) {
      if (v === null || !isFinite(v)) throw new Error(`Window value "${k}" is missing`);
    }
    if (w.xmin >= w.xmax) throw new Error('x min must be less than x max');
    if (w.ymin >= w.ymax) throw new Error('y min must be less than y max');
    return w;
  }
  return auto();
}

/** TikZ picture options for the unit lengths. */
export function scaleOptions(win, values) {
  const width = Math.max(1, values.width || 8);
  const xUnit = width / (win.xmax - win.xmin);
  const yUnit = values.equalScale ? xUnit : Math.max(1, values.height || 6) / (win.ymax - win.ymin);
  return { xUnit, yUnit, options: [`x=${n(xUnit, 4)}cm`, `y=${n(yUnit, 4)}cm`] };
}

export function fontOption(values) {
  return values.fontSize ? `every node/.style={font=${values.fontSize}}` : '';
}

// ---------------------------------------------------------------- pieces

/**
 * Split [xmin, xmax] into intervals where f is defined and inside [ymin, ymax].
 * Each piece: { a, b, startArrow, endArrow } — arrows where the curve leaves
 * the window (not where the function is undefined).
 */
export function findPieces(f, win, n = 2000) {
  const { xmin, xmax, ymin, ymax } = win;
  const inside = (x) => {
    const y = f(x);
    return isFinite(y) && y >= ymin && y <= ymax;
  };
  const h = (xmax - xmin) / n;
  const pieces = [];
  let cur = null;
  let prevX = xmin;
  let prevIn = inside(xmin);
  if (prevIn) cur = { a: xmin, startArrow: true };
  for (let i = 1; i <= n; i++) {
    const x = i === n ? xmax : xmin + i * h;
    const isIn = inside(x);
    if (isIn !== prevIn) {
      const edge = bisect(inside, prevX, x);
      if (isIn) {
        cur = { a: edge, startArrow: isFinite(f(prevX)) };
      } else {
        cur.b = edge;
        cur.endArrow = isFinite(f(x));
        pieces.push(cur);
        cur = null;
      }
    }
    prevX = x;
    prevIn = isIn;
  }
  if (cur) {
    cur.b = xmax;
    cur.endArrow = true;
    pieces.push(cur);
  }
  return pieces.filter((p) => p.b - p.a > 1e-6);
}

// ---------------------------------------------------------------- drawing

export function drawAxes(b, win, values) {
  const tip = values.axisArrow;
  const style = [values.axisWidth, arrowSpec(tip, false, true)].filter(Boolean).join(', ');
  const warnings = [];
  b.comment('axes');
  if (win.ymin <= 0 && win.ymax >= 0) {
    const anchor = values.xAxisLabelPos === 'right' ? 'west' : 'north east';
    const label = values.xAxisLabel ? ` node[anchor=${anchor}, inner sep=2pt] {${mathLabel(values.xAxisLabel)}}` : '';
    b.add(`\\draw[${style}] ${pt(win.xmin, 0)} -- ${pt(win.xmax, 0)}${label};`);
  } else warnings.push('The x-axis is outside the window, so it was not drawn.');
  if (win.xmin <= 0 && win.xmax >= 0) {
    const anchor = values.yAxisLabelPos === 'above' ? 'south' : 'north east';
    const label = values.yAxisLabel ? ` node[anchor=${anchor}, inner sep=2pt] {${mathLabel(values.yAxisLabel)}}` : '';
    b.add(`\\draw[${style}] ${pt(0, win.ymin)} -- ${pt(0, win.ymax)}${label};`);
  } else warnings.push('The y-axis is outside the window, so it was not drawn.');
  if (values.originLabel && win.ymin <= 0 && win.ymax >= 0 && win.xmin <= 0 && win.xmax >= 0) {
    b.add(`\\node[anchor=north east, inner sep=2pt] at (0,0) {$O$};`);
  }
  return warnings;
}

/**
 * Draw f over the pieces.
 * opts: { pgfExpr (uses \x), f, method: 'pgf'|'coordinates', comment? }
 */
export function drawCurve(b, pieces, values, opts) {
  const warnings = [];
  if (opts.comment !== false) b.comment(opts.comment ?? 'curve');
  for (const p of pieces) {
    const arrows = arrowSpec(values.curveArrow, p.startArrow, p.endArrow);
    const style = [values.curveWidth, arrows].filter(Boolean).join(', ');
    const samples = Math.max(10, Math.min(400, Math.round(values.samples || 100)));
    if (opts.method === 'coordinates' || !opts.pgfExpr) {
      const coords = [];
      for (let i = 0; i <= samples; i++) {
        const x = p.a + ((p.b - p.a) * i) / samples;
        coords.push(pt(x, opts.f(x)));
      }
      const rows = [];
      for (let i = 0; i < coords.length; i += 6) rows.push('    ' + coords.slice(i, i + 6).join(' '));
      b.add(`\\draw[${style}] plot[smooth] coordinates {\n${rows.join('\n')}\n  };`);
    } else {
      b.add(`\\draw[${style}] plot[domain=${n(p.a)}:${n(p.b)}, samples=${samples}, smooth] (\\x,{${opts.pgfExpr}});`);
    }
  }
  return warnings;
}

/** Draw a smooth Bézier path through points with given slopes (cubic Hermite). */
export function drawHermite(b, points, slopes, values, { startDot = false, endDot = false, startArrow = true, endArrow = true } = {}) {
  if (points.length < 2) return;
  // an end with a dot gets no arrow
  const arrows = arrowSpec(values.curveArrow, startArrow && !startDot, endArrow && !endDot);
  const style = [values.curveWidth, arrows].filter(Boolean).join(', ');
  let path = pt(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = p1.x - p0.x;
    const c1 = pt(p0.x + h / 3, p0.y + (slopes[i] * h) / 3);
    const c2 = pt(p1.x - h / 3, p1.y - (slopes[i + 1] * h) / 3);
    path += `\n    .. controls ${c1} and ${c2} .. ${pt(p1.x, p1.y)}`;
  }
  b.comment('curve (smooth through the given points)');
  b.add(`\\draw[${style}] ${path};`);
  const ends = [startDot && points[0], endDot && points[points.length - 1]].filter(Boolean);
  if (ends.length) {
    b.comment('dots at curve ends');
    for (const p of ends) b.add(`\\fill ${pt(p.x, p.y)} circle[radius=${dotRadius(values)}];`);
  }
}

/**
 * Label x-intercepts.
 * roots: [{ x, latex? }]; f used to decide label side; slopeAt optional.
 */
export function drawXIntercepts(b, roots, f, values, win) {
  if (!values.labelX && !values.interceptDots) return;
  const dp = values.dp ?? 2;
  const span = win.xmax - win.xmin;
  const lines = [];
  for (const r of roots) {
    if (r.x < win.xmin || r.x > win.xmax) continue;
    const atOrigin = Math.abs(r.x) < 1e-9;
    if (values.interceptDots) lines.push(`\\fill ${pt(r.x, 0)} circle[radius=${dotRadius(values)}];`);
    if (!values.labelX || (atOrigin && values.originLabel)) continue;
    const d = 1e-3 * span;
    const yl = f(r.x - d);
    const yr = f(r.x + d);
    const touchFromBelow = yl < 0 && yr < 0;
    let anchor = touchFromBelow ? 'south' : 'north';
    if (values.xLabelPlacement === 'smart' && !touchFromBelow) {
      const s = r.slope ?? derivative(f, r.x);
      if (yl > 0 && yr > 0) anchor = 'north';
      else if (s > 1e-9) anchor = 'north west';
      else if (s < -1e-9) anchor = 'north east';
    }
    const tickDown = values.ticks && !touchFromBelow;
    if (values.ticks) {
      lines.push(`\\draw[${values.axisWidth || 'thin'}] ${pt(r.x, 0)} -- ++(0,${touchFromBelow ? '' : '-'}3pt);`);
    }
    const label = r.latex ?? niceLatex(r.x, dp, values.exact);
    const shift = tickDown && anchor === 'north' ? ', yshift=-2pt' : touchFromBelow && values.ticks ? ', yshift=2pt' : '';
    lines.push(`\\node[anchor=${anchor}, inner sep=2pt${shift}] at ${pt(r.x, 0)} {${mathLabel(label)}};`);
  }
  if (lines.length) {
    b.comment('x-intercepts');
    lines.forEach((l) => b.add(l));
  }
}

export function drawYIntercept(b, f, values, win, { latex, slope } = {}) {
  if (!values.labelY && !values.interceptDots && !values.yTick) return;
  if (win.xmin > 0 || win.xmax < 0) return;
  const c = f(0);
  if (!isFinite(c) || c < win.ymin || c > win.ymax) return;
  if (Math.abs(c) < 1e-9) return; // that's the origin
  b.comment('y-intercept');
  if (values.yTick) b.add(`\\draw[${values.axisWidth || 'thin'}] ${pt(0, c)} -- ++(-3pt,0);`);
  if (values.interceptDots) b.add(`\\fill ${pt(0, c)} circle[radius=${dotRadius(values)}];`);
  if (!values.labelY) return;
  const s = slope ?? derivative(f, 0);
  let anchor;
  if (s < -1e-9) anchor = 'south west';
  else if (s > 1e-9) anchor = 'south east';
  else anchor = f(0.01) < c ? 'south east' : 'north east';
  const val = latex ?? niceLatex(c, values.dp ?? 2, values.exact);
  const text = values.yLabelFormat === 'coords' ? `(0, ${val})` : val;
  b.add(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(0, c)} {${mathLabel(text)}};`);
}

/** Turning points: [{ x, y, kind, latex? }] */
export function drawTurningPoints(b, tps, values, win, { xUnit = 1, yUnit = 1 } = {}) {
  const style = values.tpLabel;
  if (style === 'none' && !values.tpDots) return;
  const dp = values.dp ?? 2;
  const lines = [];
  for (const p of tps) {
    if (p.x < win.xmin || p.x > win.xmax || p.y < win.ymin || p.y > win.ymax) continue;
    const xs = p.xLatex ?? niceLatex(p.x, dp, values.exact);
    const ys = p.yLatex ?? niceLatex(p.y, dp, values.exact);
    // a turning point on the x-axis is already labelled as an x-intercept
    const onAxis = Math.abs(p.y) < 1e-9 && values.labelX;
    if (style === 'axes' && !onAxis) {
      lines.push(`\\draw[dashed, ${values.axisWidth || 'thin'}] ${pt(p.x, 0)} -- ${pt(p.x, p.y)} -- ${pt(0, p.y)};`);
      // The origin label "O" sits below-left of the origin. A value label that
      // would land on it goes to the other side of its axis instead.
      const nearO = (cm) => values.originLabel && Math.abs(cm) < 0.6;
      if (Math.abs(p.x) > 1e-9) {
        let anchor = p.y > 0 ? 'north' : 'south';
        // moved across: sit above the axis, just left of the dashed line
        if (p.y > 0 && p.x < 0 && nearO(p.x * xUnit)) anchor = 'south east';
        lines.push(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(p.x, 0)} {${mathLabel(xs)}};`);
      }
      if (Math.abs(p.y) > 1e-9) {
        let anchor = p.x > 0 ? 'east' : 'west';
        // moved across: sit just below the dashed line rather than on it
        if (p.x > 0 && p.y < 0 && nearO(p.y * yUnit)) anchor = 'north west';
        lines.push(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(0, p.y)} {${mathLabel(ys)}};`);
      }
    }
    if (values.tpDots) lines.push(`\\fill ${pt(p.x, p.y)} circle[radius=${dotRadius(values)}];`);
    if (style === 'coords' && !onAxis) {
      const anchor = p.kind === 'max' ? 'south' : 'north';
      lines.push(`\\node[anchor=${anchor}, inner sep=3pt] at ${pt(p.x, p.y)} {${mathLabel(`(${xs}, ${ys})`)}};`);
    }
  }
  if (lines.length) {
    b.comment('turning points');
    lines.forEach((l) => b.add(l));
  }
}

/** Put the equation near the end of the last piece of the curve. */
export function drawEquation(b, latex, f, pieces, values) {
  if (!values.showEquation || !latex || !pieces.length) return;
  const last = pieces[pieces.length - 1];
  const x = last.b;
  const y = f(x);
  if (!isFinite(y)) return;
  b.comment('equation');
  b.add(`\\node[anchor=west, inner sep=3pt] at ${pt(x, y)} {$y = ${latex}$};`);
}

// ---------------------------------------------------------------- scale ticks

/** A "nice" tick spacing (1, 2 or 5 × 10^k) giving roughly `target` ticks. */
export function niceStep(span, target = 8) {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

function tickValues(lo, hi, step) {
  const out = [];
  const start = Math.ceil((lo + 1e-9) / step);
  const end = Math.floor((hi - 1e-9) / step);
  for (let k = start; k <= end; k++) {
    const v = Number((k * step).toPrecision(12));
    if (Math.abs(v) > 1e-12) out.push(v);
  }
  return out;
}

/**
 * Evenly spaced ticks: below the x-axis and left of the y-axis.
 * skipX / skipY: values already labelled elsewhere (no duplicate number).
 * The arrow end of each axis is kept clear of ticks.
 */
export function drawScaleTicks(b, win, values, { skipX = [], skipY = [] } = {}) {
  const warnings = [];
  const width = values.axisWidth || 'thin';
  const near = (v, list, tol) => list.some((u) => Math.abs(u - v) < tol);
  const axis = (on, lo, hi, step, skip, numbers, name) => {
    if (!on) return;
    let st = step && step > 0 ? step : niceStep(hi - lo);
    // keep the arrow end (and the axis label there) clear of ticks
    const clear = () => Math.max(0.6 * st, 0.07 * (hi - lo));
    let ticks = tickValues(lo, hi - clear(), st);
    if (ticks.length > 60) {
      warnings.push(`Too many ${name}-axis ticks; spacing increased.`);
      st = niceStep(hi - lo, 20);
      ticks = tickValues(lo, hi - clear(), st);
    }
    if (!ticks.length) return;
    const list = ticks.map((t) => n(t)).join(',');
    b.comment(`${name}-axis scale`);
    if (name === 'x') {
      b.add(`\\foreach \\t in {${list}} \\draw[${width}] (\\t,0) -- ++(0,-3pt);`);
    } else {
      b.add(`\\foreach \\t in {${list}} \\draw[${width}] (0,\\t) -- ++(-3pt,0);`);
    }
    if (numbers) {
      const labelled = ticks.filter((t) => !near(t, skip, st * 0.3));
      if (labelled.length) {
        // one node per number (not \\foreach) so each label is plain text in
        // the code and the TikZJax minus fix can see it
        for (const t of labelled) {
          b.add(
            name === 'x'
              ? `\\node[anchor=north, inner sep=2pt, yshift=-2pt] at ${pt(t, 0)} {$${n(t)}$};`
              : `\\node[anchor=east, inner sep=2pt, xshift=-2pt] at ${pt(0, t)} {$${n(t)}$};`
          );
        }
      }
    }
  };
  if (win.ymin <= 0 && win.ymax >= 0) {
    axis(values.xScaleTicks, win.xmin, win.xmax, values.xStep, skipX, values.xScaleNumbers, 'x');
  }
  if (win.xmin <= 0 && win.xmax >= 0) {
    axis(values.yScaleTicks, win.ymin, win.ymax, values.yStep, skipY, values.yScaleNumbers, 'y');
  }
  return warnings;
}

// ---------------------------------------------------------------- custom ticks

/** Parse "3, 5/2, pi:a" into [{ value, latex }]. */
export function parseTickList(src, axisName) {
  return String(src ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const i = item.indexOf(':');
      const valueText = i >= 0 ? item.slice(0, i).trim() : item;
      const label = i >= 0 ? item.slice(i + 1).trim() : null;
      let c;
      try {
        c = parseConstant(valueText);
      } catch (e) {
        throw new Error(`Could not read custom ${axisName} tick "${item}": ${e.message}`);
      }
      return { value: c.value, latex: label ?? c.latex };
    });
}

/**
 * Ticks at chosen values: below the x-axis, left of the y-axis.
 * Labels that would repeat an existing label (skipX / skipY) are left off.
 */
export function drawCustomTicks(b, win, values, { skipX = [], skipY = [] } = {}) {
  const warnings = [];
  const width = values.axisWidth || 'thin';
  const near = (v, list) => list.some((u) => Math.abs(u - v) < 1e-9);
  const xs = parseTickList(values.xCustomTicks, 'x');
  const ys = parseTickList(values.yCustomTicks, 'y');
  const lines = [];
  if (xs.length && win.ymin <= 0 && win.ymax >= 0) {
    for (const t of xs) {
      if (t.value < win.xmin || t.value > win.xmax) {
        warnings.push(`Custom x tick ${t.latex} is outside the axes range.`);
        continue;
      }
      lines.push(`\\draw[${width}] ${pt(t.value, 0)} -- ++(0,-3pt);`);
      if (values.customTickLabels && Math.abs(t.value) > 1e-12 && !near(t.value, skipX)) {
        lines.push(`\\node[anchor=north, inner sep=2pt, yshift=-2pt] at ${pt(t.value, 0)} {${mathLabel(t.latex)}};`);
      }
    }
  }
  if (ys.length && win.xmin <= 0 && win.xmax >= 0) {
    for (const t of ys) {
      if (t.value < win.ymin || t.value > win.ymax) {
        warnings.push(`Custom y tick ${t.latex} is outside the axes range.`);
        continue;
      }
      lines.push(`\\draw[${width}] ${pt(0, t.value)} -- ++(-3pt,0);`);
      if (values.customTickLabels && Math.abs(t.value) > 1e-12 && !near(t.value, skipY)) {
        lines.push(`\\node[anchor=east, inner sep=2pt, xshift=-2pt] at ${pt(0, t.value)} {${mathLabel(t.latex)}};`);
      }
    }
  }
  if (lines.length) {
    b.comment('custom ticks');
    lines.forEach((l) => b.add(l));
  }
  return warnings;
}

// ---------------------------------------------------------------- points on curve

/** Parse "3, -1:P" into [{ x, xLatex, name }]. */
export function parseCurvePoints(src) {
  return String(src ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const i = item.indexOf(':');
      const valueText = i >= 0 ? item.slice(0, i).trim() : item;
      const name = i >= 0 ? item.slice(i + 1).trim() : '';
      let c;
      try {
        c = parseConstant(valueText);
      } catch (e) {
        throw new Error(`Could not read point "${item}": ${e.message}`);
      }
      return { x: c.value, xLatex: c.latex, name };
    });
}

/** Dots (and labels / dashed lines) at chosen x-values on the curve f. */
export function drawCurvePoints(b, f, win, values, { xUnit = 1, yUnit = 1 } = {}) {
  const pts = parseCurvePoints(values.curvePoints);
  if (!pts.length) return [];
  const warnings = [];
  const dp = values.dp ?? 2;
  const width = values.axisWidth || 'thin';
  const style = values.curvePointLabel;
  const lines = [];
  for (const p of pts) {
    const y = f(p.x);
    if (!isFinite(y)) {
      warnings.push(`The curve is not defined at x = ${p.xLatex}.`);
      continue;
    }
    if (p.x < win.xmin || p.x > win.xmax || y < win.ymin || y > win.ymax) {
      warnings.push(`The point at x = ${p.xLatex} is outside the axes range.`);
      continue;
    }
    const yLatex = niceLatex(y, dp, values.exact);
    if (style === 'axes' || values.curvePointLines) {
      lines.push(`\\draw[dashed, ${width}] ${pt(p.x, 0)} -- ${pt(p.x, y)} -- ${pt(0, y)};`);
    }
    if (style === 'axes') {
      const nearO = (cm) => values.originLabel && Math.abs(cm) < 0.6;
      if (Math.abs(p.x) > 1e-9 && Math.abs(y) > 1e-9) {
        let anchor = y > 0 ? 'north' : 'south';
        if (y > 0 && p.x < 0 && nearO(p.x * xUnit)) anchor = 'south east';
        lines.push(`\\node[anchor=${anchor}, inner sep=2pt] at ${pt(p.x, 0)} {${mathLabel(p.xLatex)}};`);
        let yAnchor = p.x > 0 ? 'east' : 'west';
        if (p.x > 0 && y < 0 && nearO(y * yUnit)) yAnchor = 'north west';
        lines.push(`\\node[anchor=${yAnchor}, inner sep=2pt] at ${pt(0, y)} {${mathLabel(yLatex)}};`);
      }
    }
    if (values.curvePointDots) lines.push(`\\fill ${pt(p.x, y)} circle[radius=${dotRadius(values)}];`);
    let text = '';
    const coords = `(${p.xLatex}, ${yLatex})`;
    if (style === 'coords') text = coords;
    else if (style === 'nameCoords') text = p.name ? `${p.name}${coords}` : coords;
    else if (style === 'name' || style === 'axes') text = p.name;
    if (text) {
      // Put the label where the curve isn't: look at the curve about 0.6 cm
      // either side. Near a minimum -> below; near a maximum -> above;
      // otherwise above, on the side the curve is not heading.
      const d = 0.6 / xUnit;
      const yl = f(p.x - d);
      const yr = f(p.x + d);
      let anchor;
      if (yl > y && yr > y) anchor = 'north';
      else if (yl < y && yr < y) anchor = 'south';
      else anchor = derivative(f, p.x) > 0 ? 'south east' : 'south west';
      lines.push(`\\node[anchor=${anchor}, inner sep=3pt] at ${pt(p.x, y)} {${mathLabel(text)}};`);
    }
  }
  if (lines.length) {
    b.comment('points on curve');
    lines.forEach((l) => b.add(l));
  }
  return warnings;
}
