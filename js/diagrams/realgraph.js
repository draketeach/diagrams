// SPDX-License-Identifier: CC0-1.0
// Real-world graphs: quantities against time and the like, drawn through
// points rather than from an equation. Axes meet at the corner, with titles
// (and units) centred under the x-axis and turned beside the y-axis, a grid,
// and numbered scales. Several curves, each smooth or straight between points,
// with jumps, gaps, dots and labels.

import { TikzBuilder, n, pt, escapeText, mathLabel, FONT_SIZES, LINE_WIDTHS } from '../lib/tikz.js';
import { parseConstant } from '../lib/mathParser.js';
import { smoothSections } from '../lib/smooth.js';

// ---------------------------------------------------------------- reading curves

const SETTINGS_WIDTHS = ['ultra thin', 'very thin', 'thin', 'semithick', 'thick', 'very thick', 'ultra thick'];

function num(s, where) {
  try {
    const t = String(s).trim();
    if (/^-?\d*\.?\d+$/.test(t)) return Number(t);
    return parseConstant(t).value;
  } catch {
    /* fall through */
  }
  throw new Error(`${where}: "${s}" isn't a number.`);
}

/**
 * One curve per line: points "x,y" separated by spaces are joined smoothly,
 * "--" between two points joins them with a straight line, and "|" leaves a
 * gap. After a point: > makes the curve level there (or @30 sets its direction
 * on the page in degrees), * gives a filled dot and o an open one, and ":text"
 * labels it. Settings follow ";": dashed, dotted, a line width, straight
 * (every join straight), and label: text — at the end of the curve, or e.g.
 * "label below: text", "label start above: text", "label middle: text".
 */
export function parseCurve(line, index) {
  const where = `Curve ${index + 1}`;
  const [body, ...settings] = line.split(';');
  const tokens = body
    .replace(/\s*,\s*/g, ',')
    .replace(/--/g, ' -- ')
    .replace(/\|/g, ' | ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const curve = { points: [], joins: [], style: '', width: '', straight: false, label: '', labelAt: 'end', labelSide: '' };
  for (const st of settings.map((x) => x.trim()).filter(Boolean)) {
    const m = st.match(/^label((?:\s+(?:at|start|end|middle|above|below|left|right))*)\s*:\s*(.*)$/i);
    if (m) {
      const words = m[1].toLowerCase().split(/\s+/).filter((w) => w && w !== 'at');
      curve.label = m[2].trim();
      curve.labelAt = words.find((w) => ['start', 'end', 'middle'].includes(w)) || 'end';
      const v = words.find((w) => w === 'above' || w === 'below') || '';
      const h = words.find((w) => w === 'left' || w === 'right') || '';
      curve.labelSide = [v, h].filter(Boolean).join(' ');
    }
    else if (/^(dashed|dotted|densely dashed|densely dotted|loosely dashed|loosely dotted)$/i.test(st)) curve.style = st.toLowerCase();
    else if (SETTINGS_WIDTHS.includes(st.toLowerCase())) curve.width = st.toLowerCase();
    else if (/^straight$/i.test(st)) curve.straight = true;
    else throw new Error(`${where}: "${st}" isn't a setting. Try dashed, dotted, thick, straight or label: text.`);
  }
  let join = null;
  for (const t of tokens) {
    if (t === '--' || t === '|') {
      if (!curve.points.length) throw new Error(`${where}: start with a point, e.g. 0,8.`);
      join = t === '--' ? 'line' : 'gap';
      continue;
    }
    const m = t.match(/^([^,:]+),([^,:*@>]+?)(>|@-?[\d.]+)?([*o])?(?::(.+))?$/);
    if (!m) throw new Error(`${where}: "${t}" isn't a point. Write points like 0,8 (or 0,8> for a level start, 10,5.8* for a dot).`);
    const p = {
      x: num(m[1], where),
      y: num(m[2], where),
      dir: m[3] ? (m[3] === '>' ? 0 : Number(m[3].slice(1))) : null,
      dot: m[4] === '*' ? 'filled' : m[4] === 'o' ? 'open' : '',
      text: m[5] || '',
    };
    if (curve.points.length) curve.joins.push(join || (curve.straight ? 'line' : 'smooth'));
    curve.points.push(p);
    join = null;
  }
  if (!curve.points.length) throw new Error(`${where}: type some points, e.g. 0,8 10,6.6 25,0.`);
  return curve;
}

/** The curve as runs to draw: { kind: 'smooth' | 'line', points }. Gaps split it. */
export function curveRuns(curve) {
  const runs = [];
  let cur = null;
  curve.joins.forEach((j, i) => {
    const a = curve.points[i];
    const b = curve.points[i + 1];
    if (j === 'gap') {
      cur = null;
      return;
    }
    if (cur && cur.kind === j) cur.points.push(b);
    else {
      cur = { kind: j, points: [a, b] };
      runs.push(cur);
    }
  });
  return runs;
}

/** A smooth run as TikZ "(a) .. controls (c1) and (c2) .. (b)" sections (see lib/smooth.js). */
export function smoothPath(points, tension, xu, yu) {
  let out = pt(points[0].x, points[0].y);
  for (const sec of smoothSections(points, tension, xu, yu)) out += ` .. controls ${pt(sec.c1.x, sec.c1.y)} and ${pt(sec.c2.x, sec.c2.y)} .. ${pt(sec.p.x, sec.p.y)}`;
  return out;
}

// ---------------------------------------------------------------- text

/**
 * A title as text: $…$ inside it is maths, \$ is a dollar sign, × and ÷ become
 * signs, and \\ or a new line starts a new line (centred).
 */
export function titleText(s) {
  return String(s ?? '')
    .replace(/\\\\/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/\\\$/g, '\u0000')
        .split(/(\$[^$]*\$)/)
        .map((part, i) => (i % 2 ? part : escapeText(part).replace(/×/g, '$\\times$').replace(/÷/g, '$\\div$')))
        .join('')
        // TikZJax has no text-mode dollar sign, so write it as maths
        .replace(/\u0000/g, () => '$\\$$')
        .trim()
    )
    .join(' \\\\ ');
}

