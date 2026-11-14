// SPDX-License-Identifier: CC0-1.0
// Unit tests for the pure (non-DOM) modules. Run: node tests/run-tests.js
import assert from 'node:assert/strict';
import { parseExpression, parseConstant } from '../js/lib/mathParser.js';
import { findRoots, findTurningPoints, fmt, niceLatex } from '../js/lib/numeric.js';
import { findPieces } from '../js/lib/functionGraph.js';
import { monotoneSlopes, hermiteFunction } from '../js/lib/hermite.js';
import { toTikzJaxSource, toStandaloneDocument, toPictureOnly } from '../js/core/tikzDocument.js';
import { defaultValues } from '../js/core/formBuilder.js';
import fn from '../js/diagrams/function.js';
import sketch, { parsePoints, pointSlopes } from '../js/diagrams/sketch.js';
import { parseGraphList } from '../js/lib/graphList.js';
import { ySquaredPaths } from '../js/lib/ySquared.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TIKZJAX } from '../js/config.js';
import { buildIndex } from '../tools/stamp-versions.mjs';
import { parsePiecewise, piecewiseFunction } from '../js/lib/piecewiseParser.js';
import blank from '../js/diagrams/blank.js';
import scatter, { parseData, regression } from '../js/diagrams/scatter.js';
import slopefield, { solutionCurve, contour } from '../js/diagrams/slopefield.js';
import normal, { normalProbability } from '../js/diagrams/normal.js';
import geometry from '../js/diagrams/geometry.js';
import realgraph, { parseCurve, curveRuns, titleText } from '../js/diagrams/realgraph.js';
import network, { DEFAULT_NETWORK } from '../js/diagrams/network.js';
import { parseEdgeList, sceneToEdgeList, applyEdgeList } from '../js/geometry/edgeList.js';
import probtree, { treeFromStages, treeFromOutline, pathProduct } from '../js/diagrams/probtree.js';
import { parseScene, sceneToTikz, coordinatesFromCode, angleSpan, labelPositions, pointMap } from '../js/geometry/scene.js';
import { GALLERY } from '../js/galleryEntries.js';
import { existsSync } from 'node:fs';
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

