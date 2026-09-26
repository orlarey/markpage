/********************************* background.ts *******************************
 *
 * Purpose: Realise the `::: background` page backdrop (BACKGROUND-SPEC) on a
 *   paginated render. The marked renderer emits each block as a hidden,
 *   zero-height `.mp-bg` sentinel that stays in the flow (so paged.js places it
 *   on a page). After pagination, applyBackgrounds() computes the cascade
 *   (which backdrops are active on each page) and clones a layer into each
 *   `.pagedjs_pagebox`, behind the content.
 * How: walk the sentinels in document order, note the page each landed on, then
 *   replay the cascade per page — normal blocks accumulate and persist to the
 *   following pages, an empty block resets the layer, a `first` block applies to
 *   its own page only (B2/B5). Each item is positioned from its [0,1] `at`/`size`
 *   with a self-aligning anchor (B4); no `size` ⇒ full page (fill / full-bleed).
 *
 *******************************************************************************/

interface BackgroundSpec {
  at: [number, number] | null;
  size: number | null;
  anchor: [number, number] | null;
  fill: string | null;
  first: boolean;
  margins: boolean;
}

interface Sentinel {
  page: number; // index of the page it landed on
  spec: BackgroundSpec;
  body: string; // rendered minipage HTML
  reset: boolean; // empty block → clears the layer
}

/** Position one backdrop item from its spec. No `size` ⇒ full page. */
function styleItem(item: HTMLElement, spec: BackgroundSpec): void {
  if (spec.fill) item.style.background = spec.fill;
  if (spec.size == null) {
    item.classList.add('mp-bg-full'); // covers the whole layer (CSS inset:0)
    return;
  }
  const [x, y] = spec.at ?? [0, 0];
  const [ax, ay] = spec.anchor ?? [x, y];
  item.style.left = `${x * 100}%`;
  item.style.top = `${y * 100}%`;
  item.style.width = `${spec.size * 100}%`;
  // Self-aligning anchor: bring the minipage's (ax, ay) point onto (x, y).
  item.style.transform = `translate(${-ax * 100}%, ${-ay * 100}%)`;
}

/** The backdrop layer holding `items` (positioned against its container). */
function buildLayer(items: Sentinel[]): HTMLElement {
  const anyMargins = items.some((s) => s.spec.margins);
  const layer = document.createElement('div');
  layer.className = anyMargins ? 'mp-bg-layer mp-bg-inset' : 'mp-bg-layer';
  for (const s of items) {
    const item = document.createElement('div');
    item.className = 'mp-bg-item';
    styleItem(item, s.spec);
    item.innerHTML = s.body;
    layer.appendChild(item);
  }
  return layer;
}

/** Inject the active backdrop items into a page's box, behind the content. */
function injectLayer(page: HTMLElement, items: Sentinel[]): void {
  const pagebox = page.querySelector<HTMLElement>('.pagedjs_pagebox');
  if (!pagebox || pagebox.querySelector(':scope > .mp-bg-layer')) return;
  pagebox.insertBefore(buildLayer(items), pagebox.firstChild);
}

/** Read one `.mp-bg` sentinel (null when its payload is unreadable). */
function readSentinel(el: HTMLElement, page: number): Sentinel | null {
  let spec: BackgroundSpec;
  try {
    spec = JSON.parse(el.getAttribute('data-bg') ?? '{}') as BackgroundSpec;
  } catch {
    return null;
  }
  const body = el.innerHTML.trim();
  const reset = body === '' && !spec.fill && spec.at == null && spec.size == null;
  return { page, spec, body, reset };
}

/** The backdrops active on a page, from the ones persisting into it and the
 *  sentinels that landed on it (in order). Updates `persistent`. */
function activeOn(here: Sentinel[], persistent: Sentinel[]): Sentinel[] {
  const firstOnly: Sentinel[] = [];
  for (const s of here) {
    if (s.reset) persistent.length = 0;
    else if (s.spec.first) firstOnly.push(s);
    else persistent.push(s);
  }
  return [...persistent, ...firstOnly];
}

/**
 * The continuous (unpaginated) preview is ONE long page: every backdrop
 * applies to the whole sheet — `at` / `size` from 0 to 1 over its full width
 * and height — with the cascade as if every sentinel were on that page.
 * The layer sits behind the content (the sheet isolates the stacking).
 */
export function applySheetBackgrounds(sheet: HTMLElement): void {
  sheet.querySelector(':scope > .mp-bg-layer')?.remove();
  const here = Array.from(sheet.querySelectorAll<HTMLElement>('.mp-bg'))
    .map((el) => readSentinel(el, 0))
    .filter((s): s is Sentinel => s !== null);
  const active = activeOn(here, []);
  if (active.length === 0) return;
  const layer = buildLayer(active);
  layer.style.zIndex = '-1';
  sheet.style.isolation = 'isolate';
  sheet.insertBefore(layer, sheet.firstChild);
}

/**
 * Clone `::: background` backdrops onto every page of their run. Call after
 * paged.js has produced `renderTo` (and after any other per-page post-step).
 * Idempotent per page.
 */
export function applyBackgrounds(renderTo: HTMLElement): void {
  const pages = Array.from(renderTo.querySelectorAll<HTMLElement>('.pagedjs_page'));
  if (pages.length === 0) return;
  const pageOf = new Map<HTMLElement, number>(pages.map((p, i) => [p, i]));

  const sentinels: Sentinel[] = [];
  for (const el of renderTo.querySelectorAll<HTMLElement>('.mp-bg')) {
    const page = el.closest<HTMLElement>('.pagedjs_page');
    const idx = page ? pageOf.get(page) : undefined;
    if (idx == null) continue;
    const s = readSentinel(el, idx);
    if (s) sentinels.push(s);
  }
  if (sentinels.length === 0) return;

  // Group by page, preserving document order within a page.
  const byPage = new Map<number, Sentinel[]>();
  for (const s of sentinels) {
    const list = byPage.get(s.page);
    if (list) list.push(s);
    else byPage.set(s.page, [s]);
  }

  const persistent: Sentinel[] = [];
  for (let p = 0; p < pages.length; p += 1) {
    const active = activeOn(byPage.get(p) ?? [], persistent);
    if (active.length > 0) injectLayer(pages[p]!, active);
  }
}
