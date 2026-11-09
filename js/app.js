// SPDX-License-Identifier: CC0-1.0
// Page wiring: diagram picker -> options form -> code box -> preview -> export.
// All of the real work lives in js/core (shared) and js/diagrams (per type).

import './diagrams/index.js';
import { diagramsByCategory, getDiagram, listDiagrams } from './core/registry.js';
import { buildForm, defaultValues } from './core/formBuilder.js';
import { encodeShareHash, decodeShareHash, changedValues } from './core/shareLink.js';
import { createCodeEditor } from './core/codeEditor.js';
import { renderTikz } from './core/tikzRenderer.js';
import { ensureTikzJax, registerServiceWorker, engineCacheStatus } from './core/tikzjaxLoader.js';
import { toStandaloneDocument, toPictureOnly } from './core/tikzDocument.js';
import {
  svgToPngBlob,
  svgToSvgBlob,
  downloadBlob,
  downloadText,
  copyPngToClipboard,
  copyText,
} from './core/exporter.js';
import { EXPORT_DEFAULTS } from './config.js';

const $ = (id) => document.getElementById(id);

const els = {
  type: $('diagram-type'),
  typeHelp: $('diagram-help'),
  form: $('options-form'),
  generate: $('btn-generate'),
  reset: $('btn-reset'),
  copyLink: $('btn-copy-link'),
  code: $('code'),
  render: $('btn-render'),
  copyPicture: $('btn-copy-picture'),
  copyStandalone: $('btn-copy-standalone'),
  downloadTex: $('btn-download-tex'),
  messages: $('messages'),
  preview: $('preview'),
  status: $('status'),
  zoom: $('zoom'),
  dpi: $('png-dpi'),
  transparent: $('png-transparent'),
  downloadPng: $('btn-download-png'),
  copyPng: $('btn-copy-png'),
  downloadSvg: $('btn-download-svg'),
  filename: $('filename'),
  progress: $('load-progress'),
  offlineNote: $('offline-note'),
};

let current = null; // current diagram module
let form = null;
let currentSvg = null;
let codeDirty = false;

const editor = createCodeEditor(els.code, { onRun: render });
els.code.addEventListener('input', () => {
  codeDirty = true;
});

// ---------------------------------------------------------------- messages

function showMessages(list, kind = 'warning') {
  els.messages.replaceChildren(
    ...list.map((m) => {
      const div = document.createElement('div');
      div.className = `msg msg-${kind}`;
      div.textContent = m;
      return div;
    })
  );
}

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
}

function toast(text) {
  setStatus(text, 'ok');
}

// ---------------------------------------------------------------- diagram type

function populateTypes() {
  els.type.replaceChildren();
  for (const [category, items] of diagramsByCategory()) {
    const group = document.createElement('optgroup');
    group.label = category;
    for (const d of items) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      group.append(opt);
    }
    els.type.append(group);
  }
}

/**
 * Show a diagram type. `restore` (from a share link) sets the options and,
 * if the link included hand-edited code, puts that code in the code box.
 */
function selectType(id, restore = null) {
  current = getDiagram(id) ?? listDiagrams()[0];
  els.type.value = current.id;
  els.typeHelp.textContent = current.description || '';
  form = buildForm(els.form, current.schema);
  els.filename.value = current.id;
  if (restore?.values) form.setValues(restore.values);
  if (restore?.code) {
    editor.setValue(restore.code);
    codeDirty = true;
    showMessages(['This link includes hand-edited TikZ code. "Generate & render" would replace it with code from the options.']);
    render();
  } else {
    codeDirty = false;
    generate();
  }
}

/** Rebuild the diagram described by the page address (#type=…&o=…). */
function restoreFromAddress() {
  let restore = null;
  try {
    restore = decodeShareHash(location.hash);
  } catch (e) {
    showMessages([e.message], 'error');
  }
  if (restore && !getDiagram(restore.type)) {
    showMessages([`This link is for a diagram type ("${restore.type}") this site doesn't have.`], 'error');
    restore = null;
  }
  selectType(restore?.type ?? new URLSearchParams(location.search).get('type'), restore);
}

