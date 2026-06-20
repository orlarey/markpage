/********************************* @markpage/marked ****************************
 *
 * Purpose: A marked plugin that renders markpage's fenced blocks (`chart`, …).
 *   Drop it into any marked pipeline:
 *
 *     import { marked } from 'marked';
 *     import { markpageBlocks } from '@markpage/marked';
 *     import '@markpage/blocks/styles.css';
 *
 *     marked.use(markpageBlocks());
 *     marked.parse('```chart line "Sales"\n…\n```');
 *
 * How: Overrides marked's fenced-`code` renderer. When the fence language is a
 *   registered block (@markpage/blocks), it emits the block's HTML/SVG;
 *   otherwise it returns `false` so marked falls back to its default code
 *   rendering (syntax highlighting, etc.).
 *
 *******************************************************************************/

import { hasBlock, renderBlock } from '@markpage/blocks';
import type { MarkedExtension, Tokens } from 'marked';

export interface MarkpageBlocksOptions {
  // Reserved for future options (caption numbering, scope class, …).
}

/** A marked extension wiring markpage's block renderers into fenced code. */
export function markpageBlocks(
  _options: MarkpageBlocksOptions = {},
): MarkedExtension {
  return {
    renderer: {
      code(token: Tokens.Code): string | false {
        // `token.lang` is the whole info string (e.g. `chart line "T"`); the
        // first word is the fence name, the rest are the block's own options.
        const info = (token.lang ?? '').trim();
        const name = info.split(/\s+/, 1)[0] ?? '';
        if (name && hasBlock(name)) {
          const html = renderBlock(name, token.text, info);
          if (html != null) return html;
        }
        return false; // not ours — let marked render the code block normally
      },
    },
  };
}
