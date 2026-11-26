import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
  atomicFitDecision,
  fitAtomicBlocks,
  fitEbnfBlocks,
  markAtomicBlocks,
  type AtomicPageGeometryPx,
} from '@orlarey/markpage-render';

const geometry: AtomicPageGeometryPx = {
  textWidth: 100,
  textHeight: 100,
  pageWidth: 200,
  pageHeight: 200,
  textLeftRecto: 40,
  textLeftVerso: 60,
  textTop: 50,
  safety: 10,
};

function documentFor(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

function measured(el: HTMLElement, width: number, height: number): void {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: height });
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('atomicFitDecision', () => {
  it('leaves an object that fits the normal text area untouched', () => {
    expect(atomicFitDecision(80, 90, geometry)).toEqual({ mode: 'none', scale: 1 });
  });

  it('reduces inside the margins while the scale stays at least 0.65', () => {
    expect(atomicFitDecision(120, 100, geometry)).toEqual({
      mode: 'text',
      scale: 100 / 120,
    });
  });

  it('borrows the margins below 0.65 and keeps reducing without a floor', () => {
    expect(atomicFitDecision(300, 300, geometry)).toEqual({
      mode: 'page',
      scale: 0.6,
    });
    expect(atomicFitDecision(600, 300, geometry)).toEqual({
      mode: 'page',
      scale: 0.3,
    });
  });
});
describe('markAtomicBlocks', () => {
  it('promotes rigid content to one semantic outer boundary', () => {
    const doc = documentFor(
      '<main><figure class="captioned"><div class="chart-block block-rigid"></div>' +
        '<figcaption>Chart</figcaption></figure>' +
        '<p><img src="x.png"></p>' +
        '<div class="mosaic-row"><img src="y.png"><img src="z.png"></div>' +
        '<div class="demo-block"></div></main>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    const marked = markAtomicBlocks(root);
    expect(marked).toHaveLength(4);
    expect(root.querySelector('figure')?.classList.contains('mp-atomic')).toBe(true);
    expect(root.querySelector('figure .block-rigid')?.classList.contains('mp-atomic')).toBe(false);
    expect(root.querySelector('p')?.classList.contains('mp-atomic')).toBe(true);
    expect(root.querySelector('.mosaic-row')?.classList.contains('mp-atomic')).toBe(true);
    expect(root.querySelector('.demo-block')?.classList.contains('mp-atomic')).toBe(true);
  });
});

describe('fitAtomicBlocks', () => {
  it('uses zoom for an ordinary text-area reduction', () => {
    const doc = documentFor('<main><div class="block-rigid"></div></main>');
    const root = doc.body.firstElementChild as HTMLElement;
    const block = root.firstElementChild as HTMLElement;
    measured(block, 120, 100);
    const [result] = fitAtomicBlocks(root, geometry);
    expect(result?.mode).toBe('text');
    expect(Number.parseFloat(block.style.zoom)).toBeCloseTo(100 / 120);
    expect(block.dataset.mpAtomicFit).toBe('text');
  });

  it('creates a dedicated page when the margins must be borrowed', () => {
    const doc = documentFor('<main><div class="block-rigid"></div></main>');
    const root = doc.body.firstElementChild as HTMLElement;
    const block = root.firstElementChild as HTMLElement;
    measured(block, 300, 300);
    const [result] = fitAtomicBlocks(root, geometry);
    const page = root.firstElementChild as HTMLElement;
    expect(result?.mode).toBe('page');
    expect(result?.scale).toBeCloseTo(0.6);
    expect(page.classList.contains('mp-atomic-page')).toBe(true);
    expect(page.querySelector('.mp-atomic-page-content > .mp-atomic')).toBe(block);
    expect(page.style.getPropertyValue('--mp-atomic-center-x-recto')).toBe('60px');
    expect(page.style.getPropertyValue('--mp-atomic-center-x-verso')).toBe('40px');
    expect(block.dataset.mpAtomicFit).toBe('page');
  });
});

/** A grammar of `heights.length` productions, `width` wide. */
function grammar(width: number, heights: number[], wrap = (dl: string) => dl): {
  root: HTMLElement;
  dl: HTMLElement;
} {
  const rules = heights.map(() => '<div class="ebnf-rule"><dt>a</dt><dd></dd></div>').join('');
  const doc = documentFor(`<main>${wrap(`<dl class="ebnf-block block-rigid">${rules}</dl>`)}</main>`);
  const root = doc.body.firstElementChild as HTMLElement;
  const dl = root.querySelector('dl') as HTMLElement;
  measured(dl, width, heights.reduce((a, b) => a + b, 0));
  [...dl.querySelectorAll<HTMLElement>('.ebnf-rule')].forEach((r, i) => measured(r, width, heights[i]!));
  return { root, dl };
}

describe('fitEbnfBlocks', () => {
  it('leaves a grammar that fits the column fragmentable, however tall', () => {
    // 80 wide in a 100 column; 5 productions of 60: three pages of them.
    const { root, dl } = grammar(80, [60, 60, 60, 60, 60]);
    const results = fitAtomicBlocks(root, geometry);
    expect(results).toEqual([]); // no atomic block at all
    expect(dl.classList.contains('mp-atomic')).toBe(false);
    expect(dl.style.zoom).toBe('');
    // The width is fixed, so each page's fragment is centred alike.
    expect(dl.style.width).toBe('80px');
    expect(dl.dataset.mpEbnfFit).toBe('flow');
  });

  it('reduces the whole grammar by one factor when a production is too wide', () => {
    const { root, dl } = grammar(125, [20, 20, 20]);
    const [fit] = fitEbnfBlocks(root, geometry);
    expect(fit?.mode).toBe('flow');
    expect(fit?.scale).toBeCloseTo(0.8);
    expect(Number.parseFloat(dl.style.zoom)).toBeCloseTo(0.8);
    expect(dl.style.width).toBe('125px'); // its own units: 125 × 0.8 = the column
    expect(markAtomicBlocks(root)).toEqual([]);
  });

  it('reduces it too when one production is taller than the page', () => {
    const { root, dl } = grammar(80, [20, 125, 20]);
    const [fit] = fitEbnfBlocks(root, geometry);
    expect(fit?.scale).toBeCloseTo(0.8);
    expect(Number.parseFloat(dl.style.zoom)).toBeCloseTo(0.8);
  });

  it('keeps a grammar too wide for the column whole: a page of its own', () => {
    // 300 wide: 0.33 of its size in the column, under the 0.65 threshold.
    const { root, dl } = grammar(300, [30, 30]);
    const results = fitAtomicBlocks(root, geometry);
    expect(dl.classList.contains('mp-ebnf-whole')).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0]?.mode).toBe('page');
    expect(dl.closest('.mp-atomic-page')).not.toBeNull();
    expect(dl.style.width).toBe(''); // not ours to fix
  });

  it('leaves a captioned grammar to its figure', () => {
    const { root, dl } = grammar(80, [60, 60, 60], (g) => `<figure class="captioned">${g}<figcaption>G</figcaption></figure>`);
    expect(fitEbnfBlocks(root, geometry)).toEqual([]);
    const marked = markAtomicBlocks(root);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.tagName.toLowerCase()).toBe('figure');
    expect(dl.classList.contains('mp-atomic')).toBe(false);
  });

  it('is idempotent', () => {
    const { root, dl } = grammar(125, [20, 20, 20]);
    fitEbnfBlocks(root, geometry);
    const zoom = dl.style.zoom;
    expect(fitEbnfBlocks(root, geometry)).toEqual([]);
    expect(dl.style.zoom).toBe(zoom);
  });
});
