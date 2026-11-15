// SPDX-License-Identifier: CC0-1.0
// Generates example diagrams and compiles them with a local pdflatex
// (if installed) to check the TikZ is valid. Output goes to tests/out/.
// Run: node tests/compile-examples.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defaultValues } from '../js/core/formBuilder.js';
import { toStandaloneDocument } from '../js/core/tikzDocument.js';
import fn from '../js/diagrams/function.js';
import sketch from '../js/diagrams/sketch.js';
import normal from '../js/diagrams/normal.js';
import blank from '../js/diagrams/blank.js';
import scatter from '../js/diagrams/scatter.js';
import slopefield from '../js/diagrams/slopefield.js';
import geometry from '../js/diagrams/geometry.js';
import probtree from '../js/diagrams/probtree.js';
import realgraph from '../js/diagrams/realgraph.js';
import network, { DEFAULT_NETWORK } from '../js/diagrams/network.js';
import solids from '../js/diagrams/solids.js';
import complex from '../js/diagrams/complex.js';
import dotplot from '../js/diagrams/dotplot.js';
import boxplot from '../js/diagrams/boxplot.js';
import { parseScene as parseNet } from '../js/geometry/scene.js';
import { applyEdgeList } from '../js/geometry/edgeList.js';
import { GALLERY } from '../js/galleryEntries.js';

