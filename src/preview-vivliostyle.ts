/********************************* preview-vivliostyle.ts **********************
 *
 * Render the paginated preview with Vivliostyle Core instead of paged.js
 *   (branch `vivliostyle`; enabled via `localStorage markpage:engine`).
 * How: Build a standalone in-memory Document from the hydrated source — body
 *   carries id="preview-pane" so every scoped rule of pagedCss() applies — and
 *   hand it to `CoreViewer` via `DocumentOptions.documentObject`. None of the
 *   paged.js mitigation passes run in this mode: Vivliostyle's own
 *   fragmentation is measured (and so far holds) on the clean DOM.
 *   CoreViewer is a *viewer* (one visible page, prev/next navigation), while
 *   markpage's preview is a scrolled stack — so after `loaded` the generated
 *   pages are linearized: every page container becomes a block in document
 *   flow and receives the `pagedjs_page` class, which plugs it into the app's
 *   existing chrome (white page + shadow via style.css, fit-to-width zoom via
 *   --mp-fit-zoom, fitPreviewWidth() measuring).
 * Licence: @vivliostyle/core is AGPL-3.0 — accepted for markpage (2026-07).
 *
 *******************************************************************************/

import { CoreViewer } from '@vivliostyle/core';

/** Vivliostyle-specific author-CSS addendum, appended after pagedCss():
 *  - `target-counter(attr(href url), page)`: the strictly-typed form; the
 *    untyped `attr(href)` variant in pagedCss() is a workaround for paged.js's
 *    TargetCounters parser and stays inert here.
 *  - `.toc-dots` keeps working as-is (border-bottom leader, engine-agnostic).
 */
const VIVLIOSTYLE_CSS_ADDENDUM = `
nav.toc-plus .toc-entry a[href]::after {
  content: target-counter(attr(href url), page);
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
`;

/** Restore content-box on Vivliostyle's page scaffolding. The app's global
 *  `* { box-sizing: border-box }` reset makes Vivliostyle count the page
 *  margins twice (it sizes boxes assuming content-box, margins as padding) —
 *  the writable area collapses and the document explodes into sliver pages. */
function installHostFixes(): void {
  if (document.getElementById('mp-vivliostyle-boxfix')) return;
  const fix = document.createElement('style');
  fix.id = 'mp-vivliostyle-boxfix';
  fix.textContent = `
    [data-vivliostyle-page-container], [data-vivliostyle-bleed-box],
    [data-vivliostyle-page-box], [data-vivliostyle-page-area-container],
    [data-vivliostyle-page-container] [data-vivliostyle-flow-chunk],
    [data-vivliostyle-page-container] [style*="padding"] {
      box-sizing: content-box;
    }`;
  document.head.appendChild(fix);
}

/** Turn CoreViewer's one-visible-page viewer layout into markpage's scrolled
 *  stack: unhide every page, put the wrapper chain back into normal flow, and
 *  tag pages `pagedjs_page` so the app chrome/zoom applies. Safe because the
 *  viewer is frozen after load (autoResize: false, no navigation UI). */
function linearizePages(renderTo: HTMLElement): void {
  for (const sel of [
    '[data-vivliostyle-viewer-viewport]',
    '[data-vivliostyle-outer-zoom-box]',
    '[data-vivliostyle-spread-container]',
  ]) {
    const el = renderTo.querySelector<HTMLElement>(sel);
    if (!el) continue;
    el.style.width = 'auto';
    el.style.height = 'auto';
    el.style.overflow = 'visible';
    el.style.position = 'static';
    // The spread container is display:flex (pages side by side, viewer-style);
    // block turns the run into the vertical stack the preview pane scrolls.
    el.style.display = 'block';
  }
  for (const pg of renderTo.querySelectorAll<HTMLElement>(
    '[data-vivliostyle-page-container]',
  )) {
    pg.classList.add('pagedjs_page');
    pg.style.display = 'block';
    pg.style.margin = ''; // let `.pagedjs_page { margin: 0 auto 24px }` center it
  }
}

/** Fill in the TOC page numbers. Vivliostyle materializes the
 *  `target-counter(...)` ::after as a real `<span data-adapt-pseudo="after">`
 *  but leaves it at its `??` placeholder in our frozen, navigation-less use
 *  (the viewer resolves forward references lazily as pages are displayed).
 *  We resolve them ourselves: find each entry's target in the rendered pages
 *  (by fragment id, falling back to heading-text match) and write the 1-based
 *  index of its page container. */
