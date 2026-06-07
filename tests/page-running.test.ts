import { describe, expect, it } from 'vitest';

import { renderPageRunning } from '../src/page-running';

describe('renderPageRunning — header / footer fences', () => {
  it('emits a <style> with @page block targeting @top-* for header', () => {
    const html = renderPageRunning('header', 'L | C | R');
    expect(html).toContain('<style class="page-running-fence"');
    expect(html).toContain('data-kind="header"');
    expect(html).toContain('@page');
    expect(html).toContain('@top-left');
    expect(html).toContain('@top-center');
    expect(html).toContain('@top-right');
    expect(html).not.toContain('@bottom');
  });

  it('emits a <style> targeting @bottom-* for footer', () => {
    const html = renderPageRunning('footer', 'L | C | R');
    expect(html).toContain('data-kind="footer"');
    expect(html).toContain('@bottom-left');
    expect(html).toContain('@bottom-center');
    expect(html).toContain('@bottom-right');
    expect(html).not.toContain('@top');
  });

  it('splits the body on pipes into 3 slots', () => {
    const html = renderPageRunning('header', 'Doc | Chap | Page');
    expect(html).toContain('@top-left { content: "Doc"; }');
    expect(html).toContain('@top-center { content: "Chap"; }');
    expect(html).toContain('@top-right { content: "Page"; }');
  });

  it('trims whitespace per slot', () => {
    const html = renderPageRunning('header', '  Doc  |   Chap   |   Page  ');
    expect(html).toContain('"Doc"');
    expect(html).toContain('"Chap"');
    expect(html).toContain('"Page"');
  });

  it('emits empty string for missing slots (only 1 pipe → 2 slots, third empty)', () => {
    const html = renderPageRunning('header', 'Doc | Chap');
    expect(html).toContain('@top-left { content: "Doc"; }');
    expect(html).toContain('@top-center { content: "Chap"; }');
    // Third slot was not supplied → emits empty content (clears any
    // previous fence's @top-right per SPEC §26.6 cascade rule).
    expect(html).toContain('@top-right { content: ""; }');
  });

  it('renders all 3 slots empty when the body is blank (clear band)', () => {
    const html = renderPageRunning('header', '');
    expect(html).toContain('@top-left { content: ""; }');
    expect(html).toContain('@top-center { content: ""; }');
    expect(html).toContain('@top-right { content: ""; }');
  });

  it('handles "| Chap |" (only center slot)', () => {
    const html = renderPageRunning('header', '| Chap |');
    expect(html).toContain('@top-left { content: ""; }');
    expect(html).toContain('@top-center { content: "Chap"; }');
    expect(html).toContain('@top-right { content: ""; }');
  });

  it('substitutes {page} as counter(page)', () => {
    const html = renderPageRunning('footer', '| | Page {page}');
    expect(html).toContain('@bottom-right { content: "Page " counter(page); }');
  });

  it('substitutes {pages} as counter(pages)', () => {
    const html = renderPageRunning('footer', '| | {page} / {pages}');
    expect(html).toContain(
      '@bottom-right { content: counter(page) " / " counter(pages); }',
    );
  });

  it('substitutes {date} statically (as a CSS string)', () => {
    const html = renderPageRunning('footer', '{date}');
    // Static substitution → quoted, not counter(); contains the year.
    expect(html).toMatch(/@bottom-left \{ content: "[^"]*\d{4}[^"]*"; \}/);
    expect(html).not.toContain('counter(date)');
  });

  it('substitutes {title} as empty string in Phase 1 (deferred)', () => {
    const html = renderPageRunning('header', '{title}');
    expect(html).toContain('@top-left { content: ""; }');
  });

  it('emits unknown variables as literal {name} text (so typos are visible)', () => {
    const html = renderPageRunning('header', '{foo}');
    expect(html).toContain('@top-left { content: "{foo}"; }');
  });

  it('preserves a literal pipe written as \\|', () => {
    const html = renderPageRunning('header', 'A \\| B | C | D');
    // Three slots, with a literal pipe inside the first.
    expect(html).toContain('@top-left { content: "A | B"; }');
    expect(html).toContain('@top-center { content: "C"; }');
    expect(html).toContain('@top-right { content: "D"; }');
  });

  it('takes only the first non-blank line of the body', () => {
    const html = renderPageRunning('header', '\n\nL | C | R\nignored');
    expect(html).toContain('@top-left { content: "L"; }');
    expect(html).toContain('@top-center { content: "C"; }');
    expect(html).toContain('@top-right { content: "R"; }');
    expect(html).not.toContain('ignored');
  });

  it('escapes double quotes inside slot text', () => {
    const html = renderPageRunning('header', 'He said "hi"');
    expect(html).toContain('"He said \\"hi\\""');
  });

  it('escapes backslashes inside slot text (e.g. C:\\foo)', () => {
    const html = renderPageRunning('header', 'C:\\foo');
    expect(html).toContain('"C:\\\\foo"');
  });
});
