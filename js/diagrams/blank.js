// SPDX-License-Identifier: CC0-1.0
// Blank axes: labelled axes with ticks and no curve, for "sketch the graph
// of …" questions. Optional trig presets, a background grid, and graph paper
// (true-size squares, with or without the axes).

import { TikzBuilder } from '../lib/tikz.js';
import { niceRound } from '../lib/numeric.js';
import {
  windowFields,
  axesFields,
  gridFields,
  resolveWindow,
  scaleOptions,
  fontOption,
  drawAxes,
  drawGrid,
  drawScaleTicks,
  drawCustomTicks,
  parseTickList,
  drawNotToScale,
  NOT_TO_SCALE_FIELD,
} from '../lib/functionGraph.js';
import { FONT_SIZES } from '../lib/tikz.js';
import { TICK_EXAMPLES } from '../lib/graphOptions.js';

const PRESETS = {
  radians: 'pi/2, pi, 3pi/2, 2pi',
  degrees: '90:90^{\\circ}, 180:180^{\\circ}, 270:270^{\\circ}, 360:360^{\\circ}',
};

const withDefaults = (group, defaults) => ({
  ...group,
  fields: group.fields.map((f) =>
    f.fields ? withDefaults(f, defaults) : f.key in defaults ? { ...f, default: defaults[f.key] } : f
  ),
});

const schema = [
  {
    type: 'group',
    label: 'Ticks',
    fields: [
      {
        type: 'select',
        key: 'xPreset',
        label: 'x-axis preset',
        default: 'none',
        options: [
          { value: 'none', label: 'None (type your own ticks)' },
          { value: 'radians', label: 'Trig: π/2, π, 3π/2, 2π' },
          { value: 'degrees', label: 'Trig: 90°, 180°, 270°, 360°' },
        ],
      },
      {
        type: 'text',
        key: 'xCustomTicks',
        label: 'x ticks',
        default: '2, 5',
        placeholder: 'e.g. 2, 5 or pi/3, 2pi/3',
        help: 'Added to any preset. Press ? for examples.',
        examples: TICK_EXAMPLES,
      },
      { type: 'text', key: 'yCustomTicks', label: 'y ticks', default: '', placeholder: 'e.g. 1, -1' },
      {
        type: 'row',
        fields: [
          { type: 'checkbox', key: 'customTickLabels', label: 'Label the ticks', default: true },
          { type: 'select', key: 'fontSize', label: 'Label font size', default: '', options: FONT_SIZES },
        ],
      },
      NOT_TO_SCALE_FIELD,
    ],
  },
  withDefaults(windowFields(), { width: 9, height: 6 }),
  (() => {
    // the shared axes group, minus the tick boxes that are in "Ticks" above
    const g = withDefaults(axesFields(), { originLabel: false });
    const drop = ['xCustomTicks', 'yCustomTicks', 'customTickLabels'];
    const keep = (fields) =>
      fields
        .filter((f) => !drop.includes(f.key))
        .map((f) => (f.fields ? { ...f, fields: keep(f.fields) } : f))
        .filter((f) => !f.fields || f.fields.length);
    return { ...g, fields: keep(g.fields) };
  })(),
  gridFields(),
  {
    type: 'group',
    label: 'Graph paper',
    collapsed: true,
    fields: [
      {
        type: 'row',
        fields: [
          {
            type: 'select',
            key: 'paper',
            label: 'Graph paper',
            default: 'none',
            options: [
              { value: 'none', label: 'None' },
              { value: '2', label: '2 mm squares' },
              { value: '1', label: '1 mm squares' },
              { value: '5', label: '5 mm squares' },
            ],
          },
          { type: 'checkbox', key: 'paperAxes', label: 'Draw the axes', default: true, showIf: (v) => v.paper && v.paper !== 'none' },
        ],
      },
      { type: 'note', text: 'True size on the page, with darker lines every 1 cm, lined up with the origin and filling the window (set its size under Window). Untick the axes for plain graph paper.', showIf: (v) => v.paper && v.paper !== 'none' },
    ],
  },
];

/** Graph paper over the window: true-size squares (mm) with darker lines every 1 cm, lined up with the origin. */
function drawPaper(b, win, values) {
  const mm = Number(values.paper);
  if (!(mm > 0)) return;
  b.comment(`graph paper: ${mm} mm squares, darker every 1 cm`);
  // grid steps in cm, so the squares are true size whatever the axes' units
  // corners nudged a hair so the edge lines aren't lost to rounding
  const e = (win.xmax - win.xmin + win.ymax - win.ymin) * 1e-4;
  const [x0, y0, x1, y1] = [win.xmin - e, win.ymin - e, win.xmax + e, win.ymax + e].map((t) => Number(t.toFixed(5)));
  b.add(`\\draw[gray!55, line width=0.15pt, step=${mm / 10}cm] (${x0},${y0}) grid (${x1},${y1});`);
  b.add(`\\draw[gray!90, line width=0.35pt, step=1cm] (${x0},${y0}) grid (${x1},${y1});`);
  // a hair of room so the outside lines aren't cut in half at the picture's edge
  b.add(`\\path (${x0},${y0}) ++(-1pt,-1pt) (${x1},${y1}) ++(1pt,1pt);`);
}

function generate(input) {
  const warnings = [];
  const preset = PRESETS[input.xPreset] || '';
  const values = { ...input, xCustomTicks: [preset, input.xCustomTicks].filter((s) => String(s ?? '').trim()).join(', ') };
  const xs = parseTickList(values.xCustomTicks, 'x').map((t) => t.value);
  const ys = parseTickList(values.yCustomTicks, 'y').map((t) => t.value);

  const win = resolveWindow(values, () => {
    // room left of the y-axis and past the last tick, like exam papers
    const xhi = Math.max(1, ...xs);
    const xlo = Math.min(0, ...xs);
    const span = xhi - xlo;
    const yhi = Math.max(1, ...ys);
    const ylo = Math.min(-1, ...ys);
    const yspan = yhi - ylo;
    return {
      xmin: niceRound(xlo - 0.12 * span),
      xmax: niceRound(xhi + 0.3 * span),
      ymin: niceRound(ylo - 0.15 * yspan),
      ymax: niceRound(yhi + 0.15 * yspan),
    };
  }, warnings);

  const { options } = scaleOptions(win, values);
  const b = new TikzBuilder();
  const paper = Number(values.paper) > 0;
  if (paper) drawPaper(b, win, values);
  warnings.push(...drawGrid(b, win, values));
  if (!paper || values.paperAxes !== false) {
    warnings.push(...drawAxes(b, win, values));
    warnings.push(...drawScaleTicks(b, win, values));
    warnings.push(...drawCustomTicks(b, win, values));
  }
  drawNotToScale(b, win, values);
  return { code: b.toString([...options, fontOption(values)]), warnings };
}

export default {
  id: 'blank',
  name: 'Blank axes',
  category: 'Function graphs',
  description: 'Labelled axes with tick marks and no curve, for "sketch the graph" questions.',
  schema,
  generate,
};
