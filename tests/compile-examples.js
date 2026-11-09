// SPDX-License-Identifier: CC0-1.0
// Generates example diagrams and compiles them with a local pdflatex
// (if installed) to check the TikZ is valid. Output goes to tests/out/.
// Run: node tests/compile-examples.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defaultValues } from '../js/core/formBuilder.js';
import { toStandaloneDocument } from '../js/core/tikzDocument.js';
import polynomial from '../js/diagrams/polynomial.js';
import piecewise from '../js/diagrams/piecewise.js';
import normal from '../js/diagrams/normal.js';
import blank from '../js/diagrams/blank.js';

const base = defaultValues(polynomial.schema);
const pbase = defaultValues(piecewise.schema);
const nbase = defaultValues(normal.schema);
const examples = {
  'roots-default': { mode: 'roots' },
  'roots-all-labels': {
    mode: 'roots', roots: '-2, 1/2, 3, 3', leading: '-1/2', labelY: true, tpLabel: 'coords',
    tpDots: true, interceptDots: true, showEquation: true,
  },
  'expression-axes': { mode: 'expression', expression: 'x^3 - 7x + 6', tpLabel: 'axes', labelY: true, yLabelFormat: 'coords' },
  'coefficients-quartic': { mode: 'coefficients', coefficients: '-1, 0, 5, 0, -4', fontSize: '\\small' },
  'expression-trig-coords': { mode: 'expression', expression: '2sin(x)', plotMethod: 'coordinates', windowMode: 'manual', xmin: -7, xmax: 7, ymin: -3, ymax: 3 },
  'scale-ticks': { mode: 'roots', labelY: true, yTick: true, xScaleTicks: true, yScaleTicks: true },
  'scale-ticks-steps': { mode: 'expression', expression: 'x^3 - 7x + 6', yTick: true, xScaleTicks: true, xStep: 0.5, xScaleNumbers: false, yScaleTicks: true, yStep: 2 },
  'near-origin-x': { mode: 'expression', expression: '-(x+0.3)^2 + 4', tpLabel: 'axes' },
  'custom-ticks': { mode: 'roots', xCustomTicks: '3, -2, 5/2:a', yCustomTicks: '12, 20, -10:k', labelY: true },
  'curve-points': { mode: 'roots', curvePoints: '2:P, -3, 1/2:Q', curvePointLabel: 'nameCoords' },
  'curve-points-axes': { mode: 'roots', curvePoints: '2:P, -3', curvePointLabel: 'axes' },
  'grid-range': { mode: 'expression', expression: '2x^3 - 5.3x^2 + 3.35x', domainFrom: '0', domainTo: '1.43', labelX: false, xCustomTicks: '1, 1.43:a', yCustomTicks: '1',
    showGrid: true, gridXStep: 0.25, gridYStep: 0.25, gridXmin: 0, gridXmax: 1.5, gridYmin: -0.25, gridYmax: 1, gridShade: 'black', windowMode: 'manual', xmin: -0.1, xmax: 1.65, ymin: -0.38, ymax: 1.2, equalScale: true, width: 7.5 },
  'sketch-default': { mode: 'sketch' },
  'sketch-custom': { mode: 'sketch', points: '-3.5,-6\n-3,0,a\n-1,4\n0,3\n1.5,0,b\n2.5,-2\n3.2,4', labelY: true },
};

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
let failures = 0;
const pwExamples = {
  'pw-pdf': {},
  'pw-hybrid': { pieces: 'x^2, x < 1\n2 - x, 1 <= x < 3\n3, x = 2\n-1, x >= 3', xCustomTicks: '' },
  'pw-reciprocal': { pieces: '1/x + 1, x > 0\n-x/2 + 1, x <= 0', asymptotes: 'x = 0, y = 1', asymptoteLabel: 'equation', windowMode: 'manual', xmin: -3, xmax: 4, ymin: -1, ymax: 5 },
  'pw-shaded': { pieces: '3x^2/8, 0 <= x <= 2\n0, otherwise', shade: '1 to 2', xCustomTicks: '1' },
  'pw-step': { pieces: '1, 0 <= x < 1\n2, 1 <= x < 2\n3, 2 <= x < 3', xCustomTicks: '', guideLines: true },
};
const jobs = [
  ...Object.entries(examples).map(([name, o]) => [name, polynomial.generate({ ...base, ...o })]),
  ...Object.entries(pwExamples).map(([name, o]) => [name, piecewise.generate({ ...pbase, ...o })]),
  ['normal-tails', normal.generate(nbase)],
  ['normal-real', normal.generate({ ...nbase, labelMode: 'real', mean: '50', sd: '10', regions: 'x > 62\n35 < x < 45', areaLabels: 'prob', shadeStyle: 'gray!20' })],
  ['normal-empirical', normal.generate({ ...nbase, labelMode: 'symbolic', regions: '-1 < z < 1', areaLabels: 'percent', empirical: 'both' })],
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
