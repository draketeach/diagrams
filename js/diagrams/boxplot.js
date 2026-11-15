// SPDX-License-Identifier: CC0-1.0
// Box-and-whisker plots from five-number summaries, one per line (several
// lines make parallel box plots), above a number line.

import { TikzBuilder, n } from '../lib/tikz.js';
import { NUMBER_LINE_FIELDS, STYLE_FIELDS, numberLineRange, drawNumberLine, pictureOptions } from '../lib/numberLine.js';
import { titleText } from './realgraph.js';

const EXAMPLES = {
  rows: [
    ['1, 2, 3, 4, 8', 'Minimum, lower quartile, median, upper quartile, maximum'],
    ['Boys: 12, 15, 18, 22, 30', 'A name before a colon labels the plot'],
    ['Girls: 10, 14, 17, 19, 24; 31, 35', 'Outliers after a semicolon: dots, with the whisker stopping at the maximum before them'],
  ],
  notes: ['Each line is a box plot; the first line is at the top.'],
};

/** One box plot per line: { name, five: [min, q1, med, q3, max], outliers }. */
export function parseSummaries(text) {
  const plots = [];
  const problems = [];
  String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      let name = '';
      let rest = line;
      const c = line.match(/^([^:]*[^\d\s.,:;-][^:]*):(.*)$/); // a name has a letter in it
      if (c) {
        name = c[1].trim();
        rest = c[2];
      }
      const [main, extra = ''] = rest.split(';');
      const five = main.split(/[\s,]+/).filter(Boolean).map(Number);
      const outliers = extra.split(/[\s,]+/).filter(Boolean).map(Number);
      if (five.length !== 5 || five.some((x) => !isFinite(x))) {
        problems.push(`Line ${i + 1}: needs five numbers (min, Q1, median, Q3, max).`);
        return;
      }
      if (five.some((x, k) => k && x < five[k - 1])) problems.push(`Line ${i + 1}: the five numbers should go from smallest to biggest.`);
      plots.push({ name, five, outliers: outliers.filter((x) => isFinite(x)) });
    });
  return { plots, problems };
}

const schema = [
  {
    type: 'group',
    label: 'Data',
    fields: [
      {
        type: 'textarea',
        key: 'data',
        label: 'Five-number summaries, one per line',
        rows: 3,
        default: '1, 2, 3, 4, 8',
        help: 'min, Q1, median, Q3, max. Name: before them labels the plot; ; then values adds outliers.',
        examples: EXAMPLES,
      },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'boxHeight', label: 'Box height (cm)', default: 0.6, step: 0.1, min: 0.2 },
          {
            type: 'select',
            key: 'caps',
            label: 'Whisker ends',
            default: 'bars',
            options: [
              { value: 'bars', label: 'Bars' },
              { value: 'none', label: 'Plain' },
            ],
          },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            type: 'select',
            key: 'outlierStyle',
            label: 'Outliers drawn as',
            default: 'dot',
            options: [
              { value: 'dot', label: 'Dots' },
              { value: 'open', label: 'Open dots' },
              { value: 'cross', label: 'Crosses' },
            ],
          },
          {
            type: 'select',
            key: 'line',
            label: 'Number line',
            default: 'below',
            options: [
              { value: 'below', label: 'Below the plots' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
      },
    ],
  },
  { type: 'group', label: 'Number line', fields: NUMBER_LINE_FIELDS, showIf: (v) => v.line !== 'none' },
  { type: 'group', label: 'Drawing', collapsed: true, fields: STYLE_FIELDS },
];

function generate(v) {
  const { plots, problems } = parseSummaries(v.data);
  const all = plots.flatMap((p) => [...p.five, ...p.outliers]);
  const L = numberLineRange(v, all);
  const warnings = [...problems, ...(v.line === 'none' ? [] : L.warnings)];
  if (!plots.length && !problems.length) warnings.push('Type a five-number summary: min, Q1, median, Q3, max.');
  const b = new TikzBuilder();
  const hgt = Number(v.boxHeight) > 0 ? Number(v.boxHeight) : 0.6;
  const gap = hgt + 0.5; // from one plot's middle to the next
  if (v.line !== 'none') drawNumberLine(b, v, L);
  const ext = 0.45 / L.xu;
  plots.forEach((p, i) => {
    const [mn, q1, md, q3, mx] = p.five;
    const y = (v.line === 'none' ? 0 : 0.5 + hgt / 2) + (plots.length - 1 - i) * gap; // first line on top
    const lo = n(y - hgt / 2);
    const hi = n(y + hgt / 2);
    b.comment(`${p.name ? `${p.name}: ` : ''}${p.five.map((x) => n(x)).join(', ')}${p.outliers.length ? `; outliers ${p.outliers.map((x) => n(x)).join(', ')}` : ''}`);
    b.add(`\\draw (${n(q1)},${lo}) rectangle (${n(q3)},${hi});`);
    b.add(`\\draw (${n(md)},${lo}) -- (${n(md)},${hi});`);
    b.add(`\\draw (${n(mn)},${n(y)}) -- (${n(q1)},${n(y)}) (${n(q3)},${n(y)}) -- (${n(mx)},${n(y)});`);
    if (v.caps !== 'none') {
      const c = hgt / 4;
      b.add(`\\draw (${n(mn)},${n(y - c)}) -- (${n(mn)},${n(y + c)}) (${n(mx)},${n(y - c)}) -- (${n(mx)},${n(y + c)});`);
    }
    for (const x of p.outliers) {
      if (v.outlierStyle === 'cross') b.add(`\\node[inner sep=0pt] at (${n(x)},${n(y)}) {$\\times$};`);
      else b.add(`\\${v.outlierStyle === 'open' ? 'draw[fill=white]' : 'fill'} (${n(x)},${n(y)}) circle[radius=2pt];`);
    }
    if (p.name) {
      const left = v.line === 'none' ? Math.min(mn, ...p.outliers) : L.from - ext;
      b.add(`\\node[left] at (${n(left, 2)},${n(y)}) {${titleText(p.name)}};`);
    }
  });
  return { code: b.toString(pictureOptions(v, L.xu)), warnings };
}

export default {
  id: 'boxplot',
  name: 'Box plot',
  category: 'Statistics',
  description: 'Box-and-whisker plots from five-number summaries, with outliers if you type them, above a number line.',
  schema,
  generate,
};
