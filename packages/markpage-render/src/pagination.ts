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
       DOM ourselves (what splitLongPreBlocks did for paged.js). The block
       starts in the space left on the current page because neither the <pre>
       nor its <code> scrolls (overflow: visible, below): a scrolling box is
       monolithic for the fragmentation engine. */
    pre { orphans: 3; widows: 3; }
    /* Added after a pagination pass to a heading left alone at the foot of a
       page (src/heading-orphans.ts); the host then paginates once more.
       break-after: avoid alone is not enough: Vivliostyle may lay the heading
       again at the top of the next page and leave a stale copy at the foot. */
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
    /* Callouts. A box cut after its title or its first line reads badly, so:
       - a short callout (definition, theorem, proof…) is kept whole. The host
         marks it .mp-keep-together after measuring it at the final text width
         (markKeepTogether in atomic-fit.ts): only boxes up to half the text
         height qualify, so the blank left at a page foot stays bounded;
       - a tall callout still spans pages, but its title is glued to the first
         lines of its body (with p { orphans: 3 }, at least three of them).
       The paged.js reason for leaving the title/body boundary free (paged.js
       dropped the title and the first paragraph when break-after:avoid
       reached the body) died with paged.js: Vivliostyle honours these rules
       without losing content. */
    .admonition,
    .admonition-body {
      break-inside: auto;
    }
    .admonition.mp-keep-together { break-inside: avoid; }
    .admonition {
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .admonition-title { break-inside: avoid; break-after: avoid; }
    .admonition-body > :first-child { break-before: avoid; }
    /* Tables: keep the header with the first row (no orphaned <thead> at a
       page foot) and never split a row; paged.js repeats the header when a
       long table spills onto the next page. */
    thead { break-after: avoid; break-inside: avoid; }
    tr { break-inside: avoid; }
    /* Table cells: no hyphenation (a header cut as "lis-seurs" reads badly),
       and a numeric cell never wraps — fitWideTables marks it .mp-num before
       measuring, so the zoom it picks already accounts for it. */
    td, th { hyphens: manual; -webkit-hyphens: manual; }
    td.mp-num { white-space: nowrap; }
    /* No single dangling first/last line of a paragraph or list item. */
    p, li { orphans: 3; widows: 3; }
    /* Definition lists: never leave a term alone at a page foot. The first
       definition remains fragmentable, but at least three of its lines stay
       together at either side of a page break. */
    /* Not the EBNF block: it is a dl too, but laid as a GRID — each rule name
       beside its diagram — and atomic as a whole. There, "keep the term with
       its definition" has no meaning, and it misled Vivliostyle's choice of a
       page break around the block: the section that held it (heading, lead
       paragraph, diagrams) was pushed whole to the next page, though it fitted
       on the current one (a title page left 32 % full). */
    dl:not(.ebnf-block) > dt { break-after: avoid; }
    dl:not(.ebnf-block) > dt + dd { break-before: avoid; }
    dd { orphans: 3; widows: 3; }
    /* Horizontal scrolling cannot expose hidden code in a printed page. Keep
       indentation, wrap at natural opportunities, then break an exceptionally
       long token as a last resort. The continuous previews retain scrolling. */
    pre > code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    /* A box that scrolls (overflow other than visible) is MONOLITHIC for the
       fragmentation engine: it cannot start in the space left at a page foot.
       highlight.js gives the code element overflow-x: auto through
       pre code.hljs, which out-specifies pre > code, so a long listing jumped
       to the next page — and with the heading kept before it, Vivliostyle laid
       that heading again on every page it tried (SHOWCASE: "6.2 Bloc long"
       alone on two pages, the code from the third). Hence !important. */
    pre, pre > code, pre code.hljs { overflow: visible !important; }
    .algorithm-code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `;
}
