import { afterEach, describe, expect, it, vi } from 'vitest';

// volumes.ts imports docs.ts (Library adapter). docs.ts is happy in happy-dom
// (lazy OPFS), but we never exercise the Library/Disk adapters here — only the
// pure tree helpers and the Repo adapter (mocked fetch).
import {
  RepoVolume,
  childrenFromTree,
  sortEntries,
  type VolumeEntry,
} from '../src/volumes';
import type { TreeEntry } from '../src/github';

afterEach(() => vi.restoreAllMocks());

const TREE: TreeEntry[] = [
  { path: 'lettres', type: 'tree', sha: 't1' },
  { path: 'lettres/devis.md', type: 'blob', sha: 'b1', size: 10 },
  { path: 'lettres/images', type: 'tree', sha: 't2' },
  { path: 'lettres/images/logo.png', type: 'blob', sha: 'b2', size: 20 },
  { path: 'README.md', type: 'blob', sha: 'b3', size: 5 },
];

describe('childrenFromTree', () => {
  it('lists immediate children of the root', () => {
    const names = childrenFromTree(TREE, '').map((e) => `${e.name}:${e.type}`);
    expect(names.sort()).toEqual(['README.md:file', 'lettres:dir']);
  });
  it('lists immediate children of a subfolder (not grandchildren)', () => {
    const c = childrenFromTree(TREE, 'lettres');
    expect(c.map((e) => e.name).sort()).toEqual(['devis.md', 'images']);
    expect(c.find((e) => e.name === 'devis.md')?.isMarkdown).toBe(true);
    expect(c.find((e) => e.name === 'images')?.type).toBe('dir');
  });
  it('flags non-markdown files', () => {
    const c = childrenFromTree(TREE, 'lettres/images');
    expect(c).toEqual([
      { name: 'logo.png', path: 'lettres/images/logo.png', type: 'file', isMarkdown: false },
    ]);
  });
});

describe('sortEntries', () => {
  it('puts folders first, then files, each alphabetical', () => {
    const input: VolumeEntry[] = [
      { name: 'zeta.md', path: 'zeta.md', type: 'file', isMarkdown: true },
      { name: 'beta', path: 'beta', type: 'dir', isMarkdown: false },
      { name: 'alpha.md', path: 'alpha.md', type: 'file', isMarkdown: true },
      { name: 'gamma', path: 'gamma', type: 'dir', isMarkdown: false },
    ];
    expect(sortEntries(input).map((e) => e.name)).toEqual([
      'beta',
      'gamma',
      'alpha.md',
      'zeta.md',
    ]);
  });
});

describe('RepoVolume', () => {
  const REF = { owner: 'me', repo: 'docs', branch: 'main' };

  function mockRepo(): void {
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), { status });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/git/ref/heads/')) return json({ object: { sha: 'H' } });
        if (url.includes('/git/commits/')) return json({ tree: { sha: 'T' } });
        if (url.includes('/git/trees/')) return json({ tree: TREE, truncated: false });
        if (url.includes('/contents/lettres/devis.md')) {
          return json({
            type: 'file',
            encoding: 'base64',
            content: btoa('# Devis\n'),
            sha: 'b1',
            size: 8,
          });
        }
        throw new Error(`unexpected ${url}`);
      },
    );
  }

  it('lists the repo root, folders first', async () => {
    mockRepo();
    const v = new RepoVolume('tok', REF);
    expect((await v.list('')).map((e) => e.name)).toEqual(['lettres', 'README.md']);
    expect(v.label).toBe('me/docs@main');
    expect(v.kind).toBe('repo');
  });

  it('lists a subfolder and reads a file', async () => {
    mockRepo();
    const v = new RepoVolume('tok', REF);
    expect((await v.list('lettres')).map((e) => e.name)).toEqual(['images', 'devis.md']);
    expect(await v.readText('lettres/devis.md')).toBe('# Devis\n');
  });

  it('reports offline when the tree cannot be fetched', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const v = new RepoVolume('tok', REF);
    expect(await v.state()).toBe('offline');
  });
});