test('fmt rounds tiny values to 0', () => {
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

test('function and sketch defaults generate code', () => {
  for (const m of [fn, sketch]) {
    const { code, warnings } = m.generate(defaultValues(m.schema));
    assert.ok(code.includes('\\begin{tikzpicture}'), m.id);
    assert.ok(!/NaN|Infinity|undefined/.test(code), `${m.id} has bad values`);
    assert.deepEqual(warnings, [], m.id);
  }
  const { code } = fn.generate(defaultValues(fn.schema));
  assert.ok(code.includes('{$-3$}') && code.includes('{$1$}') && code.includes('{$2$}'), 'roots of x^3 - 7x + 6');
});

test('graph list: plain, piecewise in braces, domains, vertical lines and settings', () => {
  const gs = parseGraphList(
    'y = x^2\n{ x/4, 0 <= x <= 2sqrt(2); 0, otherwise }; thick\nx^2 - 1, -2 <= x < 3\n{\n  1, x < 0\n  2, x >= 0\n}; dashed\ny = 6 - 3x; dashed; thick; no arrows; from -2 to 6.5; label\nx = 1/2; label: x = a'
  );
  assert.deepEqual(gs.map((g) => g.kind), ['expr', 'piecewise', 'piecewise', 'piecewise', 'expr', 'vertical']);
  assert.equal(gs[1].width, 'thick');
  assert.equal(gs[1].pieces.length, 3, 'otherwise fills both sides');
  assert.equal(gs[2].pieces.length, 1);
  assert.ok(gs[2].pieces[0].aInc && !gs[2].pieces[0].bInc);
  assert.equal(gs[3].dash, 'dashed');
  const a = gs[4];
  close(a.f(1), 3);
  assert.deepEqual([a.dash, a.width, a.arrows, a.from, a.to, a.label], ['dashed', 'thick', false, -2, 6.5, 'y = 6 - 3x']);
  assert.ok(gs[5].value === 0.5 && gs[5].label === 'x = a');
  assert.equal(parseGraphList('2x + 1')[0].f(1), 3, 'y = is optional');
  assert.throws(() => parseGraphList('y = x; wobbly'), /didn't understand "wobbly"/);
  assert.throws(() => parseGraphList('{ x, x < 0'), /no matching/);
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

const PDF = { ...defaultValues(fn.schema), graphs: '{ x/4, 0 <= x <= 2sqrt(2); 0, otherwise }; thick', dotSize: '2pt' };

test('piecewise graph: dots and exact labels for the PDF example', () => {
  const base = PDF;
  const { code } = fn.generate(base);
  assert.ok(code.includes('\\fill (0,0) circle'), 'filled dot at O');
  assert.ok(/fill=white\] \(2\.8284,0\) circle/.test(code), 'open dot at (2√2, 0)');
  assert.ok(code.includes('\\fill (2.8284,0.7071) circle'), 'filled dot at top');
  assert.ok(code.includes('{$2\\sqrt{2}$}') && code.includes('{$\\displaystyle \\frac{\\sqrt{2}}{2}$}'), 'exact labels');
  const noJoin = fn.generate({ ...base, joinDots: false }).code;
  assert.ok(!noJoin.includes('\\fill (0,0) circle'), 'no dot at a continuous join');
});

test('patched local TikZJax gets the code unchanged', () => {
  const { source } = toTikzJaxSource('\\begin{tikzpicture}\\node {$-1.5$};\\end{tikzpicture}', { glyphFixes: false });
  assert.ok(!source.includes('mathcode') && source.includes('{$-1.5$}'));
});

test('TikZJax files are named after their contents', () => {
  for (const src of TIKZJAX.sources.filter((x) => x.script.startsWith('file:'))) {
    for (const url of [src.script, src.fonts]) {
      const m = url.match(/-([0-9a-f]{10})\.(js|css)$/);
      if (!m) continue; // the v1 fonts.css is not hashed (it never changes)
      const hash = createHash('sha1').update(readFileSync(new URL(url))).digest('hex').slice(0, 10);
      assert.equal(m[1], hash, `rename ${url} to end in -${hash}`);
    }
  }
  for (const f of TIKZJAX.engineFiles) assert.equal(readFileSync(new URL(f.url)).length, f.bytes, `byte size in config for ${f.url}`);
  assert.ok(readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes(TIKZJAX.fonts.split('/vendor/')[1]), 'index.html uses the same fonts file');
});

test('share links round-trip options and code', () => {
  const defaults = defaultValues(fn.schema);
  const values = { ...defaults, graphs: '{ x/4, 0 ≤ x ≤ 2√2; 0, otherwise }', shade: '1 to 2', joinDots: false };
  const changed = changedValues(values, defaults);
  assert.deepEqual(Object.keys(changed).sort(), ['graphs', 'joinDots', 'shade']);
  assert.deepEqual(changedValues({ a: null, b: '' }, { a: '', b: null }), {}, 'blank number boxes are not changes');
  const hash = encodeShareHash({ type: 'function', values: changed, code: '\\begin{tikzpicture}% π\n\\end{tikzpicture}' });
  assert.ok(/^#type=function&o=[\w-]+&c=[\w-]+$/.test(hash), hash);
  const back = decodeShareHash(hash);
  assert.equal(back.type, 'function');
  assert.deepEqual(back.values, changed);
  assert.equal(back.code, '\\begin{tikzpicture}% π\n\\end{tikzpicture}');
  assert.equal(decodeShareHash(''), null);
  assert.throws(() => decodeShareHash('#type=x&o=!!!'), /damaged/);
});

test('sketch: dots at curve ends replace arrows', () => {
  const base = defaultValues(sketch.schema);
  const { code } = sketch.generate({ ...base, points: '0,-2\n4,-1\n8,-2.8', rightEnd: 'dot', curveArrow: 'to', dotSize: '2pt' });
  assert.ok(code.includes('\\fill (8,-2.8) circle[radius=2pt]'), 'dot at right end');
  assert.ok(/\\draw\[semithick, to-\]/.test(code), 'arrow only at the left end');
});

test('grid and curve range', () => {
  const base = defaultValues(fn.schema);
  const { code } = fn.generate({ ...base, graphs: 'y = 2x^3 - 5.3x^2 + 3.35x; from 0 to 1.43', leftEnd: 'plain', rightEnd: 'plain',
    showGrid: true, gridXStep: 0.25, gridYStep: 0.25, gridXmin: 0, gridXmax: 1.5, gridYmin: -0.25, gridYmax: 1, windowMode: 'manual', xmin: -0.1, xmax: 1.65, ymin: -0.38, ymax: 1.2 });
  const grid = code.split('\n').find((l) => l.trim().startsWith('\\draw') && l.includes(' grid '));
  assert.ok(/xstep=[\d.]+cm, ystep=[\d.]+cm\] \(-0\.0002,-0\.2501\) grid \(1\.5002,1\.0001\);/.test(grid), grid);
  assert.ok(/plot\[domain=0:1\.43,/.test(code), 'curve limited to 0..1.43');
  assert.ok(!/\\draw\[semithick, -to\] plot|\\draw\[semithick, to-to\] plot/.test(code), 'no arrow at a chosen end');
  const pw = fn.generate({ ...PDF, showGrid: true });
  assert.ok(pw.code.includes('% grid every'), 'grid in piecewise graphs too');
});

test('normal distribution: probabilities', () => {
  close(normalProbability(-Infinity, -1.5), 0.0668072, 1e-6);
  close(normalProbability(1.2, Infinity), 0.1150697, 1e-6);
  close(normalProbability(-1, 1), 0.6826895, 1e-6);
  close(normalProbability(-1.96, 1.96), 0.9500042, 1e-6);
});

test('normal distribution: default diagram like the exam image', () => {
  const base = defaultValues(normal.schema);
  const { code, warnings } = normal.generate(base);
  assert.deepEqual(warnings, []);
  assert.equal((code.match(/pattern=\{Dots/g) || []).length, 2, 'two dotted regions');
  assert.ok(code.startsWith('\\usetikzlibrary{patterns.meta}'), 'loads patterns.meta');
  assert.ok(code.includes('{$-1.5$}') && code.includes('{$0$}') && code.includes('{$1.2$}'), 'labels at -1.5, 0, 1.2');
  assert.ok(code.includes('\\draw[dashed, thin] (-1.5,0) --') && code.includes('\\draw[dashed, thin] (1.2,0) --'), 'dashed boundaries');
  const r = normal.generate({ ...base, labelMode: 'real', mean: '50', sd: '10', regions: 'x > 62 : P(X>62)', areaLabels: 'prob', shadeStyle: 'gray!20' });
  assert.ok(r.code.includes('{$62$}') && r.code.includes('{$50$}'), 'real-value labels');
  assert.ok(r.code.includes('$P(X>62)$'), 'typed area label');
  const s = normal.generate({ ...base, labelMode: 'symbolic', regions: '-1 < z < 1', areaLabels: 'percent', empirical: 'both' });
  assert.ok(s.code.includes('{$\\mu - \\sigma$}') && s.code.includes('{$\\mu + 2\\sigma$}'), 'symbolic labels');
  assert.ok(s.code.includes('68.27\\%') && s.code.includes('99.7\\%'), 'area percent and empirical brackets');
});

test('extra graphs: line crossing a parabola like the exam image', () => {
  const base = defaultValues(fn.schema);
  const plain = fn.generate({ ...base, graphs: 'y = -(x+3)(x-4)\ny = 6 - 3x; from -2.3 to 6.4' });
  assert.deepEqual(plain.warnings, []);
  assert.ok(plain.code.includes('\\draw[semithick, to-to] (-2.3,12.9) -- (6.4,-13.2);'), 'straight line with arrows');
  const { code } = fn.generate({
    ...base,
    graphs: 'y = -(x+3)(x-4)\ny = 6 - 3x; dashed; label',
    extraDots: true,
    extraCrossCoords: true,
    extraIntercepts: true,
  });
  assert.ok(code.includes('dashed, to-to'), 'own style');
  assert.ok(code.includes('{$y = 6 - 3x$}'), 'equation label');
  assert.equal((code.match(/circle\[radius=1\.3pt\]/g) || []).length, 2, 'two crossing dots');
  assert.ok(code.includes('{$(-1.16, 9.49)$}') && code.includes('{$(5.16, -9.49)$}'), 'crossing coordinates');
  assert.ok(code.includes('{$2$}') && code.includes('{$6$}'), 'line intercepts');
  const pw = fn.generate({ ...PDF, graphs: PDF.graphs + '\ny = 1/2', extraDots: true });
  assert.ok(pw.code.includes('% where the graphs cross\n  \\fill (2,0.5) circle'), 'crosses a piecewise graph at (2, 0.5)');
});

test('sketch with a plain start, asymptote and turning-point dot (exam image)', () => {
  const { code, warnings } = sketch.generate({
    ...defaultValues(sketch.schema),
    points: '0, -1.24\n2, -2.35\n4.13, 0\n5.6, 3\n7.2, 4.4\n9.6, 4.88',
    leftEnd: 'plain',
    labelX: false,
    tpLabel: 'none',
    pointDots: true,
    xCustomTicks: '2, 5',
    asymptotes: 'y = 5 from 0 to 10.6',
  });
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('\\node[anchor=east, inner sep=2pt, xshift=-2pt] at (0,5) {$5$};'), 'value on the y-axis');
  const eq = fn.generate({ ...defaultValues(fn.schema), graphs: 'y = x - 1', asymptotes: 'x = -2, y = 3', asymptoteLabel: 'equation' }).code;
  assert.ok(eq.includes('{$x = -2$}') && eq.includes('{$y = 3$}') && !eq.includes('{$-2$}'), 'equation labels only');
  assert.ok(code.includes('\\draw[semithick, -to] (0,-1.24)'), 'arrow at the right end only');
  assert.ok(code.includes('\\fill (2,-2.35) circle'), 'dot at the minimum');
  assert.ok(code.includes('\\draw[dashed, thin] (0,5) -- (10.6,5);'), 'dashed asymptote');
});

test('sketch: points with gradients', () => {
  const pts = parsePoints('0, 1\n2, 3, 0 : A\n4, 0, -2');
  assert.deepEqual(pts.map((p) => p.gradient), [null, 0, -2]);
  assert.equal(pts[1].label, 'A');
  const m = pointSlopes(pts);
  assert.equal(m[1], 0);
  assert.equal(m[2], -2);
  const { code } = sketch.generate({ ...defaultValues(sketch.schema), points: '-2, 0\n0, 4, 0\n2, 0, -5', tpLabel: 'coords' });
  assert.ok(code.includes('(0, 4)'), 'turning point with gradient 0 labelled');
  assert.ok(code.includes('.. controls (1.3333,0.6667) and (2,0) ..') || /and \(1\.3333,3\.3333\) \.\. \(2,0\)/.test(code), 'gradient -5 at (2, 0)');
  assert.throws(() => parsePoints('1, 2, 3, 4'), /expected/);
});

test('function: piecewise extra graph and labels on the first graph only', () => {
  const { code, warnings } = fn.generate({
    ...defaultValues(fn.schema),
    graphs: 'y = x^2 - 4\n{ 1, x < 0; -1, x >= 0 }; dashed',
  });
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('{$-2$}') && code.includes('{$2$}'), 'roots of the first graph');
  assert.ok(code.includes('fill=white] (0,1) circle') && code.includes('\\fill (0,-1) circle'), 'open and filled dots on the extra piecewise graph');
  assert.ok(/\\draw\[semithick, dashed[^\]]*\] \(-?[\d.]+,1\) -- \(0,1\);/.test(code), 'dashed piece');
});

test('function: first graph settings and restricted domain with dots', () => {
  const c = fn.generate({ ...defaultValues(fn.schema), graphs: 'y = x^2 - 1, -2 <= x < 3; thick' }).code;
  assert.ok(c.includes('\\fill (-2,3) circle') && c.includes('fill=white] (3,8) circle'), 'closed and open end dots');
  assert.ok(c.includes('\\draw[thick] plot'), 'own line width');
  assert.ok(c.includes('{$-1$}') && c.includes('{$1$}'), 'x-intercepts inside the domain');
  assert.throws(() => fn.generate({ ...defaultValues(fn.schema), graphs: 'x = 2' }), /first graph/);
});

test('y^2 = f(x): oval, open branch and NOT TO SCALE', () => {
  const f = (x) => x * (x + 2) * (x - 5);
  const paths = ySquaredPaths(f, { xmin: -4, xmax: 8, ymin: -6, ymax: 6 });
  assert.equal(paths.length, 2);
  assert.ok(paths[0].closed, 'oval between -2 and 0');
  assert.ok(!paths[1].closed && paths[1].arrows[0] && paths[1].arrows[1], 'branch from 5 with two arms');
  for (const [x, y] of paths[0].points) close(y * y, Math.max(0, f(x)), 1e-6);
  assert.ok(paths[1].points.some(([x, y]) => x === 5 && y === 0), 'branch passes through (5, 0)');
  const { code, warnings } = fn.generate({ ...defaultValues(fn.schema), graphs: 'y^2 = x(x+2)(x-5)', notToScale: true });
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('-- cycle;'), 'closed oval');
  assert.ok(code.includes('{$-2$}') && code.includes('{$5$}'), 'x-intercepts');
  assert.ok(code.includes('{NOT TO\\\\SCALE}'), 'note');
  assert.equal(parseGraphList('y² = x')[0].kind, 'ysq');
});

test('two-variable expressions and sgn', () => {
  const e = parseExpression('xy - y^2 + sgn(x)', { variables: ['x', 'y'] });
  close(e.evaluate({ x: 2, y: 3 }), 6 - 9 + 1);
  assert.equal(e.toLatex(), 'xy - y^{2} + \\operatorname{sgn}(x)');
  assert.throws(() => parseExpression('y + 1'), /Unknown name/, 'single-variable expressions still reject y');
});

test('slope field: segments, solution curves and isoclines', () => {
  // y' = y: solution through (0, 1) is e^x
  const curve = solutionCurve(({ y }) => y, 0, 1, { xmin: -2, xmax: 2, ymin: -10, ymax: 10 });
  for (const [x, y] of curve) close(y, Math.exp(x), 1e-6);
  // isocline of x - y = 0 is the line y = x
  const lines = contour((x, y) => x - y, { xmin: -3, xmax: 3, ymin: -3, ymax: 3 }, 30);
  assert.equal(lines.length, 1);
  for (const [x, y] of lines[0]) close(x, y, 1e-9);
  const base = defaultValues(slopefield.schema);
  const { code, warnings } = slopefield.generate({ ...base, solutions: 'dashed', isoclines: '0', labelIsoclines: true });
  assert.deepEqual(warnings, []);
  assert.equal((code.match(/ -- /g) || []).length > 121, true, '11 x 11 segments and more');
  assert.ok(code.includes('% isocline dy/dx = 0') && code.includes('\\frac{dy}{dx} = 0'), 'isocline and its label');
  assert.ok(code.includes('% solution curves') && code.includes('\\draw[semithick, dashed]'), 'dashed solution curves');
  // a horizontal segment at a point where dy/dx = 0 (x - y at (1, 1))
  assert.ok(/\(0\.\d+,1\) -- \(1\.\d+,1\)/.test(code), 'flat segment where dy/dx = 0');
  const arrows = slopefield.generate({ ...base, arrows: true, skipAxes: true }).code;
  assert.ok(arrows.includes('-{Stealth[length=3pt]}') && arrows.startsWith('\\usetikzlibrary{arrows.meta}'), 'arrowheads');
  assert.ok(!/\([-\d.]+,0\) -- \([-\d.]+,0\)/.test(arrows.split('% axes')[0]), 'none on the x-axis');
  assert.throws(() => slopefield.generate({ ...base, equation: 'x +' }), /Could not read/);
});

test('blank axes: ticks, trig presets and full-size fractions', () => {
  const base = defaultValues(blank.schema);
  const a = blank.generate(base);
  assert.deepEqual(a.warnings, []);
  assert.ok(a.code.includes('{$2$}') && a.code.includes('{$5$}'), 'ticks at 2 and 5');
  assert.ok(!a.code.includes('{$O$}') && !a.code.includes('plot'), 'no origin label, no curve');
  const r = blank.generate({ ...base, xPreset: 'radians', xCustomTicks: '', originLabel: true });
  assert.ok(r.code.includes('{$\\displaystyle \\frac{\\pi}{2}$}') && r.code.includes('{$2\\pi$}'), 'radian ticks');
  assert.ok(r.code.includes('{$O$}'), 'origin label');
  const d = blank.generate({ ...base, xPreset: 'degrees', xCustomTicks: '' });
  assert.ok(d.code.includes('{$360^{\\circ}$}'), 'degree ticks');
});

test('scatterplot: data, regression, axis breaks and clicks', () => {
  const d = parseData("Critics' score\tPublic's score\n7.1\t6.7\n8, 7.2\n9.0 7.6");
  assert.deepEqual(d.header, ["Critics' score", "Public's score"]);
  assert.deepEqual(d.points.map((p) => [p.x, p.y]), [[7.1, 6.7], [8, 7.2], [9, 7.6]]);
  assert.throws(() => parseData('1, 2\nfoo, 3'), /Line 2/);
  const reg = regression([{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }]);
  close(reg.b, 2);
  close(reg.a, 1);
  close(reg.r, 1);
  const base = defaultValues(scatter.schema);
  const { code, warnings, click } = scatter.generate({ ...base, showEquation: true, showR: true });
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('-- ++(0,-3pt) node[anchor=north, inner sep=2pt] {$0$}') && code.includes('-- ++(-3pt,0) node[anchor=east, inner sep=2pt] {$0$}'), 'ticked 0s at the broken corner');
  const one = scatter.generate({ ...base, zeroStyle: 'one' }).code;
  assert.equal((one.match(/\{\$0\$\}/g) || []).length, 1, 'a single 0');
  assert.ok(one.includes('\\node[anchor=north east, inner sep=2pt] at (6.8,5.75) {$0$};'), 'at the corner, no tick');
  assert.ok(code.includes('++(1.5pt,2.5pt)') && code.includes('++(2.5pt,1.5pt)'), 'zig-zags on both axes');
  assert.ok(code.includes('{$7.0$}') && code.includes('{$8.5$}'), 'scale numbers to the data decimals');
  assert.ok(code.includes('{$y = 0.53x + 2.82,\\quad r = 0.854$}'), 'equation and r');
  assert.ok(code.includes('rotate=90') && code.includes("Public’s score"), 'rotated y title');
  assert.equal((code.match(/\\fill \(/g) || []).length, 23, '23 points');
  assert.deepEqual(click.area, { x0: 7, x1: 10, y0: 6, y1: 8.5 });
  const off = scatter.generate({ ...base, axisBreak: 'off' }).code;
  assert.ok(!off.includes('++(1.5pt,2.5pt)'), 'no break when turned off');
  const added = scatter.onPreviewClick(base, { x: 7.5, y: 8.04, decimals: [2, 2], scale: { x: 2, y: 2 } });
  assert.ok(added.data.endsWith('\n7.50, 8.04'));
  const removed = scatter.onPreviewClick(added, { x: 7.49, y: 8.03, remove: true, scale: { x: 2, y: 2 } });
  assert.equal(removed.data, base.data);
  const typed = scatter.generate({ ...base, line: 'typed', lineEquation: 'y = 0.5x + 3', showEquation: true }).code;
  assert.ok(typed.includes('{$y = 0.5x + 3$}'), 'typed equation without r');
  assert.ok(scatter.generate({ ...base, showEquation: true }).code.includes('{$y = 0.53x + 2.82$}'), 'equation only');
  assert.ok(scatter.generate({ ...base, line: 'none', showR: true }).code.includes('{$r = 0.854$}'), 'r only, no line');
});

test('geometry: scene to TikZ', () => {
  const base = defaultValues(geometry.schema);
  const { code, warnings } = geometry.generate(base);
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('\\coordinate (A) at (0,0);'));
  assert.ok(code.includes('\\draw (A) -- (B) -- (C) -- cycle;'), 'polygon is one closed path');
  assert.ok(/\\pic\[draw[^\]]*\] \{angle = /.test(code));
  // marks, circles, arcs, shading, text
  const scene = parseScene(base.scene);
  scene.items.push(
    { id: 's1', type: 'segment', a: scene.points[1].id, b: scene.points[2].id, ticks: 2, arrows: 1 },
    { id: 'c1', type: 'circle', c: scene.points[0].id, p: scene.points[2].id, style: 'dashed' },
    { id: 'a1', type: 'arc', c: scene.points[0].id, a: scene.points[1].id, b: scene.points[2].id },
    { id: 't1', type: 'text', x: 1, y: 4, text: 'Hello $x$' }
  );
  const poly = scene.items.find((i) => i.type === 'polygon');
  if (poly) poly.fill = 'gray!30';
  scene.settings.notToScale = true;
  const more = sceneToTikz(parseScene(JSON.stringify(scene))).code;
  assert.ok(more.includes('decorations.markings'), 'markings library');
  assert.ok(/\\draw\[dashed\] \(A\) circle/.test(more), 'circle');
  assert.ok(more.includes(' arc['), 'arc');
  assert.ok(more.includes('NOT TO'), 'not to scale');
  assert.ok(more.includes('{Hello $x$}'), 'text');
  // hand-edited coordinates move points
  const edited = code.replace('\\coordinate (B) at (6,0);', '\\coordinate (B) at (7,0.5);');
  assert.deepEqual(coordinatesFromCode(edited).get('B'), { x: 7, y: 0.5 });
  const next = geometry.onCodeEdit(base, edited);
  assert.ok(next.values.scene.includes('"x":7') && next.message.includes('Moved 1 point'));
  assert.equal(geometry.onCodeEdit(base, code), null, 'unchanged code: nothing to do');
  // arrowheads on lines, labels along the line, dotted shading
  const fancy = parseScene(base.scene);
  const seg = fancy.items.find((i) => i.type === 'segment');
  seg.tip = 'b';
  seg.sloped = true;
  seg.label = 'x';
  fancy.items.push({ id: 'poly', type: 'polygon', pts: fancy.points.map((p) => p.id), fill: 'dots' });
  const fc = sceneToTikz(parseScene(JSON.stringify(fancy))).code;
  assert.ok(fc.includes('\\draw[-{Stealth[length=5pt]}] (A) -- (B);'), 'arrowhead at the end');
  assert.ok(/node\[midway, [^\]]*rotate=0\] \{\$x\$\}/.test(fc), 'label along a level line: rotate=0');
  assert.ok(fc.includes('pattern={Dots') && fc.includes('patterns.meta'), 'dotted shading');
  // a ray: its end stays in line, past the point it goes through; its bearing labels its end
  const rs = parseScene({
    points: [
      { id: 'o', name: 'O', x: 0, y: 0 },
      { id: 'p', name: 'P', x: 3, y: 4 },
      { id: 'e', name: 'E', x: 0, y: 0, hidden: true, dep: { kind: 'ray', a: 'o', b: 'p', ext: 1 } },
    ],
    items: [{ id: 'r', type: 'segment', a: 'o', b: 'e', label: '', tip: 'b', endMode: 'bearing' }],
  });
  assert.deepEqual([rs.points[2].x, rs.points[2].y], [3.6, 4.8]);
  const rc = sceneToTikz(rs).code;
  assert.ok(rc.includes('\\coordinate (E) at ($(P)!-1cm!(O)$);'), rc);
  assert.ok(rc.includes('{$037^\\circ$}'), 'bearing of (3, 4) from O is 037°');
  // a North line's top stays straight above its point
  const ns = parseScene({
    points: [
      { id: 'o', name: 'O', x: 1, y: 2 },
      { id: 't', name: 'T', x: 0, y: 0, hidden: true, dep: { kind: 'north', a: 'o', len: 3 } },
    ],
    items: [{ id: 'n', type: 'segment', a: 'o', b: 't', label: '', style: 'dashed', tip: 'b', endMode: 'custom', endText: '\\mathbf{N}' }],
  });
  assert.deepEqual([ns.points[1].x, ns.points[1].y], [1, 5]);
  const nc = sceneToTikz(ns).code;
  assert.ok(nc.includes('\\coordinate (T) at ($(O)+(0,3)$);') && nc.includes('{$\\mathbf{N}$}'), nc);
  // an angle's arrowhead points at the chosen arm, whichever way TikZ draws the arc
  const arrowed = parseScene(base.scene);
  const ang = arrowed.items.find((i) => i.type === 'angle');
  ang.arrow = ang.b;
  const one = sceneToTikz(arrowed).code;
  ang.arrow = ang.a;
  const other = sceneToTikz(arrowed).code;
  assert.ok(one.includes('arrows.meta') && /Stealth\[length=4pt\]\}?-?/.test(one));
  assert.notEqual(one.includes(', -{Stealth'), other.includes(', -{Stealth'), 'opposite arms give opposite ends');
  // angles measure the smaller turn unless reflex
  const v = { x: 0, y: 0 }, a = { x: 1, y: 0 }, b = { x: 0, y: -1 };
  assert.equal(Math.round(angleSpan(v, a, b, false).size), 90);
  assert.equal(Math.round(angleSpan(v, a, b, true).size), 270);
  // bad names warn
  const bad = parseScene(base.scene);
  bad.points[1].name = bad.points[0].name;
  assert.ok(sceneToTikz(bad).warnings.length > 0, 'duplicate names warn');
});

