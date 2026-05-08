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

// Only matches `$$` that's the very first thing on its line (no leading
// whitespace) and a closing `$$` that's also alone on its line. Without
// the line-start anchors we'd swallow `$$` mentions inside inline code
// spans or fenced code samples and treat surrounding prose as math.
const MATH_BLOCK_RE = /^\$\$\n([\S\s]+?)\n\$\$(?=\n|$)/;

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
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(src: string) {
        // Position of `$$` at the start of input or right after a newline.
        // Ignore `$$` mid-line (e.g. inside `\`…\`` code spans).
        if (src.startsWith('$$\n')) return 0;
        const idx = src.indexOf('\n$$\n');
        return idx === -1 ? undefined : idx + 1;
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
