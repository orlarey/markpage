/********************************* preview-vivliostyle.ts **********************
 *
 * SPIKE — render the paginated preview with Vivliostyle Core instead of
 *   paged.js, to evaluate replacing the engine (branch `vivliostyle`).
 * How: Build a standalone in-memory Document from the hydrated source (same
 *   phase-A/B output the paged.js path uses), inline the page CSS, and hand it
 *   to `CoreViewer` via `DocumentOptions.documentObject` — no serialisation,
 *   no fetch. The point of the spike is that NONE of the paged.js mitigation
 *   passes run (pre-split, keep-with-next, atomic-fit, repairColumnOverflow):
 *   we are measuring Vivliostyle's own fragmentation quality.
 * Licence note: @vivliostyle/core is AGPL-3.0 — shipping it in the app bundle
 *   is a licensing decision still to be made; this module is dev-only for now
 *   (dynamic import behind the `markpage:engine` localStorage flag).
 *
 *******************************************************************************/

import { CoreViewer } from '@vivliostyle/core';

/** Render `source`'s content as A4 pages into `renderTo`. Resolves with the
 *  page count once Vivliostyle reports the document fully loaded. */
export async function renderVivliostylePreview(
  source: HTMLElement,
  css: string,
  renderTo: HTMLElement,
): Promise<number> {
  // Standalone document: <base> so relative image URLs keep resolving against
  // the app, one inline <style> so @page rules sit in the author origin (a
  // user stylesheet would lose the cascade against UA defaults).
  const doc = document.implementation.createHTMLDocument('markpage preview');
  const base = doc.createElement('base');
  base.setAttribute('href', document.baseURI);
  doc.head.appendChild(base);
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.appendChild(style);
  doc.body.innerHTML = source.innerHTML;

  renderTo.replaceChildren();
  // The app's global `* { box-sizing: border-box }` reset (style.css) breaks
  // Vivliostyle's page scaffolding, which sizes its boxes assuming content-box
  // (width = content, page margins as padding). Under border-box the padding
  // is subtracted a second time — the writable area shrinks from ~629px to
  // ~135px and the document explodes into hundreds of sliver pages. Restore
  // content-box on the scaffolding only (our own content keeps border-box).
  if (!document.getElementById('mp-vivliostyle-boxfix')) {
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
  const viewport = renderTo.ownerDocument.createElement('div');
  viewport.style.cssText = 'width: 100%; height: 1400px; overflow: auto;';
  renderTo.appendChild(viewport);
  const viewer = new CoreViewer(
    { viewportElement: viewport },
    {
      renderAllPages: true,
      autoResize: false,
      fitToScreen: false,
      // Keep real CSS px so our e2e geometry probes measure what users see.
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
  return pages;
}