test('geometry: measured lengths and constructed points', () => {
  const scene = parseScene({
    points: [
      { id: 'a', name: 'A', x: 0, y: 0 },
      { id: 'b', name: 'B', x: 3, y: 4 },
      { id: 'c', name: 'C', x: 6, y: 0 },
      { id: 'm', name: 'M', x: 9, y: 9, dep: { kind: 'mid', a: 'a', b: 'c' } },
      { id: 'h', name: 'H', x: 9, y: 9, dep: { kind: 'foot', p: 'c', a: 'a', b: 'b' } },
    ],
    items: [
      { id: 's1', type: 'segment', a: 'a', b: 'b', label: null },
      { id: 's2', type: 'segment', a: 'b', b: 'c', label: '' },
      { id: 's3', type: 'segment', a: 'a', b: 'm', label: null },
    ],
    settings: { lengthDecimals: 1 },
  });
  assert.deepEqual([scene.points[3].x, scene.points[3].y], [3, 0], 'midpoint placed');
  assert.deepEqual([scene.points[4].x, scene.points[4].y], [2.16, 2.88], 'foot placed');
  const { code, warnings } = sceneToTikz(scene);
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('\\coordinate (M) at ($(A)!0.5!(C)$);'), code);
  assert.ok(code.includes('\\coordinate (H) at ($(A)!(C)!(B)$);'), code);
  assert.ok(code.includes('calc'), 'calc library');
  assert.ok(code.includes('{$5$}') && code.includes('{$3$}'), 'measured lengths');
  assert.ok(!coordinatesFromCode(code).has('M'), 'constructed points are not read back');
  scene.items.push({ id: 't1', type: 'ticks', a: 'a', b: 'm', ticks: 2 });
  const marked = sceneToTikz(parseScene(JSON.stringify(scene))).code;
  assert.ok(/\\path\[postaction=\{decorate\}[^\n]*\] \(A\) -- \(M\);/.test(marked), 'tick marks without a line');
  assert.ok(marked.includes('decorations.markings'));
  scene.settings.lengthDecimals = 2;
  scene.points[1].x = 3.333;
  assert.ok(sceneToTikz(scene).code.includes('{$5.21$}'), 'two decimal places');
});

