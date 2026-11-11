// SPDX-License-Identifier: CC0-1.0
// Builds gallery.html from js/galleryEntries.js: one card per diagram, with
// its saved image (gallery/<id>.svg) and a link that opens it in the editor.

import { GALLERY, GALLERY_GROUPS } from './galleryEntries.js';
import { encodeShareHash } from './core/shareLink.js';

const root = document.getElementById('gallery');

for (const group of GALLERY_GROUPS) {
  const entries = GALLERY.filter((e) => e.type === group.type);
  if (!entries.length) continue;
  const section = document.createElement('section');
  section.className = 'gallery-group';
  const h = document.createElement('h2');
  h.textContent = group.heading;
  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  section.append(h, grid);

  for (const e of entries) {
    const href = `./${encodeShareHash({ type: e.type, values: e.values })}`;
    const card = document.createElement('article');
    card.className = 'gallery-card';

    const pic = document.createElement('a');
    pic.className = 'gallery-image';
    pic.href = href;
    pic.setAttribute('aria-label', `Open "${e.title}" in the editor`);
    const img = document.createElement('img');
    img.src = `gallery/${e.id}.svg`;
    img.alt = `${e.title}: ${e.description}`;
    img.loading = 'lazy';
    pic.append(img);

    const body = document.createElement('div');
    body.className = 'gallery-body';
    const title = document.createElement('h3');
    title.textContent = e.title;
    const desc = document.createElement('p');
    desc.textContent = e.description;
    const open = document.createElement('a');
    open.className = 'button';
    open.href = href;
    open.textContent = 'Open in editor';
    body.append(title, desc, open);

    card.append(pic, body);
    grid.append(card);
  }
  root.append(section);
}
