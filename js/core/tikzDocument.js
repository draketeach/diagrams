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
// Unicode value. Some maths characters therefore show the wrong glyph:
//   .  cmmi10 58 -> Unicode 46 holds "▷"
//   ,  cmmi10 59 -> Unicode 44 holds a hook
//   /  cmmi10 61 -> Unicode 47 holds "◁"
//   −  cmsy10 0  -> Unicode U+2212 is missing (BaKoMa stores it at U+00A1),
//                   so the browser substitutes a minus from another font.
// Fixes (TikZJax rendering only, so copied/downloaded code stays clean and
// real LaTeX is unaffected):
//   - take . , / from the roman font (cmr10), where position = Unicode;
//   - draw the minus as a rule sized from the real minus at the current
//     size: advance = the real minus's width; ink from 10.7% to 89.3% of it,
//     centred on the maths axis, 5.1% of the width thick (cmsy10's
//     proportions). It stays a binary operator (\mathbin), so "−3" and
//     "x − 3" are spaced as usual. Plain TeX primitives only (TikZJax's TeX
//     has no e-TeX).
export const TIKZJAX_FIXES = [
  '\\mathcode`\\.="002E \\mathcode`\\,="602C \\mathcode`\\/="002F',
  '\\def\\tikzjaxrule#1#2{\\setbox0\\hbox{$#1\\mathchar"200$}' +
    '\\dimen0=.10714\\wd0 \\dimen2=.78571\\wd0 \\dimen6=.02571\\wd0 ' +
    '\\dimen4=\\fontdimen22#2 2 \\advance\\dimen4 by\\dimen6 ' +
    '\\dimen8=-\\fontdimen22#2 2 \\advance\\dimen8 by\\dimen6 ' +
    '\\hbox{\\kern\\dimen0\\vrule height\\dimen4 depth\\dimen8 width\\dimen2\\kern\\dimen0}}',
  '\\def\\tikzjaxminus{\\mathbin{\\mathchoice{\\tikzjaxrule\\displaystyle\\textfont}{\\tikzjaxrule\\textstyle\\textfont}' +
    '{\\tikzjaxrule\\scriptstyle\\scriptfont}{\\tikzjaxrule\\scriptscriptstyle\\scriptscriptfont}}}',
  '\\begingroup\\lccode`\\~=`\\-\\lowercase{\\endgroup\\let~}\\tikzjaxminus\\mathcode`\\-="8000',
].join('\n');

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
