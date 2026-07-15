import { describe, expect, it } from 'vitest';

import {
  groupLetterheads,
  renderLetterhead,
  keepLabelsWithNext,
} from '@orlarey/markpage-render';

describe('renderLetterhead', () => {
  it('emits a sender block with no label and no positioning class', () => {
    const html = renderLetterhead('sender', 'Yann Orlarey\n12 rue Exemple');
    expect(html).toContain('letterhead-sender');
    expect(html).not.toContain('letterhead-label');
    expect(html).not.toContain('letterhead-window');
    expect(html).not.toContain('letterhead-flow');
  });

  it('emits a recipient with the window class by default', () => {
    const html = renderLetterhead('recipient', 'ACME SAS');
    expect(html).toContain('letterhead-recipient');
    expect(html).toContain('letterhead-window');
  });

  it('emits a recipient with the flow class when args includes flow', () => {
    const html = renderLetterhead('recipient', 'ACME SAS', ['flow']);
    expect(html).toContain('letterhead-flow');
    expect(html).not.toContain('letterhead-window');
  });

  it('ignores the flow arg on sender (no positioning class on sender)', () => {
    const html = renderLetterhead('sender', 'X', ['flow']);
    expect(html).not.toContain('letterhead-flow');
    expect(html).not.toContain('letterhead-window');
  });

  it('joins lines with <br>', () => {
    const html = renderLetterhead('sender', 'Line 1\nLine 2\nLine 3');
    expect(html).toContain('Line 1<br>Line 2<br>Line 3');
  });

  it('drops blank lines and trims whitespace', () => {
    const html = renderLetterhead(
      'sender',
      '\n  Line 1  \n\n  Line 2  \n\n',
    );
    expect(html).toContain('Line 1<br>Line 2');
    expect(html).not.toContain('<br><br>');
  });

  it('renders **bold** inline', () => {
    const html = renderLetterhead('sender', '**Yann Orlarey**');
    expect(html).toContain('<strong>Yann Orlarey</strong>');
  });

  it('renders *italic* inline', () => {
    const html = renderLetterhead('sender', '*Consultant DSP*');
    expect(html).toContain('<em>Consultant DSP</em>');
  });

  it('renders [text](url) inline as an anchor', () => {
    const html = renderLetterhead(
      'sender',
      '[yann@example.com](mailto:yann@example.com)',
    );
    expect(html).toContain('<a href="mailto:yann@example.com">yann@example.com</a>');
  });

  it('escapes raw HTML in the body', () => {
    const html = renderLetterhead('sender', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders ![alt](url) as <img> for a logo line', () => {
    const html = renderLetterhead(
      'sender',
      '![Logo Acme](https://example.com/logo.png)\nYann Orlarey',
    );
    expect(html).toContain(
      '<img alt="Logo Acme" src="https://example.com/logo.png">',
    );
    expect(html).toContain('Yann Orlarey');
  });

  it('renders ![](url) with empty alt (drag-dropped img:// case)', () => {
    // markpage stamps drag-dropped images as ![](img://sha); after the
    // expandRefs pass at preview time, the URL becomes a blob: link.
    const html = renderLetterhead(
      'sender',
      '![](blob:https://markpage.org/abc-123)\nYann Orlarey',
    );
    expect(html).toContain('<img alt="" src="blob:https://markpage.org/abc-123">');
  });

  it('image regex wins over link regex for ![text](url)', () => {
    const html = renderLetterhead('sender', '![alt](u.png)');
    expect(html).toContain('<img');
    expect(html).not.toContain('<a href="u.png">alt</a>');
  });

  it('emits a signature block with no positioning class on the element', () => {
    // .letterhead-signature carries the right-alignment via the CSS rule
    // (margin-left: auto). No window/flow class — those are recipient-only.
    const html = renderLetterhead(
      'signature',
      '![](sig.png)\n**Yann Orlarey**\n*Consultant DSP audio*',
    );
    expect(html).toContain('letterhead-signature');
    expect(html).not.toContain('letterhead-window');
    expect(html).not.toContain('letterhead-flow');
    // Body content rendered with the same inline formatter
    expect(html).toContain('<img alt="" src="sig.png">');
    expect(html).toContain('<strong>Yann Orlarey</strong>');
    expect(html).toContain('<em>Consultant DSP audio</em>');
  });

  it('signature with image+text wraps text in a caption div (for overlay)', () => {
    // When the fence contains an image AND text lines, the renderer emits
    // image(s) as direct child + a `.letterhead-signature-caption` div
    // wrapping the text. CSS overlays the caption at bottom-left of the
    // image rectangle.
    const html = renderLetterhead(
      'signature',
      '![](sig.png)\n**Yann Orlarey**\n*Consultant DSP audio*',
    );
    expect(html).toContain('letterhead-signature-caption');
    // Image is OUTSIDE the caption (sibling, not child) so it defines
    // the wrapper's box for the absolutely-positioned caption.
    expect(html).toMatch(
      /<img[^>]*>\s*<div class="letterhead-signature-caption">/,
    );
    // No <br> between image and the caption — they're separate elements
    expect(html).not.toMatch(/<img[^>]*><br>/);
  });

  it('signature with only an image emits no caption div', () => {
    const html = renderLetterhead('signature', '![](sig.png)');
    expect(html).toContain('<img alt="" src="sig.png">');
    expect(html).not.toContain('letterhead-signature-caption');
  });

  it('signature with no image falls back to br-joined text (no caption div)', () => {
    const html = renderLetterhead(
      'signature',
      '**Yann Orlarey**\n*Consultant DSP audio*',
    );
    expect(html).not.toContain('letterhead-signature-caption');
    expect(html).toContain(
      '<strong>Yann Orlarey</strong><br><em>Consultant DSP audio</em>',
    );
  });

  it('signature ignores window / flow args (those are recipient-only)', () => {
    const html = renderLetterhead('signature', 'X', ['window']);
    expect(html).not.toContain('letterhead-window');
    const html2 = renderLetterhead('signature', 'X', ['flow']);
    expect(html2).not.toContain('letterhead-flow');
  });
});

describe('groupLetterheads — DOM grouping', () => {
  it('wraps two consecutive letterhead siblings in one group', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-sender">A</div>' +
        '<div class="letterhead letterhead-recipient letterhead-window">B</div>' +
        '<h2>After</h2>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    groupLetterheads(root);
    const groups = root.querySelectorAll('.letterhead-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].children).toHaveLength(2);
    expect(root.children).toHaveLength(2);
    expect(root.lastElementChild?.tagName.toLowerCase()).toBe('h2');
  });

  it('wraps a lone letterhead in its own group', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-recipient letterhead-window">B</div>' +
        '<p>Body</p>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    groupLetterheads(root);
    const groups = root.querySelectorAll('.letterhead-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].children).toHaveLength(1);
  });

  it('creates separate groups for non-adjacent letterhead pairs', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-sender">A</div>' +
        '<p>Between</p>' +
        '<div class="letterhead letterhead-recipient letterhead-window">B</div>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    groupLetterheads(root);
    const groups = root.querySelectorAll('.letterhead-group');
    expect(groups).toHaveLength(2);
  });

  it('is a no-op when there are no letterhead children', () => {
    const doc = makeDoc('<div><p>Just prose</p><h2>Heading</h2></div>');
    const root = doc.body.firstElementChild as HTMLElement;
    const before = root.innerHTML;
    groupLetterheads(root);
    expect(root.innerHTML).toBe(before);
  });

  it('tags the group with letterhead-group--window when a child is window-positioned', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-sender">A</div>' +
        '<div class="letterhead letterhead-recipient letterhead-window">B</div>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    groupLetterheads(root);
    const group = root.querySelector('.letterhead-group');
    expect(group?.classList.contains('letterhead-group--window')).toBe(true);
  });

  it('does NOT tag the group when the recipient opted into flow', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-sender">A</div>' +
        '<div class="letterhead letterhead-recipient letterhead-flow">B</div>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    groupLetterheads(root);
    const group = root.querySelector('.letterhead-group');
    expect(group?.classList.contains('letterhead-group--window')).toBe(false);
  });

  it('keepLabelsWithNext does NOT wrap h2 + next sibling when in slides mode', () => {
    // In slides mode, h2 carries `break-before: page` (slidesBreakCss);
    // a `break-inside: avoid` wrapper would conflict and make paged.js
    // fragment the wrapper into stub + h2-alone + sibling-alone fragments
    // across three slides. The print-export bug from the bugpdfexport.md
    // repro: a slide title + mermaid pair got split into 3 slides instead
    // of staying together on slide 2.
    const doc = makeDoc(
      '<div>' +
        '<h2>MCP in One Picture</h2>' +
        '<div class="mermaid-block"><svg/></div>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    keepLabelsWithNext(root, /*inSlidesMode=*/ true);
    expect(root.querySelector('.keep-with-next')).toBeNull();
    expect(root.children[0]?.tagName.toLowerCase()).toBe('h2');
    expect(root.children[1]?.classList.contains('mermaid-block')).toBe(true);
  });

  it('keepLabelsWithNext wraps a heading + a breakable block (default mode)', () => {
    const doc = makeDoc(
      '<div>' + '<h2>Section</h2>' + '<p>Some prose that can break.</p>' + '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    keepLabelsWithNext(root);
    expect(root.querySelector('.keep-with-next')).not.toBeNull();
  });

  it('flattens a heading chain into one keep-with-next wrapper', () => {
    const doc = makeDoc(
      '<div>' +
        '<h2>Dependency graph</h2>' +
        '<h3>Orientation</h3>' +
        '<p>The first paragraph must not disappear.</p>' +
        '<p>The second paragraph remains outside the pair.</p>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    keepLabelsWithNext(root);
    const wrappers = root.querySelectorAll('.keep-with-next');
    expect(wrappers).toHaveLength(1);
    expect([...wrappers[0].children].map((el) => el.tagName.toLowerCase())).toEqual([
      'h2',
      'h3',
      'p',
    ]);
    expect(root.children[1]?.textContent).toContain('second paragraph');
  });

  it('keepLabelsWithNext does NOT wrap a heading + an already-atomic block', () => {
    // The next block receives the semantic `.mp-atomic` boundary. Nesting it in a
    // second break-inside:avoid wrapper makes paged.js drop the tail of the
    // inner block. We keep the heading with it via break-after:avoid instead.
    for (const nextHtml of [
      '<div class="mermaid-block block-rigid"><svg/></div>',
      '<div class="math-block block-rigid"></div>',
      '<figure class="captioned captioned-figure"><div class="block-rigid"><svg/></div></figure>',
      '<div class="demo-block"></div>',
    ]) {
      const doc = makeDoc('<div><h2>Section</h2>' + nextHtml + '</div>');
      const root = doc.body.firstElementChild as HTMLElement;
      keepLabelsWithNext(root);
      expect(root.querySelector('.keep-with-next')).toBeNull();
    }
  });

  it('keepLabelsWithNext leaves internally breakable rich blocks breakable', () => {
    for (const nextHtml of [
      '<figure class="captioned captioned-algorithm">' +
        '<div class="algorithm"><table><tr><td>x</td></tr></table></div>' +
        '<figcaption>Algorithm 1</figcaption></figure>',
      '<div class="admonition"><div class="admonition-title">Caution</div>' +
        '<div class="admonition-body"><p>Body</p></div></div>',
      '<figure class="captioned captioned-table"><table><tr><td>x</td></tr></table></figure>',
      '<div class="columns-block"><div class="column"><p>Body</p></div></div>',
      '<div class="mosaic-block"><div class="mosaic-row"></div></div>',
    ]) {
      const doc = makeDoc('<div><h2>Section</h2>' + nextHtml + '</div>');
      const root = doc.body.firstElementChild as HTMLElement;
      keepLabelsWithNext(root);
      expect(root.querySelector('.keep-with-next')).toBeNull();
      expect(root.children[0]?.tagName.toLowerCase()).toBe('h2');
      expect(root.children[1]).toBeDefined();
    }
  });

  it('keepLabelsWithNext does NOT wrap an h1 + letterhead-group pair', () => {
    // The wrapper would become a fragmentation context that captures the
    // absolutely-positioned recipient, breaking the envelope-window
    // coordinates. The letterhead-group already reserves its own
    // vertical space via min-height, so skipping the wrap is safe.
    const doc = makeDoc(
      '<div>' +
        '<h1>Facture N° 2026-042</h1>' +
        '<div class="letterhead-group letterhead-group--window">' +
          '<div class="letterhead letterhead-sender">A</div>' +
          '<div class="letterhead letterhead-recipient letterhead-window">B</div>' +
        '</div>' +
        '<p>Date d\'émission: …</p>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    keepLabelsWithNext(root);
    // The h1 and the letterhead-group remain as direct siblings, NOT
    // wrapped in a keep-with-next div.
    expect(root.querySelector('.keep-with-next')).toBeNull();
    expect(root.children[0]?.tagName.toLowerCase()).toBe('h1');
    expect(root.children[1]?.classList.contains('letterhead-group')).toBe(true);
  });

  it('handles a triplet (sender + recipient + recipient) in one group', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-sender">A</div>' +
        '<div class="letterhead letterhead-recipient letterhead-window">B</div>' +
        '<div class="letterhead letterhead-recipient letterhead-window">C</div>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    groupLetterheads(root);
    const groups = root.querySelectorAll('.letterhead-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].children).toHaveLength(3);
  });
});

/** Build a happy-dom document with `html` as body content. */
function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}
