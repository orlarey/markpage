import { describe, expect, it } from 'vitest';
import { dropStaleAtomCopies } from '../src/fragment-duplicates';

function pages(...contents: string[]): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = contents
    .map(
      (c) =>
        `<div class="pagedjs_page"><div class="pagedjs_margin pagedjs_margin-top-center">` +
        `<svg data-mp-pristine="logo"></svg></div><div class="pagedjs_page_content">${c}</div></div>`,
    )
    .join('');
  return root;
}

describe('dropStaleAtomCopies', () => {
  it('keeps the copy of the later page when a formula is laid on two pages', () => {
    const r = pages(
      '<p>… inférieure à <span class="math-inline" data-mp-pristine="173">2M</span></p>',
      '<p><span class="math-inline" data-mp-pristine="173">2M</span>, laisse la somme</p>',
    );
    expect(dropStaleAtomCopies(r)).toBe(1);
    const [p1, p2] = [...r.querySelectorAll('.pagedjs_page')];
    expect(p1!.textContent).toBe('… inférieure à ');
    expect(p2!.textContent).toBe('2M, laisse la somme');
  });

  it('leaves distinct objects and single copies alone', () => {
    const r = pages(
      '<p><span data-mp-pristine="1">a</span> <span data-mp-pristine="2">b</span></p>',
      '<p><span data-mp-pristine="3">c</span></p>',
    );
    expect(dropStaleAtomCopies(r)).toBe(0);
    expect(r.querySelectorAll('.pagedjs_page_content [data-mp-pristine]').length).toBe(3);
  });

  it('ignores an object nested in another pristine object', () => {
    const r = pages(
      '<div data-mp-pristine="9"><svg data-mp-pristine="10"></svg></div>',
      '<p>suite</p>',
    );
    expect(dropStaleAtomCopies(r)).toBe(0);
  });

  it('keeps a running header logo on every page', () => {
    const r = pages('<p>un</p>', '<p>deux</p>', '<p>trois</p>');
    expect(dropStaleAtomCopies(r)).toBe(0);
    expect(r.querySelectorAll('[data-mp-pristine="logo"]').length).toBe(3);
  });

  it('does not treat two copies on the same page as a page-break duplicate', () => {
    const r = pages('<p><span data-mp-pristine="5">x</span><span data-mp-pristine="5">x</span></p>');
    expect(dropStaleAtomCopies(r)).toBe(0);
  });
});