async function copyShareLink() {
  const values = changedValues(form.getValues(), defaultValues(current.schema));
  const hash = encodeShareHash({ type: current.id, values, code: codeDirty ? editor.getValue() : null });
  const url = `${location.origin}${location.pathname}${hash}`;
  history.replaceState(null, '', hash); // the address bar now matches the link
  try {
    await copyText(url);
    toast(codeDirty ? 'Link copied (includes your edited code)' : 'Link copied');
  } catch (e) {
    showMessages([`Couldn't copy automatically. Here is the link: ${url}`]);
  }
}

// ---------------------------------------------------------------- generate / render

function generate() {
  if (codeDirty && !confirm('Replace your edited code with newly generated code?')) return;
  let result;
  try {
    result = current.generate(form.getValues());
  } catch (e) {
    showMessages([e.message], 'error');
    setStatus('Could not generate code', 'error');
    return;
  }
  editor.setValue(result.code);
  codeDirty = false;
  showMessages(result.warnings || []);
  render();
}

let renderSeq = 0;

async function render() {
  const code = editor.getValue();
  const seq = ++renderSeq;
  setStatus('Rendering with TikZJax…', 'busy');
  els.preview.classList.add('is-busy');
  setExportEnabled(false);
  try {
    // First visit only: download the TeX engine with a progress bar.
    const mb = (b) => (b / 1048576).toFixed(1);
    const downloaded = await ensureTikzJax(({ loaded, total }) => {
      if (seq !== renderSeq) return;
      els.progress.hidden = false;
      els.progress.max = total;
      els.progress.value = loaded;
      setStatus(`Downloading TeX engine (first time only)… ${mb(loaded)} of ${mb(total)} MB (${Math.round((100 * loaded) / total)}%)`, 'busy');
    });
    els.progress.hidden = true;
    if (seq !== renderSeq) return;
    setStatus(downloaded ? 'Running TeX for the first time…' : 'Rendering with TikZJax…', 'busy');
    const { svg, warnings, ms } = await renderTikz(code);
    if (seq !== renderSeq) return;
    currentSvg = svg;
    svg.removeAttribute('style');
    els.preview.replaceChildren(svg);
    applyZoom();
    setExportEnabled(true);
    setStatus(`Rendered in ${(ms / 1000).toFixed(1)} s`, 'ok');
    if (warnings.length) showMessages(warnings);
    updateOfflineNote();
  } catch (e) {
    if (e.cancelled || seq !== renderSeq) return;
    setStatus('Render failed', 'error');
    showMessages([e.message], 'error');
  } finally {
    if (seq === renderSeq) els.preview.classList.remove('is-busy');
  }
}

function applyZoom() {
  if (!currentSvg) return;
  const z = els.zoom.value;
  if (z === 'fit') {
    currentSvg.style.width = '100%';
    currentSvg.style.height = 'auto';
    currentSvg.style.maxHeight = '100%';
  } else {
    const w = parseFloat(currentSvg.getAttribute('width'));
    const h = parseFloat(currentSvg.getAttribute('height'));
    // 1pt = 4/3 px
    currentSvg.style.width = `${(w * 4 * Number(z)) / 3}px`;
    currentSvg.style.height = `${(h * 4 * Number(z)) / 3}px`;
    currentSvg.style.maxHeight = '';
  }
}

// ---------------------------------------------------------------- offline note

const OFFLINE_TEXT = {
  saved: '✓ Saved for offline use on this computer',
  missing: 'TeX engine not saved on this computer yet (downloads on first render)',
  unsupported: "Can't save for offline use in this browser (it may be blocked by settings or private browsing)",
};

