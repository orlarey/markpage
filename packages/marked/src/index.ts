/********************************* @markpage/marked ****************************
 *
 * Purpose: A marked plugin that renders markpage's fenced blocks (`chart`, …),
 *   optionally wrapping a quoted-title fence in an auto-numbered figure.
 *
 *     import { marked } from 'marked';
 *     import { markpageBlocks } from '@markpage/marked';
 *     import '@markpage/blocks/styles.css';
 *
 *     marked.use(markpageBlocks());
 *     marked.parse('```chart line "Sales"\n…\n```');  // → <figure> Figure 1: …
 *
 * How: Overrides marked's fenced-`code` renderer to emit registered blocks
 *   (falling through to the default for the rest), and resets the per-document
 *   caption counters on each parse via the `preprocess` hook.
 *
 *******************************************************************************/

import {
  createCaptionContext,
  hasBlock,
  parseFenceInfo,
  renderBlock,
  type CaptionKind,
} from '@markpage/blocks';
import type { MarkedExtension, Tokens } from 'marked';

// Which numbered "kind" each fence captions as (Figure vs Listing).
const FENCE_KIND: Record<string, CaptionKind> = {
  chart: 'figure',
  bda: 'figure',
  category: 'figure',
  tree: 'figure',
  adt: 'listing',
  diff: 'listing',
};

export interface MarkpageBlocksOptions {
  /** Wrap quoted-title fences in an auto-numbered `<figure>` (default: true). */
  captions?: boolean;
  /** Override the caption label words (e.g. French: `{ figure: 'Figure' }`). */
  labels?: Partial<Record<CaptionKind, string>>;
}

/** A marked extension wiring markpage's block renderers into fenced code. */
export function markpageBlocks(
  options: MarkpageBlocksOptions = {},
): MarkedExtension {
  const withCaptions = options.captions !== false;
  const captions = createCaptionContext({ labels: options.labels });
  return {
    hooks: {
      preprocess(markdown: string): string {
        captions.reset(); // restart Figure/Listing numbering each parse
        return markdown;
      },
    },
    renderer: {
      code(token: Tokens.Code): string | false {
        const info = (token.lang ?? '').trim();
        const name = info.split(/\s+/, 1)[0] ?? '';
        if (!name || !hasBlock(name)) return false; // not ours → default render
        const html = renderBlock(name, token.text, info);
        if (html == null) return false;
        if (!withCaptions) return html;
        const { caption, label } = parseFenceInfo(info);
        return captions.wrap(FENCE_KIND[name] ?? 'figure', caption, html, label);
      },
    },
  };
}
