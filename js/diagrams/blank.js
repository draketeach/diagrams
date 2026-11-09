// SPDX-License-Identifier: CC0-1.0
// Blank axes: labelled axes with ticks and no curve, for "sketch the graph
// of …" questions. Optional trig presets and a background grid.

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
} from '../lib/functionGraph.js';
import { FONT_SIZES } from '../lib/tikz.js';

const PRESETS = {
  radians: 'pi/2, pi, 3pi/2, 2pi',
  degrees: '90:90^{\\circ}, 180:180^{\\circ}, 270:270^{\\circ}, 360:360^{\\circ}',
};

const withDefaults = (group, defaults) => ({
  ...group,
  fields: group.fields.map((f) => (f.key in defaults ? { ...f, default: defaults[f.key] } : f)),
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
        help: 'Comma separated. Add a label after a colon, e.g. 3:a. Added to any preset.',
      },
      { type: 'text', key: 'yCustomTicks', label: 'y ticks', default: '', placeholder: 'e.g. 1, -1' },
      { type: 'checkbox', key: 'customTickLabels', label: 'Label the ticks', default: true },
      { type: 'select', key: 'fontSize', label: 'Label font size', default: '', options: FONT_SIZES },
    ],
  },
  withDefaults(windowFields(), { width: 9, height: 6 }),
  (() => {
    // the shared axes group, minus the tick boxes that are in "Ticks" above
    const g = withDefaults(axesFields(), { originLabel: false });
    return { ...g, fields: g.fields.filter((f) => !['xCustomTicks', 'yCustomTicks', 'customTickLabels'].includes(f.key)) };
  })(),
  gridFields(),
];

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
  });

  const { options } = scaleOptions(win, values);
  const b = new TikzBuilder();
  warnings.push(...drawGrid(b, win, values));
  warnings.push(...drawAxes(b, win, values));
  warnings.push(...drawScaleTicks(b, win, values));
  warnings.push(...drawCustomTicks(b, win, values));
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
