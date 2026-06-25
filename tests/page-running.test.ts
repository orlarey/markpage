import { describe, expect, it } from 'vitest';

import {
  applyPageRunningRuns,
  renderPageRunning,
} from '@orlarey/markpage-render';

describe('renderPageRunning — sentinel emission', () => {
  it('emits a <style.page-running-fence> with data-kind=header (no @page wrapper)', () => {
    const html = renderPageRunning('header', 'L | C | R');
    expect(html).toContain('<style class="page-running-fence"');
    expect(html).toContain('data-kind="header"');
    expect(html).toContain('@top-left');
    expect(html).toContain('@top-center');
    expect(html).toContain('@top-right');
    // No outer @page wrapper anymore — applyPageRunningRuns adds it
    // when assembling the named-page CSS.
    expect(html).not.toContain('@page');
    expect(html).not.toContain('@bottom');
  });

  it('emits a sentinel with data-kind=footer for footer fences', () => {
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

  it('emits empty content for missing slots (only 1 pipe → 2 slots, third empty)', () => {
    const html = renderPageRunning('header', 'Doc | Chap');
    expect(html).toContain('@top-left { content: "Doc"; }');
    expect(html).toContain('@top-center { content: "Chap"; }');
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
    expect(html).toMatch(/@bottom-left \{ content: "[^"]*\d{4}[^"]*"; \}/);
    expect(html).not.toContain('counter(date)');
  });

  it('substitutes {title} as string(mp-title) (fed by string-set on h1)', () => {
    const html = renderPageRunning('header', '{title}');
    expect(html).toContain('@top-left { content: string(mp-title); }');
  });

  it('applies font-weight: bold when the WHOLE slot is wrapped in **…**', () => {
    const html = renderPageRunning('footer', '| | **{page}**');
    expect(html).toContain(
      '@bottom-right { content: counter(page); font-weight: bold; }',
    );
    // The literal asterisks must NOT leak into the CSS content.
    expect(html).not.toMatch(/content: "\*\*"/);
  });

  it('applies font-style: italic when the WHOLE slot is wrapped in *…*', () => {
    const html = renderPageRunning('header', '*Mon document* | |');
    expect(html).toContain(
      '@top-left { content: "Mon document"; font-style: italic; }',
    );
  });

  it('combines bold + italic for ***…*** wraps', () => {
    const html = renderPageRunning('footer', '***{page}*** | |');
    expect(html).toContain(
      '@bottom-left { content: counter(page); font-weight: bold; font-style: italic; }',
    );
  });

  it('leaves PARTIAL emphasis (mixed content) untouched — markers render literally', () => {
    // Mixed-content slots can't get per-fragment styling — out of v1
    // practice. The asterisks just pass through as text.
    const html = renderPageRunning('footer', '| | Page **{page}**');
    expect(html).toContain(
      '@bottom-right { content: "Page **" counter(page) "**"; }',
    );
    // No font-weight applied at the box level.
    expect(html).not.toMatch(/@bottom-right \{[^}]*font-weight: bold/);
  });

  it('emits unknown variables as literal {name} text (so typos are visible)', () => {
    const html = renderPageRunning('header', '{foo}');
    expect(html).toContain('@top-left { content: "{foo}"; }');
  });

  it('preserves a literal pipe written as \\|', () => {
    const html = renderPageRunning('header', 'A \\| B | C | D');
    expect(html).toContain('@top-left { content: "A | B"; }');
    expect(html).toContain('@top-center { content: "C"; }');
    expect(html).toContain('@top-right { content: "D"; }');
  });

  it('takes only the first non-blank line of the body', () => {
    const html = renderPageRunning('header', '\n\nL | C | R\nignored');
    expect(html).toContain('@top-left { content: "L"; }');
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

  it('encodes recognized args as a data-args attribute', () => {
    expect(renderPageRunning('header', 'L', ['first'])).toContain(
      'data-args="first"',
    );
    expect(renderPageRunning('footer', 'L', ['blank'])).toContain(
      'data-args="blank"',
    );
  });

  it('omits data-args when no recognized arg is supplied', () => {
    const html = renderPageRunning('header', 'L');
    expect(html).not.toContain('data-args');
  });

  it('silently ignores unrecognized args (forward-compat with Phase 3+)', () => {
    // 'even' / 'odd' are reserved for Phase 3 (duplex). Until then,
    // they degrade to the default (no arg) — the fence still applies.
    const html = renderPageRunning('header', 'L', ['even']);
    expect(html).not.toContain('data-args');
  });
});

describe('applyPageRunningRuns — DOM partition into runs', () => {
  it('emits no CSS and mutates nothing when there are no fences', () => {
    const root = makeRoot('<p>Hello</p><p>World</p>');
    const css = applyPageRunningRuns(root);
    expect(css).toBe('');
    expect(root.innerHTML).toBe('<p>Hello</p><p>World</p>');
  });

  it('simplex (no duplex flag): emits a single @page rule per section, no auto-swap', () => {
    const root = makeRoot(
      renderPageRunning('header', 'Title | | Page {page}') +
        '<p>Body</p>',
    );
    const css = applyPageRunningRuns(root);
    // Without duplex: a plain `@page mp-section-1 { ... }` rule, no
    // :right / :left split.
    expect(css).toContain('@page mp-section-1 {');
    expect(css).not.toContain('mp-section-1:right');
    expect(css).not.toContain('mp-section-1:left');
    expect(css).toContain('@top-left { content: "Title"; }');
    expect(css).toContain('@top-right { content: "Page " counter(page); }');
    const p = root.querySelector('p')!;
    expect(p.getAttribute('data-page')).toBe('mp-section-1');
  });

  it('duplex: emits paired :right + :left rules with slots swapped on :left', () => {
    const root = makeRoot(
      renderPageRunning('header', 'Title | | Page {page}') +
        '<p>Body</p>',
    );
    const css = applyPageRunningRuns(root, { duplex: true });
    const rectoLine = css.split('\n').find((l) => l.includes('mp-section-1:right'));
    const versoLine = css.split('\n').find((l) => l.includes('mp-section-1:left'));
    expect(rectoLine).toBeDefined();
    expect(versoLine).toBeDefined();
    expect(rectoLine).toContain('@top-left { content: "Title"; }');
    expect(rectoLine).toContain('@top-right { content: "Page " counter(page); }');
    expect(versoLine).toContain('@top-right { content: "Title"; }');
    expect(versoLine).toContain('@top-left { content: "Page " counter(page); }');
  });

  it('does NOT tag content that appears BEFORE the first fence', () => {
    const root = makeRoot(
      '<p>Cover page</p>' +
        renderPageRunning('header', 'Title | |') +
        '<p>Body</p>',
    );
    applyPageRunningRuns(root);
    const ps = root.querySelectorAll('p');
    // Cover paragraph stays on the default (unnamed) page.
    expect(ps[0].getAttribute('data-page')).toBeNull();
    // Body paragraph is on mp-section-1.
    expect(ps[1].getAttribute('data-page')).toBe('mp-section-1');
  });

  it('partitions into multiple sections when fences appear at different positions', () => {
    const root = makeRoot(
      renderPageRunning('header', 'Chapter 1 | |') +
        '<p>Ch.1 text</p>' +
        renderPageRunning('header', 'Chapter 2 | |') +
        '<p>Ch.2 text</p>',
    );
    const css = applyPageRunningRuns(root, { duplex: true });
    // With duplex: each section emits BOTH :right and :left variants
    // for the inner-left / outer-right auto-swap (§9.6.6 / §9.5.4).
    expect(css).toContain('@page mp-section-1:right {');
    expect(css).toContain('@page mp-section-1:left');
    expect(css).toContain('@page mp-section-2:right {');
    expect(css).toContain('@page mp-section-2:left');
    expect(css).toContain('"Chapter 1"');
    expect(css).toContain('"Chapter 2"');
    const ps = root.querySelectorAll('p');
    expect(ps[0].getAttribute('data-page')).toBe('mp-section-1');
    expect(ps[1].getAttribute('data-page')).toBe('mp-section-2');
  });

  it('inherits the prior section\'s state when a fence updates only one band', () => {
    // Section 1: header set. Section 2: footer set; header should be
    // carried over from section 1 (we don't want footer-only fence to
    // wipe the header).
    const root = makeRoot(
      renderPageRunning('header', 'Header A | |') +
        '<p>Block A</p>' +
        renderPageRunning('footer', '| | Page {page}') +
        '<p>Block B</p>',
    );
    const css = applyPageRunningRuns(root);
    // Section 2 should still carry the header from section 1
    const section2 = css.split('@page mp-section-2').slice(1).join('@page mp-section-2');
    expect(section2).toContain('@top-left { content: "Header A"; }');
    expect(section2).toContain('@bottom-right { content: "Page " counter(page); }');
  });

  it('clears a band with an empty fence (slots all empty in the new section)', () => {
    const root = makeRoot(
      renderPageRunning('header', 'Old | |') +
        '<p>X</p>' +
        renderPageRunning('header', '') + // empty fence — clears
        '<p>Y</p>',
    );
    const css = applyPageRunningRuns(root);
    const section2 = css.split('@page mp-section-2').slice(1).join('@page mp-section-2');
    expect(section2).toContain('@top-left { content: ""; }');
    expect(section2).toContain('@top-center { content: ""; }');
    expect(section2).toContain('@top-right { content: ""; }');
    expect(section2).not.toContain('"Old"');
  });

  it('handles `first` arg via @page name:first selector', () => {
    const root = makeRoot(
      renderPageRunning('header', 'Default | |') +
        renderPageRunning('header', 'First only | |', ['first']) +
        '<p>X</p>',
    );
    const css = applyPageRunningRuns(root, { duplex: true });
    // Default rule appears in the :right variant (the :left variant
    // also exists and carries the swapped slots).
    expect(css).toMatch(/@page mp-section-\d+:right \{[^}]*"Default"[^}]*\}/);
    // The `first` arg keeps the literal slot mapping (no auto-swap):
    expect(css).toMatch(/@page mp-section-\d+:first \{[^}]*"First only"[^}]*\}/);
  });

  it('handles `blank` arg via @page name:blank selector', () => {
    const root = makeRoot(
      renderPageRunning('header', '| | normal') +
        renderPageRunning('header', '', ['blank']) + // clear on blank pages
        '<p>X</p>',
    );
    const css = applyPageRunningRuns(root);
    expect(css).toMatch(/@page mp-section-\d+:blank/);
  });

  it('duplex flag gates the paired :right + :left emission (§9.6.6 / §9.5.4)', () => {
    const root1 = makeRoot(
      renderPageRunning('header', 'A | | B') + '<p>X</p>',
    );
    const cssSimplex = applyPageRunningRuns(root1);
    expect(cssSimplex).not.toContain(':right');
    expect(cssSimplex).not.toContain(':left');

    const root2 = makeRoot(
      renderPageRunning('header', 'A | | B') + '<p>X</p>',
    );
    const cssDuplex = applyPageRunningRuns(root2, { duplex: true });
    expect(cssDuplex).toContain(':right');
    expect(cssDuplex).toContain(':left');
  });

  it('swaps only @top-left ↔ @top-right (center untouched, no spurious matches)', () => {
    // A bottom-only fence with the center slot non-empty: assert the
    // center stays put on the :left variant.
    const root = makeRoot(
      renderPageRunning('footer', 'B-inner | B-center | B-outer') +
        '<p>X</p>',
    );
    const css = applyPageRunningRuns(root, { duplex: true });
    const verso = css.split('\n').find((l) => l.includes(':left'));
    expect(verso).toBeDefined();
    // Center stays.
    expect(verso).toContain('@bottom-center { content: "B-center"; }');
    // Inner-left moves to @bottom-right on verso.
    expect(verso).toContain('@bottom-right { content: "B-inner"; }');
    expect(verso).toContain('@bottom-left { content: "B-outer"; }');
  });

  it('prepends a string-set rule on h1 when any fence is present (for {title})', () => {
    const root = makeRoot(
      renderPageRunning('header', '{title} | |') + '<p>X</p>',
    );
    const css = applyPageRunningRuns(root);
    expect(css).toContain('h1 { string-set: mp-title content() }');
    // The {title} ↦ string(mp-title) substitution stays intact.
    expect(css).toContain('@top-left { content: string(mp-title); }');
  });

  it('does NOT emit the string-set rule when there is no fence', () => {
    const root = makeRoot('<p>No fence here.</p>');
    const css = applyPageRunningRuns(root);
    expect(css).toBe('');
    expect(css).not.toContain('string-set');
  });

  it('groups multiple bands of the same arg into one @page rule', () => {
    // Header + footer with default args at the same position → one
    // section, one @page rule with both @top-* and @bottom-* declarations.
    const root = makeRoot(
      renderPageRunning('header', 'H | |') +
        renderPageRunning('footer', '| F |') +
        '<p>X</p>',
    );
    const css = applyPageRunningRuns(root);
    // The footer's section (mp-section-2) inherits the header from
    // section 1, so its @page rule contains BOTH bands.
    const section2 = css.split('@page mp-section-2').slice(1).join('@page mp-section-2');
    expect(section2).toContain('@top-left { content: "H"; }');
    expect(section2).toContain('@bottom-center { content: "F"; }');
  });
});

/** Build an HTMLElement holding the given inner HTML. */
function makeRoot(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body><div>${html}</div></body></html>`,
    'text/html',
  );
  return doc.body.firstElementChild as HTMLElement;
}
