// SPDX-License-Identifier: CC0-1.0
// A number line for statistics plots (dot plots, box plots): arrows at both
// ends, tick marks, numbers under them and an optional title. The picture is
// drawn with x in data units (x=…cm in the tikzpicture options), so the code
// reads in the data's own numbers: \fill (4,0.3) is a dot above 4.

import { n, escapeText, ARROW_TIPS, LINE_WIDTHS, FONT_SIZES } from './tikz.js';
import { niceStep } from './functionGraph.js';
import { titleText } from '../diagrams/realgraph.js';

const blank = (s) => String(s ?? '').trim() === '' || String(s).trim().toLowerCase() === 'auto';

/** Number-line options, for a type's schema (inside a group). */
export const NUMBER_LINE_FIELDS = [
  {
    type: 'row',
    fields: [
      { type: 'text', key: 'from', label: 'From', default: '', placeholder: 'auto' },
      { type: 'text', key: 'to', label: 'To', default: '', placeholder: 'auto' },
      { type: 'text', key: 'step', label: 'Ticks every', default: '', placeholder: 'auto' },
    ],
  },
  {
    type: 'row',
    fields: [
      {
        type: 'select',
        key: 'numbers',
        label: 'Numbers',
        default: 'every',
        options: [
          { value: 'every', label: 'At every tick' },
          { value: 'second', label: 'Every second tick' },
          { value: 'none', label: 'None' },
        ],
      },
      { type: 'number', key: 'width', label: 'Length (cm)', default: 8, step: 0.5, min: 2 },
    ],
  },
  { type: 'text', key: 'axisTitle', label: 'Title under the line', default: '', placeholder: 'e.g. Number of pets' },
];

/** Drawing options shared by the statistics plots. */
export const STYLE_FIELDS = [
  {
    type: 'row',
    fields: [
      { type: 'select', key: 'axisArrow', label: 'Arrowheads', default: 'stealth', options: ARROW_TIPS },
      { type: 'select', key: 'lineWidth', label: 'Line width', default: 'thin', options: LINE_WIDTHS },
    ],
  },
  { type: 'select', key: 'fontSize', label: 'Font size', default: '', options: FONT_SIZES },
];

/**
 * The line's range and ticks from the options, fitting the data's values when
 * from/to/step are blank. Returns { from, to, step, ticks, xu, warnings }.
 */
export function numberLineRange(v, values) {
  const warnings = [];
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 10;
  let step = blank(v.step) ? NaN : Number(v.step);
  if (!(step > 0)) step = niceStep(Math.max(hi - lo, 1), 10);
  let from = blank(v.from) ? Math.floor((lo - step * 0.5) / step) * step : Number(v.from);
  let to = blank(v.to) ? Math.ceil((hi + step * 0.5) / step) * step : Number(v.to);
  if (!isFinite(from)) from = lo;
  if (!isFinite(to)) to = hi;
  if (to <= from) {
    warnings.push('The number line must go from a smaller number to a bigger one.');
    to = from + step * 10;
  }
  if ((to - from) / step > 200) {
    warnings.push('Too many ticks: make "Ticks every" bigger.');
    step = niceStep(to - from, 10);
  }
  const ticks = [];
  for (let k = 0; from + k * step <= to + step * 1e-9; k++) ticks.push(Number((from + k * step).toPrecision(12)));
  const xu = (Number(v.width) > 0 ? Number(v.width) : 8) / (to - from); // cm per unit
  if (values.some((x) => x < from - 1e-9 || x > to + 1e-9)) warnings.push('Some values are outside the number line.');
  return { from, to, step, ticks, xu, warnings };
}

/** Writes the number line along y = 0 (in a picture whose x unit is xu cm). */
export function drawNumberLine(b, v, { from, to, ticks, xu }) {
  const ext = 0.45 / xu; // the line runs 0.45 cm past the ends
  const tip = v.axisArrow && v.axisArrow !== 'none' ? `${v.axisArrow}-${v.axisArrow}` : '';
  b.comment('number line');
  b.add(`\\draw${tip ? `[${tip}]` : ''} (${n(from - ext, 2)},0) -- (${n(to + ext, 2)},0);`);
  b.add(`\\foreach \\x in {${ticks.map((t) => n(t)).join(',')}} \\draw (\\x,0.1) -- (\\x,-0.1);`);
  const shown = v.numbers === 'none' ? [] : v.numbers === 'second' ? ticks.filter((_, i) => i % 2 === 0) : ticks;
  if (shown.length) b.add(`\\foreach \\x in {${shown.map((t) => n(t)).join(',')}} \\node[below] at (\\x,-0.1) {$\\x$};`);
  if (String(v.axisTitle ?? '').trim()) {
    const y = shown.length ? -0.75 : -0.35;
    b.add(`\\node[below] at (${n((from + to) / 2)},${n(y)}) {${titleText(v.axisTitle)}};`);
  }
}

/** The tikzpicture options: x in data units, then the line width and font. */
export function pictureOptions(v, xu) {
  return [`x=${n(xu)}cm`, v.lineWidth && v.lineWidth !== 'thin' ? v.lineWidth : '', v.fontSize ? `font=${v.fontSize}` : ''];
}

/** Numbers from text: commas, spaces, semicolons or new lines between them. */
export function parseNumbers(text) {
  const out = [];
  const bad = [];
  for (const t of String(text ?? '').split(/[\s,;]+/).filter(Boolean)) {
    const x = Number(t);
    if (isFinite(x)) out.push(x);
    else bad.push(t);
  }
  return { values: out, bad };
}

export { escapeText };
