import { marked, type Token, type Tokens } from 'marked';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  metadataLines,
  mmToPt,
  type PageSize,
  type PdfSettings,
} from '../settings';
import { buildBaseDocDefinition } from './styles';

// Page dimensions in pt, matching pdfmake's internal table. Used to figure
// out the maximum width an image is allowed to take in the body content.
const PAGE_SIZE_PT: Record<PageSize, [number, number]> = {
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  B5: [498.9, 708.66],
  LETTER: [612, 792],
  LEGAL: [612, 1008],
};

function contentWidthPt(s: PdfSettings): number {
  const [pw] = PAGE_SIZE_PT[s.pageSize];
  return pw - mmToPt(s.margins.left) - mmToPt(s.margins.right);
}

// Inline content as accepted by pdfmake's `text` field: a string, a styled run,
// or an array of those.
type InlineRun = string | { text: string | InlineRun[]; [k: string]: unknown };

// marked stores HTML-encoded text in its tokens (e.g. `&#39;` for an
// apostrophe), since it's primarily an HTML renderer. pdfmake takes plain
// text, so we round-trip through a textarea — its content is always treated
// as text, never HTML, which makes this safe even with arbitrary input.
let decodeBuf: HTMLTextAreaElement | null = null;
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  decodeBuf ??= document.createElement('textarea');
  decodeBuf.innerHTML = s;
  return decodeBuf.value;
}

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  decoration?: 'underline' | 'lineThrough';
  link?: string;
  style?: string;
}

export function markdownToDocDefinition(
  source: string,
  settings: PdfSettings,
): TDocumentDefinitions {
  // Trailing whitespace (extra blank lines) is the single most common cause
  // of pdfmake emitting an empty trailing page, so we drop it before lexing.
  const tokens = marked.lexer(source.replace(/\s+$/u, ''));
  const content = tokensToContent(tokens, settings);
  insertMetadataBlock(content, tokens, settings);
  clearTrailingMargin(content);
  return {
    ...buildBaseDocDefinition(settings),
    ...buildPageNumber(settings),
    content,
  };
}

// Resets the bottom margin of the very last block so the page break logic
// doesn't add a phantom trailing page when the previous content ends near
// the bottom of a page.
function clearTrailingMargin(content: Content[]): void {
  const last = content.at(-1);
  if (!last || typeof last !== 'object' || Array.isArray(last)) return;
  const obj = last as { margin?: number | [number, number, number, number] };
  if (typeof obj.margin === 'number') {
    obj.margin = [obj.margin, obj.margin, obj.margin, 0];
  } else if (Array.isArray(obj.margin)) {
    obj.margin = [obj.margin[0], obj.margin[1], obj.margin[2], 0];
  } else {
    obj.margin = [0, 0, 0, 0];
  }
}

// Inserts the centered author/organization/date block right after the first
// h1 in the produced content. If there is no h1, prepends it at the top of
// the document. No-op when no metadata is enabled.
function insertMetadataBlock(
  content: Content[],
  tokens: Token[],
  settings: PdfSettings,
): void {
  const lines = metadataLines(settings);
  if (lines.length === 0) return;
  const block: Content = {
    stack: lines.map((line) => ({ text: line.text, bold: line.bold })),
    style: 'metadata',
    margin: [0, 4, 0, 12],
  };
  // Walk the original tokens in parallel with the produced content; each
  // non-skipped token corresponds to one slot in `content`. We need this to
  // locate the first h1's position in `content`.
  let contentIdx = 0;
  for (const tok of tokens) {
    const skipped = tok.type === 'space' || tok.type === 'html';
    if (
      !skipped &&
      tok.type === 'heading' &&
      (tok as Tokens.Heading).depth === 1
    ) {
      content.splice(contentIdx + 1, 0, block);
      return;
    }
    if (!skipped) contentIdx += 1;
  }
  content.unshift(block);
}

function buildPageNumber(
  s: PdfSettings,
): Pick<TDocumentDefinitions, 'header' | 'footer'> {
  const pn = s.pageNumber;
  if (pn.position === 'none') return {};

  const [vSide, hSide] = pn.position.split('-') as [
    'top' | 'bottom',
    'left' | 'center' | 'right',
  ];

  const marginMm = vSide === 'top' ? s.margins.top : s.margins.bottom;
  const marginPt = mmToPt(marginMm);
  const fontSize = pn.style.fontSize;
  // Center the text vertically in the page margin: y = marginPt/2 minus half
  // the line height. fontSize ≈ ascent+descent in pt, so / 2 is a fair
  // approximation for visual centering.
  const verticalOffset = Math.max(0, marginPt / 2 - fontSize / 2);

  const renderer = (currentPage: number) => ({
    text: String(currentPage),
    alignment: hSide,
    fontSize,
    italics: pn.style.italics,
    color: pn.style.color,
    margin: [
      mmToPt(s.margins.left),
      verticalOffset,
      mmToPt(s.margins.right),
      0,
    ] as [number, number, number, number],
  });

  return vSide === 'top' ? { header: renderer } : { footer: renderer };
}

