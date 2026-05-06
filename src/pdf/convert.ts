import { marked, type Token, type Tokens } from 'marked';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { metadataLines, mmToPt, type PdfSettings } from '../settings';
import { buildBaseDocDefinition } from './styles';

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
  const content = tokensToContent(tokens);
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

function tokensToContent(tokens: Token[]): Content[] {
  const out: Content[] = [];
  for (const tok of tokens) {
    const node = tokenToContent(tok);
    if (node === null) continue;
    if (Array.isArray(node)) out.push(...node);
    else out.push(node);
  }
  return out;
}

function tokenToContent(tok: Token): Content | Content[] | null {
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
      return { text: renderInline(p.tokens ?? []), style: 'paragraph' };
    }

    case 'code': {
      const c = tok as Tokens.Code;
      return { text: decodeEntities(c.text), style: 'codeBlock' };
    }

    case 'blockquote': {
      const b = tok as Tokens.Blockquote;
      const inner = tokensToContent(b.tokens ?? []);
      return { stack: inner, style: 'blockquote' };
    }

    case 'list': {
      const l = tok as Tokens.List;
      const items = l.items.map((item) => listItemToContent(item));
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

function listItemToContent(item: Tokens.ListItem): Content {
  const blocks = tokensToContent(item.tokens ?? []);
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
  if (
    !style.bold &&
    !style.italics &&
    !style.decoration &&
    !style.link &&
    !style.style
  ) {
    return text;
  }
  return { text, ...style };
}
