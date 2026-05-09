// Side-effect-only module: registers our marked extensions on the
// shared `marked` instance. Importing this anywhere ensures the
// `mathBlock` (TeX delimited by `$$…$$` on their own lines) and
// `mathInline` (`$…$` inside a paragraph) token types are parsed and
// renderable. Import once from main.ts before any marked.parse() /
// marked.lexer() call.

import { marked, type Tokens } from 'marked';

interface MathBlockToken {
  type: 'mathBlock';
  raw: string;
  text: string;
}

interface MathInlineToken {
  type: 'mathInline';
  raw: string;
  text: string;
}

interface AdmonitionToken {
  type: 'admonition';
  raw: string;
  klass: string;
  customTitle: string | null;
  tokens: Tokens.Generic[];
}

interface FootnoteRefToken {
  type: 'footnoteRef';
  raw: string;
  id: string;
  isFirst: boolean;
}

interface DefListItem {
  termTokens: Tokens.Generic[];
  defsTokens: Tokens.Generic[][];
}

interface DefListToken {
  type: 'defList';
  raw: string;
  items: DefListItem[];
}

declare module 'marked' {
  namespace Tokens {
    interface MathBlock {
      type: 'mathBlock';
      raw: string;
      text: string;
    }
    interface MathInline {
      type: 'mathInline';
      raw: string;
      text: string;
    }
  }
}

// Localised default titles for the admonition classes we recognise.
// Unknown classes get no default title (just the styling hook). Custom
// titles via `::: classname [Title]` always win.
const ADMONITION_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Astuce',
  warning: 'Avertissement',
  caution: 'Attention',
  important: 'Important',
  theorem: 'Théorème',
  lemma: 'Lemme',
  proposition: 'Proposition',
  corollary: 'Corollaire',
  definition: 'Définition',
  proof: 'Démonstration',
  example: 'Exemple',
  remark: 'Remarque',
};

// Footnote registry. Resets at the start of every parse via the
// preprocess hook. Definitions are collected as the block lexer runs;
// references then look them up in the inline pass (block parsing
// completes before inline parsing in marked, so all defs are known by
// the time refs are tokenized).
//
// `seen` tracks the ids in order of first reference — which is how
// they are numbered in the rendered list, regardless of where the
// definition appears in the source. This matches Pandoc's behaviour.
const footnoteDefs = new Map<string, string>();
const footnoteSeen: string[] = [];
// Re-entrance guard. The postprocess hook calls `marked.parseInline()`
// to render each footnote's content as Markdown — but parseInline turns
// out to trigger the preprocess/postprocess hooks too, which would
// otherwise clear our registry mid-iteration and lose every footnote
// after the first. Setting this flag tells the hooks to no-op for the
// duration of the inner render.
let inFootnoteRender = false;

// Pandoc-style fenced div: `::: classname [Optional title]\n…body…\n:::`.
// Constraints to keep the syntax non-greedy and predictable:
//   - opening `:::` must be at the start of a line (LF, no leading WS)
//   - class name is a single identifier (letters / digits / hyphen /
//     underscore). The Pandoc curly-brace form `{.cls #id}` is not
//     supported in v1 — keep it simple
//   - optional title in square brackets, single line, no nested `]`
//   - closing `:::` alone on its line (trailing tabs/spaces tolerated)
//   - we do NOT support nesting in v1; a body `:::` would close the
//     outer block. If a user needs that we'll add the multi-colon
//     fence (`::::` opens, `:::` inside is fine) later.
const ADMONITION_RE =
  /^:::[ \t]+([A-Za-z][\w-]*)(?:[ \t]+\[([^\]\n]+)\])?[ \t]*\n([\s\S]+?)\n:::[ \t]*(?=\n|$)/;

// Only matches `$$` that's the very first thing on its line (no leading
// whitespace) and a closing `$$` that's also alone on its line.
// Trailing spaces/tabs on either delimiter line are tolerated — users
// often have them by accident and would never notice. The line-start
// anchor is what keeps us from swallowing `$$` mentions inside inline
// code spans or fenced code samples.
const MATH_BLOCK_RE =
  /^\$\$[ \t]*\n([\S\s]+?)\n[ \t]*\$\$[ \t]*(?=\n|$)/;

