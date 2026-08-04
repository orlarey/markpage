/********************************* settings.ts *********************************
 *
 * Purpose: Typed model + defaults + (de)serialisation for the user's
 *   PDF rendering settings (page, fonts, styles, margins, metadata, …).
 * How: Plain interfaces over a JSON-able shape; `mergeWithDefaults` tolerates
 *   missing fields from older versions on load. Persisted under
 *   `markpage:settings`.
 *
 *******************************************************************************/

import type { Frontmatter, MathFontSet } from '@orlarey/markpage-render';
import {
  parseColorCrans,
  deriveElementColors,
  backgroundColor,
  resolveFontPairing,
  deriveFontSizes,
  DEFAULT_FONT_RATIO,
} from '@orlarey/markpage-render';
import type { PageGeometry } from './typography';
export type { MathFontSet };
export type { PageGeometry };

export type PageSize =
  | 'A3'
  | 'A4'
  | 'A5'
  | 'B5'
  | 'LETTER'
  | 'LEGAL'
  // Beamer-style 16:9 presentation slides (PowerPoint widescreen).
  // When this size is picked, `pagedCss` adds `break-before: page` on
  // every `h2` so each second-level heading starts its own slide.
  | 'SLIDES_16_9';

export const PAGE_SIZES: PageSize[] = [
  'A4',
  'A5',
  'A3',
  'B5',
  'LETTER',
  'LEGAL',
  'SLIDES_16_9',
];

export const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  A4: 'A4',
  A5: 'A5',
  A3: 'A3',
  B5: 'B5',
  LETTER: 'Letter',
  LEGAL: 'Legal',
  SLIDES_16_9: 'Slides 16:9',
};

/**
 * Purpose: Text alignment for a styled element.
 */
export type Align = 'left' | 'center' | 'right' | 'justify';

export const ALIGNS: Align[] = ['left', 'center', 'right', 'justify'];

/**
 * Purpose: A heading / running-content "filet" (horizontal rule) — a resolved,
 *   flat value produced by the style editor's compiler (never a live rule).
 * How: `position` picks the side; `color`/`width`/`style` are fully resolved,
 *   each with a sensible default. Supersedes the legacy boolean `underline`
 *   (which stays for back-compat and for links' text-decoration meaning).
 */
export type RulePosition = 'below' | 'above';
export interface HeadingRule {
  position: RulePosition;
  color?: string; // #rrggbb; default #d0d7de
  width?: number; // px; default 1
  style?: 'solid' | 'dashed' | 'dotted'; // default solid
}

/** Capitals mode for an element: none, small-caps, or all-caps (uppercase). */
export type CapsMode = 'none' | 'small' | 'all';

/**
 * Purpose: Unified style for any document element — every field optional.
 * How: Inline elements ignore block-only fields (padding/background/border*).
 *   The form's per-element descriptor decides which subset to surface.
 */
export interface Style {
  family?: string; // override the trio font for this element
  fontSize?: number; // pt
  color?: string; // #rrggbb
  weight?: number; // one of WEIGHT_OPTIONS below
  italic?: boolean;
  underline?: boolean; // heading filet (legacy, = rule below) / link text-decoration
  rule?: HeadingRule; // heading/running-content filet: resolved position + styling
  smallCaps?: CapsMode; // 'small' → small-caps, 'all' → uppercase
  letterSpacing?: number; // em; typically paired with caps
  align?: Align;
  marginAbove?: number; // em
  marginBelow?: number; // em
  firstLineIndent?: number; // em; applied only between consecutive paragraphs
  lineHeight?: number; // multiplier; if unset, inherits from body
  // Block-only fields below.
  padding?: number; // em — uniform; if unset and renderer has a built-in default, the latter wins
  background?: string; // #rrggbb | 'transparent'
  // One bool per side — independent. The form surfaces all four as a
  // single visual `borders` widget (see attrField).
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderColor?: string; // #rrggbb
  borderWidth?: number; // px
  borderRadius?: number; // px
}

/**
 * Purpose: Weight choices surfaced in the Réglages dropdown.
 * How: Tight CSS-weight list (300-700) — values most Google Fonts ship
 *   natively, avoiding the worse-looking browser-synthesised weights.
 */
export const WEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 300, label: 'Light (300)' },
  { value: 400, label: 'Regular (400)' },
  { value: 500, label: 'Medium (500)' },
  { value: 600, label: 'Semibold (600)' },
  { value: 700, label: 'Bold (700)' },
];

/**
 * Purpose: Stable identifier for every typographic element addressable from
 *   the settings form / matrix. Adding a row to the styling matrix = adding
 *   an entry here + a default in `DEFAULT_SETTINGS.styles`.
 */
export type ElementKey =
  | 'body'
  | 'title'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'code-inline'
  | 'inline-link'
  | 'metadata'
  | 'code-block'
  | 'quote'
  | 'math-block'
  | 'mermaid'
  | 'callout'
  | 'table'
  | 'caption'
  | 'footnote'
  | 'running-content';

export const ELEMENT_KEYS: ElementKey[] = [
  'body',
  'title',
  'h1',
  'h2',
  'h3',
  'h4',
  'code-inline',
  'inline-link',
  'metadata',
  'code-block',
  'quote',
  'math-block',
  'mermaid',
  'callout',
  'table',
  'caption',
  'footnote',
  'running-content',
];

/**
 * Purpose: Name of one tweakable attribute on a `Style`. Drives the per-
 *   element form generator (one helper per name).
 */
export type AttrName =
  | 'family'
  | 'fontSize'
  | 'color'
  | 'weight'
  | 'italic'
  | 'underline'
  | 'align'
  | 'marginAbove'
  | 'marginBelow'
  | 'lineHeight'
  | 'padding'
  | 'background'
  | 'borders' // virtual — the picker drives the four `border<Side>` bools
  | 'borderColor'
  | 'borderWidth'
  | 'borderRadius';

/**
 * Purpose: Per-element list of attributes the matrix form should surface.
 * How: One entry per `ElementKey`; the form generator iterates `attrs`
 *   and dispatches to the per-attribute control builder.
 */
