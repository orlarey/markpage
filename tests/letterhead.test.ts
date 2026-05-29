import { describe, expect, it } from 'vitest';

import {
  groupLetterheads,
  renderLetterhead,
} from '../src/letterhead';

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
