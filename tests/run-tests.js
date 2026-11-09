// SPDX-License-Identifier: CC0-1.0
// Unit tests for the pure (non-DOM) modules. Run: node tests/run-tests.js
import assert from 'node:assert/strict';
import { parseExpression, parseConstant } from '../js/lib/mathParser.js';
import { findRoots, findTurningPoints, fmt, niceLatex } from '../js/lib/numeric.js';
import { findPieces } from '../js/lib/functionGraph.js';
import { monotoneSlopes, hermiteFunction } from '../js/lib/hermite.js';
import { toTikzJaxSource, toStandaloneDocument, toPictureOnly } from '../js/core/tikzDocument.js';
import { defaultValues } from '../js/core/formBuilder.js';
import polynomial, { _internal } from '../js/diagrams/polynomial.js';
import { readFileSync } from 'node:fs';
import { buildIndex } from '../tools/stamp-versions.mjs';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('parser evaluates with implicit multiplication', () => {
  close(parseExpression('2x^3 - 3x + 1').evaluate(2), 11);
  close(parseExpression('(x+4)(x-1)(x-3)').evaluate(0), 12);
  close(parseExpression('-x^2').evaluate(3), -9);
  close(parseExpression('2sin(x)').evaluate(Math.PI / 2), 2);
  close(parseExpression('|x-2|').evaluate(0), 2);
  close(parseExpression('e^x').evaluate(1), Math.E);
});

test('parser LaTeX output', () => {
  assert.equal(parseExpression('x^3 - 7x + 6').toLatex(), 'x^{3} - 7x + 6');
  assert.equal(parseExpression('(x+4)(x-1)').toLatex(), '(x + 4)(x - 1)');
  assert.equal(parseConstant('1/2').latex, '\\frac{1}{2}');
  assert.equal(parseConstant('-sqrt(3)').latex, '-\\sqrt{3}');
});

test('parser pgf output avoids ^ for integer powers', () => {
  assert.equal(parseExpression('x^3').toPgf(), '((\\x)*(\\x)*(\\x))');
  assert.ok(parseExpression('sin(x)').toPgf().includes('deg('));
});

test('roots and turning points of the example cubic', () => {
  const f = (x) => (x + 4) * (x - 1) * (x - 3);
  assert.deepEqual(findRoots(f, -10, 10), [-4, 1, 3]);
  const tps = findTurningPoints(f, -10, 10);
  assert.equal(tps.length, 2);
  assert.equal(tps[0].kind, 'max');
  close(tps[0].x, -Math.sqrt(13 / 3), 1e-5);
});

test('touching root detected', () => {
  const f = (x) => (x - 2) ** 2 * (x + 1);
  assert.deepEqual(findRoots(f, -5, 5), [-1, 2]);
});

test('pieces split at asymptote and window', () => {
  const pieces = findPieces((x) => 1 / x, { xmin: -5, xmax: 5, ymin: -5, ymax: 5 });
  assert.equal(pieces.length, 2);
  close(pieces[0].b, -0.2, 1e-6);
  close(pieces[1].a, 0.2, 1e-6);
});

test('monotone hermite has flat tangent at extrema', () => {
  const pts = [{ x: -4, y: 0 }, { x: -2, y: 5 }, { x: 1, y: 0 }];
  const m = monotoneSlopes(pts);
  assert.equal(m[1], 0);
  close(hermiteFunction(pts, m)(-2), 5);
});

test('polynomial helpers', () => {
  assert.deepEqual(_internal.polyFromRoots([-4, 1, 3], 1), [1, 0, -13, 12]);
  assert.equal(_internal.polyLatex([1, 0, -13, 12]), 'x^{3} - 13x + 12');
  assert.equal(fmt(-0.0001, 2), '0');
});

test('leading minus binds to the whole term', () => {
  assert.equal(parseConstant('-1/2').latex, '-\\frac{1}{2}');
  assert.equal(parseConstant('-1/2').absLatex, '\\frac{1}{2}');
  close(parseExpression('-x^2 + 1').evaluate(2), -3);
});

test('exact labels', () => {
  assert.equal(niceLatex(-2 * Math.PI), '-2\\pi');
  assert.equal(niceLatex(Math.PI / 2), '\\frac{\\pi}{2}');
  assert.equal(niceLatex(-4 / 3), '-\\frac{4}{3}');
  assert.equal(niceLatex(Math.sqrt(3)), '\\sqrt{3}');
  assert.equal(niceLatex(-2 * Math.sqrt(2)), '-2\\sqrt{2}');
  assert.equal(niceLatex(2.0817, 2), '2.08');
  assert.equal(niceLatex(1.5, 2, false), '1.5');
});

test('tikzjax source wrapping', () => {
  const { source } = toTikzJaxSource('\\begin{tikzpicture}\n\n\\draw (0,0)--(1,1);\n\\end{tikzpicture}');
  assert.ok(source.startsWith('\\mathcode`\\.="002E'));
  assert.ok(!source.includes('"8000'));
  const r = toTikzJaxSource('\\begin{tikzpicture}\\draw[-latex] (-1,0) -- (1,0) node {$-1.5, x-2$}; % $-$ comment\n\\node {\\$-3 \\(-4\\)};\\end{tikzpicture}').source;
  assert.ok(r.includes('\\draw[-latex] (-1,0)'), 'non-math minus untouched');
  assert.ok(r.includes('{$\\tikzjaxminus 1.5, x\\tikzjaxminus 2$}'), 'math minus rewritten');
  assert.ok(r.includes('% $-$ comment'), 'comment untouched');
  assert.ok(r.includes('\\$-3 \\(\\tikzjaxminus 4\\)'), 'escaped dollar and \\( math');
  assert.ok(!/\n\s*\n/.test(source.trim()));
  const doc = toStandaloneDocument('\\begin{tikzpicture}\\end{tikzpicture}');
  assert.ok(doc.includes('\\documentclass'));
  assert.equal(toPictureOnly(doc), '\\begin{tikzpicture}\\end{tikzpicture}');
});

test('every mode generates code', () => {
  const base = defaultValues(polynomial.schema);
  for (const mode of ['roots', 'expression', 'coefficients', 'sketch']) {
    const { code } = polynomial.generate({ ...base, mode });
    assert.ok(code.includes('\\begin{tikzpicture}'), mode);
    assert.ok(!/NaN|Infinity|undefined/.test(code), `${mode} has bad values`);
  }
});

test('index.html versions are up to date (run: node tools/stamp-versions.mjs)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html, buildIndex(html));
});

console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
