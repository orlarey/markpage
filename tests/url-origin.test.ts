import { describe, expect, it } from 'vitest';

import {
  decodeSrcParam,
  docNameFromUrl,
  normalizeDocUrl,
  resolveAgainstDoc,
  urlChip,
  urlDocKey,
} from '../src/url-origin';

describe('url-origin', () => {
  it('turns a GitHub page into its raw file, keeps other http(s) URLs', () => {
    expect(normalizeDocUrl('https://github.com/orlarey/markpage/blob/main/docs/SPEC.md').href).toBe(
      'https://raw.githubusercontent.com/orlarey/markpage/main/docs/SPEC.md',
    );
    expect(normalizeDocUrl(' https://example.org/a.md#top ').href).toBe('https://example.org/a.md');
    expect(() => normalizeDocUrl('file:///Users/x/a.md')).toThrow();
    expect(() => normalizeDocUrl('javascript:alert(1)')).toThrow();
  });

  it('identifies a loopback document by its file path, not its port or token', () => {
    const a = new URL('http://127.0.0.1:50123/tok1/Users/y/proj/doc.md');
    const b = new URL('http://127.0.0.1:61234/tok2/Users/y/proj/doc.md');
    expect(urlDocKey(a)).toBe('local:/Users/y/proj/doc.md');
    expect(urlDocKey(a)).toBe(urlDocKey(b));
    expect(urlDocKey(new URL('https://example.org/a.md'))).toBe('https://example.org/a.md');
  });

  it('names the document after its file, else its host', () => {
    expect(docNameFromUrl(new URL('https://example.org/notes/Mon%20rapport.md'))).toBe('Mon rapport');
    expect(docNameFromUrl(new URL('https://example.org/'))).toBe('example.org');
  });

  it('resolves relative references against the document URL', () => {
    expect(resolveAgainstDoc('https://example.org/notes/a.md', 'img/x.png')).toBe(
      'https://example.org/notes/img/x.png',
    );
    expect(resolveAgainstDoc('http://127.0.0.1:5/t/Users/y/p/a.md', '../z.png')).toBe(
      'http://127.0.0.1:5/t/Users/y/z.png',
    );
  });

  it('shows the host and folder on the origin chip', () => {
    expect(urlChip(new URL('https://example.org/notes/a.md'))).toBe('🌐 example.org ▸ notes/');
    expect(urlChip(new URL('https://example.org/a.md'))).toBe('🌐 example.org');
    expect(urlChip(new URL('http://127.0.0.1:5/tok/Users/y/p/a.md'))).toBe('🔗 VS Code ▸ /Users/y/p/');
  });

  it('reads a document URL given plainly or in base64url (the VS Code form)', () => {
    const inner = 'http://127.0.0.1:5123/tok/Users/y/My%20docs/100%25%20%26%20co.md';
    const b64 = btoa(inner).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeSrcParam(b64)).toBe(inner);
    expect(decodeSrcParam('https://example.org/a.md')).toBe('https://example.org/a.md');
    expect(decodeSrcParam('pas-une-url')).toBe('pas-une-url');
  });
});
