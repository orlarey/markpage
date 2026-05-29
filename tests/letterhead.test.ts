import { describe, expect, it } from 'vitest';

import {
  groupLetterheads,
  renderLetterhead,
} from '../src/letterhead';

describe('renderLetterhead', () => {
  it('emits the default FR label when no caption is given', () => {
    const html = renderLetterhead('sender', 'Yann Orlarey\n12 rue Exemple', null);
    expect(html).toContain('letterhead-sender');
    expect(html).toContain('>Émetteur<');
  });

  it('uses the recipient default label too', () => {
    const html = renderLetterhead('recipient', 'ACME SAS', null);
    expect(html).toContain('letterhead-recipient');
    expect(html).toContain('>Destinataire<');
  });

  it('overrides the label when a custom caption is supplied', () => {
    const html = renderLetterhead('sender', 'X', 'Sender');
    expect(html).toContain('>Sender<');
    expect(html).not.toContain('>Émetteur<');
  });

  it('joins lines with <br>', () => {
    const html = renderLetterhead(
      'sender',
      'Line 1\nLine 2\nLine 3',
      null,
    );
    expect(html).toContain('Line 1<br>Line 2<br>Line 3');
  });

  it('drops blank lines and trims whitespace', () => {
    const html = renderLetterhead(
      'sender',
      '\n  Line 1  \n\n  Line 2  \n\n',
      null,
    );
    expect(html).toContain('Line 1<br>Line 2');
    expect(html).not.toContain('<br><br>');
  });

  it('renders **bold** inline', () => {
    const html = renderLetterhead('sender', '**Yann Orlarey**', null);
    expect(html).toContain('<strong>Yann Orlarey</strong>');
  });

  it('renders *italic* inline', () => {
    const html = renderLetterhead('sender', '*Consultant DSP*', null);
    expect(html).toContain('<em>Consultant DSP</em>');
  });

  it('renders [text](url) inline as an anchor', () => {
    const html = renderLetterhead(
      'sender',
      '[yann@example.com](mailto:yann@example.com)',
      null,
    );
    expect(html).toContain('<a href="mailto:yann@example.com">yann@example.com</a>');
  });

  it('escapes raw HTML in the body', () => {
    const html = renderLetterhead('sender', '<script>alert(1)</script>', null);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the custom label too', () => {
    const html = renderLetterhead('sender', 'X', '<b>Boom</b>');
    expect(html).toContain('&lt;b&gt;Boom&lt;/b&gt;');
    expect(html).not.toContain('<b>Boom</b>');
  });
});

describe('groupLetterheads — DOM grouping', () => {
  it('wraps two consecutive letterhead siblings in one group', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-sender">A</div>' +
        '<div class="letterhead letterhead-recipient">B</div>' +
        '<h2>After</h2>' +
        '</div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    groupLetterheads(root);
    const groups = root.querySelectorAll('.letterhead-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].children).toHaveLength(2);
    // The h2 sits *after* the group, untouched.
    expect(root.children).toHaveLength(2);
    expect(root.lastElementChild?.tagName.toLowerCase()).toBe('h2');
  });

  it('wraps a lone letterhead in its own group', () => {
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-recipient">B</div>' +
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
        '<div class="letterhead letterhead-recipient">B</div>' +
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

  it('handles a triplet (sender + recipient + recipient) in one group', () => {
    // Edge case: 3 adjacent siblings (e.g., an additional "Architecte" block).
    // The flex container can hold N children — we just need them grouped.
    const doc = makeDoc(
      '<div>' +
        '<div class="letterhead letterhead-sender">A</div>' +
        '<div class="letterhead letterhead-recipient">B</div>' +
        '<div class="letterhead letterhead-recipient">C</div>' +
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