async function updateOfflineNote() {
  const state = await engineCacheStatus();
  els.offlineNote.textContent = OFFLINE_TEXT[state];
  els.offlineNote.className = `offline-note ${state}`;
  els.offlineNote.hidden = false;
  els.offlineNote.title =
    state === 'saved'
      ? 'The TeX engine and this site are kept by the browser, so diagrams render without an internet connection.'
      : '';
}

// ---------------------------------------------------------------- export

function setExportEnabled(on) {
  for (const b of [els.downloadPng, els.copyPng, els.downloadSvg]) b.disabled = !on;
}

function baseName() {
  return (els.filename.value || EXPORT_DEFAULTS.filename).replace(/[^\w.-]+/g, '-');
}

function fontWarning(failed) {
  if (failed.length) {
    showMessages(
      [`Couldn't embed the TikZJax fonts (${failed.join(', ')}), so labels in the exported image may use a fallback font.`],
      'warning'
    );
  }
}

async function exportPng() {
  if (!currentSvg) return;
  setStatus('Creating PNG…', 'busy');
  try {
    const { blob, failedFonts, widthPx, heightPx } = await svgToPngBlob(currentSvg, pngOptions());
    downloadBlob(blob, `${baseName()}.png`);
    fontWarning(failedFonts);
    toast(`PNG saved (${widthPx} × ${heightPx} px at ${els.dpi.value} dpi)`);
  } catch (e) {
    setStatus('PNG export failed', 'error');
    showMessages([e.message], 'error');
  }
}

async function copyPng() {
  if (!currentSvg) return;
  setStatus('Copying PNG…', 'busy');
  try {
    let failed = [];
    const promise = svgToPngBlob(currentSvg, pngOptions()).then((r) => {
      failed = r.failedFonts;
      return r.blob;
    });
    await copyPngToClipboard(promise);
    fontWarning(failed);
    toast('PNG copied to the clipboard');
  } catch (e) {
    setStatus('Copy failed', 'error');
    showMessages([e.message], 'error');
  }
}

async function exportSvg() {
  if (!currentSvg) return;
  try {
    const { blob, failedFonts } = await svgToSvgBlob(currentSvg, { transparent: els.transparent.checked });
    downloadBlob(blob, `${baseName()}.svg`);
    fontWarning(failedFonts);
    toast('SVG saved');
  } catch (e) {
    showMessages([e.message], 'error');
  }
}

function pngOptions() {
  return { dpi: Number(els.dpi.value) || EXPORT_DEFAULTS.dpi, transparent: els.transparent.checked };
}

// ---------------------------------------------------------------- events

els.type.addEventListener('change', () => {
  codeDirty = false;
  selectType(els.type.value);
});
els.generate.addEventListener('click', generate);
els.copyLink.addEventListener('click', copyShareLink);
window.addEventListener('hashchange', restoreFromAddress);
els.reset.addEventListener('click', () => {
  form.reset();
  codeDirty = false;
  generate();
});
els.render.addEventListener('click', render);
els.zoom.addEventListener('change', applyZoom);
els.copyPicture.addEventListener('click', async () => {
  await copyText(toPictureOnly(editor.getValue()));
  toast('tikzpicture copied');
});
els.copyStandalone.addEventListener('click', async () => {
  await copyText(toStandaloneDocument(editor.getValue()));
  toast('Standalone LaTeX document copied');
});
els.downloadTex.addEventListener('click', () => {
  downloadText(toStandaloneDocument(editor.getValue()), `${baseName()}.tex`, 'application/x-tex');
});
els.downloadPng.addEventListener('click', exportPng);
els.copyPng.addEventListener('click', copyPng);
els.downloadSvg.addEventListener('click', exportSvg);

els.dpi.value = String(EXPORT_DEFAULTS.dpi);
els.transparent.checked = EXPORT_DEFAULTS.transparent;
registerServiceWorker();
updateOfflineNote();
populateTypes();
restoreFromAddress();
