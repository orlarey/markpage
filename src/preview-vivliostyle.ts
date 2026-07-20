/********************************* preview-vivliostyle.ts **********************
 *
 * Render the paginated preview with Vivliostyle Core instead of paged.js
 *   (branch `vivliostyle`; enabled via `localStorage markpage:engine`).
 * How: Build a standalone in-memory Document from the hydrated source — body
 *   carries a neutral id (#mp-viv-root, swapped into the scoped pagedCss rules) — and
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
// Construct CSS as TEXT: the standalone document Vivliostyle lays out has none
// of the app's global stylesheets, so fenced constructs (adt, tree, chart…)
// lost their layout — an `adt` block collapsed onto a single line for want of
// `white-space: pre`. Imported ?inline (not as a side effect) so we can inject
// exactly these sheets and NOT style.css, whose global
// `* { box-sizing: border-box }` reset breaks Vivliostyle's layout model.
import constructsCss from '@orlarey/markpage-render/constructs.css?inline';
import blocksCss from '@orlarey/blocks/styles.css?inline';
import hljsCss from 'highlight.js/styles/atom-one-light.css?inline';

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

/** Restore content-box everywhere inside Vivliostyle pages. The app's global
 *  `* { box-sizing: border-box }` reset (style.css) conflicts with the model
 *  Vivliostyle computed its layout in: the author stylesheet of the standalone
 *  document never sets box-sizing, so every box — scaffolding AND content —
 *  was laid out as content-box, with the page margins carried as padding.
 *  Rendering any of those boxes as border-box shrinks it (margins counted
 *  twice → sliver-page explosion; content boxes → clipped paragraphs, squeezed
 *  SVGs). The host must therefore render the whole page subtree content-box;
 *  inline styles vivliostyle bakes on elements still win where present.
 */
function installHostFixes(): void {
  if (document.getElementById('mp-vivliostyle-boxfix')) return;
  const fix = document.createElement('style');
  fix.id = 'mp-vivliostyle-boxfix';
  fix.textContent = `
    [data-vivliostyle-page-container],
    [data-vivliostyle-page-container] * {
      box-sizing: content-box;
    }
    /* EXCEPT inside SVG: mermaid labels are HTML in <foreignObject>, laid out
       at hydration time under the app's border-box reset. Rendering them
       content-box grows them past their frozen foreignObject height — the
       text gets clipped mid-glyph. SVG geometry ignores box-sizing, so the
       rule is safe for the whole subtree. */
    [data-vivliostyle-page-container] svg * {
      box-sizing: border-box;
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

/** Selector for rendered objects whose DOM must survive layout byte-for-byte. */
const PRISTINE_SELECTOR = '.math-inline, .math-block, .mermaid-block';

/** Tag each pristine block in `source` so its page copy can be matched back. */
function tagPristineBlocks(source: HTMLElement): void {
  let n = 0;
  for (const el of source.querySelectorAll(PRISTINE_SELECTOR)) {
    el.setAttribute('data-mp-pristine', String(n));
    n += 1;
  }
}

/** Swap every rendered pristine block for a clone of the untouched original.
 *
 *  Vivliostyle rewrites the DOM it lays out in two ways that break rendered
 *  SVG:
 *   - it absolutises every href against the document URL, so a MathJax
 *     `<use href="#glyph">` becomes `http://host/#glyph` and resolves to
 *     nothing — the formula gets a correctly-sized but EMPTY box;
 *   - it bakes the document's typography (paragraph margins, orphans/widows)
 *     as inline styles onto the HTML inside `<foreignObject>`, so mermaid
 *     labels outgrow their frozen boxes and clip mid-glyph.
 *
 *  Both are cured by restoring the original subtree after layout. Clone from
 *  `source` — the hydrated DOM we were handed — never from the document
 *  Vivliostyle owns, which it stamps too. Safe because these blocks are
 *  atomic: fitOversizedAtomicBlocks guarantees they are never fragmented, so
 *  a page copy is always the whole object. */
function restorePristineBlocks(source: HTMLElement, renderTo: HTMLElement): void {
  const pristine = new Map<string, Element>();
  for (const el of source.querySelectorAll('[data-mp-pristine]')) {
    pristine.set(el.getAttribute('data-mp-pristine') ?? '', el);
  }
  if (pristine.size === 0) return;
  for (const rendered of renderTo.querySelectorAll(
    '[data-vivliostyle-page-container] [data-mp-pristine]',
  )) {
    const original = pristine.get(rendered.getAttribute('data-mp-pristine') ?? '');
    if (original) rendered.replaceWith(original.cloneNode(true));
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
  tagPristineBlocks(source);

  // Standalone document. NO <base>: Vivliostyle resolves every href against
  // it, which rewrites a MathJax `<use href="#glyph">` into
  // `http://host/#glyph`. The internal reference then resolves to nothing and
  // the formula renders as a correctly-sized but EMPTY box. `loadDocument`
  // already receives the base URL, which is what relative image srcs need.
  const doc = document.implementation.createHTMLDocument('markpage preview');
  const style = doc.createElement('style');
  // The scoped pagedCss rules key on #preview-pane — but Vivliostyle CLONES
  // the source body into the host DOM as a wrapper inside every page, so
  // reusing that id would (a) duplicate a host id and (b) let the app's
  // style.css paint its pane background INSIDE the pages (the grey wash).
  // Rename the scope to a neutral id that no host rule targets.
  style.textContent = [hljsCss, blocksCss, constructsCss,
    css.replaceAll('#preview-pane', '#mp-viv-root'),
    VIVLIOSTYLE_CSS_ADDENDUM].join('\n');
  doc.head.appendChild(style);
  doc.body.id = 'mp-viv-root';
  // The construct stylesheets are scoped `:where(.markpage)` — without the
  // class an `adt` block loses `white-space: pre` and collapses onto one line.
  // Same class the print target carries.
  doc.body.classList.add('markpage');
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
  restorePristineBlocks(source, renderTo);
  resolveTocPageNumbers(renderTo);
  return pages;
}