function tokensToContent(tokens: Token[], settings: PdfSettings): Content[] {
  const out: Content[] = [];
  for (const tok of tokens) {
    const node = tokenToContent(tok, settings);
    if (node === null) continue;
    if (Array.isArray(node)) out.push(...node);
    else out.push(node);
  }
  return out;
}

function tokenToContent(
  tok: Token,
  settings: PdfSettings,
): Content | Content[] | null {
  switch (tok.type) {
    case 'space':
      return null;

    case 'heading': {
      const h = tok as Tokens.Heading;
      return {
        text: renderInline(
          h.tokens ?? [{ type: 'text', raw: h.text, text: h.text } as Token],
        ),
        style: `h${h.depth}`,
      };
    }

    case 'paragraph': {
      const p = tok as Tokens.Paragraph;
      const inlineTokens = p.tokens ?? [];
      // pdfmake has no real inline-image support, so we extract every image
      // token from the paragraph and emit each as its own centred block.
      // Whatever non-image content is left becomes a regular paragraph.
      const images = inlineTokens.filter(
        (t): t is Tokens.Image => t.type === 'image',
      );
      const nonImages = inlineTokens.filter((t) => t.type !== 'image');
      const cw = contentWidthPt(settings);
      const imageBlocks: Content[] = images.map((img) => ({
        image: img.href,
        fit: [cw, cw * 3] as [number, number],
        alignment: 'center' as const,
        margin: [0, 6, 0, 6] as [number, number, number, number],
      }));
      const remainingHasText = nonImages.some(
        (t) =>
          !(t.type === 'text' && /^\s*$/.test((t as Tokens.Text).text)),
      );
      if (imageBlocks.length === 0) {
        return { text: renderInline(inlineTokens), style: 'paragraph' };
      }
      if (!remainingHasText) {
        return imageBlocks;
      }
      // Mixed paragraph: emit the text first, then the images below it.
      return [
        { text: renderInline(nonImages), style: 'paragraph' },
        ...imageBlocks,
      ];
    }

    case 'code': {
      const c = tok as Tokens.Code;
      return { text: decodeEntities(c.text), style: 'codeBlock' };
    }

    case 'blockquote': {
      const b = tok as Tokens.Blockquote;
      const inner = tokensToContent(b.tokens ?? [], settings);
      // Wrap the quote in a 1-cell table so we can paint a left bar via a
      // custom layout. pdfmake doesn't support per-element borders outside
      // of tables.
      const barColor = settings.styles.quote.barColor;
      return {
        table: { widths: ['*'], body: [[{ stack: inner, style: 'blockquote' }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (i: number) => (i === 0 ? 3 : 0),
          vLineColor: () => barColor,
          paddingLeft: () => 11,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 6],
      };
    }

    case 'list': {
      const l = tok as Tokens.List;
      const items = l.items.map((item) => listItemToContent(item, settings));
      return l.ordered ? { ol: items } : { ul: items };
    }

    case 'hr':
      return {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 4,
            x2: 515,
            y2: 4,
            lineWidth: 0.5,
            lineColor: '#d0d7de',
          },
        ],
        margin: [0, 4, 0, 8],
      };

    case 'html':
      // MVP: ignore raw HTML.
      return null;

    case 'text': {
      // Block-level "text" token (rare top-level, common inside list items).
      const t = tok as Tokens.Text;
      const inline = t.tokens
        ? renderInline(t.tokens)
        : renderInline([{ type: 'text', raw: t.text, text: t.text } as Token]);
      return { text: inline, style: 'paragraph' };
    }

    default:
      return null;
  }
}

function listItemToContent(
  item: Tokens.ListItem,
  settings: PdfSettings,
): Content {
  const blocks = tokensToContent(item.tokens ?? [], settings);
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0]!;
  return { stack: blocks };
}

// --- inline rendering ----------------------------------------------------

function renderInline(tokens: Token[], style: InlineStyle = {}): InlineRun[] {
  const out: InlineRun[] = [];
  for (const tok of tokens) {
    const run = inlineTokenToRun(tok, style);
    if (run === null) continue;
    if (Array.isArray(run)) out.push(...run);
    else out.push(run);
  }
  return out;
}