export const ELEMENT_DESCRIPTORS: Record<
  ElementKey,
  { category: 'inline' | 'block'; attrs: AttrName[] }
> = {
  body: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'align', 'lineHeight', 'marginAbove', 'marginBelow'],
  },
  title: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic', 'underline', 'align', 'marginAbove', 'marginBelow'],
  },
  h1: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic', 'underline', 'align', 'marginAbove', 'marginBelow'],
  },
  h2: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic', 'underline', 'align', 'marginAbove', 'marginBelow'],
  },
  h3: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic', 'underline', 'align', 'marginAbove', 'marginBelow'],
  },
  h4: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic', 'underline', 'align', 'marginAbove', 'marginBelow'],
  },
  'code-inline': {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color'],
  },
  'inline-link': {
    category: 'inline',
    attrs: ['color', 'weight', 'italic', 'underline'],
  },
  metadata: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic', 'align'],
  },
  'code-block': {
    category: 'block',
    attrs: ['family', 'fontSize', 'color', 'padding', 'background', 'borders', 'borderColor', 'borderWidth', 'borderRadius', 'marginAbove', 'marginBelow'],
  },
  quote: {
    category: 'block',
    attrs: ['family', 'fontSize', 'color', 'italic', 'padding', 'background', 'borders', 'borderColor', 'borderWidth', 'borderRadius', 'marginAbove', 'marginBelow'],
  },
  'math-block': {
    category: 'block',
    attrs: ['align', 'padding', 'background', 'borders', 'borderColor', 'borderWidth', 'borderRadius', 'marginAbove', 'marginBelow'],
  },
  mermaid: {
    category: 'block',
    attrs: ['align', 'padding', 'background', 'borders', 'borderColor', 'borderWidth', 'borderRadius', 'marginAbove', 'marginBelow'],
  },
  callout: {
    category: 'block',
    attrs: ['padding', 'background', 'borders', 'borderColor', 'borderWidth', 'borderRadius', 'marginAbove', 'marginBelow'],
  },
  table: {
    category: 'block',
    attrs: ['fontSize', 'color', 'borders', 'borderColor', 'borderWidth'],
  },
  caption: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic', 'align', 'marginAbove', 'marginBelow'],
  },
  footnote: {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'italic'],
  },
  'running-content': {
    category: 'inline',
    attrs: ['family', 'fontSize', 'color', 'weight', 'italic'],
  },
};

/**
 * Purpose: Page margins in millimetres.
 */
export interface Margins {
  top: number; // mm
  bottom: number; // mm
  left: number; // mm
  right: number; // mm
}

/**
 * Purpose: The geometry PRODUCTION inputs — a distinct *authoring* object, NOT a
 *   fundamental setting (docs/FUNDAMENTAL-SETTINGS.md "Résolution 2d"). The canon
 *   producer (`src/geometry-producer.ts`) reads it to bake the terminal
 *   `PageGeometry`; the render never sees it, and it is excluded from the
 *   fundamental-style export.
 * How:
 *   - 'manual':  the four `margins.*` mm sliders are the terminal geometry.
 *   - 'derived': the page area is computed via the Van de Graaf canon from the
 *                two character measures — two nested similar rectangles (text
 *                block ⊂ live area). Centred in simplex; classical inner:outer
 *                asymmetry mirrored only in duplex.
 * A document that carries a fundamental style with NO authoring object (e.g. a
 * pure imported `markpage-style`) is rendered from its baked `pageGeometry`
 * verbatim — the producer does not re-bake and clobber it.
 */
export interface GeometryAuthoring {
  marginMode: 'manual' | 'derived';
  margins: Margins;
  // Characters per line of the text block (§9.6.2). Bringhurst band 45–75, 66
  // canonical. Drives the text-block width via canvas-measured char width.
  measureChars: number;
  // Characters per line at the LIVE AREA scale (§9.6.3); strictly greater than
  // measureChars — the space between the two becomes header / footer / gutters.
  liveAreaChars: number;
}

/**
 * Purpose: One metadata line of the title block (author / organization).
 */
export interface MetadataField {
  text: string;
  show: boolean;
  bold: boolean;
}

export type DateMode = 'none' | 'today' | 'custom';

/**
 * Purpose: Date metadata configuration — none, auto today, or user-typed.
 */
export interface DateSetting {
  mode: DateMode;
  custom: string;
}

/**
 * Purpose: A user-added Google Font family loaded from a pasted CSS URL.
 * How: `name` is the CSS family; `url` the original fonts.googleapis.com
 *   URL (loader dedupes on URL when several families share one URL).
 */
export interface CustomFont {
  name: string;
  url: string;
}

/**
 * Purpose: The three font slots used across the document.
 * How: `headings` and `body` may be any family; `code` must be monospace.
 */
export interface FontTrio {
  // Family name for h1-h6 (and bold runs).
  headings: string;
  // Family name for body text (paragraphs, lists, blockquote).
  body: string;
  // Family name for inline code and code blocks. Always a monospace
  // — a proportional family here would break grid alignment.
  code: string;
}

/**
 * Purpose: The full settings record persisted to localStorage and used
 *   by every renderer (preview, PDF, LaTeX).
 */
