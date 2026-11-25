import { describe, expect, it } from 'vitest';
import { findOrphanHeadings, forceBreakBeforeOrphans } from '../src/heading-orphans';

/** Build a paginated render: one `.pagedjs_page` per HTML string. */
function pages(...contents: string[]): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = contents
    .map(
      (c) =>
        `<div class="pagedjs_page"><div class="pagedjs_margin">Le régime figé</div>` +
        `<div class="pagedjs_page_content">${c}</div></div>`,
    )
    .join('');
  return root;
}

describe('findOrphanHeadings', () => {
  it('finds a heading left alone at the foot of a page', () => {
    const r = pages(
      '<p>Avant.</p><h2 id="sec-def">2.1 La définition</h2>',
      '<h2 id="sec-def">La définition</h2><p>Un signal…</p>',
    );
    expect(findOrphanHeadings(r)).toEqual(['#sec-def']);
  });

  it('moves a whole run of headings: the first one is marked', () => {
    const r = pages(
      '<p>Avant.</p><h1 id="sec-2">2 Les circuits</h1><h2 id="sec-21">2.1 La définition</h2>',
      '<p>Un signal…</p>',
    );
    expect(findOrphanHeadings(r)).toEqual(['#sec-2']);
  });

  it('ignores a heading followed by content on its page', () => {
    const r = pages('<p>Avant.</p><h2 id="a">Titre</h2><p>Trois lignes.</p>');
    expect(findOrphanHeadings(r)).toEqual([]);
  });

  it('counts a formula or a table after the heading as content', () => {
    const r = pages(
      '<p>Avant.</p><h2 id="a">A</h2><div><svg></svg></div>',
      '<p>Avant.</p><h2 id="b">B</h2><table><tr><td></td></tr></table>',
    );
    expect(findOrphanHeadings(r)).toEqual([]);
  });

  it('leaves a title page or a title slide alone', () => {
    const r = pages('<h2 id="slide">Une diapositive titre</h2>', '<p>Suite.</p>');
    expect(findOrphanHeadings(r)).toEqual([]);
  });

  it('ignores the margin boxes (running header)', () => {
    const r = pages('<p>Avant.</p><h2 id="x">X</h2>');
    // The running header text sits in .pagedjs_margin, before the heading in
    // DOM order but outside the page area: it is not content "before" it, and
    // nothing follows the heading in the area.
    expect(findOrphanHeadings(r)).toEqual(['#x']);
  });

  it('falls back to the source line when a heading has no id', () => {
    const r = pages('<p>Avant.</p><h3 data-line="42">Sans id</h3>');
    expect(findOrphanHeadings(r)).toEqual(['h3[data-line="42"]']);
  });
});

describe('forceBreakBeforeOrphans', () => {
  it('marks the source heading, once', () => {
    const src = document.createElement('div');
    src.innerHTML = '<p>Avant.</p><h2 id="sec-def">2.1 La définition</h2><p>Un signal…</p>';
    expect(forceBreakBeforeOrphans(src, ['#sec-def'])).toBe(1);
    expect(src.querySelector('#sec-def')?.classList.contains('mp-force-page-break')).toBe(true);
    expect(forceBreakBeforeOrphans(src, ['#sec-def'])).toBe(0);
  });

  it('does not mark a heading that ends the document', () => {
    const src = document.createElement('div');
    src.innerHTML = '<p>Avant.</p><h2 id="fin">Fin</h2>';
    expect(forceBreakBeforeOrphans(src, ['#fin'])).toBe(0);
  });

  it('survives a key that is not a valid selector', () => {
    const src = document.createElement('div');
    expect(forceBreakBeforeOrphans(src, ['#2-bad id'])).toBe(0);
  });
});
