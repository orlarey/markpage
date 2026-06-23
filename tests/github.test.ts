import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// happy-dom has no IndexedDB; the image store is stubbed (in-memory by SHA-256)
// and a `getImage` that serves blobs registered by tests. The token store isn't
// exercised here (it needs IDB) — the REST + Git Data + invariant logic is.
const blobs = new Map<string, Blob>();
vi.mock('../src/image-store', () => ({
  putBlobBySha: async (blob: Blob): Promise<string> => {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const sha = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    blobs.set(sha, blob);
    return sha;
  },
  getImage: async (sha: string): Promise<Blob | null> => blobs.get(sha) ?? null,
}));

import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  gitBlobSha,
  utf8ToBytes,
} from '../src/github';
import {
  type GithubTarget,
  importFromGithub,
  placeImageForInsert,
  resolveRepoPath,
  saveToGithub,
} from '../src/github-sync';

const TARGET: GithubTarget = {
  owner: 'me',
  repo: 'docs',
  branch: 'main',
  path: 'lettres/devis.md',
};

beforeEach(() => {
  localStorage.clear();
  blobs.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ---- pure helpers -------------------------------------------------------

describe('gitBlobSha (raw bytes, SPEC R3/point 4)', () => {
  it('matches git for the empty blob', async () => {
    expect(await gitBlobSha(new Uint8Array(0))).toBe(
      'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
    );
  });
  it('matches `git hash-object` for "test content\\n"', async () => {
    expect(await gitBlobSha(utf8ToBytes('test content\n'))).toBe(
      'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
    );
  });
  it('uses byte length, not char length, for non-ASCII', () => {
    expect(utf8ToBytes('é').length).toBe(2); // "é" is 1 char but 2 UTF-8 bytes
  });
});

describe('base64 / utf8 round-trips', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });
  it('round-trips non-ASCII text', () => {
    const s = 'café — déçu — 日本語';
    expect(bytesToUtf8(base64ToBytes(bytesToBase64(utf8ToBytes(s))))).toBe(s);
  });
});

describe('resolveRepoPath (perimeter P)', () => {
  it('resolves a sibling-folder ref relative to foo.md', () => {
    expect(resolveRepoPath('lettres/devis.md', 'images/logo.png')).toBe(
      'lettres/images/logo.png',
    );
  });
  it('allows ../ while inside the repo root', () => {
    expect(resolveRepoPath('lettres/devis.md', '../shared/logo.png')).toBe(
      'shared/logo.png',
    );
  });
  it('rejects refs escaping the repo root (out of P → null)', () => {
    expect(resolveRepoPath('devis.md', '../escape.png')).toBeNull();
  });
  it('treats a leading slash as repo-root-relative', () => {
    expect(resolveRepoPath('a/b/devis.md', '/top.png')).toBe('top.png');
  });
});

// ---- a stateful GitHub mock --------------------------------------------

interface RemoteState {
  head: string | null; // null = branch absent
  treeSha: string;
  files: Record<string, string>; // path → blob sha
}

/** Route fetch over a RemoteState; record POST/PATCH calls for assertions. */
function mockGithub(state: RemoteState) {
  const calls: { method: string; url: string }[] = [];
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status });

  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url });

      if (url.includes('/git/ref/heads/')) {
        return state.head ? json({ object: { sha: state.head } }) : json({}, 404);
      }
      if (url.includes('/git/commits/') && method === 'GET') {
        return json({ tree: { sha: state.treeSha } });
      }
      if (url.includes('/git/trees/') && method === 'GET') {
        const tree = Object.entries(state.files).map(([path, sha]) => ({
          path,
          sha,
          type: 'blob',
          size: 10,
        }));
        return json({ tree, truncated: false });
      }
      if (url.includes('/git/blobs') && method === 'POST') return json({ sha: 'newblob' });
      if (url.includes('/git/trees') && method === 'POST') return json({ sha: 'newtree' });
      if (url.includes('/git/commits') && method === 'POST') return json({ sha: 'newcommit' });
      if (url.includes('/git/refs/heads/') && method === 'PATCH') {
        state.head = 'newcommit';
        return json({});
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    },
  );
  return { calls };
}

// ---- R4 Save state machine ---------------------------------------------

