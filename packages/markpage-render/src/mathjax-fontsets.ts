/********************************* mathjax-fontsets.ts *************************
 *
 * Purpose: Registry of MathJax 4 font sets — main `MathJax*Font` class loader
 *   + the dynamic-variant table per font. The active font is chosen at
 *   render time via `PdfSettings.mathFontSet`.
 * How: Each entry exposes (a) `loadFontClass()` returning the constructor
 *   passed to `new SVG({ fontData })`, and (b) `variants`, the per-variant
 *   `import()` thunks Vite must analyse statically — template-literals or
 *   `import.meta.glob` would yield duplicate module instances that fail
 *   `MathJax*Font.dynamicSetup` registration.
 *
 *******************************************************************************/

export type MathFontSet = 'newcm' | 'fira' | 'stix2' | 'asana' | 'tex';

export const MATH_FONT_SETS: MathFontSet[] = [
  'newcm',
  'fira',
  'stix2',
  'asana',
  'tex',
];

interface FontSet {
  loadFontClass: () => Promise<unknown>;
  variants: Record<string, () => Promise<unknown>>;
}

export const FONT_SETS: Record<MathFontSet, FontSet> = {
  newcm: {
    loadFontClass: async () =>
      (await import('@mathjax/mathjax-newcm-font/js/svg.js')).MathJaxNewcmFont,
    variants: {
      PUA: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/PUA.js'),
      accents: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js'),
      'accents-b-i': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js'),
      arabic: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js'),
      arrows: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js'),
      braille: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/braille.js'),
      'braille-d': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/braille-d.js'),
      calligraphic: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js'),
      cherokee: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cherokee.js'),
      cyrillic: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js'),
      'cyrillic-ss': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js'),
      devanagari: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/devanagari.js'),
      'double-struck': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js'),
      fraktur: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js'),
      greek: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js'),
      'greek-ss': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js'),
      hebrew: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js'),
      latin: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js'),
      'latin-b': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js'),
      'latin-bi': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js'),
      'latin-i': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js'),
      marrows: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js'),
      math: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js'),
      monospace: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js'),
      'monospace-ex': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js'),
      'monospace-l': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js'),
      mshapes: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js'),
      phonetics: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics.js'),
      'phonetics-ss': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics-ss.js'),
      'sans-serif': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js'),
      'sans-serif-b': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js'),
      'sans-serif-bi': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js'),
      'sans-serif-ex': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js'),
      'sans-serif-i': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js'),
      'sans-serif-r': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js'),
      script: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js'),
      shapes: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js'),
      symbols: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js'),
      'symbols-b-i': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js'),
      variants: () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js'),
    },
  },
  fira: {
    loadFontClass: async () =>
      (await import('@mathjax/mathjax-fira-font/js/svg.js')).MathJaxFiraFont,
    variants: {
      accents: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/accents.js'),
      'accents-other': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/accents-other.js'),
      arrows: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/arrows.js'),
      calligraphic: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/calligraphic.js'),
      cyrillic: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/cyrillic.js'),
      'double-struck': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/double-struck.js'),
      fraktur: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/fraktur.js'),
      greek: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/greek.js'),
      latin: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/latin.js'),
      'latin-b': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/latin-b.js'),
      'latin-bi': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/latin-bi.js'),
      'latin-i': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/latin-i.js'),
      'latin-m': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/latin-m.js'),
      'math-other': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/math-other.js'),
      monospace: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/monospace.js'),
      phonetics: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/phonetics.js'),
      'sans-serif': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/sans-serif.js'),
      script: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/script.js'),
      shapes: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/shapes.js'),
      stretchy: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/stretchy.js'),
      symbols: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/symbols.js'),
      'symbols-other': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/symbols-other.js'),
      'up-int': () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/up-int.js'),
      variants: () => import('@mathjax/mathjax-fira-font/js/svg/dynamic/variants.js'),
    },
  },
  stix2: {
    loadFontClass: async () =>
      (await import('@mathjax/mathjax-stix2-font/js/svg.js')).MathJaxStix2Font,
    variants: {
      accents: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/accents.js'),
      'accents-other': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/accents-other.js'),
      arrows: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/arrows.js'),
      calligraphic: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/calligraphic.js'),
      cyrillic: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/cyrillic.js'),
      dingbats: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/dingbats.js'),
      'double-struck': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/double-struck.js'),
      enclosed: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/enclosed.js'),
      fraktur: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/fraktur.js'),
      greek: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/greek.js'),
      latin: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin.js'),
      'latin-b': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin-b.js'),
      'latin-bi': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin-bi.js'),
      'latin-i': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin-i.js'),
      math: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/math.js'),
      monospace: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/monospace.js'),
      phonetics: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/phonetics.js'),
      'sans-serif': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/sans-serif.js'),
      script: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/script.js'),
      shapes: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/shapes.js'),
      stretchy: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/stretchy.js'),
      symbols: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/symbols.js'),
      'symbols-other': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/symbols-other.js'),
      upright: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/upright.js'),
      variants: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/variants.js'),
    },
  },
  asana: {
    loadFontClass: async () =>
      (await import('@mathjax/mathjax-asana-font/js/svg.js')).MathJaxAsanaFont,
    variants: {
      accents: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/accents.js'),
      arrows: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/arrows.js'),
      calligraphic: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/calligraphic.js'),
      cherokee: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/cherokee.js'),
      'double-struck': () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/double-struck.js'),
      fraktur: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/fraktur.js'),
      greek: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/greek.js'),
      latin: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/latin.js'),
      math: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/math.js'),
      monospace: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/monospace.js'),
      'sans-serif': () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/sans-serif.js'),
      script: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/script.js'),
      shapes: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/shapes.js'),
      stretchy: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/stretchy.js'),
      symbols: () => import('@mathjax/mathjax-asana-font/js/svg/dynamic/symbols.js'),
    },
  },
  tex: {
    loadFontClass: async () =>
      (await import('@mathjax/mathjax-tex-font/js/svg.js')).MathJaxTexFont,
    variants: {},
  },
};
