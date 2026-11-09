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
import { createHash } from 'node:crypto';
import { TIKZJAX } from '../js/config.js';
import { buildIndex } from '../tools/stamp-versions.mjs';
import { parsePiecewise, piecewiseFunction } from '../js/lib/piecewiseParser.js';
import piecewise from '../js/diagrams/piecewise.js';
import { encodeShareHash, decodeShareHash, changedValues } from '../js/core/shareLink.js';

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

test('piecewise parser: exam notation and otherwise', () => {
  const ps = parsePiecewise('x/4, 0 <= x <= 2sqrt(2)\n0, otherwise');
  assert.equal(ps.length, 3);
  assert.deepEqual(ps.map((p) => [p.aInc, p.bInc]), [[false, false], [true, true], [false, false]]);
  assert.equal(ps[1].bLatex, '2\\sqrt{2}');
  const q = parsePiecewise('x^2 for x < 1\n2 - x if 1 ≤ x < 3\n3, x = 2\n0: x in [3, inf)');
  const f = piecewiseFunction(q);
  close(f(0.5), 0.25); close(f(1), 1); close(f(2), 3); close(f(2.5), -0.5); close(f(3), 0);
  assert.throws(() => parsePiecewise('x, 0 <= x <= 2\n1, 1 < x < 3'), /overlap/);
  assert.throws(() => parsePiecewise('x, 3 <= x <= 1'), /bigger/);
});

test('piecewise diagram: dots and exact labels for the PDF example', () => {
  const base = defaultValues(piecewise.schema);
  const { code } = piecewise.generate(base);
  assert.ok(code.includes('\\fill (0,0) circle'), 'filled dot at O');
  assert.ok(/fill=white\] \(2\.8284,0\) circle/.test(code), 'open dot at (2√2, 0)');
  assert.ok(code.includes('\\fill (2.8284,0.7071) circle'), 'filled dot at top');
  assert.ok(code.includes('{$2\\sqrt{2}$}') && code.includes('{$\\frac{\\sqrt{2}}{2}$}'), 'exact labels');
  const noJoin = piecewise.generate({ ...base, joinDots: false }).code;
  assert.ok(!noJoin.includes('\\fill (0,0) circle'), 'no dot at a continuous join');
});

test('patched local TikZJax gets the code unchanged', () => {
  const { source } = toTikzJaxSource('\\begin{tikzpicture}\\node {$-1.5$};\\end{tikzpicture}', { glyphFixes: false });
  assert.ok(!source.includes('mathcode') && source.includes('{$-1.5$}'));
});

test('TikZJax script name matches its contents', () => {
  const url = TIKZJAX.sources[0].script;
  const file = new URL(url);
  const hash = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 10);
  assert.ok(file.pathname.endsWith(`tikzjax-${hash}.js`), `rename the script to tikzjax-${hash}.js`);
  for (const f of TIKZJAX.engineFiles) assert.equal(readFileSync(new URL(f.url)).length, f.bytes, `byte size in config for ${f.url}`);
});

test('share links round-trip options and code', () => {
  const defaults = defaultValues(piecewise.schema);
  const values = { ...defaults, pieces: 'x/4, 0 ≤ x ≤ 2√2\n0, otherwise', shade: '1 to 2', joinDots: false };
  const changed = changedValues(values, defaults);
  assert.deepEqual(Object.keys(changed).sort(), ['joinDots', 'pieces', 'shade']);
  assert.deepEqual(changedValues({ a: null, b: '' }, { a: '', b: null }), {}, 'blank number boxes are not changes');
  const hash = encodeShareHash({ type: 'piecewise', values: changed, code: '\\begin{tikzpicture}% π\n\\end{tikzpicture}' });
  assert.ok(/^#type=piecewise&o=[\w-]+&c=[\w-]+$/.test(hash), hash);
  const back = decodeShareHash(hash);
  assert.equal(back.type, 'piecewise');
  assert.deepEqual(back.values, changed);
  assert.equal(back.code, '\\begin{tikzpicture}% π\n\\end{tikzpicture}');
  assert.equal(decodeShareHash(''), null);
  assert.throws(() => decodeShareHash('#type=x&o=!!!'), /damaged/);
});

test('sketch mode: dots at curve ends replace arrows', () => {
  const base = defaultValues(polynomial.schema);
  const { code } = polynomial.generate({ ...base, mode: 'sketch', points: '0,-2\n4,-1\n8,-2.8', endDots: 'right', curveArrow: 'to', dotSize: '2pt' });
  assert.ok(code.includes('\\fill (8,-2.8) circle[radius=2pt]'), 'dot at right end');
  assert.ok(/\\draw\[semithick, to-\]/.test(code), 'arrow only at the left end');
});

test('grid and curve range', () => {
  const base = defaultValues(polynomial.schema);
  const { code } = polynomial.generate({ ...base, mode: 'expression', expression: '2x^3 - 5.3x^2 + 3.35x', domainFrom: '0', domainTo: '1.43',
    showGrid: true, gridXStep: 0.25, gridYStep: 0.25, gridXmin: 0, gridXmax: 1.5, gridYmin: -0.25, gridYmax: 1, windowMode: 'manual', xmin: -0.1, xmax: 1.65, ymin: -0.38, ymax: 1.2 });
  assert.ok(code.includes('(1.5,-0.25) -- (1.5,1)') && code.includes('(0,-0.25) -- (1.5,-0.25)'), 'grid lines at the edges of its range');
  assert.ok(/plot\[domain=0:1\.43,/.test(code), 'curve limited to 0..1.43');
  assert.ok(!/\\draw\[semithick, -to\] plot|\\draw\[semithick, to-to\] plot/.test(code), 'no arrow at a chosen end');
  const pw = piecewise.generate({ ...defaultValues(piecewise.schema), showGrid: true });
  assert.ok(pw.code.includes('% grid'), 'grid in piecewise graphs too');
});

test('index.html versions are up to date (run: node tools/stamp-versions.mjs)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html, buildIndex(html));
});

console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
