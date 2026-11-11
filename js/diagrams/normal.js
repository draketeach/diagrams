// SPDX-License-Identifier: CC0-1.0
// Normal distribution diagram module.
//
// A bell curve over an x-axis, with regions given as inequalities
// ("z < -1.5", "-1 < z < 2", "x > 65 : 0.1151"), shaded with dots,
// crosshatching (TikZ patterns.meta) or grey,
// dashed lines at the boundaries, labels as z-scores, real values or
// μ ± kσ, optional area labels and the empirical-rule (68–95–99.7) layout.
//
// Everything is drawn in z units (x = z); the curve is exp(-z²/2), so its
// peak is 1 and the picture's y unit sets its height.

import { parseCondition } from '../lib/piecewiseParser.js';
import { parseConstant } from '../lib/mathParser.js';
import { fmt } from '../lib/numeric.js';
import { TikzBuilder, n, pt, arrowSpec, LINE_WIDTHS, ARROW_TIPS, FONT_SIZES } from '../lib/tikz.js';

const CURVE = '{exp(-0.5*(\\x)*(\\x))}';
const h = (z) => Math.exp(-0.5 * z * z); // curve height (peak 1)

/** P(a < Z < b) for the standard normal (Simpson's rule; infinite ends allowed). */
export function normalProbability(a, b) {
  const lo = Math.max(a, -12);
  const hi = Math.min(b, 12);
  if (!(hi > lo)) return 0;
  const N = 4000;
  const step = (hi - lo) / N;
  let s = h(lo) + h(hi);
  for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * h(lo + i * step);
  return (s * step) / 3 / Math.sqrt(2 * Math.PI);
}

const schema = [
  {
    type: 'group',
    label: 'Distribution',
    fields: [
      {
        type: 'textarea',
        key: 'regions',
        label: 'Shaded regions, one per line',
        rows: 3,
        default: 'z < -1.5\nz > 1.2',
        help: 'Press ? for examples. Values are z-scores, or real values when the labels show real values.',
        examples: {
          rows: [
            ['z < -1.5', 'The left tail below z = −1.5'],
            ['z > 1.2', 'The right tail above z = 1.2'],
            ['-1 < z < 2', 'Between two values'],
            ['x <= 65', 'Real values (choose real-value labels and set μ and σ)'],
            ['z > 1.2 : 0.1151', 'Your own area label after a colon'],
          ],
          notes: ['One region per line.'],
        },
      },
      { type: 'text', key: 'mean', label: 'Mean μ', default: '0', showIf: (v) => v.labelMode === 'real' },
      { type: 'text', key: 'sd', label: 'Standard deviation σ', default: '1', showIf: (v) => v.labelMode === 'real' },
      {
        type: 'select',
        key: 'shadeStyle',
        label: 'Shading',
        default: 'dots',
        options: [
          { value: 'dots', label: 'Dots (like exam papers)' },
          { value: 'dots-medium', label: 'Dots (medium)' },
          { value: 'dots-sparse', label: 'Dots (sparse)' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'gray!20', label: 'Light grey' },
          { value: 'gray!40', label: 'Mid grey' },
        ],
      },
    ],
  },
  {
    type: 'group',
    label: 'Labels',
    collapsed: true,
    fields: [
      {
        type: 'select',
        key: 'labelMode',
        label: 'x-axis labels',
        default: 'z',
        options: [
          { value: 'z', label: 'z-scores (−1.5, 0, 1.2)' },
          { value: 'real', label: 'Real values (from μ and σ)' },
          { value: 'symbolic', label: 'μ ± kσ' },
        ],
      },
      {
        type: 'select',
        key: 'labelAt',
        label: 'Label positions',
        default: 'boundaries',
        options: [
          { value: 'boundaries', label: 'Region boundaries and the mean' },
          { value: 'sigma', label: 'Every whole σ (−3 to 3)' },
          { value: 'both', label: 'Both' },
          { value: 'none', label: 'None' },
        ],
      },
      {
        type: 'text',
        key: 'extraLabels',
        label: 'Extra labels at',
        default: '',
        placeholder: 'e.g. 2, 2.5 or 0.6:z',
        help: 'Add your own label after a colon, e.g. 0.6:z (this also replaces a boundary\'s number).',
      },
      { type: 'checkbox', key: 'ticks', label: 'Tick marks', default: true },
      { type: 'number', key: 'dp', label: 'Decimal places', default: 2, min: 0, max: 4, step: 1 },
      { type: 'checkbox', key: 'boundaryLines', label: 'Lines at region boundaries', default: true },
      {
        type: 'select',
        key: 'boundaryStyle',
        label: 'Boundary lines',
        default: 'dashed',
        options: [
          { value: 'dashed', label: 'Dashed' },
          { value: 'solid', label: 'Solid' },
        ],
        showIf: (v) => v.boundaryLines,
      },
      { type: 'checkbox', key: 'meanLine', label: 'Dashed line at the mean', default: false },
      {
        type: 'select',
        key: 'areaLabels',
        label: 'Area labels',
        default: 'none',
        options: [
          { value: 'none', label: 'None (except ones typed after a colon)' },
          { value: 'prob', label: 'Probability, e.g. 0.0668' },
          { value: 'percent', label: 'Percentage, e.g. 6.68%' },
        ],
      },
      { type: 'select', key: 'fontSize', label: 'Label font size', default: '', options: FONT_SIZES },
    ],
  },
  {
    type: 'group',
    label: 'Empirical rule',
    collapsed: true,
    fields: [
      {
        type: 'select',
        key: 'empirical',
        label: 'Show',
        default: 'none',
        options: [
          { value: 'none', label: 'Nothing' },
          { value: 'brackets', label: '68%, 95%, 99.7% brackets under the axis' },
          { value: 'bands', label: 'Percentages in each band (34%, 13.5%, …)' },
          { value: 'both', label: 'Both' },
        ],
        help: 'Adds dashed lines and labels at μ ± 1σ, 2σ and 3σ.',
      },
    ],
  },
  {
    type: 'group',
    label: 'Size & style',
    collapsed: true,
    fields: [
      { type: 'number', key: 'width', label: 'Width (cm)', default: 11, step: 0.5, min: 3 },
      { type: 'number', key: 'height', label: 'Curve height (cm)', default: 2.5, step: 0.25, min: 0.5 },
      { type: 'number', key: 'tail', label: 'Curve extends to ±… σ', default: 3.5, step: 0.25, min: 2, max: 5 },
      { type: 'select', key: 'curveWidth', label: 'Curve line width', default: 'semithick', options: LINE_WIDTHS },
      { type: 'select', key: 'axisArrow', label: 'Axis arrowheads (both ends)', default: 'stealth', options: ARROW_TIPS },
      { type: 'text', key: 'axisLabel', label: 'Axis label (right end)', default: '' },
    ],
  },
];

