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
    /* Long-<pre> fragments emitted by splitLongPreBlocks (cf. pre-split.ts):
       suppress the box seam between adjacent chunks so a code block split
       across pages still reads as one continuous block. */
    pre.pre-chunk-first { margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; padding-bottom: 0; }
    pre.pre-chunk-middle { margin-top: 0; margin-bottom: 0; border-radius: 0; padding-top: 0; padding-bottom: 0; }
    pre.pre-chunk-last { margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; padding-top: 0; }
  `;
}

/** A block that a heading / lead-in paragraph should not be split from — the
 *  ones tall enough that `break-after: avoid` alone is honoured inconsistently
 *  by paged.js (fenced code, table, image, math, mermaid). */
function isPresentableBlock(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'pre' || tag === 'table' || tag === 'img') return true;
  if (el.classList.contains('math-block')) return true;
  if (el.classList.contains('mermaid-block')) return true;
  return false;
}

/** A block that is ALREADY atomic — paginationCss() marks it `break-inside:
 *  avoid` on its own (figure.captioned, callouts, columns, math, mermaid, a
 *  bare image). Wrapping such a block together with its heading in a second
 *  `break-inside: avoid` box is both redundant and harmful: paged.js mishandles
 *  the nested avoid near a page boundary and drops the tail of the inner block
 *  (e.g. the last rows of an `algorithm` table vanish). For these we skip the
 *  wrapper and rely on the heading's `break-after: avoid` to keep them together. */
function isAtomicBlock(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return true;
  if (tag === 'figure' && el.classList.contains('captioned')) return true;
  return (
    el.classList.contains('math-block') ||
    el.classList.contains('mermaid-block') ||
    el.classList.contains('admonition') ||
    el.classList.contains('columns-block')
  );
}

/** A "label": a heading, or a paragraph that introduces a presentable block
 *  (e.g. "Mesure réelle :" right before a code block). */
function isLabel(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') return true;
  if (tag === 'p') {
    const next = el.nextElementSibling;
    return next ? isPresentableBlock(next) : false;
  }
  return false;
}

/**
 * Purpose: Reliably keep a heading (or lead-in paragraph) with the content that
 *   follows it — the JS half of the orphan-control policy. `break-after: avoid`
 *   alone is honoured inconsistently by paged.js when the next block is tall, so
 *   we wrap each label with its immediate next sibling in a `.keep-with-next`
 *   div (paginationCss() marks that `break-inside: avoid`).
 * How: Walk every element in REVERSE document order so chains of headings nest
 *   (h2 then h3 then prose → the h3+prose wrapper becomes the h2's "next"). Skip
 *   h2 in slides mode (it carries `break-before: page`) and letterhead groups.
 *   Operates in place on `root`; run it on the render DOM before pagination.
 */
export function keepLabelsWithNext(
  root: HTMLElement,
  inSlidesMode = false,
): void {
  const all = [...root.querySelectorAll<HTMLElement>('*')].reverse();
  for (const el of all) {
    if (!isLabel(el)) continue;
    if (inSlidesMode && el.tagName.toLowerCase() === 'h2') continue;
    const next = el.nextElementSibling;
    if (!next) continue;
    if (!el.parentElement) continue;
    if (next.classList.contains('letterhead-group')) continue;
    // The next block already avoids internal breaks; nesting it in a second
    // break-inside:avoid wrapper makes paged.js drop its tail. Keep them
    // together via the heading's break-after:avoid instead (paginationCss).
    if (isAtomicBlock(next)) continue;
    const wrapper = root.ownerDocument.createElement('div');
    wrapper.className = 'keep-with-next';
    el.before(wrapper);
    wrapper.appendChild(el);
    wrapper.appendChild(next);
  }
}
