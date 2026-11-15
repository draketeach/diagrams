// SPDX-License-Identifier: CC0-1.0
// Dot plots, for the Statistical graphs type: a dot stacked above a number
// line for each value in the data.

import { TikzBuilder, n } from '../lib/tikz.js';
import { numberLineRange, drawNumberLine, pictureOptions } from '../lib/numberLine.js';

const DATA_EXAMPLES = {
  rows: [
    ['1, 1, 2, 2, 2, 3', 'Each value gets a dot; repeats stack up'],
    ['4:3', 'A value and how many dots: three dots above 4'],
    ['1 1 2\n2 2 3', 'Spaces and new lines work too'],
  ],
};

/** The data as [value, count] pairs, in order of value. */
export function parseDots(text) {
  const counts = new Map();
  const bad = [];
  for (const t of String(text ?? '').split(/[\s,;]+/).filter(Boolean)) {
    const m = t.match(/^(-?[\d.]+)(?::(\d+))?$/);
    const x = m ? Number(m[1]) : NaN;
    if (!isFinite(x)) {
      bad.push(t);
      continue;
    }
    counts.set(x, (counts.get(x) ?? 0) + (m[2] !== undefined ? Number(m[2]) : 1));
  }
  return { dots: [...counts].filter(([, k]) => k > 0).sort((a, b) => a[0] - b[0]), bad };
}

/** The dot plot's own options (shown when the graph is a dot plot). */
export function dotFields(showIf) {
  return [
    {
      type: 'group',
      label: 'Data',
      showIf,
      fields: [
        {
          type: 'textarea',
          key: 'dotData',
          label: 'Values',
          rows: 4,
          default: '1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 6, 8, 8',
          help: 'Each value gets a dot. 4:3 means three dots above 4.',
          examples: DATA_EXAMPLES,
        },
        {
          type: 'row',
          fields: [
            {
              type: 'select',
              key: 'dotStyle',
              label: 'Dots',
              default: 'filled',
              options: [
                { value: 'filled', label: 'Filled' },
                { value: 'open', label: 'Open' },
                { value: 'cross', label: 'Crosses' },
              ],
            },
            {
              type: 'select',
              key: 'dotSize',
              label: 'Dot size',
              default: '2',
              options: [
                { value: '1.5', label: 'Small' },
                { value: '2', label: 'Medium' },
                { value: '2.5', label: 'Large' },
              ],
            },
            { type: 'number', key: 'gap', label: 'Spacing (cm)', default: 0.3, step: 0.05, min: 0.1 },
          ],
        },
      ],
    },
  ];
}

export function dotGenerate(v) {
  const { dots, bad } = parseDots(v.dotData);
  const L = numberLineRange(v, dots.map(([x]) => x));
  const warnings = [...L.warnings];
  if (bad.length) warnings.push(`Not numbers: ${bad.slice(0, 5).join(', ')}`);
  if (!dots.length) warnings.push('Type some values.');
  const b = new TikzBuilder();
  const gap = Number(v.gap) > 0 ? Number(v.gap) : 0.3;
  const r = Number(v.dotSize) || 2;
  const at = (x) => `(${n(x)},{${n(gap)}*\\k})`;
  const mark = (x) =>
    ({
      filled: `\\fill ${at(x)} circle[radius=${n(r)}pt];`,
      open: `\\draw[fill=white] ${at(x)} circle[radius=${n(r)}pt];`,
      cross: `\\node[inner sep=0pt] at ${at(x)} {$\\times$};`,
    })[v.dotStyle] ?? `\\fill ${at(x)} circle[radius=${n(r)}pt];`;
  drawNumberLine(b, v, L);
  if (dots.length) {
    b.comment('dots: one column for each value, \\k counting up from the line');
    for (const [x, k] of dots) {
      const one = mark(x).replace('{' + n(gap) + '*\\k}', n(gap));
      b.add(k === 1 ? one : `\\foreach \\k in {1,...,${k}} ${mark(x)}`);
    }
  }
  return { code: b.toString(pictureOptions(v, L.xu)), warnings };
}
