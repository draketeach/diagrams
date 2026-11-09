// SPDX-License-Identifier: CC0-1.0
// Parses piecewise functions written in exam notation, one piece per line:
//
//   x/4, 0 <= x <= 2sqrt(2)
//   0, otherwise
//
// Separators between formula and condition: a comma, "for", "if", "when" or ":".
// Conditions:
//   a <= x <= b   a < x < b   (any mix of < and <=; ≤ ≥ also work)
//   x < a   x <= a   x > a   x >= a   a < x   (and reversed: b >= x >= a)
//   x = a                      (a single point, drawn as a dot)
//   x in [a, b)   x ∈ (-∞, 2]  (interval notation; inf / ∞ for infinity)
//   otherwise / elsewhere / else
// A line with no condition applies to all x.

import { parseExpression, parseConstant } from './mathParser.js';

const OPS = { '<': '<', '<=': '<=', '≤': '<=', '=<': '<=', '>': '>', '>=': '>=', '≥': '>=', '=>': '>=' };
const OP_RE = /(<=|>=|=<|=>|≤|≥|<|>)/;

function bound(text, line) {
  const t = text.trim().replace(/∞/g, 'inf');
  if (/^\+?inf(inity)?$/i.test(t)) return { value: Infinity, latex: '\\infty' };
  if (/^-inf(inity)?$/i.test(t)) return { value: -Infinity, latex: '-\\infty' };
  try {
    const c = parseConstant(t);
    return { value: c.value, latex: c.latex };
  } catch (e) {
    throw new Error(`Line ${line}: could not read "${text.trim()}" as a number (${e.message})`);
  }
}

const isX = (s) => /^x$/i.test(s.trim());

/** Interval from a condition string, or { otherwise: true }. */
export function parseCondition(cond, line = 1) {
  const c = cond.trim().replace(/\s+/g, ' ');
  if (c === '' || /^(all x|all real x|x ∈ ℝ|x in R)$/i.test(c)) {
    return { a: -Infinity, b: Infinity, aInc: false, bInc: false, aLatex: '-\\infty', bLatex: '\\infty' };
  }
  if (/^(otherwise|elsewhere|else)$/i.test(c)) return { otherwise: true };

  // interval notation: x in [a, b)
  const iv = c.match(/^x\s*(?:in|∈)\s*([[(])(.+),(.+)([\])])$/i);
  if (iv) {
    const A = bound(iv[2], line);
    const B = bound(iv[3], line);
    return { a: A.value, b: B.value, aLatex: A.latex, bLatex: B.latex, aInc: iv[1] === '[' && isFinite(A.value), bInc: iv[4] === ']' && isFinite(B.value) };
  }

  // single point: x = a
  const eq = c.match(/^x\s*=\s*([^<>=≤≥]+)$/i);
  if (eq) {
    const A = bound(eq[1], line);
    return { a: A.value, b: A.value, aInc: true, bInc: true, aLatex: A.latex, bLatex: A.latex, point: true };
  }

  const parts = c.split(OP_RE).map((s) => s.trim());
  // parts alternate: term, op, term, (op, term)
  if (parts.length === 3) {
    let [l, op, r] = parts;
    op = OPS[op];
    // normalise to "x op value"
    if (isX(r) && !isX(l)) {
      [l, r] = [r, l];
      op = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }[op];
    }
    if (!isX(l)) throw new Error(`Line ${line}: the condition "${cond}" should mention x`);
    const V = bound(r, line);
    if (op === '<' || op === '<=') return { a: -Infinity, b: V.value, aInc: false, bInc: op === '<=', aLatex: '-\\infty', bLatex: V.latex };
    return { a: V.value, b: Infinity, aInc: op === '>=', bInc: false, aLatex: V.latex, bLatex: '\\infty' };
  }
  if (parts.length === 5 && isX(parts[2])) {
    let [lo, op1, , op2, hi] = parts;
    op1 = OPS[op1];
    op2 = OPS[op2];
    const ascending = op1[0] === '<' && op2[0] === '<';
    const descending = op1[0] === '>' && op2[0] === '>';
    if (!ascending && !descending) throw new Error(`Line ${line}: mixed directions in "${cond}"`);
    if (descending) {
      [lo, hi] = [hi, lo];
      [op1, op2] = [op2.replace('>', '<'), op1.replace('>', '<')];
    }
    const A = bound(lo, line);
    const B = bound(hi, line);
    if (A.value > B.value) throw new Error(`Line ${line}: ${A.latex} is bigger than ${B.latex}`);
    return { a: A.value, b: B.value, aInc: op1 === '<=', bInc: op2 === '<=', aLatex: A.latex, bLatex: B.latex };
  }
  throw new Error(`Line ${line}: could not understand the condition "${cond}"`);
}

