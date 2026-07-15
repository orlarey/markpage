import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
  atomicFitDecision,
  fitAtomicBlocks,
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
