# Latin Modern Sans (web subset)

The site's interface font: Latin Modern Sans 10 (regular, bold, oblique), the
Unicode version of Donald Knuth's Computer Modern Sans Serif, from the
Latin Modern fonts by B. Jackowski and J. M. Nowacki (GUST e-foundry).

These are subsets of `lmsans10-*.otf` (Latin, punctuation, arrows and maths
operators), converted to WOFF with fontTools:

    pyftsubset lmsans10-regular.otf --flavor=woff --layout-features='*' \
      --unicodes="U+0020-007E,U+00A0-017F,U+0391-03C9,U+2010-2027,U+2030-205E,U+2070-209F,U+20AC,U+2122,U+2190-2199,U+2200-22FF,U+00B0-00BF"

Licence: GUST Font License (see `GUST-FONT-LICENSE.TXT`), not the site's CC0.
