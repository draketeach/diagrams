# TikZJax (local copy)

These files are a copy of the TikZJax v1 build that https://tikzjax.com serves,
so the site works without contacting tikzjax.com or Amazon S3 (which some
school and network filters block).

| File | Original location |
|---|---|
| `v1/tikzjax-b33ac02c99.js` (patched, see below) | https://tikzjax.com/v1/tikzjax.js |
| `v1/fonts.css` | https://tikzjax.com/v1/fonts.css |
| `v1/3f69afb974a1e83f66a36f7618f88a38c254034b.wasm` (TeX engine) | https://s3.us-east-2.amazonaws.com/tikzjax.com/ |
| `v1/b565ab0b474e8e557d954694b7379a57db669ac9.gz` (TeX memory dump with TikZ loaded) | https://s3.us-east-2.amazonaws.com/tikzjax.com/ |
| `bakoma/ttf/*.ttf` (Computer Modern fonts) | https://tikzjax.com/bakoma/ttf/ |

The `.wasm` and `.gz` file names are their SHA-1 hashes, which were checked
when they were copied.

**Two changes** to the script (saved as `v1/tikzjax-b33ac02c99.js`; the name ends in the first
10 characters of its SHA-1 so browsers never use a cached older copy — rename
it and update `js/config.js` if it is ever changed again), both in a short header at the top:

1. It loads the `.wasm` and `.gz` files from the folder it is served from,
   instead of the Amazon S3 address.
2. It writes each character using the code point the BaKoMa fonts actually
   store it at (TeX positions 0–9 → U+00A1…, 10–32 → U+00AD…, 20 → U+2219,
   127 → U+00C4, everything else unchanged). The original looked characters up
   by their Unicode meaning (e.g. U+2212 for minus), which these fonts don't
   contain, so `-` `.` `,` `/` and `√` showed as the wrong symbol.

Nothing else was modified.

## Licences

These files are **not** covered by the repository's CC0 dedication.

- **TikZJax** by Jim Fowler (https://github.com/kisonecat/tikzjax) is licensed
  under GPL-3.0 or LPPL-1.3c. See `LICENSE-TikZJax.md`. It bundles TeX
  (Donald Knuth), LaTeX and PGF/TikZ (Till Tantau), each under its own licence.
- **BaKoMa fonts** are TrueType versions of Computer Modern by Basil K. Malyshev,
  distributed under the BaKoMa licence. See
  https://ctan.org/tex-archive/fonts/cm/ps-type1/bakoma
