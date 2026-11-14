// SPDX-License-Identifier: CC0-1.0
// Probability trees, growing left to right as on exam papers.
//
// Enter the tree either as stages (each stage's outcomes repeat under every
// branch) or as an outline with one branch per line, indented with ">" (or
// spaces) for each level — the outline can be uneven, with different
// probabilities on each branch. "?" leaves a blank to fill in. An outcome
// column can list each path and/or the product of its probabilities.

import { TikzBuilder, n, mathLabel, escapeText, FONT_SIZES, LINE_WIDTHS } from '../lib/tikz.js';

// ---------------------------------------------------------------- reading the tree

/** "Walk : 3/10" or "Walk : 3/10 : W" → { name, prob, short }. */
function parseBranch(text, where) {
  const parts = text.split(':').map((s) => s.trim());
  if (parts.length < 2 || parts[0] === '') {
    throw new Error(`${where}: write an outcome and its probability, like "Walk : 3/10" (use ? for a blank).`);
  }
  return { name: parts[0], prob: parts[1], short: parts[2] || '' };
}

/** Stages: one line per stage, outcomes separated by ";" (or ","). */
export function treeFromStages(text) {
  const stages = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const sep = line.includes(';') ? ';' : ',';
      return line
        .split(sep)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((b) => parseBranch(b, `Stage ${i + 1}`));
    });
  if (!stages.length) throw new Error('Type at least one stage, e.g. "Walk : 3/10; Not walk : 7/10".');
  const grow = (d) => (d >= stages.length ? [] : stages[d].map((b) => ({ ...b, children: grow(d + 1) })));
  return grow(0);
}

/**
 * Outline: one branch per line; each ">" (or two spaces, or a tab) at the
 * start goes one level deeper.
 */
export function treeFromOutline(text) {
  const root = { children: [] };
  const stack = [{ node: root, depth: -1 }];
  const lines = String(text ?? '').split('\n');
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const m = raw.match(/^([>\s]*)(.*)$/);
    const lead = m[1];
    const depth = (lead.match(/>/g) || []).length + Math.floor(lead.replace(/>/g, '').replace(/\t/g, '  ').length / 2);
    const node = { ...parseBranch(m[2], `Line ${i + 1}`), children: [] };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (depth > parent.depth + 1) throw new Error(`Line ${i + 1} is indented more than one level below the line above it.`);
    parent.node.children.push(node);
    stack.push({ node, depth });
  });
  if (!root.children.length) throw new Error('Type at least one branch, e.g. "Walk : 3/10".');
  return root.children;
}

// ---------------------------------------------------------------- numbers

const isBlank = (s) => String(s ?? '').trim() === '?';

/** 3/10 → \frac{3}{10} (full size via mathLabel); anything else as typed. */
function probTex(s) {
  const t = String(s).trim();
  if (t.includes('$') || t.includes('\\')) return t;
  // a/b where a and b are simple terms: 3/10, x/5, (1-p)/2
  return t.replace(/(\([^()]*\)|[A-Za-z0-9.]+)\s*\/\s*(\([^()]*\)|[A-Za-z0-9.]+)/g, (m, a, b) => `\\frac{${strip(a)}}{${strip(b)}}`);
}
const strip = (s) => (s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s);

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** An exact number from "3/10", "0.3", "1" → { num, den, decimal } or null. */
function exact(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[2]) !== 0) return { num: Number(m[1]), den: Number(m[2]), decimal: false };
  m = t.match(/^(\d*)\.(\d+)$|^(\d+)$/);
  if (m) {
    const dp = m[2] ? m[2].length : 0;
    const den = 10 ** dp;
    return { num: Math.round(Number(t) * den), den, decimal: dp > 0 };
  }
  return null;
}

/** The product of a path's probabilities: { expr, value } as TeX ('' when unknown). */
export function pathProduct(probs) {
  if (probs.some((p) => isBlank(p))) return { expr: '', value: '' };
  const expr = probs.map((p) => probTex(p)).join(' \\times ');
  const nums = probs.map(exact);
  if (nums.some((x) => !x)) return { expr, value: '' };
  let num = 1;
  let den = 1;
  for (const x of nums) {
    num *= x.num;
    den *= x.den;
  }
  let value;
  if (nums.every((x) => x.decimal || x.den === 1) && nums.some((x) => x.decimal)) {
    value = String(Number((num / den).toPrecision(12)));
  } else {
    const g = gcd(num, den) || 1;
    value = den / g === 1 ? String(num / g) : `\\frac{${num / g}}{${den / g}}`;
  }
  return { expr, value };
}

