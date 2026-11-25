/****************************** fragment-duplicates.ts *************************
 *
 * Purpose: Drop the stale copy of an atomic object Vivliostyle laid twice. When
 *   a paragraph breaks right after an inline formula, the next page's fragment
 *   can restart BEFORE that formula, while the previous page's last line still
 *   holds it: the reader sees "… inférieure à 2M" at a page foot and "2M,
 *   laisse …" at the top of the next page (LA-FORME-NORMALE, page 12 → 13).
 * How: Atomic objects (formulas, SVGs) carry `data-mp-pristine` — one id per
 *   source object (preview-vivliostyle.ts). After pagination, an id found on
 *   several pages is a duplicate: keep the copy on the LAST page (where the
 *   layout continued from) and remove the earlier ones. Removing an inline
 *   object only shortens its line; nothing else moves.
 *
 ****************************************************************************/

const PAGE = '.pagedjs_page, [data-vivliostyle-page-container]';
const AREA = '.pagedjs_page_content, [data-vivliostyle-page-area-container]';
const RUNNING = '.mp-running, .pagedjs_margin, [data-vivliostyle-page-margin-box], .mp-bg';

/**
 * Remove every copy of a pristine object but the last one. Returns the number
 * of copies removed.
 */
export function dropStaleAtomCopies(renderTo: ParentNode): number {
  const byId = new Map<string, Element[]>();
  for (const page of renderTo.querySelectorAll(PAGE)) {
    // The text area only: a running header or footer (a logo is an SVG, hence
    // pristine) repeats on every page by design.
    const area = page.querySelector(AREA) ?? page;
    for (const el of area.querySelectorAll('[data-mp-pristine]')) {
      if (el.closest(RUNNING)) continue;
      // An object nested in another pristine object travels with it.
      if (el.parentElement?.closest('[data-mp-pristine]')) continue;
      const id = el.getAttribute('data-mp-pristine') ?? '';
      const list = byId.get(id) ?? [];
      list.push(el);
      byId.set(id, list);
    }
  }
  let removed = 0;
  for (const copies of byId.values()) {
    // Only copies on DIFFERENT pages are layout duplicates: the same id twice
    // on one page cannot come from a page break.
    const pages = new Set(copies.map((c) => c.closest(PAGE)));
    if (pages.size < 2) continue;
    for (const stale of copies.slice(0, -1)) {
      stale.remove();
      removed += 1;
    }
  }
  return removed;
}