test('geometry: overlapping labels are moved apart', () => {
  // the obtuse triangle where the altitude's "3" sat beside side GE's "3.2"
  const scene = parseScene({
    points: [
      { id: 'e', name: 'E', x: 0, y: 0 },
      { id: 'f', name: 'F', x: 7, y: 0 },
      { id: 'g', name: 'G', x: -1, y: 3 },
      { id: 'i', name: 'I', x: 0, y: 0, dep: { kind: 'foot', p: 'g', a: 'e', b: 'f' } },
    ],
    items: [
      { id: 'ef', type: 'segment', a: 'e', b: 'f', label: null },
      { id: 'fg', type: 'segment', a: 'f', b: 'g', label: null },
      { id: 'ge', type: 'segment', a: 'g', b: 'e', label: null },
      { id: 'gi', type: 'segment', a: 'g', b: 'i', label: null },
      { id: 'ie', type: 'segment', a: 'i', b: 'e', label: null },
    ],
  });
  const pts = pointMap(scene);
  const placed = labelPositions(scene, pts);
  const box = (key, ax, ay, chars) => {
    const o = placed.get(key);
    return { x: ax + o.dx, y: ay + o.dy, w: chars * 0.19 + 0.08, h: 0.38 };
  };
  const all = [
    box('s:ge', -0.5, 1.5, 3),
    box('s:gi', -1, 1.5, 1),
    box('s:ie', -0.5, 0, 1),
    box('s:ef', 3.5, 0, 1),
    box('p:e', 0, 0, 1),
    box('p:i', -1, 0, 1),
  ];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-6 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 1e-6;
      assert.ok(apart, `labels ${i} and ${j} overlap`);
    }
  // a label placed by hand stays where it was put
  scene.items[2].labelPos = { dx: 0.2, dy: 0.1 };
  assert.deepEqual(labelPositions(scene, pts).get('s:ge'), { dx: 0.2, dy: 0.1 });
});

