// SPDX-License-Identifier: CC0-1.0
// Small helpers for writing TikZ code.

/** Number formatted for TikZ coordinates (max 4 dp, no trailing zeros). */
export function n(v, dp = 4) {
  if (!isFinite(v)) throw new Error(`Cannot write ${v} as a TikZ number`);
  let s = Number(v).toFixed(dp);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

export const pt = (x, y) => `(${n(x)},${n(y)})`;

/** Builds the lines of a tikzpicture with indentation. */
export class TikzBuilder {
  constructor() {
    this.preamble = [];
    this.lines = [];
  }
  usePreamble(line) {
    if (!this.preamble.includes(line)) this.preamble.push(line);
    return this;
  }
  comment(text) {
    this.lines.push(`% ${text}`);
    return this;
  }
  add(line) {
    this.lines.push(line);
    return this;
  }
  toString(pictureOptions = []) {
    const opts = pictureOptions.filter(Boolean);
    const head = opts.length ? `\\begin{tikzpicture}[${opts.join(', ')}]` : '\\begin{tikzpicture}';
    return [...this.preamble, head, ...this.lines.map((l) => '  ' + l), '\\end{tikzpicture}'].join('\n');
  }
}

/** Escape plain text for use inside a TikZ node (not math). */
export function escapeText(s) {
  return String(s).replace(/([#$%&_{}])/g, '\\$1');
}

/**
 * Wrap user label text in math mode unless it already contains $.
 * Fractions are shown full size (\displaystyle), as on exam papers;
 * \displaystyle works without amsmath, unlike \dfrac.
 */
export function mathLabel(s) {
  const t = String(s).trim();
  if (t === '') return '';
  if (t.includes('$')) return t;
  return t.includes('\\frac') && !t.includes('\\displaystyle') ? `$\\displaystyle ${t}$` : `$${t}$`;
}

export const LINE_WIDTHS = [
  { value: 'very thin', label: 'Very thin (0.2pt)' },
  { value: 'thin', label: 'Thin (0.4pt)' },
  { value: 'semithick', label: 'Semithick (0.6pt)' },
  { value: 'thick', label: 'Thick (0.8pt)' },
  { value: 'very thick', label: 'Very thick (1.2pt)' },
];

// Arrow tips available in core TikZ (TikZJax has no arrows.meta library).
export const ARROW_TIPS = [
  { value: 'stealth', label: 'Stealth (filled)' },
  { value: 'latex', label: 'LaTeX (filled)' },
  { value: 'to', label: 'To (open)' },
  { value: 'none', label: 'None' },
];

export const FONT_SIZES = [
  { value: '', label: 'Normal' },
  { value: '\\small', label: 'Small' },
  { value: '\\footnotesize', label: 'Footnote' },
  { value: '\\large', label: 'Large' },
];

/** "-stealth", "stealth-stealth", "" ... */
export function arrowSpec(tip, start, end) {
  if (!tip || tip === 'none' || (!start && !end)) return '';
  return `${start ? tip : ''}-${end ? tip : ''}`;
}
