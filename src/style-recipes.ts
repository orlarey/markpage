/******************************* style-recipes.ts ******************************
 *
 * Purpose: Small, coherent styling decisions for the default settings UI.
 * How: Each recipe changes one orthogonal dimension of PdfSettings while the
 *   detailed per-element matrix remains the compiled representation used by
 *   renderers and by the advanced settings view.
 *
 *******************************************************************************/

import type { PdfSettings } from './settings';

export type DocumentModel =
  | 'tech-note'
  | 'report'
  | 'paper'
  | 'book'
  | 'letter'
  | 'slides';

export type Appearance = 'classic' | 'modern' | 'academic' | 'technical';

export type Density = 'compact' | 'normal' | 'airy';
export type ParagraphSeparation = 'spacing' | 'indent';
export type PaginationStyle = 'none' | 'center' | 'outer';

export const DOCUMENT_MODELS: readonly DocumentModel[] = [
  'tech-note',
  'report',
  'paper',
  'book',
  'letter',
  'slides',
];

export const APPEARANCES: readonly Appearance[] = [
  'classic',
  'modern',
  'academic',
  'technical',
];

export const DENSITIES: readonly Density[] = ['compact', 'normal', 'airy'];
export const PARAGRAPH_SEPARATIONS: readonly ParagraphSeparation[] = [
  'spacing',
  'indent',
];
export const PAGINATION_STYLES: readonly PaginationStyle[] = [
  'none',
  'center',
  'outer',
];

export interface EssentialStyle {
  documentType: DocumentModel;
  appearance: Appearance;
  density: Density;
  bodySize: number;
  paragraphs: ParagraphSeparation;
  alignment: 'left' | 'justify';
  accent: string;
  pagination: PaginationStyle;
  notes: PdfSettings['notes']['position'];
}

export const DEFAULT_ESSENTIAL_STYLE: EssentialStyle = {
  documentType: 'report',
  appearance: 'modern',
  density: 'normal',
  bodySize: 11,
  paragraphs: 'spacing',
  alignment: 'justify',
  accent: '#09438b',
  pagination: 'center',
  notes: 'foot',
};

interface ModelValues {
  pageSize: PdfSettings['pageSize'];
  marginMode: PdfSettings['marginMode'];
  margins?: PdfSettings['margins'];
  measureChars: number;
  liveAreaChars: number;
  duplex: boolean;
  chapterBreak: PdfSettings['chapterBreak'];
  notesPosition: PdfSettings['notes']['position'];
  alignment: PdfSettings['styles']['body']['align'];
  pagination?: PaginationStyle;
}

const MODEL_VALUES: Record<DocumentModel, ModelValues> = {
  'tech-note': {
    pageSize: 'A4',
    marginMode: 'derived',
    measureChars: 70,
    liveAreaChars: 90,
    duplex: false,
    chapterBreak: 'none',
    notesPosition: 'foot',
    alignment: 'justify',
  },
  report: {
    pageSize: 'A4',
    marginMode: 'derived',
    measureChars: 66,
    liveAreaChars: 85,
    duplex: false,
    chapterBreak: 'none',
    notesPosition: 'foot',
    alignment: 'justify',
  },
  paper: {
    pageSize: 'A4',
    marginMode: 'derived',
    measureChars: 68,
    liveAreaChars: 85,
    duplex: false,
    chapterBreak: 'none',
    notesPosition: 'end',
    alignment: 'justify',
  },
  book: {
    pageSize: 'B5',
    marginMode: 'derived',
    measureChars: 60,
    liveAreaChars: 80,
    duplex: true,
    chapterBreak: 'next-recto',
    notesPosition: 'foot',
    alignment: 'justify',
  },
  letter: {
    pageSize: 'A4',
    marginMode: 'manual',
    margins: { top: 20, right: 25, bottom: 25, left: 25 },
    measureChars: 66,
    liveAreaChars: 82,
    duplex: false,
    chapterBreak: 'none',
    notesPosition: 'end',
    alignment: 'justify',
    pagination: 'none',
  },
  slides: {
    pageSize: 'SLIDES_16_9',
    marginMode: 'manual',
    margins: { top: 10, right: 14, bottom: 10, left: 14 },
    measureChars: 55,
    liveAreaChars: 70,
    duplex: false,
    chapterBreak: 'none',
    notesPosition: 'end',
    // Slides are the exception to markpage's justified default: their lines
    // are short, and justifying a short measure opens visible rivers of white.
    alignment: 'left',
  },
};

/**
 * Return the essential defaults after choosing a document type and appearance.
 * Document-controlled values such as note placement and alignment become the
 * comparison baseline; they are not variations merely because they differ
 * from the global Report / Modern defaults.
 */
