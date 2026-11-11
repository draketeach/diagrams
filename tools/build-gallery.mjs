// SPDX-License-Identifier: CC0-1.0
// Makes the gallery images (gallery/<id>.svg) from js/galleryEntries.js by
// opening each diagram in the real site, in a headless browser, and saving the
// same SVG that "Download SVG" gives.
//
// Needs Playwright and Chrome, and the site served locally:
//   python -m http.server 8765            (in this folder, in another window)
//   node tools/build-gallery.mjs [http://localhost:8765/] [entry-id …]
// Environment: PLAYWRIGHT_MODULE (path to playwright's index.mjs, if it isn't
// installed as "playwright"), CHROME (path to a Chrome executable).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GALLERY } from '../js/galleryEntries.js';
import { encodeShareHash } from '../js/core/shareLink.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const base = (args[0] && /^https?:/.test(args[0]) ? args.shift() : 'http://localhost:8765/').replace(/\/?$/, '/');
const only = new Set(args);
const outDir = fileURLToPath(new URL('../gallery/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
let failures = 0;
for (const e of GALLERY) {
  if (only.size && !only.has(e.id)) continue;
  // the query string forces a fresh page load for every entry
  await page.goto(`${base}index.html?gallery=${e.id}${encodeShareHash({ type: e.type, values: e.values })}`);
  await page.waitForFunction(
    () => /Rendered|failed|rror/i.test(document.querySelector('#status').textContent) &&
      !document.querySelector('#preview').classList.contains('is-busy') &&
      document.querySelector('#preview svg'),
    null,
    { timeout: 120000 }
  );
  const status = await page.textContent('#status');
  const warnings = (await page.evaluate(() => document.querySelector('#messages')?.textContent || '')).trim();
  if (!/Rendered/.test(status)) {
    failures++;
    console.log(`${e.id}: FAILED (${status.trim()})`);
    continue;
  }
  const svg = await page.evaluate(async () => {
    const { svgToSvgBlob } = await import('./js/core/exporter.js');
    await document.fonts.ready;
    const { blob, failedFonts } = await svgToSvgBlob(document.querySelector('#preview svg'), { transparent: true });
    if (failedFonts?.length) throw new Error(`fonts not embedded: ${failedFonts.join(', ')}`);
    return blob.text();
  });
  writeFileSync(`${outDir}${e.id}.svg`, svg);
  console.log(`${e.id}: ${Math.round(svg.length / 1024)} KB${warnings ? `  (warnings: ${warnings})` : ''}`);
}
await browser.close();
process.exitCode = failures ? 1 : 0;