// Inline math: `$x$`. Pandoc-ish constraints to keep it from eating prose
// dollars (prices, etc.):
//   - opening `$` is not followed by whitespace
//   - closing `$` is not preceded by whitespace
//   - closing `$` is not followed by a digit (so "Cost $5 or $7" survives)
//   - content has no newline and no unescaped `$`
// `\\.` lets users write `\$` inside the formula if they really need a
// literal dollar sign.
const MATH_INLINE_RE = /^\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\d)/;

marked.use({
  // Treat ```math fenced blocks as display math, equivalent to a $$…$$
  // block. GitHub renders ```math as LaTeX since 2023 — we follow that
  // convention. Emits the same `<div class="math-block">` placeholder
  // as the mathBlock extension below, so the rest of the pipeline
  // (renderMathBlocks → MathJax → SVG) handles them uniformly.
  // Other languages fall through to the default fenced-code renderer.
  renderer: {
    code(token) {
      if (token.lang === 'math') {
        const escaped = escapeHtml(token.text);
        return `<div class="math-block" data-math="${escaped}"></div>\n`;
      }
      if (token.lang === 'csv') {
        return renderDataTable(token.text, ',');
      }
      if (token.lang === 'tsv') {
        return renderDataTable(token.text, '\t');
      }
      return false;
    },
  },
  // Hooks for footnote bookkeeping. preprocess wipes the registry so a
  // new parse doesn't inherit state from the previous one (preview and
  // print run separate parses on the same module). postprocess appends
  // the rendered footnotes section if anything was referenced.
  hooks: {
    preprocess(src) {
      if (inFootnoteRender) return src;
      footnoteDefs.clear();
      footnoteSeen.length = 0;
      return src;
    },
    postprocess(html) {
      if (inFootnoteRender) return html;
      if (footnoteSeen.length === 0) return html;
      inFootnoteRender = true;
      try {
        const items = footnoteSeen
          .map((id) => {
            const content = footnoteDefs.get(id) ?? '';
            // Inline-parse the content so users can use **bold**,
            // $math$, links, etc. inside their footnotes. parseInline
            // re-enters the hooks; the guard above keeps them from
            // clearing our registry mid-iteration.
            const inlineHtml = marked.parseInline(content) as string;
            const idEsc = escapeHtml(id);
            return `<li id="fn-${idEsc}">${inlineHtml} <a href="#fnref-${idEsc}" class="footnote-back" aria-label="Retour à l'appel de note">↩</a></li>`;
          })
          .join('');
        return `${html}\n<section class="footnotes" role="doc-endnotes"><hr><ol>${items}</ol></section>\n`;
      } finally {
        inFootnoteRender = false;
      }
    },
  },
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(src: string) {
        // Position of `$$` at the start of input or right after a
        // newline, optionally followed by trailing spaces/tabs before
        // the line break. Ignores `$$` mid-line (inside code spans).
        if (/^\$\$[ \t]*\n/.test(src)) return 0;
        const m = /\n\$\$[ \t]*\n/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        const match = MATH_BLOCK_RE.exec(src);
        if (!match) return undefined;
        const token: MathBlockToken = {
          type: 'mathBlock',
          raw: match[0],
          text: (match[1] ?? '').trim(),
        };
        return token as unknown as Tokens.Generic;
      },
      // Renderer emits a placeholder element. The preview pipeline finds
      // these and swaps in the MathJax SVG once it's loaded.
      renderer(token) {
        const t = token as unknown as MathBlockToken;
        const escaped = escapeHtml(t.text);
        return `<div class="math-block" data-math="${escaped}"></div>\n`;
      },
    },
    {
      name: 'admonition',
      level: 'block',
      start(src: string) {
        if (/^:::[ \t]+/.test(src)) return 0;
        const m = /\n:::[ \t]+/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        const match = ADMONITION_RE.exec(src);
        if (!match) return undefined;
        const klass = (match[1] ?? '').toLowerCase();
        const customTitle = match[2] ?? null;
        const inner = match[3] ?? '';
        // Recurse into the body so nested Markdown (paragraphs, lists,
        // math, mermaid…) is parsed normally.
        const tokens: Tokens.Generic[] = [];
        this.lexer.blockTokens(inner, tokens);
        const token: AdmonitionToken = {
          type: 'admonition',
          raw: match[0],
          klass,
          customTitle,
          tokens,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as AdmonitionToken;
        const klass = escapeHtml(t.klass);
        const defaultLabel = ADMONITION_LABELS[t.klass];
        let titleHtml = '';
        if (t.customTitle && defaultLabel) {
          // Known class with custom title: combine them — "Théorème — Pythagore".
          titleHtml = `<div class="admonition-title">${escapeHtml(defaultLabel)} — ${escapeHtml(t.customTitle)}</div>`;
        } else if (t.customTitle) {
          titleHtml = `<div class="admonition-title">${escapeHtml(t.customTitle)}</div>`;
        } else if (defaultLabel) {
          titleHtml = `<div class="admonition-title">${escapeHtml(defaultLabel)}</div>`;
        }
        const body = this.parser.parse(t.tokens);
        return `<div class="admonition admonition-${klass}">${titleHtml}<div class="admonition-body">${body}</div></div>\n`;
      },
      childTokens: ['tokens'],
    },
    {
      name: 'footnoteDef',
      level: 'block',
      start(src: string) {
        if (/^\[\^[^\]\n]+\]:/.test(src)) return 0;
        const m = /\n\[\^[^\]\n]+\]:/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        // Single-line definition for v1: `[^id]: content`. Pandoc also
        // allows multi-paragraph defs with 4-space-indented continuations;
        // we'll add that if a real document needs it.
        const match = /^\[\^([^\]\n]+)\]:[ \t]*(.+)/.exec(src);
        if (!match) return undefined;
        footnoteDefs.set(match[1] ?? '', (match[2] ?? '').trim());
        return {
          type: 'footnoteDef',
          raw: match[0],
        };
      },
      // Defs don't render in place — they're collected and emitted at
      // the end of the document via the postprocess hook.
      renderer() {
        return '';
      },
    },
    {
      name: 'footnoteRef',
      level: 'inline',
      start(src: string) {
        const m = /\[\^/.exec(src);
        return m === null ? undefined : m.index;
      },
      tokenizer(src: string) {
        const match = /^\[\^([^\]\n]+)\]/.exec(src);
        if (!match) return undefined;
        const id = match[1] ?? '';
        // Refs to undefined ids fall through to default Markdown
        // (rendered as literal `[^id]` text). Avoids surprising "blank"
        // numbers when a user typos an id.
        if (!footnoteDefs.has(id)) return undefined;
        const isFirst = !footnoteSeen.includes(id);
        if (isFirst) footnoteSeen.push(id);
        const token: FootnoteRefToken = {
          type: 'footnoteRef',
          raw: match[0],
          id,
          isFirst,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as FootnoteRefToken;
        const num = footnoteSeen.indexOf(t.id) + 1;
        const idEsc = escapeHtml(t.id);
        // Only the first reference carries the back-link target id —
        // a footnote referenced N times shouldn't generate N elements
        // with the same DOM id.
        const idAttr = t.isFirst ? ` id="fnref-${idEsc}"` : '';
        return `<sup class="footnote-ref"><a href="#fn-${idEsc}"${idAttr}>${num}</a></sup>`;
      },
    },
    {
      name: 'defList',
      level: 'block',
      // Cheap pre-check: a `:` at the start of a line, preceded by
      // anything that isn't itself a `:` line. The full validation
      // happens in the tokenizer below — here we just want to skip
      // ahead efficiently.
      start(src: string) {
        if (/^[^\n:][^\n]*\n:[ \t]+/.test(src)) return 0;
        const m = /\n[^\n:][^\n]*\n:[ \t]+/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        const parsed = parseDefListBlock(src);
        if (!parsed) return undefined;
        const items: DefListItem[] = parsed.pairs.map((pair) => ({
          termTokens: this.lexer.inlineTokens(pair.term),
          defsTokens: pair.defs.map((d) => this.lexer.inlineTokens(d)),
        }));
        const token: DefListToken = {
          type: 'defList',
          raw: parsed.raw,
          items,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as DefListToken;
        const parts: string[] = ['<dl>'];
        for (const item of t.items) {
          parts.push(`<dt>${this.parser.parseInline(item.termTokens)}</dt>`);
          for (const defTokens of item.defsTokens) {
            parts.push(`<dd>${this.parser.parseInline(defTokens)}</dd>`);
          }
        }
        parts.push('</dl>\n');
        return parts.join('');
      },
    },
    {
      name: 'mathInline',
      level: 'inline',
      start(src: string) {
        const idx = src.indexOf('$');
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src: string) {
        const match = MATH_INLINE_RE.exec(src);
        if (!match) return undefined;
        const text = (match[1] ?? '').trim();
        if (text === '') return undefined;
        const token: MathInlineToken = {
          type: 'mathInline',
          raw: match[0],
          text,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as MathInlineToken;
        const escaped = escapeHtml(t.text);
        return `<span class="math-inline" data-math="${escaped}"></span>`;
      },
    },
  ],
});

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Renders a CSV/TSV fenced block as an HTML <table>. The first
// non-empty row becomes the header (<thead>), the rest are data rows.
// CRLF is normalised to LF; leading/trailing blank lines are dropped
// so users can leave a blank line after the opening fence without it
// turning into an empty header row.
function renderDataTable(src: string, sep: string): string {
  const lines = src.replaceAll(/\r\n?/g, '\n').split('\n');
  const rows = lines
    .filter((l) => l.trim() !== '')
    .map((l) => parseCsvLine(l, sep));
  if (rows.length === 0) return '';
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  const headHtml = head
    .map((cell) => `<th>${escapeHtml(cell)}</th>`)
    .join('');
  const bodyHtml = body
    .map((row) => {
      const cells = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table class="data-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>\n`;
}

// Walks src line-by-line and consumes a contiguous block of
// term/definition pairs (Pandoc def list). Returns the raw consumed
// text and the parsed pairs, or null if the head of src isn't the
// start of such a block.
//
// Format (single-line per term, single-line per def — v1):
//   Term
//   :   Definition
//
// Multiple defs per term, multiple consecutive term-pairs in the
// same dl block are supported. A blank line or a non-`:` line after
// a def closes the dl. Multi-paragraph defs with 4-space-indented
// continuations are not yet supported.
function parseDefListBlock(
  src: string,
): { raw: string; pairs: { term: string; defs: string[] }[] } | null {
  const lines = src.split('\n');
  const pairs: { term: string; defs: string[] }[] = [];
  let i = 0;
  while (i < lines.length) {
    const termLine = lines[i] ?? '';
    // Term: non-empty, doesn't start with `:`. Stop the loop on
    // anything else — we only consume contiguous pairs.
    if (termLine === '' || termLine.startsWith(':')) break;
    const defLine = lines[i + 1];
    if (defLine === undefined || !/^:[ \t]+/.test(defLine)) break;
    const defs: string[] = [defLine.replace(/^:[ \t]+/, '')];
    i += 2;
    while (i < lines.length && /^:[ \t]+/.test(lines[i] ?? '')) {
      defs.push((lines[i] ?? '').replace(/^:[ \t]+/, ''));
      i += 1;
    }
    pairs.push({ term: termLine, defs });
  }
  if (pairs.length === 0) return null;
  const raw = lines.slice(0, i).join('\n');
  return { raw, pairs };
}

// Minimal RFC-4180-ish CSV/TSV line parser: handles double-quoted
// fields with escaped `""` inside. Doesn't handle embedded newlines
// in quoted fields (we split on \n before reaching here) — if a real
// document needs that we'll add a multi-line state machine.
function parseCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else if (c === '"' && cur.trim() === '') {
      // Opening quote at the start of a field. We allow whitespace
      // between the previous separator and the quote (CSVs from
      // spreadsheets often pad after the comma) and drop it so the
      // padding doesn't end up inside the parsed field.
      inQuote = true;
      cur = '';
    } else if (c === sep) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}