/** A list of numbers for the axis: "8" or "10, 20, 30" ('' for none given). */
function numberList(s, where) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  return t
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((x) => num(x, where));
}

// ---------------------------------------------------------------- drawing

const near = (a, b) => Math.abs(a - b) < 1e-9;
const multiples = (lo, hi, step) => {
  const out = [];
  if (!(step > 0)) return out;
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push(Math.round(k * step * 1e9) / 1e9);
  return out;
};

function generate(v) {
  const warnings = [];
  const curves = String(v.curves ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCurve);
  if (!curves.length) throw new Error('Type a curve as points, e.g. 0,8 10,6.6 -- 10,5.8 20,2.9 25,0');
  const all = curves.flatMap((c) => c.points);

  const xStep = Number(v.xStep) || 1;
  const yStep = Number(v.yStep) || 1;
  const pick = (val, auto) => (val === null || val === undefined || val === '' || !isFinite(Number(val)) ? auto : Number(val));
  const xmin = pick(v.xmin, Math.min(0, ...all.map((p) => p.x)));
  const ymin = pick(v.ymin, Math.min(0, ...all.map((p) => p.y)));
  const xmax = pick(v.xmax, (Math.ceil(Math.max(...all.map((p) => p.x)) / xStep - 1e-9) + 1) * xStep);
  const ymax = pick(v.ymax, (Math.ceil(Math.max(...all.map((p) => p.y)) / yStep - 1e-9) + 1) * yStep);
  if (!(xmax > xmin) || !(ymax > ymin)) throw new Error('The axes need max bigger than min.');
  const W = Number(v.width) || 8;
  const H = Number(v.height) || 6;
  const xu = W / (xmax - xmin);
  const yu = H / (ymax - ymin);
  // the axes meet at 0 when it's in range, otherwise at the bottom-left corner
  const x0 = xmin <= 0 && xmax >= 0 ? 0 : xmin;
  const y0 = ymin <= 0 && ymax >= 0 ? 0 : ymin;

  const b = new TikzBuilder();

  // ---- grid: up to the last grid line before the arrowheads
  if (v.showGrid) {
    const gx = Number(v.gridX) || xStep;
    const gy = Number(v.gridY) || yStep;
    const gxMax = pick(v.gridXmax, Math.floor((xmax - 1e-9) / gx) * gx);
    const gyMax = pick(v.gridYmax, Math.floor((ymax - 1e-9) / gy) * gy);
    const colour = v.gridColour === 'grey' ? ', gray!60' : '';
    // TikZ's grid draws lines at multiples of the steps (in the axes' units); the far corner goes
    // a hair past the last line so rounding can't drop it
    b.comment('grid');
    b.add(`\\draw[very thin${colour}, xstep=${n(gx)}, ystep=${n(gy)}] ${pt(xmin, ymin)} grid ${pt(gxMax + gx * 1e-3, gyMax + gy * 1e-3)};`);
  }

  // ---- axes
  const tip = v.axisArrow === 'none' ? '' : '-latex';
  b.comment('axes');
  b.add(`\\draw[${['thin', tip].filter(Boolean).join(', ')}] ${pt(xmin, y0)} -- ${pt(xmax, y0)};`);
  b.add(`\\draw[${['thin', tip].filter(Boolean).join(', ')}] ${pt(x0, ymin)} -- ${pt(x0, ymax)};`);

  // ---- scales: ticks and numbers
  const fmtNum = (x) => (v.decimalComma ? n(x).replace('.', '{,}') : n(x));
  const xNums = numberList(v.xNumbers, 'x numbers') ?? multiples(xmin, xmax - xStep * 0.25, xStep);
  const yNums = numberList(v.yNumbers, 'y numbers') ?? multiples(ymin, ymax - yStep * 0.25, yStep);
  const origin = v.origin || 'corner';
  b.comment('scales');
  for (const x of xNums) {
    if (near(x, x0) && origin !== 'both') continue;
    b.add(`\\draw[thin] ${pt(x, y0)} -- ++(0,-3pt) node[anchor=north, inner sep=2pt] {$${fmtNum(x)}$};`);
  }
  for (const y of yNums) {
    if (near(y, y0) && origin !== 'both') continue;
    b.add(`\\draw[thin] ${pt(x0, y)} -- ++(-3pt,0) node[anchor=east, inner sep=2pt] {$${fmtNum(y)}$};`);
  }
  // one 0, level with the x-axis and in line with the y numbers
  if (origin === 'corner') b.add(`\\node[anchor=east, inner sep=2pt, xshift=-3pt] at ${pt(x0, y0)} {$0$};`);

  // ---- titles
  const widest = Math.max(1, ...yNums.map((y) => fmtNum(y).length), origin === 'none' ? 0 : 1);
  if (String(v.xTitle ?? '').trim()) {
    if (v.xTitlePos === 'end') b.add(`\\node[anchor=west, align=left] at ${pt(xmax, y0)} {${titleText(v.xTitle)}};`);
    else b.add(`\\node[anchor=north, align=center] at ([yshift=-${xNums.length ? 0.62 : 0.3}cm]${n((xmin + xmax) / 2)},${n(y0)}) {${titleText(v.xTitle)}};`);
  }
  if (String(v.yTitle ?? '').trim()) {
    if (v.yTitlePos === 'top') b.add(`\\node[anchor=south, align=center] at ${pt(x0, ymax)} {${titleText(v.yTitle)}};`);
    else {
      const gap = 0.35 + widest * 0.2;
      b.add(`\\node[rotate=90, anchor=south, align=center] at ([xshift=-${n(gap, 2)}cm]${n(x0)},${n((ymin + ymax) / 2)}) {${titleText(v.yTitle)}};`);
    }
  }

  // ---- curves
  const width = v.curveWidth || 'semithick';
  const R = `${Number(v.dotSize) || 2}pt`;
  curves.forEach((c, i) => {
    b.comment(`curve ${i + 1}`);
    const opts = [c.width || width, c.style, 'line join=round', 'line cap=round'].filter(Boolean).join(', ');
    const tension = v.tension === undefined || v.tension === null || v.tension === '' ? 0.5 : Number(v.tension);
    for (const run of curveRuns(c)) {
      const bent = run.kind === 'smooth' && (run.points.length > 2 || run.points.some((p) => p.dir !== null));
      if (!bent) b.add(`\\draw[${opts}] ${run.points.map((p) => pt(p.x, p.y)).join(' -- ')};`);
      else b.add(`\\draw[${opts}] ${smoothPath(run.points, tension, xu, yu)};`);
    }
    for (const p of c.points) {
      if (p.dot === 'filled') b.add(`\\fill ${pt(p.x, p.y)} circle[radius=${R}];`);
      else if (p.dot === 'open') b.add(`\\draw[thin, fill=white] ${pt(p.x, p.y)} circle[radius=${R}];`);
      if (p.text) b.add(`\\node[anchor=south west, inner sep=2pt] at ${pt(p.x, p.y)} {${mathLabel(p.text)}};`);
    }
    if (c.label) {
      const at = c.labelAt === 'start' ? c.points[0] : c.labelAt === 'middle' ? c.points[Math.floor((c.points.length - 1) / 2)] : c.points[c.points.length - 1];
      // beside the end it's on: right of the end, left of the start, above the middle
      const side = c.labelSide || (c.labelAt === 'start' ? 'left' : c.labelAt === 'middle' ? 'above' : 'right');
      const anchor = { right: 'west', left: 'east', above: 'south', below: 'north', 'above right': 'south west', 'above left': 'south east', 'below right': 'north west', 'below left': 'north east' }[side];
      b.add(`\\node[anchor=${anchor}, inner sep=3pt] at ${pt(at.x, at.y)} {${titleText(c.label)}};`);
    }
    for (const p of c.points) {
      if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) {
        warnings.push(`Curve ${i + 1} goes outside the axes at (${n(p.x)}, ${n(p.y)}).`);
        break;
      }
    }
  });

  const opts = [`x=${n(xu)}cm`, `y=${n(yu)}cm`, v.fontSize ? `font=${v.fontSize}` : ''];
  return { code: b.toString(opts), warnings };
}

