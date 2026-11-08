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

// TikZJax displays text with the BaKoMa Computer Modern fonts, which keep
// characters at their TeX positions, but it looks each character up by its
// Unicode value. In the maths-italic font (cmmi10) a few punctuation marks
// sit at a different position from their Unicode value, so the browser
// shows whatever glyph is stored at the Unicode position instead:
//   .  cmmi10 58 -> Unicode 46 holds "▷"
//   ,  cmmi10 59 -> Unicode 44 holds a hook
//   /  cmmi10 61 -> Unicode 47 holds "◁"
// Taking these from the roman font (cmr10), where position = Unicode, fixes
// the display and looks identical in real LaTeX. (The comma keeps its
// punctuation spacing: class 6.) Applied only to what TikZJax renders, so
// copied/downloaded code stays clean.
export const TIKZJAX_FIXES = '\\mathcode`\\.="002E \\mathcode`\\,="602C \\mathcode`\\/="002F';

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
  const source = `${TIKZJAX_FIXES}\n${strip(pre)}\n\\begin{document}\n${strip(body)}\n\\end{document}\n`.replace(/\n\n/, '\n');
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