export function contextualEssentialStyle(
  documentType: DocumentModel,
  appearance: Appearance,
): EssentialStyle {
  const model = MODEL_VALUES[documentType];
  return {
    ...DEFAULT_ESSENTIAL_STYLE,
    documentType,
    appearance,
    alignment: model.alignment === 'justify' ? 'justify' : 'left',
    notes: model.notesPosition,
    pagination: model.pagination ?? DEFAULT_ESSENTIAL_STYLE.pagination,
  };
}

interface AppearanceValues {
  fonts: PdfSettings['fonts'];
  mathFontSet: PdfSettings['mathFontSet'];
  headingWeight: number;
}

const APPEARANCE_VALUES: Record<Appearance, AppearanceValues> = {
  classic: {
    fonts: {
      headings: 'Roboto Condensed',
      body: 'EB Garamond',
      code: 'Roboto Mono',
    },
    mathFontSet: 'newcm',
    headingWeight: 500,
  },
  modern: {
    fonts: { headings: 'Inter', body: 'Inter', code: 'JetBrains Mono' },
    mathFontSet: 'newcm',
    headingWeight: 600,
  },
  academic: {
    fonts: {
      headings: 'STIX Two Text',
      body: 'STIX Two Text',
      code: 'Roboto Mono',
    },
    mathFontSet: 'stix2',
    headingWeight: 600,
  },
  technical: {
    fonts: { headings: 'Fira Sans', body: 'Fira Sans', code: 'Fira Code' },
    mathFontSet: 'fira',
    headingWeight: 600,
  },
};

interface DensityValues {
  lineHeight: number;
  paragraphMargin: number;
  headingAbove: number;
  headingBelow: number;
  blockPadding: number;
  captionMargin: number;
}

const DENSITY_VALUES: Record<Density, DensityValues> = {
  compact: {
    lineHeight: 1.25,
    paragraphMargin: 0.55,
    headingAbove: 1.25,
    headingBelow: 0.4,
    blockPadding: 0.45,
    captionMargin: 0.25,
  },
  normal: {
    lineHeight: 1.4,
    paragraphMargin: 0.8,
    headingAbove: 1.55,
    headingBelow: 0.55,
    blockPadding: 0.65,
    captionMargin: 0.4,
  },
  airy: {
    lineHeight: 1.55,
    paragraphMargin: 1.1,
    headingAbove: 1.85,
    headingBelow: 0.7,
    blockPadding: 0.85,
    captionMargin: 0.55,
  },
};

const HEADING_KEYS = ['title', 'h1', 'h2', 'h3', 'h4'] as const;
const BLOCK_KEYS = [
  'code-block',
  'quote',
  'math-block',
  'mermaid',
  'callout',
] as const;

/** Apply a document-purpose recipe without disturbing typography or metadata. */
export function applyDocumentModel(
  settings: PdfSettings,
  model: DocumentModel,
): PdfSettings {
  const v = MODEL_VALUES[model];
  const styles = cloneStyles(settings.styles);
  styles.body = { ...styles.body, align: v.alignment };
  return {
    ...settings,
    pageSize: v.pageSize,
    marginMode: v.marginMode,
    margins: v.margins ? { ...v.margins } : settings.margins,
    measureChars: v.measureChars,
    liveAreaChars: v.liveAreaChars,
    duplex: v.duplex,
    chapterBreak: v.chapterBreak,
    notes: { position: v.notesPosition },
    styles,
  };
}

/** Detect a model only when every dimension controlled by that model matches. */
export function detectDocumentModel(
  settings: PdfSettings,
): DocumentModel | null {
  for (const model of DOCUMENT_MODELS) {
    const v = MODEL_VALUES[model];
    if (
      settings.pageSize === v.pageSize &&
      settings.marginMode === v.marginMode &&
      settings.measureChars === v.measureChars &&
      settings.liveAreaChars === v.liveAreaChars &&
      settings.duplex === v.duplex &&
      settings.chapterBreak === v.chapterBreak &&
      settings.notes.position === v.notesPosition &&
      settings.styles.body.align === v.alignment &&
      (!v.margins || sameMargins(settings.margins, v.margins))
    ) {
      return model;
    }
  }
  return null;
}

/** Detect only the page-layout dimensions; reading choices are orthogonal. */
export function detectDocumentModelLayout(
  settings: PdfSettings,
): DocumentModel | null {
  for (const model of DOCUMENT_MODELS) {
    const v = MODEL_VALUES[model];
    if (
      settings.pageSize === v.pageSize &&
      settings.marginMode === v.marginMode &&
      settings.measureChars === v.measureChars &&
      settings.liveAreaChars === v.liveAreaChars &&
      settings.duplex === v.duplex &&
      settings.chapterBreak === v.chapterBreak &&
      (!v.margins || sameMargins(settings.margins, v.margins))
    ) {
      return model;
    }
  }
  return null;
}