test('probability trees: input, products, blanks', () => {
  const st = treeFromStages('A : 1/2; B : 1/2\nX : 0.3, Y : 0.7');
  assert.equal(st.length, 2);
  assert.equal(st[0].children[1].name, 'Y');
  const ol = treeFromOutline('A : 1/3\n> X : 1/4\n  > Deep : p\nB : 2/3\n\tY : ?');
  assert.equal(ol[0].children[0].children[0].name, 'Deep', '">" and spaces mix');
  assert.equal(ol[1].children[0].prob, '?', 'a tab is one level');
  assert.throws(() => treeFromOutline('A : 1/2\n>> X : 1/2'), /more than one level/);
  assert.throws(() => treeFromStages('Walk 3/10'), /outcome and its probability/);
  assert.deepEqual(pathProduct(['3/10', '9/10']), { expr: '\\frac{3}{10} \\times \\frac{9}{10}', value: '\\frac{27}{100}' });
  assert.equal(pathProduct(['3/7', '2/6']).value, '\\frac{1}{7}', 'simplified');
  assert.equal(pathProduct(['0.3', '0.5']).value, '0.15', 'decimals stay decimals');
  assert.equal(pathProduct(['p', '1/2']).value, '', 'letters: no value');
  assert.equal(pathProduct(['?', '1/2']).expr, '', 'a blank: nothing');
  const base = defaultValues(probtree.schema);
  const { code, warnings } = probtree.generate(base);
  assert.deepEqual(warnings, []);
  assert.equal((code.match(/\\draw /g) || []).length, 6, 'six branches');
  assert.ok(code.includes('node[midway, above left] {$\\displaystyle \\frac{3}{10}$}'));
  const blanks = probtree.generate({ ...base, stages: 'A : ?; ? : 1/2', blankStyle: 'box' }).code;
  assert.ok(blanks.includes('draw, minimum width=0.9cm'), 'blank probability box');
  assert.ok(blanks.includes('draw, minimum width=2.2cm'), 'blank outcome box');
  const col = probtree.generate({ ...base, outcomes: 'both', headings: 'First; Second' }).code;
  assert.ok(col.includes('{Walk, Correct uniform}') && col.includes('= \\frac{27}{100}$}'), 'outcome column');
  assert.ok(col.includes('{First}') && col.includes('{Outcome}') && col.includes('{Probability}'), 'headings');
});

