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

/** Inject the active backdrop items into a page's box, behind the content. */
function injectLayer(page: HTMLElement, items: Sentinel[]): void {
  const pagebox = page.querySelector<HTMLElement>('.pagedjs_pagebox');
  if (!pagebox || pagebox.querySelector(':scope > .mp-bg-layer')) return;
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
  pagebox.insertBefore(layer, pagebox.firstChild);
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
    let spec: BackgroundSpec;
    try {
      spec = JSON.parse(el.getAttribute('data-bg') ?? '{}') as BackgroundSpec;
    } catch {
      continue;
    }
    const body = el.innerHTML.trim();
    const reset = body === '' && !spec.fill && spec.at == null && spec.size == null;
    sentinels.push({ page: idx, spec, body, reset });
  }
  if (sentinels.length === 0) return;

  // Group by page, preserving document order within a page.
  const byPage = new Map<number, Sentinel[]>();
  for (const s of sentinels) {
    const list = byPage.get(s.page);
    if (list) list.push(s);
    else byPage.set(s.page, [s]);
  }

  let persistent: Sentinel[] = [];
  for (let p = 0; p < pages.length; p += 1) {
    const here = byPage.get(p) ?? [];
    const firstOnly: Sentinel[] = [];
    for (const s of here) {
      if (s.reset) persistent = [];
      else if (s.spec.first) firstOnly.push(s);
      else persistent.push(s);
    }
    const active = [...persistent, ...firstOnly];
    if (active.length > 0) injectLayer(pages[p]!, active);
  }
}