export interface PdfSettings {
  pageSize: PageSize;
  fonts: FontTrio;
  author: MetadataField;
  organization: MetadataField;
  date: DateSetting;
  styles: Record<ElementKey, Style>;
  // Default running content (SPEC §26.5). The strings carry one fence
  // body each — same syntax as a `\`\`\`header` / `\`\`\`footer` fence
  // body: three slots separated by `|`, with `{page}` / `{pages}` /
  // `{title}` / `{date}` substitutions and `**bold**` / `*italic*`
  // inline emphasis allowed. They are synthesised as invisible fences
  // at the very top of the source so the cascade machinery in
  // page-running.ts treats them like a "section 0": active everywhere
  // until a real fence in the doc overrides the same band (header or
  // footer), at which point that band switches over per cascade.
  // Empty string ↔ no default for that band.
  header: string;
  footer: string;
  // Maximum upscaling factor applied to mermaid diagrams in the PDF. The
  // diagram is scaled up to this factor, but never beyond the width and
  // height bounds defined below.
  // Extra Google Fonts the user added by pasting a fonts.googleapis.com
  // URL. They appear in every font picker slot and load on the same
  // pipeline as the bundled catalogue.
  customFonts: CustomFont[];
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
  // Multiplicative size factor for MathJax output, relative to the body
  // font-size. 1.0 = MathJax's native size; values below tighten math
  // glyphs against text fonts that run visually larger (e.g. Roboto).
  // Applied uniformly to inline and display math via a CSS variable.
  mathScale: number;
  // Which MathJax 4 font set to render formulas with:
  //   - newcm: NewComputerModern (default, serif TeX revival)
  //   - fira:  Fira Math (sans-serif, pairs with Roboto / Fira Sans)
  //   - stix2: STIX Two Math (serif, pairs with Times-like body fonts)
  //   - asana: Asana Math (modern serif, generous x-height)
  //   - tex:   classic MathJax TeX font (legacy look)
  mathFontSet: MathFontSet;
  // Style-editor background surfaces (STYLE-EDITOR-SPEC §4): the page and cover
  // fill colours, DERIVED at render from the `page` / `cover` entries of
  // `color-crans`. Optional and transient — undefined leaves the default white
  // page and a bare (page-coloured) cover, so existing profiles are unaffected.
  pageBackground?: string;
  coverBackground?: string;

  // === Layout / typography (SPEC §9.5 / §9.6 / §9.7) ============================
  // When `duplex: true`, pages alternate recto/verso semantics:
  //   - margins.left / .right become inner / outer (mirrored via @page :left).
  //   - header/footer slots `inner-left` / `outer-right` auto-swap (§9.6.6).
  //   - `header even` / `header odd` page selectors become meaningful (§26.4).
  duplex: boolean;
  // Page-break behaviour at each h1 (§9.5.3):
  //   - 'none':       no forced break, h1 sits in flow.
  //   - 'next-page':  `h1 { break-before: page }` — chapter starts on new page.
  //   - 'next-recto': `h1 { break-before: right }` — chapter starts on recto,
  //                   blank verso inserted if needed. Degenerates to 'next-page'
  //                   in simplex (all pages are :right).
  chapterBreak: 'none' | 'next-page' | 'next-recto';
  // Geometry production inputs — a DISTINCT authoring object, NOT fundamental
  // (see GeometryAuthoring). Read only by the canon producer to bake
  // `pageGeometry`; excluded from the fundamental-style export. Optional: a pure
  // imported fundamental style has NO authoring — the producer then honours its
  // baked `pageGeometry` verbatim instead of re-baking (withBakedGeometry).
  authoring?: GeometryAuthoring;
  // Footnote placement (§9.7.2). The same `[^id]` Markdown syntax compiles to
  // a different rendering depending on this setting:
  //   - 'foot': classical numbered footnote section at the page bottom (§17).
  //   - 'side': Tufte-style sidenote in the outer gutter of the live area,
  //             aligned with its anchor. Marker auto-suppressed (proximity
  //             carries the reference).
  //   - 'end':  endnotes — single section at the document tail (§17 variant).
  notes: { position: 'foot' | 'side' | 'end' };
  // The terminal, resolved page geometry (docs/FUNDAMENTAL-SETTINGS.md
  // "Résolution 2d"). Baked by the canon producer (src/geometry-producer.ts,
  // `withBakedGeometry`) at the end of settings resolution and consumed verbatim
  // by the render — which never reads marginMode / measureChars / liveAreaChars
  // / margins. Optional so direct callers (tests, ad-hoc renders) still work:
  // the render bakes on the fly when it's absent.
  pageGeometry?: PageGeometry;
  // Chapter opening (docs/FUNDAMENTAL-SETTINGS.md §1): the vertical DROP (mm) of a
  // chapter title below the text-block top on the first page of a chapter — the
  // classic book "sink" that starts each chapter lower down the page. Only
  // meaningful when `chapterBreak` forces each h1 onto a fresh page. Optional:
  // absent / 0 keeps chapter titles at the top of the page.
  chapter?: { drop: number };
}

/**
 * Purpose: Default geometry authoring inputs — manual mode with the historical
 *   four mm margins, plus the two canon measures kept ready for a switch to
 *   'derived'. Used as the seed and as the producer's fallback.
 */
export const DEFAULT_GEOMETRY_AUTHORING: GeometryAuthoring = {
  marginMode: 'manual',
  margins: { top: 25, bottom: 25, left: 35, right: 35 },
  measureChars: 66,
  liveAreaChars: 85,
};

/**
 * Purpose: Out-of-the-box settings used as the seed for the first
 *   profile and as the fallback for missing fields in `mergeWithDefaults`.
 */