describe('saveToGithub — state machine (R4)', () => {
  it('No-op when neither side changed (L=B, R=B)', async () => {
    const content = '# Hi\n';
    const sha = await gitBlobSha(utf8ToBytes(content));
    const { calls } = mockGithub({ head: 'H', treeSha: 'T', files: { 'lettres/devis.md': sha } });
    const out = await saveToGithub('tok', TARGET, content, 'Devis', sha);
    expect(out.kind).toBe('noop');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('Reload-suggested when only the remote moved (L=B, R≠B)', async () => {
    const content = '# Hi\n';
    const sha = await gitBlobSha(utf8ToBytes(content));
    mockGithub({ head: 'H', treeSha: 'T', files: { 'lettres/devis.md': 'REMOTE' } });
    const out = await saveToGithub('tok', TARGET, content, 'Devis', sha);
    expect(out.kind).toBe('reload-suggested');
  });

  it('Fast-forward push when only the local changed (L≠B, R=B)', async () => {
    const content = '# Edited\n';
    const { calls } = mockGithub({
      head: 'H',
      treeSha: 'T',
      files: { 'lettres/devis.md': 'BASE' },
    });
    const out = await saveToGithub('tok', TARGET, content, 'Devis', 'BASE');
    expect(out.kind).toBe('pushed');
    if (out.kind === 'pushed') {
      expect(out.baselineSha).toBe(await gitBlobSha(utf8ToBytes(content)));
    }
    expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
  });

  it('Fork when both sides changed (L≠B, R≠B) — never overwrites foo.md', async () => {
    const content = '# Mine\n';
    mockGithub({ head: 'H', treeSha: 'T', files: { 'lettres/devis.md': 'REMOTE' } });
    const out = await saveToGithub('tok', TARGET, content, 'Devis', 'BASE');
    expect(out.kind).toBe('forked');
    if (out.kind === 'forked') {
      expect(out.path).toMatch(/^lettres\/devis-[0-9a-f]{8}\.md$/);
      expect(out.path).not.toBe('lettres/devis.md');
    }
  });

  it('remote-gone when foo.md is absent in the tree', async () => {
    mockGithub({ head: 'H', treeSha: 'T', files: {} });
    const out = await saveToGithub('tok', TARGET, '# x\n', 'Devis', 'BASE');
    expect(out.kind).toBe('remote-gone');
  });

  it('remote-gone when the branch is absent', async () => {
    mockGithub({ head: null, treeSha: 'T', files: {} });
    const out = await saveToGithub('tok', TARGET, '# x\n', 'Devis', 'BASE');
    expect(out.kind).toBe('remote-gone');
  });
});

// ---- R3 image placement -------------------------------------------------

describe('placeImageForInsert (R3)', () => {
  const png = (bytes: number[]): Blob => new Blob([new Uint8Array(bytes)], { type: 'image/png' });

  it('defaults to images/ when the doc has no image neighbour', async () => {
    const ref = await placeImageForInsert('# Doc\n', 5, 'bidon/foo.md', png([1, 2, 3]), 'logo.png');
    expect(ref).toBe('images/logo.png');
  });

  it('places next to the nearest neighbour image', async () => {
    const content = '![](pics/a.png)\n\nhere';
    const ref = await placeImageForInsert(content, content.length, 'foo.md', png([4, 5]), 'logo.png');
    expect(ref).toBe('pics/logo.png');
  });

  it('dedups by content — same blob reuses its mapped path regardless of name', async () => {
    const blob = png([9, 9, 9]);
    const first = await placeImageForInsert('# d\n', 0, 'foo.md', blob, 'logo.png');
    const again = await placeImageForInsert('# d\n', 0, 'foo.md', blob, 'autre.png');
    expect(again).toBe(first);
  });

  it('renames on a name collision with different content (hash, never ordinal)', async () => {
    const first = await placeImageForInsert('# d\n', 0, 'foo.md', png([1]), 'logo.png');
    const second = await placeImageForInsert('# d\n', 0, 'foo.md', png([2]), 'logo.png');
    expect(first).toBe('images/logo.png');
    expect(second).toMatch(/^images\/logo-[0-9a-f]{8}\.png$/);
  });

  it('falls back to "image" for a nameless paste', async () => {
    const ref = await placeImageForInsert('# d\n', 0, 'foo.md', png([7]), null);
    expect(ref).toBe('images/image.png');
  });
});

// ---- R2 import ----------------------------------------------------------

describe('importFromGithub (R2)', () => {
  it('reads foo.md verbatim and fetches in-perimeter images, skipping unresolved', async () => {
    // images/logo.png is in the tree → fetched; missing/absent.png is relative
    // but not in the repo → skipped (R2 doesn't fail); the https:// ref isn't an
    // external mapping ref at all, so it never enters the loop.
    const md = '# Devis\n\n![](images/logo.png)\n\n![](missing/absent.png)\n\n![](https://x/y.png)\n';
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), { status });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/contents/lettres/devis.md')) {
          return json({ type: 'file', encoding: 'base64', content: bytesToBase64(utf8ToBytes(md)), sha: 'FOOSHA', size: md.length });
        }
        if (url.includes('/git/ref/heads/')) return json({ object: { sha: 'H' } });
        if (url.includes('/git/commits/')) return json({ tree: { sha: 'T' } });
        if (url.includes('/git/trees/')) {
          return json({ tree: [{ path: 'lettres/images/logo.png', sha: 'IMGSHA', type: 'blob', size: 12 }] });
        }
        if (url.includes('/git/blobs/IMGSHA')) {
          return json({ encoding: 'base64', content: bytesToBase64(new Uint8Array([1, 2, 3])) });
        }
        throw new Error(`unexpected ${url}`);
      },
    );
    const res = await importFromGithub('tok', TARGET);
    expect(res?.content).toBe(md); // verbatim (R1)
    expect(res?.baselineSha).toBe('FOOSHA');
    expect(res?.fetched).toEqual(['images/logo.png']);
    expect(res?.skipped).toEqual(['missing/absent.png']);
    // the http(s) ref is out of P; the relative one is mapped for rendering
    expect(localStorage.getItem('markpage:resources:mapping')).toContain('images/logo.png');
  });
});