test('networks: edge lists, repeated edges, loops, directions', () => {
  const pl = parseEdgeList('A-B\nB->C 5\nC<-D: x\nC-C\nE\nStart->A A, 8');
  assert.deepEqual(pl.vertices, ['A', 'B', 'C', 'D', 'E', 'Start']);
  assert.deepEqual(pl.edges[4], { a: 'Start', b: 'A', directed: true, label: 'A, 8' }, 'a label with a comma');
  assert.deepEqual(pl.edges[1], { a: 'B', b: 'C', directed: true, label: '5' });
  assert.deepEqual(pl.edges[2], { a: 'D', b: 'C', directed: true, label: 'x' }, 'C<-D is an edge from D to C');
  assert.throws(() => parseEdgeList('A = B'), /isn't an edge or a vertex/);
  let k = 0;
  const id = (p) => `${p}${++k}`;
  const scene = parseScene(JSON.stringify(DEFAULT_NETWORK));
  const before = scene.points.find((p) => p.name === 'A');
  applyEdgeList(scene, 'A-B\nA-B\nA->C 4\nC-C\nH', id);
  assert.equal(scene.points.find((p) => p.name === 'A').x, before.x, 'vertices that stay keep their places');
  assert.ok(scene.points.find((p) => p.name === 'H'), 'a new vertex');
  assert.ok(!scene.points.find((p) => p.name === 'D'), 'an unlisted vertex goes');
  const ab = scene.items.filter((i) => i.type === 'segment' && [i.a, i.b].sort().join() === ['A', 'B'].sort().join());
  assert.equal(ab.length, 2);
  assert.deepEqual(ab.map((i) => i.bend).sort(), [0, 25], 'the second AB curves');
  assert.equal(sceneToEdgeList(scene), 'A-B\nA-B\nA->C 4\nC-C\nH');
  scene.settings.mode = 'network';
  const { code, warnings } = sceneToTikz(scene);
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('(A) to[bend left=25] (B)'), 'curved edge');
  assert.ok(/\(C\) \.\. controls \+\([\d.-]+:1\.28\) and \+\([\d.-]+:1\.28\) \.\. \(C\)/.test(code), 'loop');
  assert.ok(/mark=at position 0\.5 with \{\\arrow\[xshift=2pt\]\{Stealth\[length=4pt\]\}\}\}\] \(A\) -- \(C\)/.test(code), 'directed: arrow in the middle');
  assert.ok(code.includes('{$4$}'), 'edge label');
  assert.deepEqual(network.generate({ scene: JSON.stringify(DEFAULT_NETWORK) }).warnings, []);
  // word names (Start, Finish) are upright text; letters stay maths
  const words = sceneToTikz(parseScene({ points: [{ id: 's', name: 'Start', x: 0, y: 0 }, { id: 'a', name: 'A', x: 3, y: 0 }], items: [{ id: 'e', type: 'segment', a: 's', b: 'a', label: '' }] })).code;
  assert.ok(words.includes('node {Start};') && words.includes('node {$A$};'), words);
});

