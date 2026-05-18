/********************************* mathjax-newcm-dynamic.ts ********************
 *
 * Purpose: Static registry of every dynamically-loadable newcm font variant,
 *   keyed by variant name, so `mathjax.asyncLoad` can dispatch by basename.
 * How: Each entry is a thunk returning `import('@mathjax/…/dynamic/<v>.js')`.
 *   Hardcoded paths let Vite analyse, code-split, and (crucially) resolve
 *   each variant through the same package as the SVG output's default font
 *   — so the dynamic module registers on the same `MathJaxNewcmFont` class.
 *
 *******************************************************************************/

export const NEWCM_DYNAMIC_VARIANTS: Record<string, () => Promise<unknown>> = {
  PUA: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/PUA.js'),
  accents: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js'),
  'accents-b-i': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js'),
  arabic: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js'),
  arrows: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js'),
  braille: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/braille.js'),
  'braille-d': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/braille-d.js'),
  calligraphic: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js'),
  cherokee: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cherokee.js'),
  cyrillic: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js'),
  'cyrillic-ss': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js'),
  devanagari: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/devanagari.js'),
  'double-struck': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js'),
  fraktur: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js'),
  greek: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js'),
  'greek-ss': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js'),
  hebrew: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js'),
  latin: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js'),
  'latin-b': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js'),
  'latin-bi': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js'),
  'latin-i': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js'),
  marrows: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js'),
  math: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js'),
  monospace: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js'),
  'monospace-ex': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js'),
  'monospace-l': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js'),
  mshapes: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js'),
  phonetics: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics.js'),
  'phonetics-ss': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics-ss.js'),
  'sans-serif': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js'),
  'sans-serif-b': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js'),
  'sans-serif-bi': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js'),
  'sans-serif-ex': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js'),
  'sans-serif-i': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js'),
  'sans-serif-r': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js'),
  script: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js'),
  shapes: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js'),
  symbols: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js'),
  'symbols-b-i': () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js'),
  variants: () =>
    import('@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js'),
};