// ---------------------------------------------------------------- options

const CURVE_EXAMPLES = {
  rows: [
    ['0,8 5,7.5 10,6.6', 'A smooth curve through the points'],
    ['0,0 -- 2,40 -- 3,40 -- 5,0', 'Straight lines between points (a travel graph)'],
    ['0,0 2,40 3,40; straight', 'Every join straight'],
    ['10,6.6 -- 10,5.8', 'A vertical drop (a jump joined by a line)'],
    ['0,8> 10,6.6 20,3', 'Level at the start (> after a point)'],
    ['0,0@60 5,8 10,0@-60', 'Set the direction there (degrees on the page)'],
    ['0,2 4,2* | 4,5o 8,5', 'A gap; filled (*) and open (o) dots'],
    ['3,4:P', 'A point labelled P'],
    ['0,20 6,35 12,22; dashed; label: Melbourne', 'A dashed curve with a label at its end'],
    ['…; label below: Car', 'Label below the end (also above, left, right)'],
    ['…; label start above: Car', 'Label at the start (or middle) of the curve'],
  ],
  notes: 'One curve per line. Points are x,y and are joined in the order you type them.',
};

const TITLE_HELP = 'Text; \\\\ starts a new line, $…$ is maths, \\$ is a dollar sign, × works.';

