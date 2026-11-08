// SPDX-License-Identifier: CC0-1.0
// Helpers for turning the code in the code box into the different forms
// we need: TikZJax input, a standalone .tex document, or just the picture.

const TIKZ_BEGIN = /\\begin\s*\{tikzpicture\}/;
const TIKZ_END = /\\end\s*\{tikzpicture\}/;

/**
 * Split code into { preamble, body }.
 * preamble = everything before \begin{document} (or before the first
 * \begin{tikzpicture} when there is no document environment).
 */
export function splitCode(code) {
  let src = code.replace(/\r\n?/g, '\n');
  src = src.replace(/\\end\s*\{document\}[\s\S]*$/, '');
  const docMatch = src.match(/\\begin\s*\{document\}/);
  if (docMatch) {
    return {
      preamble: src.slice(0, docMatch.index),
      body: src.slice(docMatch.index + docMatch[0].length),
    };
  }
  const idx = src.search(TIKZ_BEGIN);
  if (idx > 0) return { preamble: src.slice(0, idx), body: src.slice(idx) };
  return { preamble: '', body: src };
}

function cleanPreamble(preamble) {
  return preamble
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return (
        t &&
        !/^\\documentclass/.test(t) &&
        !/^\\usepackage(\[[^\]]*\])?\{tikz\}/.test(t)
      );
    })
    .join('\n');
}

/** Code suitable for TikZJax (tikz is preloaded; no \documentclass). */
export function toTikzJaxSource(code, { supportsLibraries = false } = {}) {
  const warnings = [];
  const { preamble, body } = splitCode(code);
  const pre = cleanPreamble(preamble);
  for (const line of pre.split('\n')) {
    const t = line.trim();
    if (/^\\usetikzlibrary/.test(t) && !supportsLibraries) {
      warnings.push(`TikZJax may not support "${t}" (no TikZ libraries are bundled). Rendering may fail.`);
    } else if (/^\\usepackage/.test(t)) {
      warnings.push(`TikZJax may not support "${t}". Rendering may fail.`);
    }
  }
  // Blank lines become \par, which can upset TikZ inside a picture.
  const strip = (s) => s.split('\n').filter((l) => l.trim() !== '').join('\n');
  const source = `${strip(pre)}\n\\begin{document}\n${strip(body)}\n\\end{document}\n`.replace(/^\n/, '');
  return { source, warnings };
}

/** A complete, compilable standalone LaTeX document. */
export function toStandaloneDocument(code) {
  const { preamble, body } = splitCode(code);
  const pre = cleanPreamble(preamble);
  return [
    '\\documentclass[border=2pt]{standalone}',
    '\\usepackage{tikz}',
    pre,
    '\\begin{document}',
    body.trim(),
    '\\end{document}',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Just the tikzpicture environment(s) — for pasting into an existing document. */
export function toPictureOnly(code) {
  const { body } = splitCode(code);
  const start = body.search(TIKZ_BEGIN);
  const endMatch = [...body.matchAll(new RegExp(TIKZ_END, 'g'))].pop();
  if (start < 0 || !endMatch) return body.trim();
  return body.slice(start, endMatch.index + endMatch[0].length).trim();
}
