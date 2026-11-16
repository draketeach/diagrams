// SPDX-License-Identifier: CC0-1.0
// Histograms for the Statistical graphs type: bars side by side, one per
// category or class, with a labelled tick under each bar's centre and a
// numbered frequency axis. A frequency polygon (through the tops' middles) or a
// cumulative frequency line (an ogive, through the tops' right-hand corners)
// can go over the bars, and horizontal lines can run behind them.

import { TikzBuilder, n } from '../lib/tikz.js';
import { niceStep } from '../lib/functionGraph.js';
import { titleText } from './realgraph.js';
import { PIE_SHADES } from './piechart.js';

export const HIST_EXAMPLES = {
  rows: [
    ['Red: 25\nWhite: 50\nGreen: 10\nYellow: 15', 'Categories: a bar each, named under it'],
    ['135: 15\n145: 17.5\n155: 22.5', 'Classes by their centres (the label is the centre)'],
    ['Red: 25, White: 50', 'Commas between bars work too'],
    ['3 dots\n2\n4 grey', 'A shade after a bar\'s frequency (white, grey, dots, sparse dots, hatch); no label, no tick'],
  ],
  notes: 'Each bar is label: frequency, in order from left to right.',
};

/** The bars as [{ label, f }], in order. */
export function parseBars(text) {
  const bars = [];
  const problems = [];
  String(text ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((item) => {
      const i = item.lastIndexOf(':');
      const label = i >= 0 ? item.slice(0, i).trim() : '';
      // the frequency, then optionally the bar's own shade: "Red: 25 dots", "3 grey"
      const m = (i >= 0 ? item.slice(i + 1) : item).trim().match(/^(-?[\d.]+)\s*(.*)$/);
      const f = m ? Number(m[1]) : NaN;
      const shade = m && m[2] ? m[2].toLowerCase().replace(/\s+/g, ' ') : '';
      if (!isFinite(f) || f < 0) problems.push(`"${item}" needs a frequency of 0 or more, e.g. Red: 25.`);
      else if (shade && !PIE_SHADES[shade]) problems.push(`"${item}": "${shade}" isn't a shade. Try white, grey, dots or sparse dots.`);
      else bars.push(shade ? { label, f, shade } : { label, f });
    });
  return { bars, problems };
}

/** The histogram's own options (shown when the graph is a histogram). */
export function histogramFields(showIf) {
  return [
    {
      type: 'group',
      label: 'Bars',
      showIf,
      fields: [
        {
          type: 'textarea',
          key: 'histData',
          label: 'One bar per line (label: frequency)',
          rows: 4,
          default: 'Red: 25\nWhite: 50\nGreen: 10\nYellow: 15',
          examples: HIST_EXAMPLES,
        },
        {
          type: 'row',
          fields: [
            {
              type: 'select',
              key: 'histLine',
              label: 'Line over bars',
              default: 'none',
              options: [
                { value: 'none', label: 'None' },
                { value: 'polygon', label: 'Frequency polygon' },
                { value: 'ogive', label: 'Ogive (cumulative)' },
              ],
            },
            {
              type: 'select',
              key: 'histFill',
              label: 'Bars',
              default: 'white',
              options: [
                { value: 'white', label: 'White' },
                { value: 'gray!20', label: 'Light grey' },
                { value: 'gray!40', label: 'Grey' },
              ],
            },
          ],
        },
        { type: 'note', text: 'The ogive starts at the left of the first bar and goes through each bar’s top right-hand corner, so type cumulative frequencies.', showIf: (v) => showIf(v) && v.histLine === 'ogive' },
      ],
    },
    {
      type: 'group',
      label: 'Axes',
      showIf,
      fields: [
        {
          type: 'row',
          fields: [
            { type: 'text', key: 'histXTitle', label: 'Title under', default: 'Colours' },
            { type: 'text', key: 'histYTitle', label: 'Title beside', default: 'Frequency' },
          ],
        },
        {
          type: 'row',
          fields: [
            { type: 'text', key: 'histTop', label: 'Frequency up to', default: '', placeholder: 'auto' },
            { type: 'text', key: 'histStep', label: 'Numbers every', default: '', placeholder: 'auto' },
          ],
        },
        {
          type: 'row',
          fields: [
            { type: 'checkbox', key: 'histLines', label: 'Lines across', default: false },
            { type: 'checkbox', key: 'histArrows', label: 'Axis arrows', default: false },
          ],
        },
        {
          type: 'row',
          fields: [
            { type: 'number', key: 'barWidth', label: 'Bar width (cm)', default: 1.2, step: 0.1, min: 0.3 },
            { type: 'number', key: 'histHeight', label: 'Height (cm)', default: 3.5, step: 0.5, min: 1 },
          ],
        },
      ],
    },
  ];
}

export function histogramGenerate(v) {
  const { bars, problems } = parseBars(v.histData);
  const warnings = [...problems];
  if (!bars.length && !problems.length) warnings.push('Type a bar on each line, e.g. Red: 25.');
  const b = new TikzBuilder();
  const N = Math.max(1, bars.length);
  const g = 0.5; // half a bar before the first bar and after the last
  const end = N + 2 * g;
  const fmax = Math.max(1, ...bars.map((x) => x.f));
  let step = Number(v.histStep);
  if (!(step > 0)) step = niceStep(fmax, 6);
  let top = Number(v.histTop);
  if (!(top > 0)) top = Math.ceil(fmax / step) * step;
  if (top < fmax) warnings.push('A bar is taller than "Frequency up to".');
  if (top / step > 60) {
    warnings.push('Too many numbers on the frequency axis: make "Numbers every" bigger.');
    step = niceStep(top, 6);
  }
  const xu = Number(v.barWidth) > 0 ? Number(v.barWidth) : 1.2;
  const yu = (Number(v.histHeight) > 0 ? Number(v.histHeight) : 3.5) / top;
  const levels = [];
  for (let k = 0; k * step <= top + step * 1e-9; k++) levels.push(Number((k * step).toPrecision(12)));
  const tip = v.histArrows ? '-stealth' : '';
  const over = v.histArrows ? 0.4 / yu : 0; // the y-axis runs past the top number to its arrowhead
  const right = end + (v.histArrows ? 0.4 / xu : 0);

  if (v.histLines) {
    b.comment('lines across, behind the bars');
    b.add(`\\foreach \\y in {${levels.filter((y) => y > 0).map((y) => n(y)).join(',')}} \\draw[gray] (0,\\y) -- (${n(end)},\\y);`);
  }
  b.comment('bars');
  bars.forEach((bar, i) => {
    const box = `(${n(g + i)},0) rectangle (${n(g + i + 1)},${n(bar.f)})`;
    const own = bar.shade ? PIE_SHADES[bar.shade] : null;
    if (own?.pattern) {
      // a white bar with the stipple over it, so lines behind don't show through
      b.usePreamble('\\usetikzlibrary{patterns.meta}');
      b.add(`\\fill[white] ${box};`);
      b.add(`\\filldraw[pattern={${own.pattern}}] ${box};`);
    } else {
      const fill = own ? own.fill || 'white' : v.histFill && v.histFill !== 'white' ? v.histFill : 'white';
      b.add(`\\filldraw[fill=${fill}] ${box};`);
    }
  });
  b.comment('axes');
  b.add(`\\draw${tip ? `[${tip}]` : ''} (0,0) -- (${n(right)},0);`);
  b.add(`\\draw${tip ? `[${tip}]` : ''} (0,0) -- (0,${n(top + over)});`);
  b.add(`\\foreach \\y in {${levels.map((y) => n(y)).join(',')}} \\draw (0,\\y) -- ++(-3pt,0) node[left, inner sep=2pt] {$\\y$};`);
  bars.forEach((bar, i) => {
    const x = n(g + i + 0.5);
    const label = bar.label ? (/^-?[\d.]+$/.test(bar.label) ? `$${bar.label}$` : titleText(bar.label)) : '';
    // a tick and its label under each named bar (unnamed bars have neither)
    if (label) b.add(`\\draw (${x},0) -- ++(0,-3pt) node[below, inner sep=2pt] {${label}};`);
  });
  if (bars.length && v.histLine === 'polygon') {
    b.comment('frequency polygon: through the middle of each bar’s top, down to the axis half a bar beyond');
    const p = [`(${n(g - 0.5)},0)`, ...bars.map((bar, i) => `(${n(g + i + 0.5)},${n(bar.f)})`), `(${n(g + N + 0.5)},0)`];
    b.add(`\\draw[semithick] ${p.join(' -- ')};`);
  }
  if (bars.length && v.histLine === 'ogive') {
    b.comment('cumulative frequency: from the start of the first bar through each top right-hand corner');
    const p = [`(${n(g)},0)`, ...bars.map((bar, i) => `(${n(g + i + 1)},${n(bar.f)})`)];
    b.add(`\\draw[semithick] ${p.join(' -- ')};`);
    if (bars.some((bar, i) => i && bar.f < bars[i - 1].f)) warnings.push('Cumulative frequencies should never go down.');
  }
  if (String(v.histXTitle ?? '').trim()) b.add(`\\node[below, yshift=-0.55cm] at (${n(end / 2)},0) {${titleText(v.histXTitle)}};`);
  if (String(v.histYTitle ?? '').trim()) {
    const widest = Math.max(...levels.map((y) => n(y).length));
    b.add(`\\node[rotate=90, anchor=south] at ([xshift=-${n(0.3 + 0.2 * widest, 2)}cm]0,${n(top / 2)}) {${titleText(v.histYTitle)}};`);
  }
  const opts = [`x=${n(xu)}cm`, `y=${n(yu, 5)}cm`, v.lineWidth && v.lineWidth !== 'thin' ? v.lineWidth : '', v.fontSize ? `font=${v.fontSize}` : ''];
  return { code: b.toString(opts), warnings };
}