const base = defaultValues(fn.schema);
const sbase = defaultValues(sketch.schema);
const nbase = defaultValues(normal.schema);
const examples = {
  'cubic-default': {},
  'cubic-all-labels': {
    graphs: 'y = -1/2(x+2)(x-1/2)(x-3)^2', labelY: true, tpLabel: 'coords', pointDots: true, showEquation: true,
  },
  'cubic-axes': { tpLabel: 'axes', labelY: true, yLabelFormat: 'coords' },
  'quartic-small': { graphs: 'y = -x^4 + 5x^2 - 4', fontSize: '\\small' },
  'trig-coords': { graphs: 'y = 2sin(x)', plotMethod: 'coordinates', windowMode: 'manual', xmin: -7, xmax: 7, ymin: -3, ymax: 3 },
  'scale-ticks': { labelY: true, yTick: true, xScaleTicks: true, yScaleTicks: true },
  'scale-ticks-steps': { yTick: true, xScaleTicks: true, xStep: 0.5, xScaleNumbers: false, yScaleTicks: true, yStep: 2 },
  'near-origin-x': { graphs: 'y = -(x+0.3)^2 + 4', tpLabel: 'axes' },
  'custom-ticks': { xCustomTicks: '3, -2, 5/2:a', yCustomTicks: '12, 20, -10:k', labelY: true },
  'curve-points': { curvePoints: '2:P, -3, 1/2:Q', curvePointLabel: 'nameCoords' },
  'curve-points-axes': { curvePoints: '2:P, -3', curvePointLabel: 'axes' },
  'grid-range': { graphs: 'y = 2x^3 - 5.3x^2 + 3.35x; from 0 to 1.43', leftEnd: 'plain', rightEnd: 'plain', labelX: false, xCustomTicks: '1, 1.43:a', yCustomTicks: '1',
    showGrid: true, gridXStep: 0.25, gridYStep: 0.25, gridXmin: 0, gridXmax: 1.5, gridYmin: -0.25, gridYmax: 1, gridShade: 'black', windowMode: 'manual', xmin: -0.1, xmax: 1.65, ymin: -0.38, ymax: 1.2, equalScale: true, width: 7.5 },
  'line-and-parabola': { graphs: 'y = -(x+3)(x-4)\ny = 6 - 3x; dashed; label', extraDots: true, extraCrossCoords: true, extraIntercepts: true },
  'y-squared': { graphs: 'y^2 = x(x+2)(x-5)\ny^2 = 4 - x^2; dashed', notToScale: true },
  'domain-dots': { graphs: 'y = x^2 - 1, -2 <= x < 3' },
  'pw-pdf': { graphs: '{ x/4, 0 <= x <= 2sqrt(2); 0, otherwise }; thick', dotSize: '2pt', xCustomTicks: '2' },
  'pw-hybrid': { graphs: '{\n x^2, x < 1\n 2 - x, 1 <= x < 3\n 3, x = 2\n -1, x >= 3\n}' },
  'pw-reciprocal': { graphs: '{ 1/x + 1, x > 0; -x/2 + 1, x <= 0 }', asymptotes: 'x = 0, y = 1', asymptoteLabel: 'equation', windowMode: 'manual', xmin: -3, xmax: 4, ymin: -1, ymax: 5 },
  'pw-shaded': { graphs: '{ 3x^2/8, 0 <= x <= 2; 0, otherwise }', shade: '1 to 2', xCustomTicks: '1' },
  'pw-step': { graphs: '{ 1, 0 <= x < 1; 2, 1 <= x < 2; 3, 2 <= x < 3 }', guideLines: true },
};
const sketchExamples = {
  'sketch-default': {},
  'sketch-custom': { points: '-3.5,-6\n-3,0 : a\n-1,4\n0,3\n1.5,0 : b\n2.5,-2\n3.2,4', labelY: true },
  'sketch-gradients': { points: '0, -1.24\n2, -2.35, 0\n4.13, 0, 2.5\n10.3, 4.9, 0.05', leftEnd: 'plain', pointDots: true, labelX: false, asymptotes: 'y = 5 from 0 to 10.6' },
};

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
let failures = 0;
const jobs = [
  ...Object.entries(examples).map(([name, o]) => [name, fn.generate({ ...base, ...o })]),
  ...Object.entries(sketchExamples).map(([name, o]) => [name, sketch.generate({ ...sbase, ...o })]),
  ['normal-tails', normal.generate(nbase)],
  ['normal-real', normal.generate({ ...nbase, labelMode: 'real', mean: '50', sd: '10', regions: 'x > 62\n35 < x < 45', areaLabels: 'prob', shadeStyle: 'gray!20' })],
  ['normal-empirical', normal.generate({ ...nbase, labelMode: 'symbolic', regions: '-1 < z < 1', areaLabels: 'percent', empirical: 'both' })],
  ['scatter-default', scatter.generate({ ...defaultValues(scatter.schema), showEquation: true, showR: true })],
  ['scatter-typed-crosses', scatter.generate({ ...defaultValues(scatter.schema), line: 'typed', lineEquation: '0.5x + 3', pointStyle: 'cross', axisBreak: 'off', showGrid: false })],
  ['slopefield-curves', slopefield.generate({ ...defaultValues(slopefield.schema), solutions: 'dashed', isoclines: '0, 1', labelIsoclines: true, xScaleTicks: true, yScaleTicks: true })],
  ['slopefield-arrows', slopefield.generate({ ...defaultValues(slopefield.schema), equation: 'xy/4', arrows: true, skipAxes: true })],
  ['geometry-default', geometry.generate(defaultValues(geometry.schema))],
  ...['geometry-vectors-sum-zero', 'geometry-bearings', 'geometry-grass', 'geometry-circle-triangle', 'geometry-bearing-legs', 'geometry-semicircle', 'geometry-reflection-3d', 'geometry-chord-diameter', 'geometry-rotation-angles'].map((id) => [id, geometry.generate(GALLERY.find((e) => e.id === id).values)]),
  ['geometry-marks', geometry.generate({ scene: JSON.stringify({ points: [{ id: 'P', name: 'P', x: 0, y: 0 }, { id: 'Q', name: 'Q', x: 4, y: 0 }, { id: 'R', name: 'R', x: 5, y: 3 }, { id: 'S', name: 'S', x: 1, y: 3 }], items: [{ id: 'p', type: 'polygon', pts: ['P', 'Q', 'R', 'S'], fill: 'gray!15' }, { id: 'a', type: 'segment', a: 'P', b: 'Q', arrows: 2, ticks: 1 }, { id: 'b', type: 'segment', a: 'S', b: 'R', arrows: 2, ticks: 1 }, { id: 'c', type: 'segment', a: 'Q', b: 'R', ticks: 2 }, { id: 'd', type: 'segment', a: 'P', b: 'S', ticks: 2 }, { id: 'e', type: 'circle', c: 'P', p: 'Q', style: 'dotted' }, { id: 'f', type: 'arc', c: 'R', a: 'Q', b: 'S' }, { id: 'g', type: 'angle', v: 'Q', a: 'R', b: 'P', arcs: 2 }, { id: 'h', type: 'text', x: 2.5, y: -1, text: 'parallelogram' }] }) })],
  ['geometry-constructed', geometry.generate({ scene: JSON.stringify({ points: [{ id: 'a', name: 'A', x: 0, y: 0 }, { id: 'b', name: 'B', x: 7, y: 0 }, { id: 'c', name: 'C', x: 2, y: 4 }, { id: 'm', name: 'M', x: 0, y: 0, dep: { kind: 'mid', a: 'a', b: 'b' } }, { id: 'h', name: 'H', x: 0, y: 0, dep: { kind: 'foot', p: 'c', a: 'a', b: 'b' } }], items: [{ id: 'p', type: 'polygon', pts: ['a', 'b', 'c'], fill: 'none' }, { id: 's1', type: 'segment', a: 'a', b: 'b', label: null }, { id: 's2', type: 'segment', a: 'b', b: 'c', label: null }, { id: 's3', type: 'segment', a: 'c', b: 'a', label: null }, { id: 's4', type: 'segment', a: 'c', b: 'h', style: 'dashed', label: null }, { id: 's5', type: 'segment', a: 'c', b: 'm', label: '' }, { id: 'r', type: 'right', v: 'h', a: 'b', b: 'c' }, { id: 't1', type: 'ticks', a: 'a', b: 'm', ticks: 1 }, { id: 't2', type: 'ticks', a: 'm', b: 'b', ticks: 1 }] }) })],
  ['probtree-uniform', probtree.generate({ ...defaultValues(probtree.schema), ...GALLERY.find((e) => e.id === 'probtree-uniform').values })],
  ['probtree-counters', probtree.generate({ ...defaultValues(probtree.schema), input: 'outline', outline: 'Red : 3/7\n> Red : 2/6\n> Blue : ?\nBlue : 4/7\n> Red : ?\n> Blue : 3/6', headings: 'First counter; Second counter', outcomes: 'both' })],
  ['probtree-lines', probtree.generate({ ...defaultValues(probtree.schema), stages: 'H : p; T : ?\nH : ?; T : 1-p', blankStyle: 'line', outcomes: 'probs' })],
  ['network-default', network.generate({ scene: JSON.stringify(DEFAULT_NETWORK) })],
  ['network-features', (() => {
    let k = 0;
    const sc = applyEdgeList(parseNet(JSON.stringify(DEFAULT_NETWORK)), 'A-B 3\nA-B 5\nA->C 4\nC-C 2\nB->B\nG-E\nE->D 7', (p) => `${p}${++k}`);
    return network.generate({ scene: JSON.stringify(sc) });
  })()],
  ['solids-cylinder-none', solids.generate({ ...defaultValues(solids.schema), solid: 'cylinder', hidden: 'none', ends: 'both', sLabel: 'l' })],
  ['solids-cylinder-dashed', solids.generate({ ...defaultValues(solids.schema), solid: 'cylinder', hidden: 'dashed', ends: 'both', sLabel: 'l' })],
  ['solids-cone-none', solids.generate({ ...defaultValues(solids.schema), solid: 'cone', hidden: 'none', ends: 'both', sLabel: 'l' })],
  ['solids-cone-dashed', solids.generate({ ...defaultValues(solids.schema), solid: 'cone', hidden: 'dashed', ends: 'both', sLabel: 'l' })],
  ['solids-sphere-none', solids.generate({ ...defaultValues(solids.schema), solid: 'sphere', hidden: 'none', ends: 'both', sLabel: 'l' })],
  ['solids-sphere-dashed', solids.generate({ ...defaultValues(solids.schema), solid: 'sphere', hidden: 'dashed', ends: 'both', sLabel: 'l' })],
  ['solids-hemisphere-none', solids.generate({ ...defaultValues(solids.schema), solid: 'hemisphere', hidden: 'none', ends: 'both', sLabel: 'l' })],
  ['solids-hemisphere-dashed', solids.generate({ ...defaultValues(solids.schema), solid: 'hemisphere', hidden: 'dashed', ends: 'both', sLabel: 'l' })],
  ['solids-cuboid-none', solids.generate({ ...defaultValues(solids.schema), solid: 'cuboid', hidden: 'none', ends: 'both', sLabel: 'l' })],
  ['solids-cuboid-dashed', solids.generate({ ...defaultValues(solids.schema), solid: 'cuboid', hidden: 'dashed', ends: 'both', sLabel: 'l' })],
  ['solids-prism-none', solids.generate({ ...defaultValues(solids.schema), solid: 'prism', hidden: 'none', ends: 'both', sLabel: 'l' })],
  ['solids-prism-dashed', solids.generate({ ...defaultValues(solids.schema), solid: 'prism', hidden: 'dashed', ends: 'both', sLabel: 'l' })],
  ['solids-pyramid-none', solids.generate({ ...defaultValues(solids.schema), solid: 'pyramid', hidden: 'none', ends: 'both', sLabel: 'l' })],
  ['solids-pyramid-dashed', solids.generate({ ...defaultValues(solids.schema), solid: 'pyramid', hidden: 'dashed', ends: 'both', sLabel: 'l' })],
  ['solids-pyramid', solids.generate({ ...defaultValues(solids.schema), ...GALLERY.find((e) => e.id === 'solids-pyramid').values })],
  ['solids-sphere-vectors', solids.generate({ ...defaultValues(solids.schema), ...GALLERY.find((e) => e.id === 'solids-sphere-vectors').values })],
  ['solids-sphere-vectors-bold', solids.generate({ ...defaultValues(solids.schema), solid: 'sphere', equator: 'full', vecStyle: 'bold', vectors: 'u: 10\nw: 100\nright u w\nangle u w : \\alpha' })],
  ['solids-face-angle', solids.generate({ ...defaultValues(solids.schema), solid: 'pyramid', angle: 'face', names: 'A B C D M O N', hidden: 'dashed' })],
  ['solids-cuboid-names', solids.generate({ ...defaultValues(solids.schema), solid: 'cuboid', names: 'A B C D E F G H', hidden: 'dashed' })],
  ['solids-prism-names', solids.generate({ ...defaultValues(solids.schema), solid: 'prism', names: 'A B C D E F', hidden: 'dashed' })],
  ['solids-bowl', solids.generate({ ...defaultValues(solids.schema), solid: 'hemisphere' })],
  ['dotplot-default', dotplot.generate(defaultValues(dotplot.schema))],
  ['dotplot-styles', dotplot.generate({ ...defaultValues(dotplot.schema), data: '2.5:3 3 3.5:2 5', dotStyle: 'open', axisTitle: 'Time (h)', step: '0.5', numbers: 'second', axisArrow: 'latex' })],
  ['dotplot-crosses', dotplot.generate({ ...defaultValues(dotplot.schema), dotStyle: 'cross', numbers: 'none' })],
  ['boxplot-default', boxplot.generate(defaultValues(boxplot.schema))],
  ['boxplot-parallel', boxplot.generate({ ...defaultValues(boxplot.schema), ...GALLERY.find((e) => e.id === 'boxplot-parallel').values })],
  ['boxplot-bare', boxplot.generate({ ...defaultValues(boxplot.schema), data: 'Group A: 1, 2, 3, 4, 8; 0.2', line: 'none', caps: 'none', outlierStyle: 'cross' })],
  ...['realgraph-linear', 'realgraph-exponential'].map((id) => [id, realgraph.generate({ ...defaultValues(realgraph.schema), ...GALLERY.find((e) => e.id === id).values })]),
  ['scatter-sketch', scatter.generate({ ...defaultValues(scatter.schema), ...GALLERY.find((e) => e.id === 'scatter-sketch').values })],
  ['complex-disc', complex.generate({ ...defaultValues(complex.schema), conditions: '|z+2+3i| <= 1\nIm(z) <= Re(z)' , scales: false })],
  ['complex-annulus', complex.generate({ ...defaultValues(complex.schema), conditions: '|z - 1| > 2\nRe(z) >= -2\n|z-1| <= 3' , scales: true, xLabel: 'Re', yLabel: 'Im' })],
  ['complex-bisector', complex.generate({ ...defaultValues(complex.schema), conditions: '|z - 1| <= |z + i|\n|z| < 3' , originLabel: true })],
  ['complex-sector', complex.generate({ ...defaultValues(complex.schema), conditions: '0 <= arg(z - 1) < 3pi/4\n|z - 1| <= 2' , scales: true })],
  ['complex-locus', complex.generate({ ...defaultValues(complex.schema), conditions: 'arg(z+1) = pi/3\n|z - 2i| = 1\nRe(z) >= 0' , scales: false })],
  ['complex-labels', complex.generate({ ...defaultValues(complex.schema), conditions: '\\pi/4 \\le \\operatorname{Arg}(z - i) \\le 3\\pi/4\n|z - i| \\le 2', labelPoints: true, labelAngles: true, points: '2i : P\n1 + i' })],
  ['complex-locus-dashed', complex.generate({ ...defaultValues(complex.schema), conditions: '|z - 1| = 2\narg(z) >= 0', labelPoints: true })],
  ['complex-tangent', complex.generate({ ...defaultValues(complex.schema), ...GALLERY.find((e) => e.id === 'complex-tangent').values })],
  ['complex-spiral', complex.generate({ ...defaultValues(complex.schema), ...GALLERY.find((e) => e.id === 'complex-spiral').values })],
  ['complex-vectors', complex.generate({ ...defaultValues(complex.schema), conditions: '|z| <= 2', points: 'w = 1 + i @ above\n0 -> w\nw -- 2 -- cycle dashed\n-1 + 1/2i : P' })],
  ['realgraph-loan', realgraph.generate(defaultValues(realgraph.schema))],
  ['realgraph-travel', realgraph.generate({ ...defaultValues(realgraph.schema), curves: '0,0 -- 2,40 -- 3,40 -- 5,0; label above right: Car\n0,10 1,15 2,30* | 2,35o 4,38; dashed; label: Bus\n1,5:P', xTitle: 'Time (hours)', yTitle: 'Distance from home (km)', yTitlePos: 'top', xmax: 6, ymax: 45, xStep: 1, yStep: 10, yNumbers: '', gridX: 0.5, gridY: 5, gridColour: 'grey', origin: 'both' })],
  ['blank-trig', blank.generate({ ...defaultValues(blank.schema), xPreset: 'radians', xCustomTicks: '', originLabel: true })],
  ['blank-degrees-grid', blank.generate({ ...defaultValues(blank.schema), xPreset: 'degrees', yCustomTicks: '1, -1', showGrid: true })],
];
for (const [name, { code, warnings }] of jobs) {
  const texPath = new URL(`./out/${name}.tex`, import.meta.url).pathname;
  writeFileSync(texPath, toStandaloneDocument(code));
  if (warnings.length) console.log(`${name}: warnings: ${warnings.join(' | ')}`);
  try {
    execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', `${name}.tex`], {
      cwd: new URL('./out/', import.meta.url).pathname,
      stdio: 'pipe',
    });
    console.log(`${name}: OK`);
  } catch (e) {
    failures++;
    const log = String(e.stdout).split('\n').filter((l) => l.startsWith('!') || /^l\.\d+/.test(l));
    console.log(`${name}: FAILED\n  ${log.slice(0, 6).join('\n  ')}`);
  }
}
process.exitCode = failures ? 1 : 0;
