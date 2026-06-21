import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GithubError,
  base64ToBytes,
  base64ToUtf8,
  bytesToBase64,
  getFile,
  getRemoteContentSha,
  getUser,
  listDir,
  mimeForExt,
  pullBundle,
  pushBundle,
  putFile,
  utf8ToBase64,
  type GithubTarget,
  type RepoLoc,
} from '../src/github';

// Minimal Response stand-in for the mocked fetch.
function res(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as unknown as Response;
}

const LOC: RepoLoc = { owner: 'orlarey', repo: 'markpage', path: 'lettres/devis/content.md', branch: 'main' };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('base64 / utf-8 helpers', () => {
  it('round-trips UTF-8 text including accents and emoji', () => {
    const s = 'Réglages ⛓️‍💥 — devis n°3 😀';
    expect(base64ToUtf8(utf8ToBase64(s))).toBe(s);
  });

  it('round-trips raw bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 64]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('tolerates newline-wrapped base64 (GitHub wraps at 60 cols)', () => {
    const b64 = utf8ToBase64('hello world, this is a longer string to wrap');
    const wrapped = b64.replace(/(.{8})/g, '$1\n');
    expect(base64ToUtf8(wrapped)).toBe('hello world, this is a longer string to wrap');
  });
});

describe('getUser', () => {
  it('returns the login on 200', async () => {
    fetchMock.mockResolvedValue(res(200, { login: 'orlarey', id: 1 }));
    expect(await getUser('tok')).toEqual({ login: 'orlarey' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/user');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws a GithubError on 401', async () => {
    fetchMock.mockResolvedValue(res(401, { message: 'Bad credentials' }));
    await expect(getUser('bad')).rejects.toBeInstanceOf(GithubError);
  });
});

describe('getFile', () => {
  it('decodes content + sha on 200, hitting the contents URL with ?ref', async () => {
    const content = Buffer.from('# Devis\n\nBonjour é 😀', 'utf8').toString('base64');
    fetchMock.mockResolvedValue(res(200, { sha: 'abc123', content: `${content}\n` }));
    const f = await getFile('tok', LOC);
    expect(f).not.toBeNull();
    expect(f?.sha).toBe('abc123');
    expect(f?.text).toBe('# Devis\n\nBonjour é 😀');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/orlarey/markpage/contents/lettres/devis/content.md?ref=main',
    );
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValue(res(404, { message: 'Not Found' }));
    expect(await getFile('tok', LOC)).toBeNull();
  });

  it('throws if the path is a directory (array response)', async () => {
    fetchMock.mockResolvedValue(res(200, [{ name: 'a', type: 'file' }]));
    await expect(getFile('tok', LOC)).rejects.toBeInstanceOf(GithubError);
  });
});

describe('listDir', () => {
  it('maps entries on 200', async () => {
    fetchMock.mockResolvedValue(
      res(200, [
        { name: 'content.md', path: 'lettres/devis/content.md', type: 'file', sha: 's1', extra: 1 },
        { name: 'assets', path: 'lettres/devis/assets', type: 'dir', sha: 's2' },
      ]),
    );
    const entries = await listDir('tok', { owner: 'orlarey', repo: 'markpage', path: 'lettres/devis' });
    expect(entries).toEqual([
      { name: 'content.md', path: 'lettres/devis/content.md', type: 'file', sha: 's1' },
      { name: 'assets', path: 'lettres/devis/assets', type: 'dir', sha: 's2' },
    ]);
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValue(res(404, { message: 'Not Found' }));
    expect(await listDir('tok', LOC)).toBeNull();
  });

  it('throws if the path is a file (object response)', async () => {
    fetchMock.mockResolvedValue(res(200, { sha: 's', content: 'x' }));
    await expect(listDir('tok', LOC)).rejects.toBeInstanceOf(GithubError);
  });
});

describe('putFile', () => {
  it('creates a file (no sha) and returns the new sha', async () => {
    fetchMock.mockResolvedValue(res(201, { content: { sha: 'new1' } }));
    const out = await putFile('tok', LOC, { contentBase64: 'Zm9v', message: 'markpage: Devis' });
    expect(out).toEqual({ sha: 'new1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/orlarey/markpage/contents/lettres/devis/content.md');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ message: 'markpage: Devis', content: 'Zm9v', branch: 'main' });
    expect(body.sha).toBeUndefined();
  });

  it('updates a file when a sha is given', async () => {
    fetchMock.mockResolvedValue(res(200, { content: { sha: 'new2' } }));
    await putFile('tok', LOC, { contentBase64: 'YmFy', message: 'markpage: Devis', sha: 'old' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.sha).toBe('old');
  });

  it('throws a GithubError on failure (e.g. 409 conflict)', async () => {
    fetchMock.mockResolvedValue(res(409, { message: 'is at ... but expected ...' }));
    await expect(
      putFile('tok', LOC, { contentBase64: 'Zm9v', message: 'm', sha: 'stale' }),
    ).rejects.toBeInstanceOf(GithubError);
  });
});

const TARGET: GithubTarget = { owner: 'orlarey', repo: 'markpage', branch: 'main', path: 'sandbox/devis' };

describe('mimeForExt', () => {
  it('maps known extensions and defaults to png', () => {
    expect(mimeForExt('jpg')).toBe('image/jpeg');
    expect(mimeForExt('JPEG')).toBe('image/jpeg');
    expect(mimeForExt('svg')).toBe('image/svg+xml');
    expect(mimeForExt('webp')).toBe('image/webp');
    expect(mimeForExt('xyz')).toBe('image/png');
  });
});

describe('getRemoteContentSha', () => {
  it('returns the content.md sha when present', async () => {
    fetchMock.mockResolvedValue(res(200, { sha: 'c1', content: '' }));
    expect(await getRemoteContentSha('tok', TARGET)).toBe('c1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/orlarey/markpage/contents/sandbox/devis/content.md?ref=main',
    );
  });

  it('returns null when absent (404)', async () => {
    fetchMock.mockResolvedValue(res(404, { message: 'Not Found' }));
    expect(await getRemoteContentSha('tok', TARGET)).toBeNull();
  });
});

describe('pushBundle (no images)', () => {
  it('PUTs content.md with the baseline sha and returns the new sha', async () => {
    fetchMock.mockResolvedValue(res(200, { content: { sha: 'new' } }));
    const out = await pushBundle('tok', TARGET, '# Devis sans image', 'markpage: Devis', 'base');
    expect(out).toEqual({ contentSha: 'new' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no assets → single commit
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/orlarey/markpage/contents/sandbox/devis/content.md');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body.sha).toBe('base');
    expect(base64ToUtf8(body.content as string)).toBe('# Devis sans image');
  });
});

describe('pullBundle (no assets)', () => {
  it('returns content.md text + sha when there are no assets', async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, { sha: 'c2', content: Buffer.from('# Pulled', 'utf8').toString('base64') }))
      .mockResolvedValueOnce(res(404, { message: 'Not Found' })); // assets/ absent
    const out = await pullBundle('tok', TARGET);
    expect(out).toEqual({ content: '# Pulled', contentSha: 'c2' });
  });

  it('returns null when there is no content.md', async () => {
    fetchMock.mockResolvedValue(res(404, { message: 'Not Found' }));
    expect(await pullBundle('tok', TARGET)).toBeNull();
  });
});