export const DEFAULT_SETTINGS: PdfSettings = {
  pageSize: 'A4',
  fonts: {
    headings: 'Roboto Condensed',
    body: 'Roboto Condensed',
    code: 'Roboto Mono',
  },
  author: { text: 'Prénom Nom', show: true, bold: true },
  organization: { text: 'Mon organisation', show: true, bold: true },
  date: { mode: 'today', custom: '' },
  styles: {
    body: {
      fontSize: 11,
      color: '#000000',
      align: 'justify',
      lineHeight: 1.25,
      marginAbove: 1,
      marginBelow: 1,
      firstLineIndent: 0,
    },
    title: {
      fontSize: 24,
      color: '#09438b',
      weight: 500,
      italic: false,
      underline: true,
      align: 'center',
      marginAbove: 0.4,
      marginBelow: 1.2,
    },
    h1: {
      fontSize: 22,
      color: '#09438b',
      weight: 500,
      italic: false,
      underline: false,
      align: 'left',
      marginAbove: 1.6,
      marginBelow: 0.6,
    },
    h2: {
      fontSize: 20,
      color: '#09438b',
      weight: 500,
      italic: false,
      underline: true,
      align: 'left',
      marginAbove: 1.6,
      marginBelow: 0.6,
    },
    h3: {
      fontSize: 16,
      color: '#09438b',
      weight: 500,
      italic: false,
      underline: true,
      align: 'left',
      marginAbove: 1.6,
      marginBelow: 0.6,
    },
    h4: {
      fontSize: 14,
      color: '#09438b',
      weight: 500,
      italic: false,
      underline: false,
      align: 'left',
      marginAbove: 1.6,
      marginBelow: 0.6,
    },
    'code-inline': { fontSize: 10, color: '#1f2328' },
    'inline-link': { color: '#0969da', underline: true },
    metadata: { fontSize: 11, color: '#000000', align: 'center' },
    'code-block': {
      fontSize: 10,
      color: '#1f2328',
      background: '#f6f8fa',
      borderRadius: 4,
    },
    quote: {
      fontSize: 11,
      color: '#57606a',
      borderLeft: true,
      borderColor: '#d0d7de',
      borderWidth: 3,
    },
    'math-block': { align: 'center' },
    mermaid: { align: 'center' },
    callout: {
      padding: 0.6,
      background: '#f6f8fa',
      borderLeft: true,
      borderColor: '#0969da',
      borderWidth: 4,
      borderRadius: 4,
    },
    table: {},
    caption: { fontSize: 10, color: '#57606a', italic: true, align: 'center', marginAbove: 0.4, marginBelow: 0.4 },
    // Footnotes sit one step below the body on the type scale — smaller by the
    // pairing's ratio, not a hardcoded size (STYLE-EDITOR-SPEC, notes = step -1).
    footnote: { fontSize: 9, color: '#57606a' },
    'running-content': { fontSize: 9, color: '#57606a', weight: 400, italic: false },
  },
  // Default header / footer for new profiles. Matches the previous
  // built-in default of `pageNumber.position = 'bottom-center'` — an
  // empty header and a centered page counter in the footer. Users can
  // edit both fields in Réglages → Page, or override them by writing a
  // \`\`\`header / \`\`\`footer fence directly in the doc.
  header: '',
  footer: ' | {page} | ',
  customFonts: [],
  // First-launch default for the doc language. Re-resolved at the
  // creation of a fresh profile via `detectLanguage()` so a user
  // landing in an `en-*` browser gets English defaults. Existing
  // profiles keep whatever was previously persisted.
  language: 'fr',
  mermaidMaxScale: 2,
  mermaidMaxWidthPct: 1,
  mermaidMaxHeightPct: 0.7,
  mathScale: 1.0,
  mathFontSet: 'newcm',
  // Layout / typography defaults — chosen so opening any pre-§9.6 profile
  // renders byte-identical to before: `marginMode: 'manual'` keeps the four
  // sliders authoritative, `duplex: false` keeps the page symmetric,
  // `chapterBreak: 'none'` keeps h1 in flow, `notes.position: 'foot'`
  // preserves the §17 footnote rendering. The two measures are stored even
  // in manual mode so toggling to 'derived' does not immediately need a
  // round of inputs from the user.
  duplex: false,
  chapterBreak: 'none',
  authoring: DEFAULT_GEOMETRY_AUTHORING,
  notes: { position: 'foot' },
};

const KEY = 'markpage:settings';

/**
 * Purpose: Load persisted settings, falling back to defaults on any failure.
 * How: JSON parse, then run through `mergeWithDefaults` for tolerance.
 */
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

/**
 * Purpose: Persist the settings to localStorage as JSON.
 * How: `JSON.stringify` + `setItem`.
 */
