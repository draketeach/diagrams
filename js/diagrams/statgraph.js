// SPDX-License-Identifier: CC0-1.0
// Statistical graphs: dot plots, box plots, histograms and pie charts in one
// type, chosen from the Graph menu at the top. Each graph has its own data box
// (so switching between them keeps what you typed); dot plots and box plots
// share the number line options.

import { NUMBER_LINE_FIELDS } from '../lib/numberLine.js';
import { ARROW_TIPS, LINE_WIDTHS, FONT_SIZES } from '../lib/tikz.js';
import { dotFields, dotGenerate } from './dotplot.js';
import { boxFields, boxGenerate } from './boxplot.js';
import { histogramFields, histogramGenerate } from './histogram.js';
import { pieFields, pieGenerate } from './piechart.js';

const is = (...kinds) => (v) => kinds.includes(v.graph || 'dot');
const onLine = (v) => is('dot')(v) || (is('box')(v) && v.line !== 'none');

const schema = [
  {
    type: 'select',
    key: 'graph',
    label: 'Graph',
    default: 'dot',
    options: [
      { value: 'dot', label: 'Dot plot' },
      { value: 'box', label: 'Box plot' },
      { value: 'histogram', label: 'Histogram' },
      { value: 'pie', label: 'Pie chart' },
    ],
  },
  ...dotFields(is('dot')),
  ...boxFields(is('box')),
  ...histogramFields(is('histogram')),
  ...pieFields(is('pie')),
  { type: 'group', label: 'Number line', fields: NUMBER_LINE_FIELDS, showIf: onLine },
  {
    type: 'group',
    label: 'Drawing',
    collapsed: true,
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'select', key: 'axisArrow', label: 'Arrowheads', default: 'stealth', options: ARROW_TIPS, showIf: onLine },
          { type: 'select', key: 'lineWidth', label: 'Line width', default: 'thin', options: LINE_WIDTHS },
        ],
      },
      { type: 'select', key: 'fontSize', label: 'Font size', default: '', options: FONT_SIZES },
    ],
  },
];

function generate(v) {
  const graph = v.graph || 'dot';
  if (graph === 'box') return boxGenerate(v);
  if (graph === 'histogram') return histogramGenerate(v);
  if (graph === 'pie') return pieGenerate(v);
  return dotGenerate(v);
}

export default {
  id: 'statgraph',
  name: 'Statistical graphs',
  category: 'Statistics',
  description: 'Dot plots, box plots, histograms (with a frequency polygon or ogive) and pie charts.',
  schema,
  generate,
};
