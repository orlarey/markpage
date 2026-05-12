export type PageSize = 'A3' | 'A4' | 'A5' | 'B5' | 'LETTER' | 'LEGAL';

export const PAGE_SIZES: PageSize[] = [
  'A4',
  'A5',
  'A3',
  'B5',
  'LETTER',
  'LEGAL',
];

export const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  A4: 'A4',
  A5: 'A5',
  A3: 'A3',
  B5: 'B5',
  LETTER: 'Letter',
  LEGAL: 'Legal',
};

export type PageNumberPosition =
  | 'none'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const PAGE_NUMBER_POSITIONS: PageNumberPosition[] = [
  'none',
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export interface TextStyle {
  fontSize: number; // pt
  color: string; // #rrggbb
  // The next three apply to headings only (h1/h2/h3/h4); body, code
  // and quote ignore them and inherit the document's font-weight /
  // font-style from CSS defaults.
  underline?: boolean;
  italic?: boolean;
  weight?: number; // one of WEIGHT_OPTIONS below
}

// Standard CSS weights surfaced in the Réglages dropdown. Keeping the
// list tight (no 100 / 200 / 800 / 900) because most Google Fonts
// only ship a subset of these — anything beyond gets synthesised by
// the browser, which looks worse than just picking the next slot.
export const WEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 300, label: 'Light (300)' },
  { value: 400, label: 'Regular (400)' },
  { value: 500, label: 'Medium (500)' },
  { value: 600, label: 'Semibold (600)' },
  { value: 700, label: 'Bold (700)' },
];

export interface QuoteStyle extends TextStyle {
  barColor: string; // #rrggbb — the vertical bar at the left of a blockquote
}

export interface PageNumberStyle {
  fontSize: number;
  italics: boolean;
  color: string;
}

export interface Margins {
  top: number; // mm
  bottom: number; // mm
  left: number; // mm
  right: number; // mm
}

export interface MetadataField {
  text: string;
  show: boolean;
  bold: boolean;
}

export type DateMode = 'none' | 'today' | 'custom';

export interface DateSetting {
  mode: DateMode;
  custom: string;
}

// A Google Fonts URL the user pasted to bring in a family that isn't
// in our bundled catalogue. We store the family name (as it appears
// in CSS — already URL-decoded) and the full original CSS URL. One
// URL may declare several families; in that case we store one entry
// per family, all sharing the same URL — the loader dedupes on URL.
export interface CustomFont {
  name: string;
  url: string;
}

export interface FontTrio {
  // Family name for h1-h6 (and bold runs).
  headings: string;
  // Family name for body text (paragraphs, lists, blockquote).
  body: string;
  // Family name for inline code and code blocks. Always a monospace
  // — a proportional family here would break grid alignment.
  code: string;
}

export interface PdfSettings {
  pageSize: PageSize;
  margins: Margins;
  justify: boolean;
  lineHeight: number;
  fonts: FontTrio;
  author: MetadataField;
  organization: MetadataField;
  date: DateSetting;
  styles: {
    h1: TextStyle;
    h2: TextStyle;
    h3: TextStyle;
    h4: TextStyle;
    body: TextStyle;
    code: TextStyle;
    quote: QuoteStyle;
  };
  pageNumber: {
    position: PageNumberPosition;
    style: PageNumberStyle;
  };
  // Maximum upscaling factor applied to mermaid diagrams in the PDF. The
  // diagram is scaled up to this factor, but never beyond the width and
  // height bounds defined below.
  // Extra Google Fonts the user added by pasting a fonts.googleapis.com
  // URL. They appear in every font picker slot and load on the same
  // pipeline as the bundled catalogue.
  customFonts: CustomFont[];
  // Vertical spacing around every heading, expressed as multiples of
  // the heading's own font-size (so `above = 1.6` on a 20pt h2 gives
  // 32pt of space above). Asymmetric on purpose — see SPEC notes on
  // Gestalt proximity. Applied uniformly to h1-h6.
  headingSpacing: { above: number; below: number };
  // Symmetric vertical margin around <p> elements, in em of the body
  // font-size. 1.0 matches browser defaults; users can dial down for
  // tighter copy. Note: lists, blockquotes etc. keep their own
  // browser defaults, which still collapse with adjacent margins —
  // so the actual space before a list won't fall below ~1em even at
  // paragraphSpacing=0.
  paragraphSpacing: number;
  // Document language. Distinct from the user's UI language (which
  // lives in localStorage). Drives the LaTeX `\usepackage[…]{babel}`
  // line, the theorem-env names emitted in the preamble, and the
  // Intl format of the "Date du jour" metadata block.
  language: 'fr' | 'en';
  mermaidMaxScale: number;
  // Maximum width allowed for a mermaid diagram, as a fraction of the
  // content (text) width of a page. 1.0 lets the diagram fill the column.
  mermaidMaxWidthPct: number;
  // Maximum height allowed for a mermaid diagram, as a fraction of the
  // content (text) height of a page. Caps tall diagrams so they don't
  // dominate or exceed a full page, which would otherwise force a page
  // break before the diagram and leave the previous page half-empty.
  mermaidMaxHeightPct: number;
}

