// SPDX-License-Identifier: CC0-1.0
// The "Graphs" box of the Function diagram: one graph per line.
//
//   y = x^3 - 7x + 6                              a function of x
//   y = 6 - 3x; dashed; label                     settings after semicolons
//   x^2 - 1, -2 <= x < 3                          a function on a restricted domain
//   { x/4, 0 <= x <= 2sqrt(2); 0, otherwise }     a piecewise function
//   x = 3; dotted                                 a vertical line
//
// Braces may span several lines, with one piece per line:
//   {
//     x/4, 0 <= x <= 2sqrt(2)
//     0, otherwise
//   }; thick
//
// Settings: solid | dashed | dotted, a line width (very thin … very thick),
// arrows | no arrows, from <a> to <b> (x-range; y-range for x = c),
// label (shows the equation) or label: <text>.

import { parseExpression, parseConstant } from './mathParser.js';
import { parsePiecewise, piecewiseFunction } from './piecewiseParser.js';
import { LINE_WIDTHS } from './tikz.js';

const DASHES = ['solid', 'dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted'];
const WIDTHS = LINE_WIDTHS.map((w) => w.value);
// "expr, condition" (same separators as the piecewise parser)
const HAS_CONDITION = /^(.*?)\s*(?:,|\bfor\b|\bif\b|\bwhen\b|:)\s*((?:otherwise|elsewhere|else)\b.*|.*(?:<|>|≤|≥).*|x\s*(?:=|in\b|∈).*)$/i;

const stripY = (s) => s.replace(/^\s*y\s*=\s*/i, '');
const sqrt = (s) => s.replace(/√/g, 'sqrt');

function constant(text, where) {
  try {
    return parseConstant(sqrt(String(text).trim()));
  } catch (e) {
    throw new Error(`${where}: could not read "${text}" (${e.message})`);
  }
}

/** Split the box into entries: { body, options, line }. Braces may span lines. */
function entries(src) {
  const out = [];
  const lines = String(src ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (!text || text.startsWith('%')) continue;
    if (text.startsWith('{')) {
      // collect up to the matching }
      let buf = text;
      const start = i;
      while (!buf.includes('}') && i + 1 < lines.length) buf += '\n' + lines[++i];
      const close = buf.indexOf('}');
      if (close < 0) throw new Error(`Graph on line ${start + 1}: "{" has no matching "}".`);
      const rest = buf.slice(close + 1).trim();
      if (rest && !rest.startsWith(';')) throw new Error(`Graph on line ${start + 1}: put settings after "};", e.g. "}; dashed".`);
      out.push({ body: buf.slice(1, close), braces: true, options: rest.slice(1), line: start + 1 });
    } else {
      const [body, ...opts] = text.split(';');
      out.push({ body, braces: false, options: opts.join(';'), line: i + 1 });
    }
  }
  return out;
}

function parseOptions(text, g, where) {
  for (const opt of String(text).split(';').map((s) => s.trim())) {
    if (!opt) continue;
    const low = opt.toLowerCase().replace(/\s+/g, ' ');
    const range = opt.match(/^from\s+(.+?)\s+to\s+(.+)$/i);
    const label = opt.match(/^label\s*(?:[:=]\s*(.*))?$/i);
    if (DASHES.includes(low)) g.dash = low === 'solid' ? '' : low;
    else if (WIDTHS.includes(low)) g.width = low;
    else if (/^no arrows?$/.test(low)) g.arrows = false;
    else if (/^arrows?$/.test(low)) g.arrows = true;
    else if (range) {
      g.from = constant(range[1], where).value;
      g.to = constant(range[2], where).value;
      if (g.from >= g.to) throw new Error(`${where}: "from" must be less than "to".`);
    } else if (label) {
      const text = label[1] ? label[1].trim() : g.kind === 'expr' ? `y = ${g.latex}` : g.latex;
      if (!text) throw new Error(`${where}: give the label text, e.g. "label: f(x)".`);
      g.label = text;
    } else throw new Error(`${where}: didn't understand "${opt}".`);
  }
}

/**
 * Parse the box. Each graph:
 *   { kind: 'expr', f, pgf, latex }            y = …
 *   { kind: 'piecewise', f, pieces, latex: '' } { … } or "expr, condition"
 *   { kind: 'vertical', value, latex }         x = c
 * plus settings { dash, width, arrows, from, to, label, line }.
 */
export function parseGraphList(src) {
  return entries(src).map(({ body, braces, options, line }) => {
    const where = `Graph on line ${line}`;
    const g = { dash: '', width: '', arrows: null, from: null, to: null, label: null, line };
    const text = body.trim();
    const vertical = text.match(/^x\s*=\s*([^<>≤≥,]+)$/i);
    if (braces || (!vertical && HAS_CONDITION.test(stripY(text)))) {
      const piecesText = (braces ? text.split(/[;\n]/) : [text])
        .map((s) => stripY(s.trim()))
        .filter(Boolean)
        .join('\n');
      let pieces;
      try {
        pieces = parsePiecewise(sqrt(piecesText));
      } catch (e) {
        throw new Error(`${where}: ${e.message.replace(/^Lines? \d+(?: and \d+)?: /, '')}`);
      }
      Object.assign(g, { kind: 'piecewise', pieces, f: piecewiseFunction(pieces), latex: '' });
    } else if (vertical) {
      const c = constant(vertical[1], where);
      Object.assign(g, { kind: 'vertical', value: c.value, latex: `x = ${c.latex}` });
    } else {
      let e;
      try {
        e = parseExpression(sqrt(stripY(text)));
      } catch (err) {
        throw new Error(`${where}: could not read "${text}" (${err.message})`);
      }
      Object.assign(g, { kind: 'expr', f: e.evaluate, pgf: e.toPgf('\\x'), latex: e.toLatex(), expr: e });
    }
    parseOptions(options, g, where);
    return g;
  });
}