/** Apply a coordinated text/headings/code/math family and heading treatment. */
export function applyAppearance(
  settings: PdfSettings,
  appearance: Appearance,
): PdfSettings {
  const v = APPEARANCE_VALUES[appearance];
  const styles = cloneStyles(settings.styles);
  for (const key of HEADING_KEYS) {
    styles[key] = {
      ...styles[key],
      family: undefined,
      weight: v.headingWeight,
      italic: false,
      underline: false,
    };
  }
  styles.body = { ...styles.body, family: undefined };
  styles['code-inline'] = { ...styles['code-inline'], family: undefined };
  styles['code-block'] = { ...styles['code-block'], family: undefined };
  return applyBaseFontSize(
    {
      ...settings,
      fonts: { ...v.fonts },
      mathFontSet: v.mathFontSet,
      styles,
    },
    settings.styles.body.fontSize ?? 11,
  );
}

/** Detect the coordinated family recipe; element-level family overrides are custom. */
export function detectAppearance(settings: PdfSettings): Appearance | null {
  const hasFamilyOverride = [
    ...HEADING_KEYS,
    'body',
    'code-inline',
    'code-block',
  ].some((key) =>
    Boolean(
      settings.styles[key as keyof typeof settings.styles].family?.trim(),
    ),
  );
  if (hasFamilyOverride) return null;
  for (const appearance of APPEARANCES) {
    const v = APPEARANCE_VALUES[appearance];
    if (
      settings.fonts.headings === v.fonts.headings &&
      settings.fonts.body === v.fonts.body &&
      settings.fonts.code === v.fonts.code &&
      settings.mathFontSet === v.mathFontSet &&
      HEADING_KEYS.every(
        (key) =>
          settings.styles[key].weight === v.headingWeight &&
          settings.styles[key].italic === false &&
          settings.styles[key].underline === false,
      )
    ) {
      return appearance;
    }
  }
  return null;
}

/** Apply one vertical-rhythm recipe across paragraphs, headings and framed blocks. */
export function applyDensity(
  settings: PdfSettings,
  density: Density,
): PdfSettings {
  const v = DENSITY_VALUES[density];
  const styles = cloneStyles(settings.styles);
  const usesIndent = (styles.body.firstLineIndent ?? 0) > 0;
  styles.body = {
    ...styles.body,
    lineHeight: v.lineHeight,
    marginAbove: usesIndent ? 0 : v.paragraphMargin,
    marginBelow: usesIndent ? 0 : v.paragraphMargin,
  };
  for (const key of HEADING_KEYS) {
    styles[key] = {
      ...styles[key],
      marginAbove: key === 'title' ? 0.4 : v.headingAbove,
      marginBelow: key === 'title' ? v.headingAbove : v.headingBelow,
    };
  }
  for (const key of BLOCK_KEYS) {
    styles[key] = { ...styles[key], padding: v.blockPadding };
  }
  styles.caption = {
    ...styles.caption,
    marginAbove: v.captionMargin,
    marginBelow: v.captionMargin,
  };
  return { ...settings, styles };
}

/** Detect the shared vertical rhythm, ignoring unrelated visual properties. */
export function detectDensity(settings: PdfSettings): Density | null {
  for (const density of DENSITIES) {
    const v = DENSITY_VALUES[density];
    if (
      settings.styles.body.lineHeight === v.lineHeight &&
      (['h1', 'h2', 'h3', 'h4'] as const).every(
        (key) =>
          settings.styles[key].marginAbove === v.headingAbove &&
          settings.styles[key].marginBelow === v.headingBelow,
      ) &&
      BLOCK_KEYS.every((key) => settings.styles[key].padding === v.blockPadding)
    ) {
      return density;
    }
  }
  return null;
}

/**
 * Apply one of the two conventional ways of marking a new paragraph.
 * Indented paragraphs have no extra vertical gap; spaced paragraphs reuse
 * the paragraph margin belonging to the active density recipe.
 */
export function applyParagraphSeparation(
  settings: PdfSettings,
  separation: ParagraphSeparation,
): PdfSettings {
  const styles = cloneStyles(settings.styles);
  if (separation === 'indent') {
    styles.body = {
      ...styles.body,
      marginAbove: 0,
      marginBelow: 0,
      firstLineIndent: 1.5,
    };
  } else {
    const density = detectDensity(settings) ?? 'normal';
    const paragraphMargin = DENSITY_VALUES[density].paragraphMargin;
    styles.body = {
      ...styles.body,
      marginAbove: paragraphMargin,
      marginBelow: paragraphMargin,
      firstLineIndent: 0,
    };
  }
  return { ...settings, styles };
}