const schema = [
  {
    type: 'textarea',
    key: 'curves',
    label: 'Curves (one per line)',
    rows: 4,
    default: '0,8> 5,7.47 10,6.6 -- 10,5.85 15,4.75 20,2.95 22.5,1.66 25,0',
    help: 'Points x,y: spaces join smoothly, -- straight, | leaves a gap. Press ? for examples.',
    examples: CURVE_EXAMPLES,
  },
  {
    type: 'group',
    label: 'Axis titles',
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'xTitle', label: 'x title', default: 'Years', help: TITLE_HELP },
          {
            type: 'select',
            key: 'xTitlePos',
            label: 'Placed',
            default: 'under',
            options: [
              { value: 'under', label: 'Centred under the axis' },
              { value: 'end', label: 'At the end of the axis' },
            ],
          },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'yTitle', label: 'y title', default: 'Balance \\\\ (× \\$ hundred thousands)' },
          {
            type: 'select',
            key: 'yTitlePos',
            label: 'Placed',
            default: 'side',
            options: [
              { value: 'side', label: 'Turned, beside the axis' },
              { value: 'top', label: 'Above the axis' },
            ],
          },
        ],
      },
    ],
  },
  {
    type: 'group',
    label: 'Axes and scales',
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'xmin', label: 'x from', default: 0, step: 1 },
          { type: 'number', key: 'xmax', label: 'x to', default: 38, step: 1 },
          { type: 'number', key: 'ymin', label: 'y from', default: 0, step: 1 },
          { type: 'number', key: 'ymax', label: 'y to', default: 10.8, step: 1 },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'xStep', label: 'x numbers every', default: 10, step: 1, min: 0 },
          { type: 'number', key: 'yStep', label: 'y numbers every', default: 2, step: 1, min: 0 },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'xNumbers', label: 'Only these x numbers', default: '', placeholder: 'e.g. 10, 20, 30' },
          { type: 'text', key: 'yNumbers', label: 'Only these y numbers', default: '8', placeholder: 'e.g. 8' },
        ],
      },
      {
        type: 'select',
        key: 'origin',
        label: 'Zero',
        default: 'corner',
        options: [
          { value: 'corner', label: 'One 0 at the corner' },
          { value: 'both', label: 'A 0 on each axis' },
          { value: 'none', label: 'No 0' },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'width', label: 'Width (cm)', default: 8, step: 0.5, min: 2 },
          { type: 'number', key: 'height', label: 'Height (cm)', default: 7.5, step: 0.5, min: 2 },
        ],
      },
    ],
  },
  {
    type: 'group',
    label: 'Grid',
    fields: [
      { type: 'checkbox', key: 'showGrid', label: 'Grid', default: true },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'gridX', label: 'x spacing', default: 3.3333, step: 0.5, min: 0 },
          { type: 'number', key: 'gridY', label: 'y spacing', default: 1, step: 0.5, min: 0 },
        ],
        showIf: (v) => v.showGrid,
      },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'gridXmax', label: 'Grid to x', default: null, step: 1, placeholder: 'auto' },
          { type: 'number', key: 'gridYmax', label: 'Grid to y', default: null, step: 1, placeholder: 'auto' },
          {
            type: 'select',
            key: 'gridColour',
            label: 'Colour',
            default: 'black',
            options: [
              { value: 'black', label: 'Black' },
              { value: 'grey', label: 'Grey' },
            ],
          },
        ],
        showIf: (v) => v.showGrid,
      },
    ],
  },
  {
    type: 'group',
    label: 'Style',
    collapsed: true,
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'select', key: 'curveWidth', label: 'Curve width', default: 'semithick', options: LINE_WIDTHS },
          { type: 'number', key: 'tension', label: 'Smoothness (0–1)', default: 0.5, step: 0.1, min: 0, max: 1 },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'dotSize', label: 'Dot size (pt)', default: 2, step: 0.25, min: 0.5 },
          {
            type: 'select',
            key: 'axisArrow',
            label: 'Axis arrowheads',
            default: 'latex',
            options: [
              { value: 'latex', label: 'Yes' },
              { value: 'none', label: 'No' },
            ],
          },
          { type: 'select', key: 'fontSize', label: 'Font size', default: '', options: FONT_SIZES },
        ],
      },
      { type: 'checkbox', key: 'decimalComma', label: 'Decimal comma in numbers', default: false },
    ],
  },
];

export default {
  id: 'realgraph',
  name: 'Real-world graph',
  category: 'Function graphs',
  description: 'Graphs of real quantities drawn through points: axis titles with units, a grid, jumps, several curves.',
  schema,
  generate,
};
