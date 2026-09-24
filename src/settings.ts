/********************************* settings.ts *********************************
 *
 * Purpose: Typed model + defaults for the PDF rendering settings (page,
 *   fonts, styles, geometry, metadata, …), and the fundamental-style snapshot
 *   a named style is made of.
 * How: Plain interfaces over a JSON-able shape. Nothing is persisted here: a
 *   document's settings are resolved from its named style on every render
 *   (style-library.ts, resolveDocumentSettings).
 *
 *******************************************************************************/

import type { MathFontSet, RunningApparatus } from '@orlarey/markpage-render';
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

/**
 * Purpose: Text alignment for a styled element.
 */
export type Align = 'left' | 'center' | 'right' | 'justify';

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
 * Purpose: Stable identifier for every typographic element a style addresses.
 *   Adding an element = adding an entry here + a default in
 *   `DEFAULT_SETTINGS.styles`.
 */
export type ElementKey =
  | 'body'
  | 'title'
  | 'subtitle'
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
  'subtitle',
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
 * Purpose: Heading auto-numbering directive — a resolved, flat value the style
 *   editor compiles. The render strips typed numbers and applies this on a COPY
 *   of the source (never mutates it). When `on` is false the strip still runs
 *   (the style fully owns numbering). Absent = legacy no-op (source untouched).
 */
export interface HeadingNumbering {
  on: boolean;
  depth: number; // levels numbered, 1 = h1 only (inline compact 1, 1.1, 1.1.1…)
  chapterFormat?: 'numeric' | 'chapter'; // chapter-opening numeral (rendered apart)
  chapterNumeralPt?: number; // big chapter-opening numeral size (pt); default 2.4em of h1
  // How a chapter-opening h1's number is shown. DEFAULT (unset) = 'marginal':
  // in the left margin like the other heading numbers, consistent with the whole
  // marginal-numbering scheme. 'numeral' opts into the big opening numeral above
  // the title.
  chapterStyle?: 'numeral' | 'marginal';
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
  // Heading auto-numbering (docs/STYLE-ALIGNMENT.md step 4). Optional: absent =
  // legacy no-op; present drives a render-time strip+renumber of a source copy.
  numbering?: HeadingNumbering;
  // Running apparatus (step 6): resolved header/footer composition compiled by
  // the style editor (band × parity × zone → stack of materials). Optional:
  // absent = the legacy header/footer fence model. Compiled by
  // runningApparatusCss; live @page wiring is a follow-up.
  runningApparatus?: RunningApparatus;
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
 * Purpose: The base every document's settings resolve from: the named style
 *   (or the default style) is applied over it (resolveDocumentSettings).
 *   Author / organization / date are document content — they come from the
 *   front-matter only, so the base shows none of them.
 */
export const DEFAULT_SETTINGS: PdfSettings = {
  pageSize: 'A4',
  fonts: {
    headings: 'Roboto Condensed',
    body: 'Roboto Condensed',
    code: 'Roboto Mono',
  },
  author: { text: '', show: false, bold: true },
  organization: { text: '', show: false, bold: true },
  date: { mode: 'none', custom: '' },
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
    subtitle: {
      fontSize: 15,
      color: '#57606a',
      weight: 400,
      italic: true,
      align: 'center',
      marginAbove: 0.2,
      marginBelow: 1,
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
  // Default header / footer: an empty header and a centered page counter in
  // the footer. A document can override them with a ```header / ```footer
  // fence.
  header: '',
  footer: ' | {page} | ',
  customFonts: [],
  // Default document language. The app replaces it with the UI locale, and a
  // document's `language:` front-matter overrides both.
  language: 'fr',
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
 * Every field of `PdfSettings` that defines the FUNDAMENTAL style
 * (docs/FUNDAMENTAL-SETTINGS.md) — the complete, interpretation-free snapshot.
 * Everything a self-contained style file must carry to reproduce the
 * look on any engine, with nothing derivable left out.
 */
export const FUNDAMENTAL_STYLE_KEYS = [
  // page frame + RESOLVED geometry (the canon inputs are authoring, not
  // fundamental — they never appear here; pageGeometry is the terminal result).
  'pageSize', 'pageGeometry', 'duplex', 'chapterBreak', 'chapter', 'notes',
  // heading auto-numbering directive (resolved by the style editor)
  'numbering',
  // running content — legacy fence strings + the resolved apparatus model
  'header', 'footer', 'runningApparatus',
  // typography
  'fonts', 'styles', 'mathScale', 'mathFontSet',
  // surfaces
  'pageBackground', 'coverBackground',
  // NOTE: author / organization / date / language are DOCUMENT-level — they live
  // in the doc front-matter, never in a named/exported style. Language is about
  // the words, not the look (the same style serves fr or en), so it is the ONE
  // front-matter key that overrides (see applyLanguageOverride).
  // embedded @font-face registry (data-URI faces the style ships with)
  'customFonts',
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
    if (k === 'styles') {
      // Element-level merge: a provided element REPLACES the default wholesale,
      // so a style's element is taken exactly as authored — no default attr
      // (e.g. the legacy `underline: true` on h2/h3) leaks onto it. Elements the
      // style omits fall back to their FULL default so every ElementKey stays
      // present (the render indexes `styles['running-content'].family` unguarded).
      // The render already defaults absent per-element attrs (weight ?? 500,
      // margin ?? …); a compiled style always carries at least colour + size.
      out.styles = {
        ...DEFAULT_SETTINGS.styles,
        ...((fs.styles ?? {}) as Record<string, Style>),
      };
      continue;
    }
    if (fs[k] !== undefined) out[k] = fs[k];
    else delete out[k];
  }
  // A fundamental style carrying a resolved geometry supersedes the base's canon
  // producer: drop the authoring object so `withBakedGeometry` honours the
  // imported `pageGeometry` verbatim instead of re-baking over it.
  if (fs.pageGeometry !== undefined) delete out.authoring;
  return out as unknown as PdfSettings;
}

/**
 * Apply the document's front-matter `language:` over resolved settings — the ONE
 * content-level override (language left the style; it is about the words, not the
 * look). Absent/invalid values are ignored, so the base/style language stands.
 */
export function applyLanguageOverride(
  settings: PdfSettings,
  raw: string | undefined,
): PdfSettings {
  const lang = (raw ?? '').trim().toLowerCase();
  if (lang !== 'fr' && lang !== 'en') return settings;
  if (settings.language === lang) return settings;
  return { ...settings, language: lang };
}


/**
 * Purpose: Collect the title-block metadata lines (author / org / date)
 *   in display order, dropping hidden or empty entries.
 * How: Append author and organization when `show && text.trim()`; append
 *   the formatted date when `formatDate` returns non-null. Per-document
 *   YAML frontmatter takes precedence over the settings fields when
 *   provided.
 */
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
