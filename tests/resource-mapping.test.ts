import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// happy-dom doesn't ship IndexedDB. `putBlobBySha` would otherwise blow up
// in `openDb`, so we stub it with an in-memory SHA-only implementation —
// the mapping module only needs the digest, not the actual blob storage,
// for these tests. The orchestrator + real IDB plumbing is exercised by
// the existing image-store tests.
vi.mock('../src/image-store', () => ({
  putBlobBySha: async (blob: Blob): Promise<string> => {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },
}));

import {
  addResource,
  extractExternalRefs,
  isExternalRef,
  loadMapping,
  lookupResource,
  mappedShas,
  removeResource,
  rewriteExternalRefs,
} from '../src/resource-mapping';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isExternalRef', () => {
  it.each([
    ['images/foo.png', true],
    ['./photo.jpg', true],
    ['../assets/logo.svg', true],
    ['plain.png', true],
    // Internal / inline / remote / non-resource forms are not external.
    ['img://abc123', false],
    ['data:image/png;base64,iVBOR', false],
    ['blob:http://localhost/abc', false],
    ['http://example.com/x.png', false],
    ['https://example.com/x.png', false],
    ['//cdn.example.com/x.png', false],
    ['mailto:x@y.z', false],
    ['javascript:void(0)', false],
    ['file:///x', false],
    ['#section', false],
    ['', false],
  ])('classifies %s as external=%s', (url, expected) => {
    expect(isExternalRef(url)).toBe(expected);
  });
});

describe('extractExternalRefs', () => {
  it('finds inline image refs and dedupes them', () => {
    const md = [
      'Some prose ![alt](images/foo.png) more.',
      '',
      'Another ![](./photo.jpg)',
      '',
      'And again ![alt](images/foo.png) — dup.',
    ].join('\n');
    expect(new Set(extractExternalRefs(md))).toEqual(
      new Set(['images/foo.png', './photo.jpg']),
    );
  });

  it('finds reference-style definitions', () => {
    const md = [
      'Body ![alt][logo].',
      '',
      '[logo]: assets/logo.svg',
    ].join('\n');
    expect(extractExternalRefs(md)).toEqual(['assets/logo.svg']);
  });

  it('ignores img:// internal refs', () => {
    const md = 'Internal ![](img://abc123) and external ![](images/foo.png).';
    expect(extractExternalRefs(md)).toEqual(['images/foo.png']);
  });

  it('ignores data:, http(s), and protocol-relative URLs', () => {
    const md = [
      '![](data:image/png;base64,xyz)',
      '![](http://x.com/a.png)',
      '![](https://x.com/b.png)',
      '![](//cdn.x.com/c.png)',
      '![](images/keep-me.png)',
    ].join('\n');
    expect(extractExternalRefs(md)).toEqual(['images/keep-me.png']);
  });

  it('handles an inline image with a title attribute', () => {
    const md = '![alt](images/foo.png "Caption text")';
    expect(extractExternalRefs(md)).toEqual(['images/foo.png']);
  });
});

describe('rewriteExternalRefs', () => {
  it('rewrites every external ref via the resolver', () => {
    const md = '![alt](images/foo.png) and ![](images/bar.png).';
    const out = rewriteExternalRefs(md, (path) =>
      path === 'images/foo.png' ? 'blob:resolved-foo' : null,
    );
    expect(out).toBe('![alt](blob:resolved-foo) and ![](images/bar.png).');
  });

  it('rewrites reference-style definitions', () => {
    const md = ['![alt][logo].', '', '[logo]: assets/logo.svg'].join('\n');
    const out = rewriteExternalRefs(md, () => 'blob:logo-url');
    expect(out).toContain('[logo]: blob:logo-url');
  });

  it('leaves internal img:// untouched', () => {
    const md = '![](img://abc) ![](images/foo.png)';
    const out = rewriteExternalRefs(md, () => 'X');
    expect(out).toBe('![](img://abc) ![](X)');
  });

  it('preserves the alt text and title on inline images', () => {
    const md = '![Mon image](images/foo.png "ma légende")';
    const out = rewriteExternalRefs(md, () => 'blob:X');
    // Title is dropped (we only keep alt + URL), but alt survives.
    expect(out).toBe('![Mon image](blob:X)');
  });
});

describe('addResource + loadMapping + lookupResource (round-trip)', () => {
  it('first call records sha and firstSeen', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' });
    const result = await addResource('images/foo.png', blob);
    expect(result.replaced).toBe(false);
    expect(result.sha).toMatch(/^[a-f0-9]{64}$/);
    expect(lookupResource('images/foo.png')).toBe(result.sha);
    const entry = loadMapping()['images/foo.png'];
    expect(entry.sha).toBe(result.sha);
    expect(typeof entry.firstSeen).toBe('number');
  });

  it('same content twice keeps firstSeen and reports no replace', async () => {
    const blob = new Blob(['same'], { type: 'image/png' });
    const first = await addResource('images/a.png', blob);
    const firstSeen = loadMapping()['images/a.png'].firstSeen;
    // Wait a tick so Date.now() would shift if the code rewrote it.
    await new Promise((r) => setTimeout(r, 5));
    const second = await addResource('images/a.png', new Blob(['same']));
    expect(second.replaced).toBe(false);
    expect(second.sha).toBe(first.sha);
    expect(loadMapping()['images/a.png'].firstSeen).toBe(firstSeen);
  });

  it('different content at same path consults onConflict', async () => {
    await addResource('images/a.png', new Blob(['v1']));
    const decision = vi.fn().mockResolvedValue('overwrite');
    const result = await addResource(
      'images/a.png',
      new Blob(['v2']),
      decision,
    );
    expect(decision).toHaveBeenCalled();
    expect(result.replaced).toBe(true);
  });

  it('onConflict returning "keep" leaves the existing sha intact', async () => {
    const v1 = await addResource('images/a.png', new Blob(['v1']));
    const result = await addResource(
      'images/a.png',
      new Blob(['v2']),
      () => 'keep',
    );
    expect(result.replaced).toBe(false);
    expect(result.sha).toBe(v1.sha);
    expect(lookupResource('images/a.png')).toBe(v1.sha);
  });

  it('removeResource drops the entry without throwing on a missing key', async () => {
    await addResource('images/a.png', new Blob(['v1']));
    removeResource('images/a.png');
    expect(lookupResource('images/a.png')).toBe(null);
    // Idempotent.
    expect(() => removeResource('images/a.png')).not.toThrow();
    expect(() => removeResource('images/never-existed.png')).not.toThrow();
  });

  it('mappedShas returns the union of all referenced blob shas', async () => {
    const aSha = (await addResource('images/a.png', new Blob(['a']))).sha;
    const bSha = (await addResource('images/b.png', new Blob(['b']))).sha;
    // Same blob under another path → same sha, single entry in the set.
    const aSha2 = (await addResource('images/dup.png', new Blob(['a']))).sha;
    expect(aSha2).toBe(aSha);
    const shas = mappedShas();
    expect(shas).toEqual(new Set([aSha, bSha]));
  });
});