function inlineTokenToRun(
  tok: Token,
  style: InlineStyle,
): InlineRun | InlineRun[] | null {
  switch (tok.type) {
    case 'text': {
      const t = tok as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) return renderInline(t.tokens, style);
      return applyStyle(decodeEntities(t.text), style);
    }
    case 'escape':
      return applyStyle(decodeEntities((tok as Tokens.Escape).text), style);

    case 'strong': {
      const s = tok as Tokens.Strong;
      return renderInline(s.tokens ?? [], { ...style, bold: true });
    }
    case 'em': {
      const e = tok as Tokens.Em;
      return renderInline(e.tokens ?? [], { ...style, italics: true });
    }
    case 'del': {
      const d = tok as Tokens.Del;
      return renderInline(d.tokens ?? [], { ...style, decoration: 'lineThrough' });
    }
    case 'codespan':
      return applyStyle(decodeEntities((tok as Tokens.Codespan).text), {
        ...style,
        style: 'code',
      });

    case 'link': {
      const l = tok as Tokens.Link;
      return renderInline(l.tokens ?? [], {
        ...style,
        link: l.href,
        style: 'link',
      });
    }

    case 'br':
      return { text: '\n' };

    case 'html':
      return null;

    default:
      return null;
  }
}

function applyStyle(text: string, style: InlineStyle): InlineRun {
  const segments = splitByFont(text);
  const hasStyle = !!(
    style.bold ||
    style.italics ||
    style.decoration ||
    style.link ||
    style.style
  );

  if (segments.length === 1) {
    const seg = segments[0];
    if (!seg.font && !hasStyle) return seg.text;
    return {
      text: seg.text,
      ...style,
      ...(seg.font ? { font: seg.font } : {}),
    };
  }

  // Multiple segments: emit a nested array of runs. pdfmake propagates
  // outer styles (bold, italics, decoration, link, style) to children, so
  // we don't need to repeat them on every segment.
  const runs: InlineRun[] = segments.map((seg) =>
    seg.font ? { text: seg.text, font: seg.font } : seg.text,
  );
  return hasStyle ? { text: runs, ...style } : { text: runs };
}

type FallbackFont = 'Math' | 'Symbols';

interface FontSegment {
  text: string;
  font?: FallbackFont;
}

// Order matters: we test each fallback against the codepoint and pick the
// first that has the glyph. Math is tried before Symbols because some
// characters (e.g. ⊕, ⊗) live in both fonts, and Math draws them at the
// proportions expected for mathematical use.
const FALLBACK_FONTS: ReadonlyArray<{ font: FallbackFont; family: string }> = [
  { font: 'Math', family: 'Noto Sans Math' },
  { font: 'Symbols', family: 'Noto Sans Symbols' },
];

function makeSegment(text: string, font: FallbackFont | undefined): FontSegment {
  return font ? { text, font } : { text };
}

// Splits a string into runs, marking each codepoint with the font that
// should render it. The default font is "Roboto" (Roboto Condensed); chars
// outside its glyph coverage get tagged with the first fallback that has
// them, or are left untagged (and will tofu) if no fallback covers them.
function splitByFont(text: string): FontSegment[] {
  if (text === '') return [{ text }];
  const out: FontSegment[] = [];
  let buf = '';
  let bufFont: FallbackFont | undefined;
  let started = false;
  for (const ch of text) {
    const font = pickFontFor(ch.codePointAt(0) ?? 0);
    if (started && font === bufFont) {
      buf += ch;
      continue;
    }
    if (buf) out.push(makeSegment(buf, bufFont));
    buf = ch;
    bufFont = font;
    started = true;
  }
  if (buf) out.push(makeSegment(buf, bufFont));
  return out;
}

const fontPickCache = new Map<number, FallbackFont | undefined>();

// Returns the fallback font to use for `codepoint`, or undefined when
// Roboto Condensed already has a glyph (or no fallback covers it).
function pickFontFor(codepoint: number): FallbackFont | undefined {
  if (codepoint <= 0x024f) return undefined; // ASCII + Latin Extended A/B
  if (fontPickCache.has(codepoint)) return fontPickCache.get(codepoint);
  let chosen: FallbackFont | undefined;
  if (!canvasHasGlyph(codepoint, 'Roboto Condensed')) {
    for (const { font, family } of FALLBACK_FONTS) {
      if (canvasHasGlyph(codepoint, family)) {
        chosen = font;
        break;
      }
    }
  }
  fontPickCache.set(codepoint, chosen);
  return chosen;
}

let widthCanvas: HTMLCanvasElement | null = null;

function canvasHasGlyph(codepoint: number, fontFamily: string): boolean {
  widthCanvas ??= document.createElement('canvas');
  const ctx = widthCanvas.getContext('2d');
  if (!ctx) return true; // No way to detect; assume yes to avoid breaking.
  const ch = String.fromCodePoint(codepoint);
  // Compare width with `fontFamily, monospace` against `something-fake,
  // monospace`. If the test char isn't in fontFamily, both fall through to
  // monospace and produce the same width.
  ctx.font = `64px "${fontFamily}", monospace`;
  const w1 = ctx.measureText(ch).width;
  ctx.font = '64px "__no_such_font_xyz__", monospace';
  const w2 = ctx.measureText(ch).width;
  return Math.abs(w1 - w2) > 0.5;
}