/** Detect whether paragraphs are separated by whitespace or first-line indent. */
export function detectParagraphSeparation(
  settings: PdfSettings,
): ParagraphSeparation | null {
  const body = settings.styles.body;
  if (
    body.firstLineIndent === 1.5 &&
    body.marginAbove === 0 &&
    body.marginBelow === 0
  ) {
    return 'indent';
  }
  if ((body.firstLineIndent ?? 0) === 0) return 'spacing';
  return null;
}

/** Derive the complete type scale from one readable body size. */
export function applyBaseFontSize(
  settings: PdfSettings,
  bodySize: number,
): PdfSettings {
  const size = clamp(bodySize, 9, 14);
  const styles = cloneStyles(settings.styles);
  styles.body = { ...styles.body, fontSize: size };
  styles.title = { ...styles.title, fontSize: half(size * 2.45) };
  styles.h1 = { ...styles.h1, fontSize: half(size * 2) };
  styles.h2 = { ...styles.h2, fontSize: half(size * 1.6) };
  styles.h3 = { ...styles.h3, fontSize: half(size * 1.3) };
  styles.h4 = { ...styles.h4, fontSize: half(size * 1.1) };
  styles['code-inline'] = {
    ...styles['code-inline'],
    fontSize: half(size * 0.9),
  };
  styles['code-block'] = {
    ...styles['code-block'],
    fontSize: half(size * 0.9),
  };
  styles.metadata = { ...styles.metadata, fontSize: half(size * 0.95) };
  styles.quote = { ...styles.quote, fontSize: size };
  styles.table = { ...styles.table, fontSize: half(size * 0.95) };
  styles.caption = { ...styles.caption, fontSize: half(size * 0.85) };
  styles['running-content'] = {
    ...styles['running-content'],
    fontSize: half(size * 0.8),
  };
  return { ...settings, styles };
}

/** Apply semantic colour roles from one accent rather than per-element colours. */
export function applyAccentColor(
  settings: PdfSettings,
  accent: string,
): PdfSettings {
  const styles = cloneStyles(settings.styles);
  for (const key of HEADING_KEYS)
    styles[key] = { ...styles[key], color: accent };
  styles['inline-link'] = { ...styles['inline-link'], color: accent };
  styles.callout = { ...styles.callout, borderColor: accent };
  return { ...settings, styles };
}

/** Infer the accent only when all accent-bearing roles agree. */
export function detectAccentColor(settings: PdfSettings): string {
  const colors = [
    ...HEADING_KEYS.map((key) => settings.styles[key].color),
    settings.styles['inline-link'].color,
    settings.styles.callout.borderColor,
  ];
  const first = colors[0] ?? '#09438b';
  return colors.every((color) => color === first) ? first : '#09438b';
}

/** Convert the friendly page-number choice to the existing running-footer syntax. */
export function applyPaginationStyle(
  settings: PdfSettings,
  pagination: PaginationStyle,
): PdfSettings {
  const footer =
    pagination === 'none'
      ? ''
      : pagination === 'center'
      ? ' | {page} | '
      : settings.duplex
      ? ' | | {page}'
      : ' | | {page}';
  return { ...settings, footer };
}

/** Recognise only the simple footer forms controlled by the essential view. */
export function detectPaginationStyle(
  settings: PdfSettings,
): PaginationStyle | null {
  const value = settings.footer.trim();
  if (value === '') return 'none';
  if (value === '| {page} |') return 'center';
  if (value === '| | {page}') return 'outer';
  return null;
}

/** Compile the semantic frontmatter choices into the renderer settings model. */
export function applyEssentialStyle(
  settings: PdfSettings,
  style: EssentialStyle,
): PdfSettings {
  let out = applyDocumentModel(settings, style.documentType);
  out = applyAppearance(out, style.appearance);
  out = applyBaseFontSize(out, style.bodySize);
  out = applyDensity(out, style.density);
  out = applyParagraphSeparation(out, style.paragraphs);
  out.styles.body = { ...out.styles.body, align: style.alignment };
  out = applyAccentColor(out, style.accent);
  out = applyPaginationStyle(out, style.pagination);
  return { ...out, notes: { position: style.notes } };
}

function cloneStyles(styles: PdfSettings['styles']): PdfSettings['styles'] {
  return structuredClone(styles);
}

function half(value: number): number {
  return Math.round(value * 2) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sameMargins(
  a: PdfSettings['margins'],
  b: PdfSettings['margins'],
): boolean {
  return (
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left
  );
}
