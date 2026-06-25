import { describe, expect, it } from 'vitest';

import { voidTagsToXhtml } from '@orlarey/markpage-render';

/**
 * Purpose: Mermaid emits HTML5-style void tags (`<br>`, `<img …>`, etc.)
 *   inside the `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">`
 *   island it uses for `htmlLabels: true` labels. The browser's strict
 *   XML / SVG parser rejects this ("Opening and ending tag mismatch:
 *   br line N and p") and renders a `<parsererror>` instead of the
 *   diagram. `voidTagsToXhtml` self-closes those tags so the SVG
 *   parses cleanly.
 */

describe('voidTagsToXhtml — mermaid SVG XHTML compliance', () => {
  it('self-closes a bare <br> inside a foreignObject', () => {
    const input = '<foreignObject><div><p>Line 1<br>Line 2</p></div></foreignObject>';
    const out = voidTagsToXhtml(input);
    expect(out).toContain('<br/>');
    expect(out).not.toMatch(/<br>/);
  });

  it("leaves already-self-closed <br/> alone (no double slash)", () => {
    const input = '<p>Line 1<br/>Line 2</p>';
    expect(voidTagsToXhtml(input)).toBe(input);
  });

  it('self-closes an <img …> with attributes', () => {
    const input = '<img src="x.png" alt="x">';
    expect(voidTagsToXhtml(input)).toBe('<img src="x.png" alt="x"/>');
  });

  it("doesn't touch <img …/> already self-closed", () => {
    const input = '<img src="x.png" alt="x"/>';
    expect(voidTagsToXhtml(input)).toBe(input);
  });

  it('handles multiple void tags in one string', () => {
    const input = 'a<br>b<hr>c<wbr>d';
    expect(voidTagsToXhtml(input)).toBe('a<br/>b<hr/>c<wbr/>d');
  });

  it("doesn't touch non-void tags (paragraphs, divs, spans)", () => {
    const input = '<p>foo</p><div>bar</div><span>baz</span>';
    expect(voidTagsToXhtml(input)).toBe(input);
  });

  it("doesn't break tag names that start with a void name (e.g. <branch>)", () => {
    // Defensive: the regex matches `<br` followed by `>` or whitespace —
    // `<branch>` starts with `<br` but is followed by `anch` (not `>` /
    // whitespace), so it must NOT be self-closed.
    const input = '<branch>foo</branch>';
    expect(voidTagsToXhtml(input)).toBe(input);
  });
});
