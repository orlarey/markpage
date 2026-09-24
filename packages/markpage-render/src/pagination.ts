/********************************* pagination **********************************
 *
 * Purpose: the shared *fragmentation policy* — the `break-*` / orphans / widows
 *   rules that keep a paginated render free of orphaned headings, orphaned
 *   table headers, split rows and dangling lines. Consumed by the page
 *   stylesheet ([src/preview-paginated.ts]) — which the app, its print export
 *   and the VS Code preview all paginate with — so the policy lives in exactly
 *   one place (the drift between hosts is what produced a string of one-off
 *   orphan bugs).
 *
 * Left UNSCOPED on purpose: `break-*` properties are inert outside a
 *   paginated context, so emitting them globally is harmless.
 *
 *******************************************************************************/

/** The shared `break-*` fragmentation policy, as a CSS string to splice into
 *  the page stylesheet. */
export function paginationCss(): string {
  return `
    /* Keep a heading with the content that follows it — no orphaned title at
       a page foot. */
    h1, h2, h3, h4, h5, h6 { break-after: avoid; }
    h1 + *, h2 + *, h3 + *, h4 + *, h5 + *, h6 + * { break-before: avoid; }
    /* Code blocks fragment like prose: never leave fewer than three lines on
       either side of a break — below that the whole block moves on. Same
       contract as paragraphs, expressed natively instead of pre-chunking the
       DOM ourselves (what splitLongPreBlocks did for paged.js).
       KNOWN GAP: the other half of the intended rule — "the first chunk fills
       the space left on the current page" — is NOT achieved. Vivliostyle
       starts a long block on a fresh page even with 47 free lines above it,
       and nothing in our CSS asks for that: every ancestor computes
       break-inside/break-before: auto and no atomic page is involved.
       Removing the break-before rule above does not change it either. */
    pre { orphans: 3; widows: 3; }
    /* Added after a first pagination pass when a heading is found alone at
       the bottom of a page. The host then paginates once more. */
    .mp-force-page-break { break-before: page !important; }
    /* Atomic blocks never split across a page boundary. Captioned algorithms
       are the exception: their table rows are natural fragmentation points. */
    .mp-atomic { break-inside: avoid; }
    /* Only the promoted outer boundary is atomic. Renderer markers nested in
       a caption wrapper must not create a second avoid context. */
    .mp-atomic .block-rigid { break-inside: auto; }
    .columns-block, figure.captioned { break-inside: auto; }
    /* A severely oversized atomic gets a dedicated full text-height page.
       Its absolutely positioned child may borrow the physical margins while
       the wrapper remains a perfectly placeable page-sized flow box. */
    .mp-atomic-page {
      position: relative;
      width: 100%;
      height: var(--mp-atomic-text-height);
      margin: 0 !important;
      padding: 0 !important;
      break-before: page;
      break-after: page;
      break-inside: avoid;
    }
    .mp-atomic-page-content {
      position: absolute;
      left: var(--mp-atomic-center-x-recto);
      top: var(--mp-atomic-center-y);
      transform: translate(-50%, -50%) scale(var(--mp-atomic-page-scale));
      transform-origin: center center;
    }
    .pagedjs_left_page .mp-atomic-page-content {
      left: var(--mp-atomic-center-x-verso);
    }
    .mp-atomic-page .mp-atomic {
      break-inside: auto;
      margin: 0 !important;
    }
    figure.captioned-algorithm { break-inside: auto; }
    figure.captioned-algorithm .algorithm,
    figure.captioned-algorithm .algorithm-body,
    figure.captioned-algorithm .algorithm-body tbody { break-inside: auto; }
    figure.captioned-algorithm figcaption { break-before: avoid; }
    /* Callouts may span pages. Keeping the whole box atomic makes paged.js
       occasionally drop its title and first lines near a page boundary. */
    .admonition,
    .admonition-body {
      break-inside: auto;
    }
    .admonition {
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    /* Do not put an avoid constraint on the title/body boundary. paged.js
       propagates break-after:avoid to the body container; when its first
       paragraph overflows, it can then move that boundary while retaining a
       text-offset break token. The result is exactly the missing title and
       paragraph prefix this policy must prevent. Keeping the title itself
       atomic is safe; the surrounding callout remains freely fragmentable. */
    .admonition-title { break-inside: avoid; }
    /* Tables: keep the header with the first row (no orphaned <thead> at a
       page foot) and never split a row; paged.js repeats the header when a
       long table spills onto the next page. */
    thead { break-after: avoid; break-inside: avoid; }
    tr { break-inside: avoid; }
    /* No single dangling first/last line of a paragraph or list item. */
    p, li { orphans: 3; widows: 3; }
    /* Definition lists: never leave a term alone at a page foot. The first
       definition remains fragmentable, but at least three of its lines stay
       together at either side of a page break. */
    dt { break-after: avoid; }
    dt + dd { break-before: avoid; }
    dd { orphans: 3; widows: 3; }
    /* Horizontal scrolling cannot expose hidden code in a printed page. Keep
       indentation, wrap at natural opportunities, then break an exceptionally
       long token as a last resort. The continuous previews retain scrolling. */
    pre > code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      overflow-x: visible;
    }
    .algorithm-code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `;
}
