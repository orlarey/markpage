/********************************* pagination **********************************
 *
 * Purpose: the shared *fragmentation policy* — the `break-*` / orphans / widows
 *   rules that keep a paged.js render free of orphaned headings, orphaned table
 *   headers, split rows and dangling lines. Consumed by BOTH the host app
 *   ([src/preview-paginated.ts]) and the VS Code extension's webview, so the
 *   policy lives in exactly one place and the two can't drift apart (the drift
 *   is what produced a string of one-off orphan bugs).
 *
 * Left UNSCOPED on purpose: paged.js's break-rule processor naively splits a
 *   selector list on commas before calling querySelectorAll, which corrupts
 *   pseudo-class lists like `:is(a, b)` / `:where(a, b)`. `break-*` properties
 *   are inert outside a paginated context, so emitting them globally is
 *   harmless.
 *
 * The `.keep-with-next` rule pairs with the host's `keepLabelsWithNext()` DOM
 *   transform (it wraps a label with its immediate next sibling so the pair
 *   gets a real `break-inside: avoid` boundary — the reliable fix for when
 *   `break-after: avoid` alone is honoured inconsistently by paged.js). Where
 *   that transform is not run, the rule is simply inert.
 *
 *******************************************************************************/

/** The shared `break-*` fragmentation policy, as a CSS string to splice into
 *  the page stylesheet handed to paged.js. */
export function paginationCss(): string {
  return `
    /* Keep a heading with the content that follows it — no orphaned title at
       a page foot. */
    h1, h2, h3, h4, h5, h6 { break-after: avoid; }
    h1 + *, h2 + *, h3 + *, h4 + *, h5 + *, h6 + * { break-before: avoid; }
    /* Reliable keep-with-next: the pair wrapped by keepLabelsWithNext(). */
    .keep-with-next { break-inside: avoid; }
    /* Atomic blocks never split across a page boundary. */
    .math-block, .mermaid-block, img { break-inside: avoid; }
    .admonition, .columns-block, figure.captioned { break-inside: avoid; }
    /* Tables: keep the header with the first row (no orphaned <thead> at a
       page foot) and never split a row; paged.js repeats the header when a
       long table spills onto the next page. */
    thead { break-after: avoid; break-inside: avoid; }
    tr { break-inside: avoid; }
    /* No single dangling first/last line of a paragraph or list item. */
    p, li { orphans: 3; widows: 3; }
  `;
}