// ---------------------------------------------------------------- drawing

const textWidth = (s) => Math.max(1, String(s).replace(/\$[^$]*\$/g, 'xx').length) * 0.2 + 0.25; // cm, rough

/** A blank to fill in, as a node body and options. */
function blankNode(style, wide) {
  if (style === 'line') return { opts: '', body: `\\underline{\\hspace{${wide ? 2.2 : 1}cm}}` };
  // a probability's box stands a little off its branch
  if (style === 'box') return { opts: `draw, minimum width=${wide ? 2.2 : 0.9}cm, minimum height=${wide ? 0.6 : 0.75}cm${wide ? '' : ', outer sep=3pt'}`, body: '' };
  return { opts: `minimum width=${wide ? 2.2 : 0.9}cm`, body: '' };
}

function generate(v) {
  const warnings = [];
  const tree = v.input === 'outline' ? treeFromOutline(v.outline) : treeFromStages(v.stages);

  // ---- layout: leaves evenly spaced down the page; a parent level with the middle of its children
  const L = Number(v.branchLength) || 2.2;
  const gap = Number(v.leafGap) || 1.6;
  let leafIndex = 0;
  const all = [];
  const leaves = [];
  const place = (node, depth, path) => {
    node.depth = depth;
    node.path = [...path, node];
    all.push(node);
    if (node.children.length) {
      node.children.forEach((c) => place(c, depth + 1, node.path));
      const ys = node.children.map((c) => c.y);
      node.y = (Math.max(...ys) + Math.min(...ys)) / 2;
    } else {
      node.y = -leafIndex * gap;
      leafIndex++;
      leaves.push(node);
    }
  };
  tree.forEach((c) => place(c, 1, []));
  const rootY = (Math.max(...tree.map((c) => c.y)) + Math.min(...tree.map((c) => c.y))) / 2;
  const depth = Math.max(...all.map((x) => x.depth));

  // columns: each stage's names sit in a column as wide as its widest name;
  // branches end just before a column and start just after it, so every
  // branch of a stage is the same length (as on exam papers)
  const heads = String(v.headings ?? '')
    .split(/[;,]/)
    .map((s) => s.trim());
  const widths = [];
  for (let d = 1; d <= depth; d++) {
    const ws = all.filter((x) => x.depth === d).map((x) => (isBlank(x.name) ? 2.4 : textWidth(x.name)));
    widths[d] = Math.max(...ws);
  }
  const left = [];
  const right = [0];
  for (let d = 1; d <= depth; d++) {
    left[d] = right[d - 1] + L;
    right[d] = left[d] + widths[d] + 0.2;
  }

  const b = new TikzBuilder();
  const lw = v.lineWidth && v.lineWidth !== 'thin' ? v.lineWidth : '';
  const blank = v.blankStyle || 'box';

  // ---- names: centred in their column, or (at the ends) starting where the branch ends
  b.comment('outcomes');
  all.forEach((x, i) => {
    x.id = `n${i + 1}`;
    const end = !x.children.length;
    const at = end ? `anchor=west` : 'anchor=center';
    const px = end ? left[x.depth] + 0.05 : left[x.depth] + 0.1 + widths[x.depth] / 2;
    if (isBlank(x.name)) {
      const bl = blankNode(blank, true);
      b.add(`\\node[${at}${bl.opts ? `, ${bl.opts}` : ''}] (${x.id}) at (${n(px)},${n(x.y)}) {${bl.body}};`);
    } else {
      b.add(`\\node[${at}] (${x.id}) at (${n(px)},${n(x.y)}) {${escapeOutcome(x.name)}};`);
    }
  });

  // ---- branches with their probabilities
  b.comment('branches');
  const parentOf = (x) => (x.path.length > 1 ? x.path[x.path.length - 2] : null);
  for (const x of all) {
    const p = parentOf(x);
    const py = p ? p.y : rootY;
    const from = `(${n(right[x.depth - 1])},${n(py)})`;
    const to = `(${n(left[x.depth])},${n(x.y)})`;
    const side = x.y > py + 1e-9 ? 'above left' : x.y < py - 1e-9 ? 'below left' : 'above';
    let label;
    if (isBlank(x.prob)) {
      const bl = blankNode(blank, false);
      label = `node[midway, ${side}${bl.opts ? `, ${bl.opts}` : ''}] {${bl.body}}`;
    } else if (String(x.prob).trim() === '') {
      label = '';
    } else {
      label = `node[midway, ${side}] {${mathLabel(probTex(x.prob))}}`;
    }
    b.add(`\\draw${lw ? `[${lw}]` : ''} ${from} -- ${to}${label ? ` ${label}` : ''};`);
  }

  // ---- outcome column
  const col = v.outcomes || 'none';
  const showPaths = col === 'paths' || col === 'both';
  const showProbs = col === 'probs' || col === 'both';
  const pathText = (leaf) => leaf.path.map((x) => x.short || (isBlank(x.name) ? '?' : x.name)).join(v.pathSeparator ?? ', ');
  // clear of the last stage's names and of its heading (which starts where they do)
  const lastHead = heads[depth - 1] ? left[depth] + 0.05 + textWidth(heads[depth - 1]) : 0;
  const xOut = Math.max(right[depth], lastHead) + 0.7;
  const pathW = showPaths ? Math.max(...leaves.map((l) => textWidth(pathText(l))), textWidth(String(v.pathHeading ?? ''))) : 0;
  const xProb = xOut + (showPaths ? pathW + 0.6 : 0);
  if (showPaths || showProbs) {
    b.comment('outcome column');
    for (const leaf of leaves) {
      if (leaf.depth !== depth) warnings.push(`"${leaf.name}" ends the tree early, so its row in the outcome column is level with it.`);
      if (showPaths) b.add(`\\node[anchor=west] at (${n(xOut)},${n(leaf.y)}) {${escapeOutcome(pathText(leaf))}};`);
      if (showProbs) {
        const { expr, value } = pathProduct(leaf.path.map((x) => x.prob));
        const style = v.productStyle || 'both';
        let tex = '';
        if (style === 'expr') tex = expr;
        else if (style === 'value') tex = value || expr;
        else tex = value && value !== expr ? `${expr} = ${value}` : expr;
        if (tex) b.add(`\\node[anchor=west] at (${n(xProb)},${n(leaf.y)}) {${mathLabel(tex)}};`);
        else {
          const bl = blankNode(blank, true);
          b.add(`\\node[anchor=west${bl.opts ? `, ${bl.opts}` : ''}] at (${n(xProb)},${n(leaf.y)}) {${bl.body}};`);
        }
      }
    }
  }

  // ---- headings
  const outHeads = [v.pathHeading, v.probHeading].map((s) => String(s ?? '').trim());
  if (heads.some(Boolean) || ((showPaths || showProbs) && outHeads.some(Boolean))) {
    const top = Math.max(...all.map((x) => x.y)) + (Number(v.headingGap) || 1.3);
    b.comment('headings');
    for (let d = 1; d <= depth; d++) {
      const h = heads[d - 1];
      if (!h) continue;
      // over the names: centred on a middle stage, starting with them on the last
      if (d === depth) b.add(`\\node[anchor=west] at (${n(left[d] + 0.05)},${n(top)}) {${escapeOutcome(h)}};`);
      else b.add(`\\node at (${n(left[d] + 0.1 + widths[d] / 2)},${n(top)}) {${escapeOutcome(h)}};`);
    }
    if (showPaths && outHeads[0]) b.add(`\\node[anchor=west] at (${n(xOut)},${n(top)}) {${escapeOutcome(outHeads[0])}};`);
    if (showProbs && outHeads[1]) b.add(`\\node[anchor=west] at (${n(xProb)},${n(top)}) {${escapeOutcome(outHeads[1])}};`);
  }

  const opts = [v.fontSize ? `font=${v.fontSize}` : ''];
  return { code: b.toString(opts), warnings };
}

