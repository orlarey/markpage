// Side-effect-only module: registers our marked extensions on the
// shared `marked` instance. Importing this anywhere ensures the
// `mathBlock` token type (TeX delimited by `$$…$$`) is parsed and
// renderable. Import once from main.ts before any marked.parse() /
// marked.lexer() call.

import { marked, type Tokens } from 'marked';

interface MathBlockToken {
  type: 'mathBlock';
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
  }
}

// Only matches `$$` that's the very first thing on its line (no leading
// whitespace) and a closing `$$` that's also alone on its line. Without
// the line-start anchors we'd swallow `$$` mentions inside inline code
// spans or fenced code samples and treat surrounding prose as math.
const MATH_BLOCK_RE = /^\$\$\n([\S\s]+?)\n\$\$(?=\n|$)/;

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
