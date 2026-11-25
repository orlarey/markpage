/******************************** heading-orphans.ts ***************************
 *
 * Purpose: Keep a heading off the foot of a page. The fragmentation policy asks
 *   for it (`h1…h6 { break-after: avoid }`, `h + * { break-before: avoid }`),
 *   but Vivliostyle does not always honour it: when the content after the
 *   heading cannot start on the page, it backtracks and lays the heading again
 *   at the top of the next page — yet leaves the first copy at the foot of the
 *   previous one. The reader sees the title twice, once alone at a page foot,
 *   once (without its number) at the top of the next page.
 * How: After pagination, find every heading that has content before it on its
 *   page, nothing after it on that page, and content after it in the document.
 *   Mark the first heading of its run (a "2" directly followed by a "2.1" moves
 *   with it) in the SOURCE with `.mp-force-page-break` (break-before: page, see
 *   paginationCss) and let the host paginate once more. A heading forced to the
 *   top of a page needs no backtracking, so the duplicate disappears with the
 *   orphan.
 *
 ****************************************************************************/

const HEADING = /^H[1-6]$/;

/** The page's flow area (the text block, without the margin boxes). */
const PAGE_AREA = '.pagedjs_page_content, [data-vivliostyle-page-area-container]';
const PAGE = '.pagedjs_page, [data-vivliostyle-page-container]';

/** Whether `el` paints something: text, an image, a formula, a diagram. */
const VISUAL = 'img, svg, canvas, video, hr, table';

function hasContent(el: Element): boolean {
  if ((el.textContent ?? '').trim() !== '') return true;
  return el.matches(VISUAL) || el.querySelector(VISUAL) !== null;
}

/** Elements of `area` strictly after / before `node` in document order,
 *  skipping its own descendants and ancestors. */
function contentAround(area: Element, node: Element): { before: boolean; after: boolean } {
  let before = false;
  let after = false;
  for (const el of area.querySelectorAll('*')) {
    if (el === node || node.contains(el) || el.contains(node)) continue;
    // Only leaves of content matter: an ancestor of other elements is judged
    // through them, an element with direct text through itself.
    const direct = [...el.childNodes].some(
      (c) => c.nodeType === 3 && (c.textContent ?? '').trim() !== '',
    );
    const leaf = el.children.length === 0 || direct || el.matches(VISUAL);
    if (!leaf || !hasContent(el)) continue;
    const pos = node.compareDocumentPosition(el);
    if (pos & 4) after = true; // DOCUMENT_POSITION_FOLLOWING
    else if (pos & 2) before = true; // DOCUMENT_POSITION_PRECEDING
    if (before && after) break;
  }
  return { before, after };
}

/** The heading that opens the run `heading` closes: walk back over directly
 *  preceding sibling headings (nothing in between). */
function runStart(heading: Element): Element {
  let first = heading;
  for (let prev = heading.previousElementSibling; prev; prev = prev.previousElementSibling) {
    if (HEADING.test(prev.tagName)) first = prev;
    else if (hasContent(prev)) break;
  }
  return first;
}

/** A key that finds the same heading in the source: its id, else its line. */
function headingKey(el: Element): string | null {
  const id = el.getAttribute('id');
  if (id) return `#${id}`;
  const line = el.getAttribute('data-line');
  return line ? `${el.tagName.toLowerCase()}[data-line="${line}"]` : null;
}

/**
 * Find the headings left alone at the foot of a page in a paginated render.
 * Returns their source keys (see headingKey), each the first heading of its
 * run. Pure DOM reading — no mutation.
 */
export function findOrphanHeadings(renderTo: ParentNode): string[] {
  const keys: string[] = [];
  for (const page of renderTo.querySelectorAll(PAGE)) {
    const area = page.querySelector(PAGE_AREA) ?? page;
    const headings = [...area.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
      (h) => !h.classList.contains('doc-title') && hasContent(h),
    );
    const last = headings[headings.length - 1];
    if (!last) continue;
    const { after } = contentAround(area, last);
    if (after) continue;
    const start = runStart(last);
    // A heading (run) alone on its page is a title page or a title slide.
    if (!contentAround(area, start).before) continue;
    const key = headingKey(start);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * Mark the source headings found by findOrphanHeadings with
 * `.mp-force-page-break`, unless nothing follows them in the source (a heading
 * that ends the document has nowhere to go). Returns how many were marked.
 */
export function forceBreakBeforeOrphans(source: HTMLElement, keys: readonly string[]): number {
  let marked = 0;
  for (const key of keys) {
    let el: Element | null = null;
    try {
      el = source.querySelector(key);
    } catch {
      el = null; // an id that is not a valid selector
    }
    if (!el || el.classList.contains('mp-force-page-break')) continue;
    let next = el.nextElementSibling;
    while (next && !hasContent(next)) next = next.nextElementSibling;
    if (!next) continue;
    el.classList.add('mp-force-page-break');
    marked += 1;
  }
  return marked;
}