/** Outcome names are text; $…$ inside them is maths. */
function escapeOutcome(s) {
  return String(s)
    .split(/(\$[^$]*\$)/)
    .map((part, i) => (i % 2 ? part : escapeText(part)))
    .join('');
}

// ---------------------------------------------------------------- options

const INPUT_EXAMPLES = {
  rows: [
    ['Walk : 3/10', 'an outcome and its probability'],
    ['> Correct uniform : 9/10', 'one level deeper (">" or two spaces per level)'],
    ['Red : ?', 'a blank probability to fill in'],
    ['? : 1/4', 'a blank outcome'],
    ['Walk : 3/10 : W', 'a short name for the outcome column'],
    ['Heads : p', 'letters work: p, 1-p, (1-p)/2, 0.35'],
  ],
  notes: 'In the stages box, put each stage on its own line and separate its outcomes with ";" — every branch then gets the next stage.',
};

const schema = [
  {
    type: 'select',
    key: 'input',
    label: 'Enter the tree as',
    default: 'stages',
    options: [
      { value: 'stages', label: 'Stages (the same outcomes under every branch)' },
      { value: 'outline', label: 'Outline (any tree, one branch per line)' },
    ],
  },
  {
    type: 'textarea',
    key: 'stages',
    label: 'Stages (one per line)',
    default: 'Walk : 3/10; Not walk : 7/10\nCorrect uniform : 9/10; Not correct uniform : 1/10',
    rows: 4,
    help: 'Separate the outcomes of a stage with ";". Press ? for examples.',
    examples: INPUT_EXAMPLES,
    showIf: (v) => v.input !== 'outline',
  },
  {
    type: 'textarea',
    key: 'outline',
    label: 'Branches (">" for each level)',
    default:
      'Walk : 3/10\n> Correct uniform : 9/10\n> Not correct uniform : 1/10\nNot walk : 7/10\n> Correct uniform : 9/10\n> Not correct uniform : 1/10',
    rows: 8,
    help: 'Each ">" (or two spaces) at the start goes one level deeper. Press ? for examples.',
    examples: INPUT_EXAMPLES,
    showIf: (v) => v.input === 'outline',
  },
  {
    type: 'select',
    key: 'blankStyle',
    label: 'Blanks (?) as',
    default: 'box',
    options: [
      { value: 'box', label: 'Boxes' },
      { value: 'line', label: 'Lines' },
      { value: 'empty', label: 'Empty space' },
    ],
  },
  {
    type: 'group',
    label: 'Outcome column',
    fields: [
      {
        type: 'select',
        key: 'outcomes',
        label: 'Show',
        default: 'none',
        options: [
          { value: 'none', label: 'Nothing' },
          { value: 'paths', label: 'Outcomes (e.g. Walk, Correct uniform)' },
          { value: 'probs', label: 'Probabilities' },
          { value: 'both', label: 'Outcomes and probabilities' },
        ],
      },
      {
        type: 'select',
        key: 'productStyle',
        label: 'Probabilities as',
        default: 'both',
        options: [
          { value: 'both', label: '3/10 × 9/10 = 27/100' },
          { value: 'expr', label: '3/10 × 9/10' },
          { value: 'value', label: '27/100' },
        ],
        showIf: (v) => v.outcomes === 'probs' || v.outcomes === 'both',
      },
      {
        type: 'text',
        key: 'pathSeparator',
        label: 'Between outcomes',
        default: ', ',
        showIf: (v) => v.outcomes === 'paths' || v.outcomes === 'both',
      },
    ],
  },
  {
    type: 'group',
    label: 'Headings',
    fields: [
      { type: 'text', key: 'headings', label: 'Stage headings', default: '', placeholder: 'e.g. 1st draw; 2nd draw' },
      {
        type: 'row',
        fields: [
          { type: 'text', key: 'pathHeading', label: 'Outcome column', default: 'Outcome' },
          { type: 'text', key: 'probHeading', label: 'Probability column', default: 'Probability' },
        ],
        showIf: (v) => v.outcomes && v.outcomes !== 'none',
      },
    ],
  },
  {
    type: 'group',
    label: 'Layout',
    fields: [
      {
        type: 'row',
        fields: [
          { type: 'number', key: 'branchLength', label: 'Branch length (cm)', default: 2.2, step: 0.1, min: 0.8 },
          { type: 'number', key: 'leafGap', label: 'Gap between ends (cm)', default: 1.6, step: 0.1, min: 0.6 },
        ],
      },
      {
        type: 'row',
        fields: [
          { type: 'select', key: 'lineWidth', label: 'Line width', default: 'thin', options: LINE_WIDTHS },
          { type: 'select', key: 'fontSize', label: 'Font size', default: '', options: FONT_SIZES },
        ],
      },
    ],
  },
];

export default {
  id: 'probtree',
  name: 'Probability tree',
  category: 'Probability',
  description: 'Tree diagrams from stages or an outline, with blanks to fill in and an optional outcome column.',
  schema,
  generate,
};