export function saveSettings(s: PdfSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/**
 * Purpose: Coerce a possibly-partial JSON blob into a full `PdfSettings`.
 * How: Field-by-field with default fallback; v0.4-and-earlier shapes (per-
 *   element keys `code` / `quote.barColor`, top-level `pageNumber.style`)
 *   are detected and rewritten into the new `Record<ElementKey, Style>`.
 */
export function mergeWithDefaults(input: unknown): PdfSettings {
  const d = DEFAULT_SETTINGS;
  if (!input || typeof input !== 'object') return d;
  const obj = input as Record<string, unknown>;
  const merge = <T>(def: T, partial: Partial<T> | undefined): T =>
    partial ? { ...def, ...partial } : def;
  return {
    pageSize: (obj.pageSize as PageSize | undefined) ?? d.pageSize,
    fonts: merge(d.fonts, obj.fonts as Partial<FontTrio> | undefined),
    author: merge(d.author, obj.author as Partial<MetadataField> | undefined),
    organization: merge(
      d.organization,
      obj.organization as Partial<MetadataField> | undefined,
    ),
    date: merge(d.date, obj.date as Partial<DateSetting> | undefined),
    styles: mergeStyles(obj),
    // Migrate the legacy pageNumber.position → an equivalent footer
    // (or header for top-* positions) fence body string. Any explicit
    // `header` / `footer` field in the input wins over the migration.
    header:
      typeof obj.header === 'string'
        ? (obj.header as string)
        : migrateHeaderFromPageNumber(obj) ?? d.header,
    footer:
      typeof obj.footer === 'string'
        ? (obj.footer as string)
        : migrateFooterFromPageNumber(obj) ?? d.footer,
    customFonts: Array.isArray(obj.customFonts)
      ? (obj.customFonts as CustomFont[])
      : d.customFonts,
    language: (obj.language as 'fr' | 'en' | undefined) ?? d.language,
    mermaidMaxScale:
      (obj.mermaidMaxScale as number | undefined) ?? d.mermaidMaxScale,
    mermaidMaxWidthPct:
      (obj.mermaidMaxWidthPct as number | undefined) ?? d.mermaidMaxWidthPct,
    mermaidMaxHeightPct:
      (obj.mermaidMaxHeightPct as number | undefined) ?? d.mermaidMaxHeightPct,
    mathScale: (obj.mathScale as number | undefined) ?? d.mathScale,
    mathFontSet:
      (obj.mathFontSet as MathFontSet | undefined) ?? d.mathFontSet,
    duplex: (obj.duplex as boolean | undefined) ?? d.duplex,
    chapterBreak:
      (obj.chapterBreak as PdfSettings['chapterBreak'] | undefined) ??
      d.chapterBreak,
    authoring: mergeAuthoring(obj),
    pageGeometry: obj.pageGeometry as PageGeometry | undefined,
    chapter: obj.chapter as PdfSettings['chapter'],
    notes: merge(
      d.notes,
      obj.notes as Partial<PdfSettings['notes']> | undefined,
    ),
  };
}

/**
 * Purpose: Resolve the geometry authoring object from a persisted / imported
 *   blob, tolerating three shapes: the new nested `authoring`, the pre-2d flat
 *   fields (marginMode / margins / measureChars / liveAreaChars), or neither.
 * How: nested wins over flat; both fall back to DEFAULT_GEOMETRY_AUTHORING. When
 *   NEITHER is present, a blob carrying a resolved `pageGeometry` is treated as a
 *   pure fundamental style → authoring stays `undefined` (the producer honours
 *   its geometry verbatim); otherwise defaults seed editable geometry.
 */
function mergeAuthoring(
  obj: Record<string, unknown>,
): GeometryAuthoring | undefined {
  const a = obj.authoring as Partial<GeometryAuthoring> | undefined;
  const legacy =
    obj.marginMode !== undefined ||
    obj.margins !== undefined ||
    obj.measureChars !== undefined ||
    obj.liveAreaChars !== undefined;
  if (!a && !legacy) {
    return obj.pageGeometry !== undefined
      ? undefined
      : DEFAULT_GEOMETRY_AUTHORING;
  }
  const d = DEFAULT_GEOMETRY_AUTHORING;
  return {
    marginMode:
      (a?.marginMode ??
        (obj.marginMode as GeometryAuthoring['marginMode'] | undefined)) ??
      d.marginMode,
    margins: {
      ...d.margins,
      ...((a?.margins ?? (obj.margins as Partial<Margins> | undefined)) ?? {}),
    },
    measureChars:
      (a?.measureChars ?? (obj.measureChars as number | undefined)) ??
      d.measureChars,
    liveAreaChars:
      (a?.liveAreaChars ?? (obj.liveAreaChars as number | undefined)) ??
      d.liveAreaChars,
  };
}

/**
 * Purpose: Migrate the legacy `pageNumber.position` field into a slot
 *   string for the new `footer` (or `header`) setting. Returns `null`
 *   when the input doesn't carry a recognisable pageNumber position —
 *   the caller falls back to the DEFAULT_SETTINGS value. The slot
 *   layout mirrors the dropdown corners:
 *     - `top-{side}` ↔ header band; `bottom-{side}` ↔ footer band.
 *     - `-left` / `-center` / `-right` fills the matching slot with
 *       `{page}`; the other two slots stay empty.
 */
function migrateFromPageNumber(
  obj: Record<string, unknown>,
  band: 'top' | 'bottom',
): string | null {
  const pn = obj.pageNumber as { position?: string } | undefined;
  const pos = pn?.position;
  if (typeof pos !== 'string') return null;
  if (pos === 'none') return '';
  const [b, slot] = pos.split('-');
  if (b !== band) return '';
  if (slot === 'left') return '{page} | | ';
  if (slot === 'center') return ' | {page} | ';
  if (slot === 'right') return ' | | {page}';
  return null;
}
function migrateHeaderFromPageNumber(obj: Record<string, unknown>): string | null {
  return migrateFromPageNumber(obj, 'top');
}
function migrateFooterFromPageNumber(obj: Record<string, unknown>): string | null {
  return migrateFromPageNumber(obj, 'bottom');
}

/**
 * Purpose: Describe a layout configuration issue produced by
 *   `validateLayoutSettings`. Carries a field id (so the Settings UI can
 *   highlight the offending input) and a severity:
 *     - 'error':   the configuration is invalid (the renderer must not
 *                  attempt the 'derived' computation); the form should
 *                  block the save.
 *     - 'warning': the configuration is unusual but renderable; surface
 *                  a hint to the user without blocking.
 */
export type LayoutValidationField =
  | 'measureChars'
  | 'liveAreaChars';
export interface LayoutValidationIssue {
  field: LayoutValidationField;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Purpose: Statically validate the two `measureChars` / `liveAreaChars`
 *   levers introduced by §9.6 (live area model). Returns an empty list
 *   when the configuration is sound.
 * How: Three checks — Bringhurst's readability band (45-75), the
 *   hard structural invariant `liveAreaChars > measureChars` (§9.6.3:
 *   the live area must strictly contain the text block), and a soft
 *   upper cap on `liveAreaChars` (110 chars × 0.5 em × 11 pt ≈ 213 mm,
 *   already over an A4's width — the page-fit check that depends on
 *   the actually-loaded body font happens at render time).
 *   Only relevant when `marginMode === 'derived'`; in 'manual' mode
 *   the two measures are ignored. The validator does NOT gate on
 *   `marginMode` itself — the caller decides whether to ignore issues
 *   for an inert config.
 */
export function validateLayoutSettings(s: PdfSettings): LayoutValidationIssue[] {
  const issues: LayoutValidationIssue[] = [];
  const a = s.authoring ?? DEFAULT_GEOMETRY_AUTHORING;
  if (a.measureChars < 45 || a.measureChars > 75) {
    issues.push({
      field: 'measureChars',
      severity: 'warning',
      message: `measureChars=${a.measureChars} sort de la zone de lisibilité (Bringhurst 45-75)`,
    });
  }
  if (a.liveAreaChars <= a.measureChars) {
    issues.push({
      field: 'liveAreaChars',
      severity: 'error',
      message: `liveAreaChars (${a.liveAreaChars}) doit être strictement supérieur à measureChars (${a.measureChars})`,
    });
  }
  if (a.liveAreaChars > 110) {
    issues.push({
      field: 'liveAreaChars',
      severity: 'warning',
      message: `liveAreaChars=${a.liveAreaChars} risque de sortir de la largeur d'une A4 standard à 11 pt`,
    });
  }
  return issues;
}

/**
 * Purpose: Build the per-element styles map, migrating pre-matrix shapes.
 * How: Start from defaults; copy known v0.4 keys (h1..h4, body, code, quote);
 *   split `code` into `code-inline` + `code-block`; convert `quote.barColor`
 *   to `borderColor` + `borderLeft: true`; lift legacy `pageNumber.style`
 *   into `styles['page-number']`. Pre-v0.5 top-level `justify` / `lineHeight`
 *   / `paragraphSpacing` / `headingSpacing` migrate into `body` and h1-h4.
 *   Legacy `borderSides` enum migrates into the four `border<Side>` bools.
 */
function mergeStyles(obj: Record<string, unknown>): Record<ElementKey, Style> {
  const d = DEFAULT_SETTINGS.styles;
  const out: Record<ElementKey, Style> = { ...d };
  const inStyles = obj.styles;
  if (inStyles && typeof inStyles === 'object') {
    const s = inStyles as Record<
      string,
      Style & { barColor?: string; borderSides?: string }
    >;
    for (const k of ELEMENT_KEYS) {
      if (s[k]) out[k] = { ...d[k], ...s[k], ...sidesFromLegacy(s[k]) };
    }
    // Legacy: 'code' was the single key for both inline + block code.
    if (s.code) {
      const c = s.code;
      out['code-inline'] = { ...d['code-inline'], ...c };
      out['code-block'] = { ...d['code-block'], ...c, ...sidesFromLegacy(c) };
    }
    // Legacy: quote carried `barColor` for the left vertical bar.
    if (s.quote?.barColor) {
      out.quote = {
        ...out.quote,
        borderLeft: true,
        borderColor: s.quote.barColor,
        borderWidth: out.quote.borderWidth ?? 3,
      };
    }
    // Pre-v0.8: `h1` doubled as the document title. The renderer now
    // distinguishes the two — lift the user's old h1 styling onto the
    // new `title` element so existing docs keep their look. Only fires
    // when the profile pre-dates the split (no explicit `title`).
    if (s.h1 && !s.title) {
      out.title = { ...d.title, ...s.h1 };
    }
    // Pre-v0.16: dedicated `page-number` element style — fold it into
    // `running-content` (which now styles the whole header / footer
    // band, page counter included) when the latter is at defaults.
    const pn = (inStyles as Record<string, Style>)['page-number'];
    if (
      pn &&
      out['running-content'].fontSize === d['running-content'].fontSize &&
      out['running-content'].color === d['running-content'].color
    ) {
      out['running-content'] = { ...out['running-content'], ...pn };
    }
  }
  // Legacy: pre-v0.16 pageNumber.style { fontSize, italics, color }
  // lived at the top level. Migrate into `running-content` (same
  // condition as above — only if running-content is at defaults).
  const inPageNumber = obj.pageNumber;
  if (inPageNumber && typeof inPageNumber === 'object') {
    const ps = (inPageNumber as { style?: { fontSize?: number; italics?: boolean; color?: string } })
      .style;
    if (
      ps &&
      out['running-content'].fontSize === d['running-content'].fontSize &&
      out['running-content'].color === d['running-content'].color
    ) {
      out['running-content'] = {
        ...out['running-content'],
        ...(ps.fontSize !== undefined && { fontSize: ps.fontSize }),
        ...(ps.color !== undefined && { color: ps.color }),
        ...(ps.italics !== undefined && { italic: ps.italics }),
      };
    }
  }
  // Pre-v0.5: typography fields lived at the top level. Lift them into the
  // appropriate per-element styles, but only when the new field hasn't been
  // explicitly set in `styles` already (newer wins on round-trip).
  if (typeof obj.justify === 'boolean' && out.body.align === d.body.align) {
    out.body = { ...out.body, align: obj.justify ? 'justify' : 'left' };
  }
  if (typeof obj.lineHeight === 'number' && out.body.lineHeight === d.body.lineHeight) {
    out.body = { ...out.body, lineHeight: obj.lineHeight };
  }
  if (
    typeof obj.paragraphSpacing === 'number' &&
    out.body.marginAbove === d.body.marginAbove &&
    out.body.marginBelow === d.body.marginBelow
  ) {
    out.body = {
      ...out.body,
      marginAbove: obj.paragraphSpacing,
      marginBelow: obj.paragraphSpacing,
    };
  }
  if (obj.headingSpacing && typeof obj.headingSpacing === 'object') {
    const hs = obj.headingSpacing as { above?: number; below?: number };
    for (const k of ['h1', 'h2', 'h3', 'h4'] as const) {
      if (
        hs.above !== undefined &&
        out[k].marginAbove === d[k].marginAbove
      ) {
        out[k] = { ...out[k], marginAbove: hs.above };
      }
      if (
        hs.below !== undefined &&
        out[k].marginBelow === d[k].marginBelow
      ) {
        out[k] = { ...out[k], marginBelow: hs.below };
      }
    }
  }
  return out;
}

/**
 * Purpose: Convert a v0.5-era `borderSides` enum value into the four
 *   independent `border<Side>` bools introduced in the visual border picker.
 * How: Pattern-match the eight legacy tokens; missing / unknown → no bools
 *   (caller's spread keeps any bools already present in the new shape).
 */
function sidesFromLegacy(
  s: Style & { borderSides?: string } | undefined,
): Partial<Style> {
  const sides = s?.borderSides;
  if (sides === undefined) return {};
  const out: Partial<Style> = {};
  if (sides === 'all') {
    out.borderTop = out.borderRight = out.borderBottom = out.borderLeft = true;
  } else if (sides === 'top-bottom') {
    out.borderTop = out.borderBottom = true;
  } else if (sides === 'left-right') {
    out.borderLeft = out.borderRight = true;
  } else if (sides === 'top') out.borderTop = true;
  else if (sides === 'right') out.borderRight = true;
  else if (sides === 'bottom') out.borderBottom = true;
  else if (sides === 'left') out.borderLeft = true;
  // 'none' → no bools set
  return out;
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

/**
 * Purpose: Render the title-block date string for a given `DateSetting`.
 * How: `'today'` → locale long-date now; `'custom'` → trimmed user input;
 *   `'none'` (or empty custom) → null so the caller skips the line.
 */
export function formatDate(
  d: DateSetting,
  language: 'fr' | 'en' = 'fr',
): string | null {
  if (d.mode === 'none') return null;
  if (d.mode === 'today') return DATE_FORMATTERS[language].format(new Date());
  const trimmed = d.custom.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Purpose: One rendered line of the title-block metadata.
 */
export interface MetadataLine {
  text: string;
  bold: boolean;
}

/**
 * Purpose: Collect the title-block metadata lines (author / org / date)
 *   in display order, dropping hidden or empty entries.
 * How: Append author and organization when `show && text.trim()`; append
 *   the formatted date when `formatDate` returns non-null. Per-document
 *   YAML frontmatter takes precedence over the profile fields when
 *   provided.
 */
/**
 * Purpose: Return a settings copy with the frontmatter's per-doc overrides
 *   folded in, so a document is self-describing — it renders the same in the
 *   app and in any host that reads its frontmatter (e.g. the VS Code preview).
 *   Handles `page-size`, `margins`, `page-numbers`, `font-*`, and `slides`.
 * How: Layer the layout overrides on a shallow clone, then apply the slides
 *   rule last (it forces SLIDES_16_9 + clamps vertical margins). Returns the
 *   original when nothing is in effect, so call sites stay cheap.
 */
export function applyFrontmatterToSettings(
  settings: PdfSettings,
  frontmatter?: Frontmatter,
): PdfSettings {
  const s = frontmatter ? applyLayoutOverrides(settings, frontmatter) : settings;
  if (frontmatter?.slides) {
    return slidesSettings({ ...s, pageSize: 'SLIDES_16_9' });
  }
  if (s.pageSize === 'SLIDES_16_9') {
    return slidesSettings(s);
  }
  return s;
}

/**
 * Purpose: Serialize the style-relevant parts of the settings as JSON, for the
 *   `markpage-profile` frontmatter block — so external renderers (the VS Code
 *   preview) can reproduce the document's full per-element typography + layout.
 * How: Emit `fonts`, the per-element `styles` record, and the layout (pageSize,
 *   margins, whether the footer carries a page number). Compact JSON, one line.
 */
export function serializeProfile(s: PdfSettings): string {
  const a = s.authoring ?? DEFAULT_GEOMETRY_AUTHORING;
  return JSON.stringify({
    fonts: s.fonts,
    styles: s.styles,
    pageSize: s.pageSize,
    margins: a.margins,
    marginMode: a.marginMode,
    measureChars: a.measureChars,
    liveAreaChars: a.liveAreaChars,
    duplex: s.duplex,
    chapterBreak: s.chapterBreak,
    notesPosition: s.notes.position,
    footer: s.footer,
    mathFontSet: s.mathFontSet,
  });
}

/**
 * Every field of `PdfSettings` that defines the FUNDAMENTAL style
 * (docs/FUNDAMENTAL-SETTINGS.md) — the complete, interpretation-free snapshot,
 * as opposed to `serializeProfile`'s partial subset (kept for the VS Code
 * interop). Everything a self-contained style file must carry to reproduce the
 * look on any engine, with nothing derivable left out.
 */
export const FUNDAMENTAL_STYLE_KEYS = [
  // page frame + RESOLVED geometry (the canon inputs are authoring, not
  // fundamental — they never appear here; pageGeometry is the terminal result).
  'pageSize', 'pageGeometry', 'duplex', 'chapterBreak', 'chapter', 'notes',
  // running content
  'header', 'footer',
  // typography
  'fonts', 'styles', 'mathScale', 'mathFontSet',
  // surfaces + language
  'pageBackground', 'coverBackground', 'language',
  // NOTE: author / organization / date are DOCUMENT metadata, not style —
  // they live in the doc front-matter, never in a named/exported style.
  // fonts registry + figure caps
  'customFonts', 'mermaidMaxScale', 'mermaidMaxWidthPct', 'mermaidMaxHeightPct',
] as const;

export type FundamentalStyle = Record<string, unknown>;

/** Snapshot the complete fundamental style from settings. */
export function serializeFundamentalStyle(s: PdfSettings): FundamentalStyle {
  const rec = s as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of FUNDAMENTAL_STYLE_KEYS) {
    if (rec[k] !== undefined) out[k] = rec[k];
  }
  return out;
}

/** Apply a fundamental-style snapshot onto a base — the import side. Each field
 *  is a complete value (whole `styles` record, `fonts` trio, …), so a
 *  key-level replace is the correct merge; unknown/extra keys are ignored. */
export function applyFundamentalStyle(
  base: PdfSettings,
  fs: FundamentalStyle,
): PdfSettings {
  const out: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  // A named style is COMPLETE: its fundamental fields fully define the look, so
  // set each present key AND clear each absent one. Otherwise an optional field
  // the style omits (e.g. `coverBackground` on a cover-less style) would leak in
  // from the previously-applied style — switching Rapport (navy cover) → Article
  // (no cover) would keep the navy cover, with a washed-out title on top.
  for (const k of FUNDAMENTAL_STYLE_KEYS) {
    if (fs[k] !== undefined) out[k] = fs[k];
    else delete out[k];
  }
  // A fundamental style carrying a resolved geometry supersedes the base's canon
  // producer: drop the authoring object so `withBakedGeometry` honours the
  // imported `pageGeometry` verbatim instead of re-baking over it.
  if (fs.pageGeometry !== undefined) delete out.authoring;
  return out as unknown as PdfSettings;
}

// Page formats a `page-size:` key may select. SLIDES_16_9 is intentionally
// excluded — slides are opted into via the dedicated `slides:` key.
const FRONTMATTER_PAGE_SIZES: PageSize[] = ['A3', 'A4', 'A5', 'B5', 'LETTER', 'LEGAL'];

/**
 * Purpose: Fold the frontmatter layout/typography overrides into the settings.
 * How: Each present key replaces the corresponding profile field. `margins`
 *   forces `marginMode: 'manual'` (derived mode would recompute and ignore
 *   them); `page-numbers` rewrites the footer running content to carry — or
 *   drop — the `{page}` token.
 */
function applyLayoutOverrides(settings: PdfSettings, fm: Frontmatter): PdfSettings {
  let s = settings;

  const sizeRaw = fm['page-size']?.trim().toUpperCase();
  if (sizeRaw && (FRONTMATTER_PAGE_SIZES as string[]).includes(sizeRaw)) {
    s = { ...s, pageSize: sizeRaw as PageSize };
  }

  if (fm.margins) {
    const { top, right, bottom, left } = fm.margins;
    const a = s.authoring ?? DEFAULT_GEOMETRY_AUTHORING;
    s = {
      ...s,
      authoring: { ...a, marginMode: 'manual', margins: { top, right, bottom, left } },
    };
  }

  if (fm['page-numbers'] !== undefined) {
    s = { ...s, footer: fm['page-numbers'] ? ' | {page} | ' : '' };
  }

  const fonts = { ...s.fonts };
  let fontsChanged = false;
  if (fm['font-body']) {
    fonts.body = fm['font-body'];
    fontsChanged = true;
  }
  if (fm['font-heading']) {
    fonts.headings = fm['font-heading'];
    fontsChanged = true;
  }
  if (fm['font-mono']) {
    fonts.code = fm['font-mono'];
    fontsChanged = true;
  }
  if (fontsChanged) s = { ...s, fonts };

  return applyStyleVocabulary(s, fm);
}

/**
 * Purpose: Apply the style-editor vocabulary axes (colour × fonts) — the axes
 *   the atelier writes — on top of whatever settings it's handed.
 * How: colour-crans → per-element text colours + page/cover fills (STYLE-EDITOR
 *   -SPEC §8); font-pair → the three families + maths set, and font-pair/base →
 *   the derived type scale (§6); math-scale → the maths zoom.
 *
 * Kept SEPARATE from the rest of applyLayoutOverrides and EXPORTED because the
 * render composes settings as `base → stack profile patch → vocabulary`: a
 * document carrying a `document-type` recipe flattens through the stack, whose
 * profile patch (applyProfilePatch) rewrites every per-element colour and font
 * and would otherwise clobber the vocabulary. buildPreviewDom re-asserts the
 * vocabulary LAST by calling this after the patch, so the atelier's choices win
 * over the inherited recipe. Idempotent — re-applying with the same front-matter
 * yields the same settings.
 */
export function applyStyleVocabulary(
  settings: PdfSettings,
  fm: Frontmatter,
): PdfSettings {
  let s = settings;

  // Style-editor colour axis (STYLE-EDITOR-SPEC §8): derive per-element text
  // colours AND the page / cover background fills from (hue, crans).
  if (fm['color-crans'] !== undefined) {
    const hue = fm['color-hue'] ?? 0;
    const crans = parseColorCrans(fm['color-crans']);
    const colors = deriveElementColors(hue, crans);
    if (colors.size > 0) {
      const styles = { ...s.styles };
      for (const [key, hex] of colors) {
        const k = key as ElementKey;
        if (styles[k]) styles[k] = { ...styles[k], color: hex };
      }
      s = { ...s, styles };
    }
    const pageBg = backgroundColor(hue, crans, 'page');
    const coverBg = backgroundColor(hue, crans, 'cover');
    if (pageBg) s = { ...s, pageBackground: pageBg };
    if (coverBg) s = { ...s, coverBackground: coverBg };
  }

  // Style-editor fonts axis (STYLE-EDITOR-SPEC §6): a pairing sets the three
  // families + the maths font set, the anchor + ratio derive every text size.
  const pairing =
    fm['font-pair'] !== undefined ? resolveFontPairing(fm['font-pair']) : undefined;
  if (pairing) {
    s = {
      ...s,
      fonts: { headings: pairing.headings, body: pairing.body, code: pairing.code },
      mathFontSet: pairing.math,
    };
  }
  if (pairing || fm['font-base'] !== undefined) {
    const ratio = pairing ? pairing.ratio : DEFAULT_FONT_RATIO;
    const base = fm['font-base'] ?? (s.styles.body.fontSize ?? 11);
    const sizes = deriveFontSizes(base, ratio);
    const styles = { ...s.styles };
    for (const [key, pt] of sizes) {
      const k = key as ElementKey;
      if (styles[k]) styles[k] = { ...styles[k], fontSize: pt };
    }
    s = { ...s, styles };
  }
  if (fm['math-scale'] !== undefined) {
    s = { ...s, mathScale: fm['math-scale'] };
  }

  return s;
}

/**
 * Purpose: Apply the slide-specific defaults that only make sense for
 *   the 16:9 format — primarily tighter vertical margins so a title +
 *   description + figure can all fit on one slide.
 * How: Clamp top/bottom margins to a slide-friendly ceiling (10 mm).
 *   Horizontal margins stay as the user picked them. Idempotent: applied
 *   only when needed.
 */
function slidesSettings(settings: PdfSettings): PdfSettings {
  const SLIDE_MARGIN_CAP_MM = 10;
  const a = settings.authoring ?? DEFAULT_GEOMETRY_AUTHORING;
  const m = a.margins;
  const top = Math.min(m.top, SLIDE_MARGIN_CAP_MM);
  const bottom = Math.min(m.bottom, SLIDE_MARGIN_CAP_MM);
  if (top === m.top && bottom === m.bottom) return settings;
  return {
    ...settings,
    authoring: { ...a, margins: { ...m, top, bottom } },
  };
}

export function metadataLines(
  s: PdfSettings,
  frontmatter?: {
    author?: string;
    organization?: string;
    date?: string;
  },
): MetadataLine[] {
  const lines: MetadataLine[] = [];
  const authorText = (frontmatter?.author ?? s.author.text).trim();
  if (frontmatter?.author !== undefined || s.author.show) {
    if (authorText !== '') {
      lines.push({ text: authorText, bold: s.author.bold });
    }
  }
  const orgText = (frontmatter?.organization ?? s.organization.text).trim();
  if (frontmatter?.organization !== undefined || s.organization.show) {
    if (orgText !== '') {
      lines.push({ text: orgText, bold: s.organization.bold });
    }
  }
  if (frontmatter?.date !== undefined) {
    const t = frontmatter.date.trim();
    if (t !== '') lines.push({ text: t, bold: false });
  } else {
    const d = formatDate(s.date, s.language);
    if (d) lines.push({ text: d, bold: false });
  }
  return lines;
}
