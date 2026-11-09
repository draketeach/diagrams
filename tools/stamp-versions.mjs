// SPDX-License-Identifier: CC0-1.0
// Stamps content-hash versions onto the site's JS and CSS URLs in index.html.
//
// Why: GitHub Pages' CDN can briefly serve a mix of old and new files right
// after a deploy (e.g. a new app.js with an old module it imports), which
// breaks the page. With a hash in every URL, a changed file has a new URL
// that no cache has seen, so a page always gets one consistent set of files.
//
// How: an import map in index.html maps every js/ module to "?v=<hash>", and
// the app.js <script> and style.css <link> get the same treatment.
//
// Run after changing any JS or CSS:   node tools/stamp-versions.mjs
// (tests/run-tests.js fails if this has been forgotten.)

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const hash = (file) => createHash('sha256').update(readFileSync(join(root, file))).digest('hex').slice(0, 10);

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir)).sort()) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...jsFiles(rel));
    else if (name.endsWith('.js')) out.push(rel);
  }
  return out;
}

export function buildIndex(html) {
  const imports = {};
  for (const f of jsFiles('js')) imports[`./${f}`] = `./${f}?v=${hash(f)}`;
  const map = JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n  ');
  let out = html.replace(
    /<!-- importmap:start -->[\s\S]*?<!-- importmap:end -->/,
    `<!-- importmap:start -->\n  <script type="importmap">\n  ${map}\n  </script>\n  <!-- importmap:end -->`
  );
  out = out.replace(/href="css\/style\.css(\?v=[0-9a-f]+)?"/, `href="css/style.css?v=${hash('css/style.css')}"`);
  out = out.replace(/src="js\/app\.js(\?v=[0-9a-f]+)?"/, `src="js/app.js?v=${hash('js/app.js')}"`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(root, 'index.html');
  const before = readFileSync(file, 'utf8');
  if (!before.includes('<!-- importmap:start -->')) throw new Error('index.html has no importmap markers');
  const after = buildIndex(before);
  writeFileSync(file, after);
  console.log(after === before ? 'index.html already up to date' : 'index.html versions updated');
}
