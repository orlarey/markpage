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
      return false;
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
