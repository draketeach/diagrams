// SPDX-License-Identifier: CC0-1.0
// Generates example diagrams and compiles them with a local pdflatex
// (if installed) to check the TikZ is valid. Output goes to tests/out/.
// Run: node tests/compile-examples.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defaultValues } from '../js/core/formBuilder.js';
import { toStandaloneDocument } from '../js/core/tikzDocument.js';
import polynomial from '../js/diagrams/polynomial.js';

const base = defaultValues(polynomial.schema);
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
  'sketch-default': { mode: 'sketch' },
  'sketch-custom': { mode: 'sketch', points: '-3.5,-6\n-3,0,a\n-1,4\n0,3\n1.5,0,b\n2.5,-2\n3.2,4', labelY: true },
};

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
let failures = 0;
for (const [name, opts] of Object.entries(examples)) {
  const { code, warnings } = polynomial.generate({ ...base, ...opts });
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
