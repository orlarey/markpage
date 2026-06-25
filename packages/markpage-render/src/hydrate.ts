/********************************* hydrate.ts *********************************
 *
 * Purpose: Phase B of the render pipeline — turn the placeholders left by the
 *   transform (phase A) into live output ON THE DOM: inline / block math →
 *   MathJax SVG, ```mermaid → rendered SVG. Needs a DOM + the MathJax / Mermaid
 *   libs (lazy-loaded), so it runs in a browser or a webview, not in pure node.
 * How: query the placeholders, render in parallel, swap the inner HTML. SVG ids
 *   are made unique per insert so duplicate renders (preview + print target)
 *   don't collide on `url(#id)` resolution.
 *
 *******************************************************************************/

import { renderMath } from './math';
import { renderMermaid } from './mermaid';
import { type MathFontSet } from './mathjax-fontsets';

export interface HydrateOptions {
  fontSet?: MathFontSet;
  preamble?: string;
}

/**
 * Run the full phase-B hydrate on a rendered root: inline math, block math,
 * then mermaid. The host calls this after inserting `renderMarkpageMarkdown`'s
 * HTML into the DOM.
 */
export async function hydratePreview(
  target: HTMLElement,
  opts: HydrateOptions = {},
): Promise<void> {
  const fontSet = opts.fontSet ?? 'newcm';
  const preamble = opts.preamble ?? '';
  await renderMathInlines(target, fontSet, preamble);
  await renderMathBlocks(target, fontSet, preamble);
  await renderMermaidBlocks(target);
}

/**
 * Purpose: Swap inline `$…$` placeholders for MathJax SVGs (or red error spans).
 * How: Query `.math-inline[data-math]`, render in parallel, set inner HTML.
 */
export async function renderMathInlines(
  target: HTMLElement,
  fontSet: MathFontSet = 'newcm',
  preamble = '',
): Promise<void> {
  const placeholders = Array.from(
    target.querySelectorAll<HTMLElement>('span.math-inline[data-math]'),
  );
  if (placeholders.length === 0) return;
  await Promise.all(
    placeholders.map(async (el) => {
      const source = el.dataset['math'] ?? '';
      const result = await renderMath(source, false, fontSet, preamble);
      if (result.ok) {
        el.innerHTML = makeIdsUnique(result.svg);
      } else {
        el.classList.add('math-error');
        el.textContent = source;
        el.title = `Erreur LaTeX : ${result.error}`;
      }
    }),
  );
}

/**
 * Purpose: Prefix every `id` and every `#id` reference in an SVG so duplicate
 *   inserts (preview + print target) don't collide on `url(#id)` resolution.
 * How: Parse, harvest ids into a map, rewrite attributes and `<style>` text.
 */
let uniqueIdCounter = 0;
function makeIdsUnique(svg: string): string {
  uniqueIdCounter += 1;
  const prefix = `mid${uniqueIdCounter}-`;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;

  // Build the id → newId map and stamp the new ids onto every element.
  const idMap = new Map<string, string>();
  for (const el of root.querySelectorAll<Element>('[id]')) {
    const oldId = el.getAttribute('id');
    if (!oldId) continue;
    const newId = prefix + oldId;
    idMap.set(oldId, newId);
    el.setAttribute('id', newId);
  }
  if (idMap.size === 0) return svg;

  // Rewrites every `#oldId` in a string to `#newId`, keeping unrelated
  // hash sequences (e.g. CSS colours `#fff`) untouched because `idMap`
  // only contains real ids harvested above.
  const rewrite = (s: string): string =>
    s.replaceAll(/#([\w-]+)/g, (match, id: string) => {
      const replaced = idMap.get(id);
      return replaced ? `#${replaced}` : match;
    });

  // 1. Attribute references (href, xlink:href, marker-end, fill,
  //    stroke, mask, clip-path, filter…). Walk every attribute that
  //    contains a `#` so we don't have to maintain a list.
  for (const el of root.querySelectorAll<Element>('*')) {
    for (const attr of el.attributes) {
      if (attr.name === 'id') continue;
      if (!attr.value.includes('#')) continue;
      const updated = rewrite(attr.value);
      if (updated !== attr.value) el.setAttribute(attr.name, updated);
    }
  }

  // 2. CSS selectors inside <style> blocks (e.g. `#mermaid-1 .node rect
  //    { fill: ... }`) — what we'd missed in the first regex pass and
  //    that made mermaid diagrams render as black rectangles.
  for (const styleEl of root.querySelectorAll<Element>('style')) {
    const css = styleEl.textContent ?? '';
    if (!css.includes('#')) continue;
    styleEl.textContent = rewrite(css);
  }

  return new XMLSerializer().serializeToString(root);
}

/**
 * Purpose: Swap `$$…$$` block placeholders for MathJax SVGs (or red error blocks).
 * How: Query `.math-block[data-math]`, render in parallel, replace inner HTML.
 */
export async function renderMathBlocks(
  target: HTMLElement,
  fontSet: MathFontSet = 'newcm',
  preamble = '',
): Promise<void> {
  const placeholders = Array.from(
    target.querySelectorAll<HTMLElement>('.math-block[data-math]'),
  );
  if (placeholders.length === 0) return;
  await Promise.all(
    placeholders.map(async (el) => {
      const source = el.dataset['math'] ?? '';
      const result = await renderMath(source, true, fontSet, preamble);
      if (result.ok) {
        el.innerHTML = makeIdsUnique(result.svg);
      } else {
        el.classList.add('math-error');
        const msg = document.createElement('div');
        msg.className = 'math-error-msg';
        msg.textContent = `Erreur LaTeX : ${result.error}`;
        const sourcePre = document.createElement('pre');
        sourcePre.textContent = source;
        el.append(msg, sourcePre);
      }
    }),
  );
}

/**
 * Purpose: Replace every ```mermaid code block with its rendered SVG (or error block).
 * How: Find `<code.language-mermaid>`, render in parallel, swap the `<pre>` for a div.
 */
export async function renderMermaidBlocks(target: HTMLElement): Promise<void> {
  const codes = Array.from(
    target.querySelectorAll<HTMLElement>('code.language-mermaid'),
  );
  if (codes.length === 0) return;
  await Promise.all(
    codes.map(async (code) => {
      const pre = code.parentElement;
      if (!pre) return;
      const source = code.textContent ?? '';
      const result = await renderMermaid(source);
      // Preserve the `data-line` attribute so scroll-sync still works after
      // the swap.
      const dataLine = pre.dataset.line;
      const wrapper = document.createElement('div');
      if (dataLine !== undefined) wrapper.dataset.line = dataLine;
      // Stash the original markdown form on the wrapper so the help
      // window's insert-button machinery can offer "insert this" on
      // a rendered diagram (otherwise the source is lost when we
      // replace the <pre><code> with the SVG below).
      wrapper.dataset.source = `\`\`\`mermaid\n${source.replace(/\n$/, '')}\n\`\`\``;
      if (result.ok) {
        wrapper.className = 'mermaid-block block-rigid';
        wrapper.innerHTML = makeIdsUnique(result.svg);
      } else {
        wrapper.className = 'mermaid-error';
        const msg = document.createElement('div');
        msg.className = 'mermaid-error-msg';
        msg.textContent = `Erreur Mermaid : ${result.error}`;
        const sourcePre = document.createElement('pre');
        sourcePre.textContent = source;
        wrapper.append(msg, sourcePre);
      }
      pre.replaceWith(wrapper);
    }),
  );
}
