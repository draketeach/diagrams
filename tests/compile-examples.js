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
