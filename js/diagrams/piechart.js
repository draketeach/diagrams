// SPDX-License-Identifier: CC0-1.0
// Pie charts (and spinners) for the Statistical graphs type: a sector for each
// line, sized by its value, going round from the top. Each sector can be
// white, grey or dotted (the exam-paper stipples), with its name inside, and
// right angles can be marked at the centre.

import { TikzBuilder, n } from '../lib/tikz.js';
import { titleText } from './realgraph.js';

/** Shades a sector can have: TikZ fill colours, or patterns.meta patterns. */
export const PIE_SHADES = {
  white: { label: 'white' },
  none: { label: 'white' },
  'light grey': { fill: 'gray!15' },
  grey: { fill: 'gray!30' },
  gray: { fill: 'gray!30' },
  'dark grey': { fill: 'gray!50' },
  dots: { pattern: 'Dots[radius=0.33pt, distance=1.5pt, angle=45]' },
  'sparse dots': { pattern: 'Dots[radius=0.42pt, distance=3pt, angle=45]' },
  hatch: { pattern: 'Lines[angle=45, distance=3pt, line width=0.3pt]' },
};

export const PIE_EXAMPLES = {
  rows: [
    ['White: 50\nRed: 25, dots\nGreen: 10, sparse dots\nYellow: 15, grey', 'A sector each: name: value, then a shade'],
    ['A: 90\nB: 270', 'Values can be angles, counts or percentages; only their sizes matter'],
    ['Red: 25, hatch', 'Shades: white, light grey, grey, dark grey, dots, sparse dots, hatch'],
  ],
  notes: 'Sectors go round from the top in the order you type them.',
};

/** The sectors as [{ label, value, shade }]. */
export function parseSectors(text) {
  const sectors = [];
  const problems = [];
  String(text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const [main, shadeText = ''] = line.split(',').map((s) => s.trim());
      const k = main.lastIndexOf(':');
      const label = k >= 0 ? main.slice(0, k).trim() : '';
      const value = Number(k >= 0 ? main.slice(k + 1).trim() : main);
      const shade = shadeText.toLowerCase().replace(/\s+/g, ' ') || 'white';
      if (!isFinite(value) || value <= 0) problems.push(`Line ${i + 1}: needs a value above 0, e.g. Red: 25.`);
      else if (!PIE_SHADES[shade]) problems.push(`Line ${i + 1}: "${shadeText}" isn't a shade. Try white, grey, dots or sparse dots.`);
      else sectors.push({ label, value, shade });
    });
  return { sectors, problems };
}

/** The pie chart's own options (shown when the graph is a pie chart). */
export function pieFields(showIf) {
  return [
    {
      type: 'group',
      label: 'Sectors',
      showIf,
      fields: [
        {
          type: 'textarea',
          key: 'pieData',
          label: 'One sector per line (name: value, shade)',
          rows: 4,
          default: 'White: 50\nRed: 25, dots\nGreen: 10, sparse dots\nYellow: 15, grey',
          examples: PIE_EXAMPLES,
        },
        {
          type: 'row',
          fields: [
            {
              type: 'select',
              key: 'pieTurn',
              label: 'From the top',
              default: 'clockwise',
              options: [
                { value: 'clockwise', label: 'Clockwise' },
                { value: 'anticlockwise', label: 'Anticlockwise' },
              ],
            },
            { type: 'number', key: 'pieRadius', label: 'Radius (cm)', default: 2, step: 0.25, min: 0.5 },
          ],
        },
        {
          type: 'row',
          fields: [
            { type: 'checkbox', key: 'pieLabels', label: 'Names inside', default: true },
            { type: 'checkbox', key: 'pieRight', label: 'Mark right angles', default: false },
          ],
        },
      ],
    },
  ];
}

export function pieGenerate(v) {
  const { sectors, problems } = parseSectors(v.pieData);
  const warnings = [...problems];
  if (!sectors.length && !problems.length) warnings.push('Type a sector on each line, e.g. Red: 25.');
  const b = new TikzBuilder();
  const r = Number(v.pieRadius) > 0 ? Number(v.pieRadius) : 2;
  const total = sectors.reduce((s, x) => s + x.value, 0);
  const dir = v.pieTurn === 'anticlockwise' ? 1 : -1;
  let a = 90;
  const parts = sectors.map((s) => {
    const sweep = (360 * s.value) / total;
    const p = { ...s, start: a, end: a + dir * sweep, sweep };
    a += dir * sweep;
    return p;
  });
  if (parts.some((p) => PIE_SHADES[p.shade].pattern)) b.usePreamble('\\usetikzlibrary{patterns.meta}');
  const arc = (p) => `(0,0) -- (${n(p.start, 3)}:${n(r)}) arc[start angle=${n(p.start, 3)}, end angle=${n(p.end, 3)}, radius=${n(r)}] -- cycle`;
  b.comment('shading');
  for (const p of parts) {
    const sh = PIE_SHADES[p.shade];
    if (sh.pattern) b.add(`\\fill[pattern={${sh.pattern}}] ${arc(p)};`);
    else if (sh.fill) b.add(`\\fill[${sh.fill}] ${arc(p)};`);
  }
  b.comment('circle and dividing lines');
  b.add(`\\draw (0,0) circle[radius=${n(r)}];`);
  if (parts.length > 1) b.add(`\\draw ${parts.map((p) => `(0,0) -- (${n(p.start, 3)}:${n(r)})`).join(' ')};`);
  if (v.pieRight) {
    const s = Math.min(0.25, r / 6);
    for (const p of parts.filter((q) => Math.abs(q.sweep - 90) < 1e-6)) {
      const m = Math.min(p.start, p.end);
      b.add(`\\draw (${n(m, 3)}:${n(s)}) -- (${n(m + 45, 3)}:${n(s * Math.SQRT2, 4)}) -- (${n(m + 90, 3)}:${n(s)});`);
    }
  }
  if (v.pieLabels !== false) {
    b.comment('names');
    for (const p of parts.filter((q) => q.label)) {
      const mid = (p.start + p.end) / 2;
      // a narrow sector's name sits further out, where there's more room
      const k = p.sweep < 50 ? 0.74 : 0.55;
      b.add(`\\node at (${n(mid, 3)}:${n(r * k, 3)}) {${titleText(p.label)}};`);
    }
  }
  const opts = [v.lineWidth && v.lineWidth !== 'thin' ? v.lineWidth : '', v.fontSize ? `font=${v.fontSize}` : ''];
  return { code: b.toString(opts), warnings };
}