// ------------------------------------------------------------------ helpers

function constant(text, name) {
  try {
    return parseConstant(String(text ?? '').trim() || 'x').value;
  } catch (e) {
    throw new Error(`Could not read the ${name} "${text}"`);
  }
}

function parseRegions(src) {
  return String(src ?? '')
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line, i) => {
      const colon = line.indexOf(':');
      const cond = (colon >= 0 ? line.slice(0, colon) : line).trim();
      const label = colon >= 0 ? line.slice(colon + 1).trim() : '';
      // any single-letter variable (z, x, X, Z) is read as x
      const normalised = cond.replace(/(^|[^A-Za-z\\])[xXzZ](?![A-Za-z])/g, '$1x').replace(/√/g, 'sqrt');
      const iv = parseCondition(normalised, i + 1);
      if (iv.otherwise || iv.point) throw new Error(`Line ${i + 1}: use an inequality such as "z > 1.2"`);
      return { a: iv.a, b: iv.b, label };
    });
}

/** LaTeX for a position given in z units. */
function labelFor(z, values, mean, sd) {
  const dp = values.dp ?? 2;
  if (values.labelMode === 'real') return fmt(mean + z * sd, dp);
  if (values.labelMode === 'symbolic') {
    if (Math.abs(z) < 1e-9) return '\\mu';
    const k = Math.abs(z);
    const ks = Math.abs(k - 1) < 1e-9 ? '' : fmt(k, dp);
    return `\\mu ${z < 0 ? '-' : '+'} ${ks}\\sigma`;
  }
  return fmt(z, dp);
}

// ------------------------------------------------------------------ generate

