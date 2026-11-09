# TikZJax (benrbray build) — local copy

The site's main renderer. These two files are copied unmodified from the
`output/` folder of https://github.com/benrbray/tikzjax at commit
`bc5b21635ca9fe4b5078ebe2c86a559191e9ae2a`:

| File here | Original |
|---|---|
| `tikzjax-3f7757b04d.js` | `output/tikzjax.js` (TeX engine, memory dump and TeX files are embedded) |
| `fonts-a7d4964e6d.css` | `output/fonts.css` (Computer Modern and AMS fonts embedded as data URLs) |

The names end in the first 10 characters of each file's SHA-1, so browsers and
the service worker never use a stale cached copy. If you replace a file, rename
it to its new hash and update `js/config.js` (the tests check this).

Compared with the TikZJax v1 copy in `vendor/tikzjax/` (now only a fallback), this
build includes nearly all TikZ libraries (patterns, patterns.meta, arrows.meta,
calc, angles, …) and packages such as amsmath, amssymb, pgfplots and tikz-cd, and
it displays maths symbols correctly without any patches.

Two pattern bugs in its SVG driver (PGF's `pgfsys-common-svg.def`) are worked
around at render time, not in these files:

- pattern definitions were never written, so filled patterns came out blank;
- each pattern tile ignored the lower-left corner of its bounding box, so a
  drawing centred on the origin (a `patterns.meta` dot, a hatch line) was cut
  to a quarter.

The site adds redefinitions of `\pgf@sys@svg@make@defs` and
`\pgfsys@@declarepattern` to the TeX it sends to TikZJax. See `PATTERN_DEFS_FIX`
in `js/config.js`.

## Licence

GPL-3.0-or-later (as stated in the fork's `package.json`). This is **not**
covered by the repository's CC0 dedication.

Credits: TikZJax by Jim Fowler (kisonecat/tikzjax), with forks by Glenn Rice
(drgrice1), artisticat1 and Benjamin Bray (benrbray). It bundles TeX (Donald
Knuth), LaTeX, PGF/TikZ (Till Tantau) and other packages under their own
licences, and the BaKoMa/AMS fonts.
