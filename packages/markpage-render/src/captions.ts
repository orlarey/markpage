/********************************* captions.ts *********************************
 *
 * Purpose: The app's captioned-block infrastructure — now a thin adapter over
 *   @orlarey/blocks' shared caption context, configured with French labels
 *   and the app's own cross-ref anchor-id scheme (refs.ts). The public API
 *   (resetCaptions / nextCaptionNumber / withCaption / parseFenceInfo) is
 *   unchanged, so marked-config and the exporters keep working as-is.
 *
 *******************************************************************************/

import {
  createCaptionContext,
  parseFenceInfo,
  type CaptionKind,
} from '@orlarey/blocks';
import { anchorId } from './refs';

export type { CaptionKind };
export { parseFenceInfo };

// Single per-document context. French labels match the admonition renderer;
// the app's `anchorId` ties `\label{}`'d captions into its cross-ref system.
const ctx = createCaptionContext({
  labels: {
    algorithm: 'Algorithme',
    figure: 'Figure',
    table: 'Tableau',
    listing: 'Listing',
  },
  anchorId,
});

/** Reset every per-kind counter between renders (marked preprocess hook). */
export function resetCaptions(): void {
  ctx.reset();
}

/** Allocate the next number for a given kind. */
export function nextCaptionNumber(kind: CaptionKind): number {
  return ctx.next(kind);
}

/** Wrap block HTML in an auto-numbered `<figure>` + `<figcaption>`. */
export function withCaption(
  kind: CaptionKind,
  caption: string | null,
  blockHtml: string,
  labelKey: string | null = null,
): string {
  return ctx.wrap(kind, caption, blockHtml, labelKey);
}