export const DEFAULT_SETTINGS: PdfSettings = {
  pageSize: 'A4',
  margins: { top: 25, bottom: 25, left: 35, right: 35 },
  justify: true,
  lineHeight: 1.25,
  fonts: {
    headings: 'Roboto Condensed',
    body: 'Roboto Condensed',
    code: 'Roboto Mono',
  },
  author: { text: 'Prénom Nom', show: true, bold: true },
  organization: { text: 'Mon organisation', show: true, bold: true },
  date: { mode: 'today', custom: '' },
  styles: {
    h1: { fontSize: 24, color: '#09438b', underline: true, italic: false, weight: 500 },
    h2: { fontSize: 20, color: '#09438b', underline: true, italic: false, weight: 500 },
    h3: { fontSize: 16, color: '#09438b', underline: true, italic: false, weight: 500 },
    h4: { fontSize: 14, color: '#09438b', underline: false, italic: false, weight: 500 },
    body: { fontSize: 11, color: '#000000' },
    code: { fontSize: 10, color: '#1f2328' },
    quote: { fontSize: 11, color: '#57606a', barColor: '#d0d7de' },
  },
  pageNumber: {
    position: 'bottom-center',
    style: { fontSize: 9, italics: false, color: '#57606a' },
  },
  customFonts: [],
  headingSpacing: { above: 1.6, below: 0.6 },
  paragraphSpacing: 1,
  // First-launch default for the doc language. Re-resolved at the
  // creation of a fresh profile via `detectLanguage()` so a user
  // landing in an `en-*` browser gets English defaults. Existing
  // profiles keep whatever was previously persisted.
  language: 'fr',
  mermaidMaxScale: 2,
  mermaidMaxWidthPct: 1,
  mermaidMaxHeightPct: 0.7,
};

const KEY = 'markpage:settings';

export function loadSettings(): PdfSettings {
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: PdfSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

// Tolerant merge: any missing field falls back to its default. Lets us add
// new fields later without breaking persisted settings from older versions.
function mergeWithDefaults(input: unknown): PdfSettings {
  const d = DEFAULT_SETTINGS;
  if (!input || typeof input !== 'object') return d;
  const obj = input as Partial<PdfSettings>;
  const merge = <T>(def: T, partial: Partial<T> | undefined): T =>
    partial ? { ...def, ...partial } : def;
  return {
    pageSize: obj.pageSize ?? d.pageSize,
    margins: merge(d.margins, obj.margins),
    justify: obj.justify ?? d.justify,
    lineHeight: obj.lineHeight ?? d.lineHeight,
    fonts: merge(d.fonts, obj.fonts),
    author: merge(d.author, obj.author),
    organization: merge(d.organization, obj.organization),
    date: merge(d.date, obj.date),
    styles: {
      h1: merge(d.styles.h1, obj.styles?.h1),
      h2: merge(d.styles.h2, obj.styles?.h2),
      h3: merge(d.styles.h3, obj.styles?.h3),
      h4: merge(d.styles.h4, obj.styles?.h4),
      body: merge(d.styles.body, obj.styles?.body),
      code: merge(d.styles.code, obj.styles?.code),
      quote: merge(d.styles.quote, obj.styles?.quote),
    },
    pageNumber: {
      position: obj.pageNumber?.position ?? d.pageNumber.position,
      style: merge(d.pageNumber.style, obj.pageNumber?.style),
    },
    customFonts: Array.isArray(obj.customFonts) ? obj.customFonts : d.customFonts,
    headingSpacing: merge(d.headingSpacing, obj.headingSpacing),
    paragraphSpacing: obj.paragraphSpacing ?? d.paragraphSpacing,
    language: obj.language ?? d.language,
    mermaidMaxScale: obj.mermaidMaxScale ?? d.mermaidMaxScale,
    mermaidMaxWidthPct: obj.mermaidMaxWidthPct ?? d.mermaidMaxWidthPct,
    mermaidMaxHeightPct: obj.mermaidMaxHeightPct ?? d.mermaidMaxHeightPct,
  };
}

// 1 mm = 1/25.4 in × 72 pt/in.
export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

// Per-locale long-date formatters, lazily cached. Driven by the
// document's language (PdfSettings.language) so an English doc shows
// "May 11, 2026" and a French one "11 mai 2026" — regardless of the
// user's UI locale, which is independent.
const DATE_FORMATTERS: Record<'fr' | 'en', Intl.DateTimeFormat> = {
  fr: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }),
  en: new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }),
};

export function formatDate(
  d: DateSetting,
  language: 'fr' | 'en' = 'fr',
): string | null {
  if (d.mode === 'none') return null;
  if (d.mode === 'today') return DATE_FORMATTERS[language].format(new Date());
  const trimmed = d.custom.trim();
  return trimmed === '' ? null : trimmed;
}

export interface MetadataLine {
  text: string;
  bold: boolean;
}

// Returns the centered metadata lines (author, organization, date) that
// should appear in the title block, in display order. Each entry is already
// trimmed and non-empty.
export function metadataLines(s: PdfSettings): MetadataLine[] {
  const lines: MetadataLine[] = [];
  if (s.author.show && s.author.text.trim() !== '') {
    lines.push({ text: s.author.text.trim(), bold: s.author.bold });
  }
  if (s.organization.show && s.organization.text.trim() !== '') {
    lines.push({
      text: s.organization.text.trim(),
      bold: s.organization.bold,
    });
  }
  const d = formatDate(s.date, s.language);
  if (d) lines.push({ text: d, bold: false });
  return lines;
}
