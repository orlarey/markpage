import { describe, expect, it } from 'vitest';
import { setFrontmatterKeys } from '../src/frontmatter-edit';

describe('setFrontmatterKeys', () => {
  it('replaces a present key, appends a new one, deletes a listed one', () => {
    const src = '---\ntitle: X\nh1-color: "#000000"\n---\nBody';
    const out = setFrontmatterKeys(
      src,
      new Map([
        ['h1-color', '"#ff0000"'], // replace in place
        ['page-size', 'A5'], // append
      ]),
      ['title'], // delete
    );
    expect(out).toBe('---\nh1-color: "#ff0000"\npage-size: A5\n---\nBody');
  });

  it('creates the front-matter block when absent', () => {
    expect(setFrontmatterKeys('# Hi', new Map([['page-size', 'A5']]))).toBe(
      '---\npage-size: A5\n---\n\n# Hi',
    );
    // nothing to write → source untouched
    expect(setFrontmatterKeys('# Hi', new Map())).toBe('# Hi');
  });

  it('leaves unrelated keys and the body verbatim', () => {
    const src = '---\ndocument-style: papier\ntitle: X\n---\n\nThe body\n\nmore';
    const out = setFrontmatterKeys(src, new Map([['h2-color', '"#123456"']]));
    expect(out).toContain('document-style: papier');
    expect(out).toContain('title: X');
    expect(out).toContain('h2-color: "#123456"');
    expect(out).toContain('The body\n\nmore');
  });
});