test('real-world graphs: curves from points, titles', () => {
  const c = parseCurve('0,8 5, 7.5 10,6.6 -- 10,5.8 20,3 | 22,2* 25,0o:Q; dashed; thick; label: Plan A', 0);
  assert.equal(c.points.length, 7, '"5, 7.5" with a space is one point');
  assert.deepEqual(c.joins, ['smooth', 'smooth', 'line', 'smooth', 'gap', 'smooth']);
  assert.deepEqual([c.style, c.width, c.label], ['dashed', 'thick', 'Plan A']);
  assert.deepEqual([c.points[5].dot, c.points[6].dot, c.points[6].text], ['filled', 'open', 'Q']);
  assert.deepEqual(curveRuns(c).map((r) => [r.kind, r.points.length]), [['smooth', 3], ['line', 2], ['smooth', 2], ['smooth', 2]]);
  assert.deepEqual(curveRuns(parseCurve('0,0 2,40 3,40; straight', 0)).map((r) => r.kind), ['line']);
  assert.throws(() => parseCurve('0,8 ten,3', 0), /isn't a number/);
  assert.throws(() => parseCurve('0,8; wiggly', 0), /isn't a setting/);
  assert.equal(titleText('Balance \\\\ (× \\$ hundred)'), 'Balance \\\\ ($\\times$ $\\$$ hundred)', 'TikZJax needs the dollar as maths');
  assert.equal(titleText('Speed ($v$ m/s) 50%'), 'Speed ($v$ m/s) 50\\%');
  const base = defaultValues(realgraph.schema);
  const { code, warnings } = realgraph.generate(base);
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('(10,6.6) -- (10,5.85)'), 'the vertical drop');
  assert.ok(code.includes('(0,8) .. controls (1.7656,8) and'), 'level start: the first control point is at the same height');
  // a direction at any point, measured on the page; and where labels go
  const dirs = parseCurve('0,0@45 5,5@0:T 10,0@-90; label start below left: A', 0);
  assert.deepEqual(dirs.points.map((p) => p.dir), [45, 0, -90]);
  assert.equal(dirs.points[1].text, 'T');
  assert.deepEqual([dirs.labelAt, dirs.labelSide, dirs.label], ['start', 'below left', 'A']);
  assert.deepEqual([parseCurve('0,0 1,1; label: B', 0).labelAt, parseCurve('0,0 1,1; label middle: B', 0).labelAt], ['end', 'middle']);
  const dc = realgraph.generate({ ...base, curves: '0,0@45 5,5@0 10,0; label start below left: A\n0,1 2,3; label below: Z' }).code;
  assert.ok(/\(0,0\) \.\. controls \(([\d.]+),([\d.]+)\)/.test(dc), dc);
  const [, cx, cy] = dc.match(/\(0,0\) \.\. controls \(([\d.]+),([\d.]+)\)/);
  const xu = 8 / 38;
  const yu = 7.5 / 10.8;
  assert.ok(Math.abs(Math.atan2(cy * yu, cx * xu) * 180 / Math.PI - 45) < 0.1, '45° on the page, whatever the scales');
  assert.ok(dc.includes('node[anchor=north east, inner sep=3pt] at (0,0) {A}'), 'label at the start, below left');
  assert.ok(dc.includes('node[anchor=north, inner sep=3pt] at (2,3) {Z}'), 'label below the end');
  assert.ok(code.includes('node[rotate=90, anchor=south, align=center]'), 'turned y title');
  assert.ok(code.includes('{$8$}') && !code.includes('{$2$}'), 'only the chosen y numbers');
  const out = realgraph.generate({ ...base, curves: '0,8 50,1' });
  assert.ok(out.warnings.some((w) => /outside the axes/.test(w)));
});

test('function graphs in other letters name the axes', () => {
  const base = defaultValues(fn.schema);
  const { code, warnings } = fn.generate({ ...base, graphs: 't = 4 - p; from 0.1 to 3.9; label' });
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('{$p$}') && code.includes('{$t$}'), 'axes named p and t');
  assert.ok(code.includes('domain=0.1:3.9'));
  assert.ok(code.includes('t = 4 - p'), 'the label keeps the letters');
  const own = fn.generate({ ...base, graphs: 'h = 45 + 12t - 2t^2', xAxisLabel: 'time', yAxisLabel: 'height' }).code;
  assert.ok(own.includes('{$time$}') && own.includes('{$height$}'), 'labels you typed win');
  const xy = fn.generate({ ...base, graphs: 'y = 2sin(x) + e^(-x)' }).code;
  assert.ok(xy.includes('{$x$}') && xy.includes('{$y$}'), 'x and y unchanged');
});

