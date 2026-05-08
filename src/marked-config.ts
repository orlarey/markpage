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

const MATH_BLOCK_RE = /^\$\$([\S\s]+?)\$\$(?:\n|$)/;

marked.use({
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(src: string) {
        const idx = src.indexOf('$$');
        return idx === -1 ? undefined : idx;
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