function resolveTocPageNumbers(renderTo: HTMLElement): void {
  const pageNumberOf = (el: Element): number | null => {
    const idx = el
      .closest('[data-vivliostyle-page-container]')
      ?.getAttribute('data-vivliostyle-page-index');
    return idx === null || idx === undefined ? null : Number(idx) + 1;
  };
  const headings = [
    ...renderTo.querySelectorAll<HTMLElement>(
      '[data-vivliostyle-page-container] :is(h1, h2, h3, h4, h5, h6)',
    ),
  ];
  const byText = new Map<string, HTMLElement>();
  for (const h of headings) {
    const key = (h.textContent ?? '').trim();
    if (key && !byText.has(key)) byText.set(key, h);
  }
  for (const a of renderTo.querySelectorAll<HTMLAnchorElement>(
    'nav.toc-plus .toc-entry a[href]',
  )) {
    const frag = (a.getAttribute('href') ?? '').split('#')[1];
    let target: Element | null = null;
    if (frag) {
      try {
        target = renderTo.querySelector(
          `[data-vivliostyle-page-container] #${CSS.escape(frag)}`,
        );
      } catch {
        /* invalid fragment — fall through to text match */
      }
    }
    target ??=
      byText.get(a.querySelector('.toc-title')?.textContent?.trim() ?? '') ??
      null;
    const num = target ? pageNumberOf(target) : null;
    const slot = a.querySelector('[data-adapt-pseudo="after"]');
    if (slot && num !== null) slot.textContent = String(num);
  }
}

/** Render `source`'s content as pages into `renderTo`; resolves with the page
 *  count once the document is fully rendered and linearized. */
export async function renderVivliostylePreview(
  source: HTMLElement,
  css: string,
  renderTo: HTMLElement,
): Promise<number> {
  installHostFixes();

  // Standalone document. <base> keeps relative image URLs resolving against
  // the app; body#preview-pane re-activates every scoped pagedCss rule (the
  // cascade is evaluated by Vivliostyle against THIS document's structure).
  const doc = document.implementation.createHTMLDocument('markpage preview');
  const base = doc.createElement('base');
  base.setAttribute('href', document.baseURI);
  doc.head.appendChild(base);
  const style = doc.createElement('style');
  style.textContent = `${css}\n${VIVLIOSTYLE_CSS_ADDENDUM}`;
  doc.head.appendChild(style);
  doc.body.id = 'preview-pane';
  doc.body.innerHTML = source.innerHTML;
  // applyPageRunningRuns() tags section membership as `data-page="mp-section-N"`
  // — a paged.js-internal side channel (its addPageAttributes reads
  // `dataset.page`). Vivliostyle only knows the standard CSS `page` property,
  // so translate: one rule per section name present in the document. This is
  // what routes content onto the named pages whose @page rules carry the
  // header/footer margin boxes.
  const sectionNames = new Set<string>();
  for (const el of doc.querySelectorAll('[data-page]')) {
    const name = el.getAttribute('data-page');
    if (name) sectionNames.add(name);
  }
  if (sectionNames.size === 1) {
    // Vivliostyle loses the page NAME on pages that start inside certain
    // fragmented boxes (split paragraphs/lists), so named margin boxes render
    // on only part of the pages. A markpage document without header/footer
    // fences is a single section — its rules can safely live on the UNNAMED
    // @page, which applies to every page. Multi-section documents keep named
    // pages (known gap: their boxes show only on cleanly-started pages).
    const only = [...sectionNames][0]!;
    style.textContent = style.textContent.replace(
      new RegExp(`@page ${only}(:[a-z]+)?\\s*\\{`, 'g'),
      '@page $1 {',
    );
  } else if (sectionNames.size > 1) {
    style.textContent += [...sectionNames]
      .map((n) => `[data-page="${n}"], [data-page="${n}"] * { page: ${n}; }`)
      .join('\n');
  }

  renderTo.replaceChildren();
  // Viewport for the layout phase; linearizePages() collapses it afterwards.
  const viewport = renderTo.ownerDocument.createElement('div');
  viewport.style.cssText = 'width: 100%; height: 1400px; overflow: auto;';
  renderTo.appendChild(viewport);
  const viewer = new CoreViewer(
    { viewportElement: viewport },
    {
      renderAllPages: true,
      autoResize: false,
      fitToScreen: false,
      // Keep real CSS px so the app's zoom/measure logic sees true geometry.
      pixelRatio: 0,
    },
  );

  const pages = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('vivliostyle: render timed out')),
      120_000,
    );
    viewer.addListener('loaded', (payload) => {
      clearTimeout(timeout);
      const counted = renderTo.querySelectorAll(
        '[data-vivliostyle-page-container]',
      ).length;
      resolve(payload?.pages ?? counted);
    });
    viewer.addListener('error', (payload) => {
      // Vivliostyle reports recoverable CSS/layout issues here; log, don't die.
      console.warn('[vivliostyle]', payload?.content ?? payload);
    });
    viewer.loadDocument({ url: document.baseURI }, { documentObject: doc });
  });

  linearizePages(renderTo);
  resolveTocPageNumbers(renderTo);
  return pages;
}
