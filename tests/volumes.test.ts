import { afterEach, describe, expect, it, vi } from 'vitest';

// volumes.ts imports docs.ts (Library adapter). docs.ts is happy in happy-dom
// (lazy OPFS), but we never exercise the Library/Disk adapters here — only the
// pure tree helpers and the Repo adapter (mocked fetch).
import {
  RepoVolume,
  childrenFromTree,
  resolveWithinRoot,
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

  it("'date': folders still first by name, files most recent first, undated last", () => {
    const f = (name: string, modified?: number): VolumeEntry => ({
      name,
      path: name,
      type: 'file',
      isMarkdown: true,
      ...(modified === undefined ? {} : { modified }),
    });
    const input: VolumeEntry[] = [
      f('old.md', 1000),
      { name: 'zdir', path: 'zdir', type: 'dir', isMarkdown: false, modified: 9999 },
      f('undated-b.md'),
      f('new.md', 3000),
      { name: 'adir', path: 'adir', type: 'dir', isMarkdown: false, modified: 1 },
      f('undated-a.md'),
      f('mid.md', 2000),
    ];
    expect(sortEntries(input, 'date').map((e) => e.name)).toEqual([
      'adir',
      'zdir',
      'new.md',
      'mid.md',
      'old.md',
      'undated-a.md',
      'undated-b.md',
    ]);
  });
});

describe('resolveWithinRoot', () => {
  it('resolves a sibling image against the doc folder', () => {
    expect(resolveWithinRoot('lettres', 'logo.png')).toBe('lettres/logo.png');
  });
  it('resolves a subfolder path', () => {
    expect(resolveWithinRoot('lettres', 'images/logo.png')).toBe(
      'lettres/images/logo.png',
    );
  });
  it('resolves a doc at the volume root (empty baseDir)', () => {
    expect(resolveWithinRoot('', 'a/b.png')).toBe('a/b.png');
  });
  it('climbs into a sibling folder with ..', () => {
    expect(resolveWithinRoot('lettres/2026', '../shared/logo.png')).toBe(
      'lettres/shared/logo.png',
    );
  });
  it('normalises redundant ./ and empty segments', () => {
    expect(resolveWithinRoot('lettres', './a//b.png')).toBe('lettres/a/b.png');
  });
  it('refuses a .. that would escape the mounted root', () => {
    expect(resolveWithinRoot('lettres', '../../etc/passwd')).toBeNull();
    expect(resolveWithinRoot('', '../secret.png')).toBeNull();
  });
  it('refuses absolute paths and URL schemes (left untouched)', () => {
    expect(resolveWithinRoot('lettres', '/etc/passwd')).toBeNull();
    expect(resolveWithinRoot('lettres', 'https://x/y.png')).toBeNull();
    expect(resolveWithinRoot('lettres', 'data:image/png;base64,AAAA')).toBeNull();
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

  it('dates the markdown files of a folder with their last commit, in one request', async () => {
    const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
    const graphql: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url.includes('/git/ref/heads/')) return json({ object: { sha: 'H' } });
        if (url.includes('/git/commits/')) return json({ tree: { sha: 'T' } });
        if (url.includes('/git/trees/')) return json({ tree: TREE, truncated: false });
        if (url.endsWith('/graphql')) {
          const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string> };
          graphql.push(body.query);
          expect(body.variables).toEqual({ owner: 'me', name: 'docs', ref: 'refs/heads/main' });
          return json({
            data: { repository: { ref: { target: { f0: { nodes: [{ committedDate: '2026-11-20T10:00:00Z' }] } } } } },
          });
        }
        throw new Error(`unexpected ${url}`);
      },
    );
    const v = new RepoVolume('tok', { owner: 'me', repo: 'docs', branch: 'main' });
    // Before: listed at once, undated.
    expect((await v.list('lettres')).find((e) => e.name === 'devis.md')?.modified).toBeUndefined();
    expect(await v.loadDates('lettres')).toBe(true);
    // One request, for the markdown file only (not the folder, not the images).
    expect(graphql).toHaveLength(1);
    expect(graphql[0]).toContain('f0:history(first:1,path:"lettres/devis.md")');
    expect(graphql[0]).not.toContain('f1:');
    // After: the listing carries the date; nothing more to fetch.
    expect((await v.list('lettres')).find((e) => e.name === 'devis.md')?.modified).toBe(
      Date.parse('2026-11-20T10:00:00Z'),
    );
    expect(await v.loadDates('lettres')).toBe(false);
    expect(graphql).toHaveLength(1);
    // Another volume on the same repo head reuses them (a new Open).
    const again = new RepoVolume('tok', { owner: 'me', repo: 'docs', branch: 'main' });
    expect(await again.loadDates('lettres')).toBe(false);
    expect((await again.list('lettres')).find((e) => e.name === 'devis.md')?.modified).toBeDefined();
  });

  it('says the token is refused on a 401, not that the repo is offline', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
    );
    expect(await new RepoVolume('expired', REF).state()).toBe('needs-token');
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    expect(await new RepoVolume('tok', REF).state()).toBe('offline');
  });

  it('retries after a failure instead of caching it', async () => {
    // A timed-out request used to stay cached: the repo then read "offline"
    // for good, until a reload.
    const v = new RepoVolume('tok', REF);
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    expect(await v.state()).toBe('offline');
    vi.restoreAllMocks();
    mockRepo();
    expect(await v.state()).toBe('ready');
    expect((await v.list('')).map((e) => e.name)).toEqual(['lettres', 'README.md']);
  });

  it('bounds every GitHub request in time', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    await new RepoVolume('tok', REF).state();
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