test('geometry: curves, shading along a curve, measurement lines, units', () => {
  const sc = parseScene({
    settings: { unit: 'm', lengthDecimals: 0 },
    points: [
      { id: 'A', name: 'A', x: 0, y: 0 },
      { id: 'B', name: 'B', x: 16, y: 0 },
      { id: 'C', name: 'C', x: 16, y: 7 },
      { id: 'D', name: 'D', x: 0, y: 3 },
      { id: 'M', name: 'M', x: 8, y: 4 },
      { id: 'P', name: 'P', x: 0, y: 0, hidden: true, dep: { kind: 'offset', p: 'A', a: 'A', b: 'B', d: -1.5 } },
      { id: 'Q', name: 'Q', x: 0, y: 0, hidden: true, dep: { kind: 'offset', p: 'B', a: 'A', b: 'B', d: -1.5 } },
    ],
    items: [
      { id: 'c', type: 'curve', pts: ['D', 'M', 'C'], dirs: [null, null, 0] },
      { id: 'g', type: 'polygon', pts: ['A', 'B', 'C', 'D'], fill: 'dots' },
      { id: 'm', type: 'segment', a: 'P', b: 'Q', label: null, gap: true, bars: true, tip: 'both', style: 'dashed' },
    ],
  });
  assert.deepEqual([sc.points[5].x, sc.points[5].y], [0, -1.5], 'a measurement end set 1.5 cm below');
  const { code, warnings } = sceneToTikz(sc);
  assert.deepEqual(warnings, []);
  assert.ok(code.includes('\\coordinate (P) at ($(A)!-1.5cm!90:(B)$);') && code.includes('\\coordinate (Q) at ($(B)!-1.5cm!-90:(A)$);'));
  assert.ok(/\(D\) \.\. controls \([\d.,]+\) and \([\d.,]+\) \.\. \(M\) \.\. controls \([\d.,]+\) and \(([\d.]+),7\) \.\. \(C\)/.test(code), 'curve through D, M, C, level at C');
  assert.ok(code.includes('angle=45]}] (A) -- (B) -- (C) .. controls'), 'shading follows the curve from C back to D');
  assert.ok(code.includes('-- (7.') && code.includes('(8.') && code.includes('-- (Q);'), 'a gap in the measurement line');
  assert.ok(code.includes('(0,-1.35) -- (0,-1.65)'), 'bars across the ends');
  assert.ok(code.includes('{$16\\ \\mathrm{m}$}'), 'measured length with units');
});

test('geometry: scale shrinks the drawing, not its text or marks', () => {
  const sc = parseScene({
    settings: { unit: 'm', lengthDecimals: 0, scale: 0.5 },
    points: [
      { id: 'A', name: 'A', x: 0, y: 0 },
      { id: 'B', name: 'B', x: 16, y: 0 },
      { id: 'P', name: 'P', x: 0, y: 0, hidden: true, dep: { kind: 'offset', p: 'A', a: 'A', b: 'B', d: -1 } },
      { id: 'Q', name: 'Q', x: 0, y: 0, hidden: true, dep: { kind: 'offset', p: 'B', a: 'A', b: 'B', d: -1 } },
    ],
    items: [
      { id: 's', type: 'segment', a: 'A', b: 'B', label: null },
      { id: 'm', type: 'segment', a: 'P', b: 'Q', label: null, gap: true, bars: true, tip: 'both' },
      { id: 't', type: 'text', x: 8, y: 2, text: 'Hi' },
    ],
  });
  const { code } = sceneToTikz(sc);
  assert.ok(code.includes('\\coordinate (B) at (8,0);'), 'positions halved');
  assert.ok(code.includes('\\coordinate (P) at ($(A)!-1cm!90:(B)$);'), 'stand-off stays 1 cm');
  assert.ok(code.includes('(0,-0.85) -- (0,-1.15)'), 'bars stay 0.3 cm long');
  assert.ok(code.includes('{$16\\ \\mathrm{m}$}'), 'lengths in the drawing\'s units');
  assert.ok(code.includes('at (4,1) {Hi}'), 'text moves with the drawing');
  assert.equal(sc.points[1].x, 16, 'the drawing itself is unchanged');
  const edited = code.replace('\\coordinate (B) at (8,0);', '\\coordinate (B) at (9,0);');
  const next = geometry.onCodeEdit({ scene: JSON.stringify(sc) }, edited);
  assert.ok(next.values.scene.includes('"x":18'), 'hand-edited page coordinates come back at the drawing\'s scale');
});

test('gallery: every entry generates cleanly and has its image', () => {
  const modules = { realgraph, function: fn, sketch, blank, normal, scatter, slopefield, geometry, network, probtree };
  const ids = new Set();
  for (const e of GALLERY) {
    assert.ok(!ids.has(e.id), `duplicate gallery id ${e.id}`);
    ids.add(e.id);
    const m = modules[e.type];
    assert.ok(m, `${e.id}: unknown type ${e.type}`);
    const { warnings } = m.generate({ ...defaultValues(m.schema), ...e.values });
    assert.deepEqual(warnings, [], e.id);
    assert.ok(existsSync(new URL(`../gallery/${e.id}.svg`, import.meta.url)), `gallery/${e.id}.svg missing (run tools/build-gallery.mjs)`);
  }
});

test('gallery.html versions are up to date', () => {
  const html = readFileSync(new URL('../gallery.html', import.meta.url), 'utf8');
  assert.equal(html, buildIndex(html));
});

test('index.html versions are up to date (run: node tools/stamp-versions.mjs)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html, buildIndex(html));
});

console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