function generate(values) {
  const warnings = [];
  const real = values.labelMode === 'real';
  const mean = real ? constant(values.mean, 'mean') : 0;
  const sd = real ? constant(values.sd, 'standard deviation') : 1;
  if (!(sd > 0)) throw new Error('The standard deviation must be positive.');
  const toZ = (v) => (real ? (v - mean) / sd : v);

  const T = Math.max(2, Math.min(5, values.tail || 3.5));
  const axisEnd = T + 0.5;
  const regions = parseRegions(values.regions).map((r) => ({ ...r, a: toZ(r.a), b: toZ(r.b) }));

  const width = Math.max(3, values.width || 11);
  const xu = Number(n(width / (2 * axisEnd), 4));
  const yu = Number(n(Math.max(0.5, values.height || 2.5), 4));
  const opts = [`x=${xu}cm`, `y=${yu}cm`];
  if (values.fontSize) opts.push(`every node/.style={font=${values.fontSize}}`);

  const b = new TikzBuilder();

  // ---- shading (patterns come from TikZ's patterns.meta library)
  const style = values.shadeStyle || 'dots';
  const PATTERNS = {
    // staggered (45°) like printed exam papers; ink coverage ≈ π r² / d²
    dots: 'Dots[radius=0.33pt, distance=1.5pt, angle=45]', // ≈ 15%, matches the HSC-style stipple
    'dots-medium': 'Dots[radius=0.38pt, distance=2.2pt, angle=45]', // ≈ 9%
    'dots-sparse': 'Dots[radius=0.42pt, distance=3pt, angle=45]', // ≈ 6%
    crosshatch: 'Hatch[angle=45, distance=3pt, line width=0.3pt]',
  };
  const pattern = PATTERNS[style];
  if (pattern) b.usePreamble('\\usetikzlibrary{patterns.meta}');
  const visible = [];
  for (const r of regions) {
    const a = Math.max(r.a, -T);
    const c = Math.min(r.b, T);
    if (!(c > a)) {
      warnings.push('A region lies outside the drawn curve.');
      continue;
    }
    visible.push({ ...r, lo: a, hi: c });
    const region = `${pt(a, 0)} -- plot[domain=${n(a)}:${n(c)}, samples=60, smooth] (\\x,${CURVE}) -- ${pt(c, 0)} -- cycle`;
    b.comment(`shaded region ${fmt(a, 2)} to ${fmt(c, 2)}`);
    b.add(pattern ? `\\fill[pattern={${pattern}}] ${region};` : `\\fill[${style}] ${region};`);
  }

  // ---- lines up to the curve (boundaries dashed or solid; mean and σ lines dashed)
  const lines = new Map(); // z -> 'dashed' | 'solid'
  const addLine = (z, style = 'dashed') => {
    if (Math.abs(z) <= T && !lines.has(n(z, 6))) lines.set(n(z, 6), style);
  };
  if (values.boundaryLines) {
    for (const r of visible) [r.a, r.b].filter(isFinite).forEach((z) => addLine(z, values.boundaryStyle === 'solid' ? 'solid' : 'dashed'));
  }
  if (values.meanLine) addLine(0);
  const emp = values.empirical || 'none';
  if (emp !== 'none') [-3, -2, -1, 1, 2, 3].forEach((z) => addLine(z));
  if (lines.size) {
    b.comment('lines up to the curve');
    for (const [zs, style] of lines) {
      const z = Number(zs);
      b.add(`\\draw[${style === 'solid' ? '' : 'dashed, '}thin] ${pt(z, 0)} -- ${pt(z, h(z))};`);
    }
  }

  // ---- curve and axis
  b.comment('curve and axis');
  b.add(`\\draw[${values.curveWidth || 'semithick'}] plot[domain=${n(-T)}:${n(T)}, samples=150, smooth] (\\x,${CURVE});`);
  const arrows = arrowSpec(values.axisArrow, true, true);
  const axisLabel = values.axisLabel ? ` node[anchor=west, inner sep=2pt] {$${values.axisLabel}$}` : '';
  b.add(`\\draw[thin${arrows ? ', ' + arrows : ''}] ${pt(-axisEnd, 0)} -- ${pt(axisEnd, 0)}${axisLabel};`);

  // ---- axis labels
  const at = new Map();
  const addLabel = (z) => {
    if (Math.abs(z) <= axisEnd - 0.2) at.set(n(z, 6), z);
  };
  const where = values.labelAt || 'boundaries';
  if (where === 'boundaries' || where === 'both') {
    addLabel(0);
    for (const r of visible) [r.a, r.b].filter(isFinite).forEach(addLabel);
  }
  if (where === 'sigma' || where === 'both' || emp !== 'none') [-3, -2, -1, 0, 1, 2, 3].forEach(addLabel);
  // extra labels, optionally with their own text after a colon ("0.6:z")
  const ownText = new Map();
  for (const t of String(values.extraLabels ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [v, ...rest] = t.split(':');
    const z = toZ(constant(v.trim(), 'extra label'));
    addLabel(z);
    if (rest.length) ownText.set(n(z, 6), rest.join(':').trim());
  }
  if (at.size) {
    b.comment('axis labels');
    for (const z of [...at.values()].sort((p, q) => p - q)) {
      if (values.ticks) b.add(`\\draw[thin] ${pt(z, 0)} ++(0,-2pt) -- ++(0,4pt);`);
      const own = ownText.get(n(z, 6));
      b.add(`\\node[anchor=north, inner sep=2pt, yshift=-2pt] at ${pt(z, 0)} {$${own ?? labelFor(z, values, mean, sd)}$};`);
    }
  }

  // ---- area labels
  const areaLines = [];
  for (const r of visible) {
    let text = r.label;
    if (!text && values.areaLabels !== 'none') {
      const p = normalProbability(r.a, r.b);
      text = values.areaLabels === 'percent' ? `${fmt(100 * p, 2)}\\%` : p.toFixed(4);
    }
    if (!text) continue;
    const cx = (r.lo + r.hi) / 2;
    const inside = h(cx) * yu > 1.1 && (r.hi - r.lo) * xu > 1.2;
    // keep clear of the empirical-rule band percentages (drawn at 40% height)
    const insideY = emp === 'bands' || emp === 'both' ? 0.72 : 0.45;
    const latex = text.includes('$') ? text : `$${text.replace(/(^|[^\\])%/g, '$1\\%')}$`;
    areaLines.push(
      inside
        ? `\\node[fill=white, inner sep=1.5pt] at ${pt(cx, h(cx) * insideY)} {${latex}};`
        : `\\node[anchor=south, inner sep=2pt] at ${pt(cx, h(cx) + 0.06)} {${latex}};`
    );
  }
  if (areaLines.length) {
    b.comment('area labels');
    areaLines.forEach((l) => b.add(l));
  }

  // ---- empirical rule
  if (emp === 'bands' || emp === 'both') {
    b.comment('empirical rule: percentage in each band');
    for (const [z, text, inside] of [
      [0.5, '34\\%', true], [-0.5, '34\\%', true],
      [1.5, '13.5\\%', true], [-1.5, '13.5\\%', true],
      [2.5, '2.35\\%', false], [-2.5, '2.35\\%', false],
    ]) {
      b.add(
        inside
          ? `\\node[font=\\footnotesize] at ${pt(z, h(z) * 0.4)} {$${text}$};`
          : `\\node[font=\\footnotesize, anchor=south, inner sep=2pt] at ${pt(z, h(z) + 0.05)} {$${text}$};`
      );
    }
  }
  if (emp === 'brackets' || emp === 'both') {
    b.comment('empirical rule: 68%, 95%, 99.7%');
    const tip = ARROW_TIPS.some((t) => t.value === values.axisArrow && t.value !== 'none') ? values.axisArrow : 'stealth';
    [[1, '68\\%', 0.9], [2, '95\\%', 1.5], [3, '99.7\\%', 2.1]].forEach(([k, text, down]) => {
      b.add(
        `\\draw[thin, ${tip}-${tip}] ([yshift=-${down}cm]${n(-k)},0) -- ([yshift=-${down}cm]${n(k)},0) ` +
          `node[midway, fill=white, inner sep=1.5pt] {$${text}$};`
      );
    });
  }

  return { code: b.toString(opts), warnings };
}

export default {
  id: 'normal',
  name: 'Normal distribution',
  category: 'Statistics',
  description: 'Bell curves with shaded regions, z-scores or real values, area labels and the empirical rule.',
  schema,
  generate,
};