const SPLIT = /^(.*?)\s*(?:,|\bfor\b|\bif\b|\bwhen\b|:)\s*((?:otherwise|elsewhere|else)\b.*|.*(?:<|>|≤|≥).*|x\s*(?:=|in\b|∈).*)$/i;

/** Parse all lines. Returns pieces sorted by a, with "otherwise" expanded. */
export function parsePiecewise(src) {
  const lines = String(src ?? '')
    .split('\n')
    .map((l, i) => ({ text: l.trim(), line: i + 1 }))
    .filter((l) => l.text && !l.text.startsWith('%'));
  if (!lines.length) throw new Error('Enter at least one piece, e.g. "x/4, 0 <= x <= 2".');

  const pieces = [];
  let otherwise = null;
  for (const { text, line } of lines) {
    const m = text.match(SPLIT);
    const exprText = m ? m[1] : text;
    const condText = m ? m[2] : '';
    let expr;
    try {
      expr = parseExpression(exprText.replace(/√/g, 'sqrt'));
    } catch (e) {
      throw new Error(`Line ${line}: could not read the formula "${exprText}" (${e.message})`);
    }
    const iv = parseCondition(condText.replace(/√/g, 'sqrt'), line);
    if (iv.otherwise) {
      if (otherwise) throw new Error(`Line ${line}: only one "otherwise" line is allowed`);
      otherwise = { expr, line };
    } else {
      pieces.push({ expr, ...iv, line });
    }
  }
  pieces.sort((p, q) => p.a - q.a || p.b - q.b);

  // overlap check (a single point "x = a" may sit inside another piece:
  // it overrides that piece there, leaving an open dot on it)
  const spans = pieces.filter((p) => !p.point);
  for (let i = 1; i < spans.length; i++) {
    const p = spans[i - 1];
    const q = spans[i];
    if (q.a < p.b || (q.a === p.b && p.bInc && q.aInc)) {
      throw new Error(`Lines ${p.line} and ${q.line} overlap`);
    }
  }
  const points = pieces.filter((p) => p.point);
  for (let i = 1; i < points.length; i++) {
    if (points[i].a === points[i - 1].a) throw new Error(`Lines ${points[i - 1].line} and ${points[i].line} both define x = ${points[i].aLatex}`);
  }

  if (otherwise) {
    // fill every gap between the given pieces
    const gaps = [];
    let cur = { a: -Infinity, aInc: false, aLatex: '-\\infty' };
    for (const p of pieces.filter((p) => !p.point)) {
      if (p.a > cur.a || (p.a === cur.a && !p.aInc && !cur.aInc && isFinite(p.a))) {
        gaps.push({ ...cur, b: p.a, bInc: !p.aInc && isFinite(p.a), bLatex: p.aLatex });
      }
      cur = { a: p.b, aInc: !p.bInc && isFinite(p.b), aLatex: p.bLatex };
    }
    if (cur.a < Infinity) gaps.push({ ...cur, b: Infinity, bInc: false, bLatex: '\\infty' });
    for (const g of gaps) if (g.b > g.a || (g.a === g.b && g.aInc && g.bInc)) pieces.push({ expr: otherwise.expr, ...g, line: otherwise.line });
    pieces.sort((p, q) => p.a - q.a || p.b - q.b);
  }
  return pieces;
}

/** f(x) for the whole piecewise function (NaN where undefined). */
export function piecewiseFunction(pieces) {
  // single points (x = a) take priority over a piece running through them
  const ordered = [...pieces.filter((p) => p.point), ...pieces.filter((p) => !p.point)];
  return (x) => {
    for (const p of ordered) {
      const inside = (x > p.a || (x === p.a && p.aInc)) && (x < p.b || (x === p.b && p.bInc));
      if (inside) return p.expr.evaluate(x);
    }
    return NaN;
  };
}
