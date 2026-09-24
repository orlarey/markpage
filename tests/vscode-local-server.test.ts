// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalDocServer, markpageUrlFor } from '../vscode/src/local-server-core';

/**
 * The VS Code extension's loopback server for "Open in markpage.org": it must
 * serve the shared document's folder to markpage — and nothing else, to no one
 * else.
 */

const APP = 'https://markpage.org';
let dir: string;
let secretDir: string;
let server: LocalDocServer;
const buffers = new Map<string, string>();

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'mp-local-'));
  dir = join(root, 'projet');
  secretDir = join(root, 'secret');
  await mkdir(join(dir, 'img'), { recursive: true });
  await mkdir(secretDir);
  await writeFile(join(dir, 'doc.md'), '# Sur disque');
  await writeFile(join(dir, 'img', 'a.png'), 'PNG');
  await writeFile(join(secretDir, 'keys.txt'), 'secret');
  buffers.clear();
  server = new LocalDocServer({
    allowedOrigins: () => new Set([APP]),
    bufferText: (file) => buffers.get(file),
  });
});

afterEach(() => server.stop());

const get = (url: string, origin = APP) => fetch(url, { headers: { Origin: origin } });

describe('LocalDocServer', () => {
  it('serves the shared document and the files next to it, to markpage', async () => {
    const url = await server.share(join(dir, 'doc.md'));
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\//);
    const doc = await get(url);
    expect(doc.status).toBe(200);
    expect(await doc.text()).toBe('# Sur disque');
    expect(doc.headers.get('access-control-allow-origin')).toBe(APP);
    expect(doc.headers.get('content-type')).toMatch(/^text\/markdown/);
    const img = await get(new URL('img/a.png', url).href);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
  });

  it('serves the editor buffer (unsaved edits) for an open document', async () => {
    const file = join(dir, 'doc.md');
    buffers.set(file, '# Pas encore enregistré');
    expect(await (await get(await server.share(file))).text()).toBe('# Pas encore enregistré');
  });

  it('refuses anything outside the shared folder, or without the token', async () => {
    const url = await server.share(join(dir, 'doc.md'));
    const base = new URL(url);
    const token = base.pathname.split('/')[1];
    // `..` escape, even percent-encoded.
    expect((await get(new URL('../secret/keys.txt', url).href)).status).toBe(404);
    const escaped = `${base.origin}/${token}${encodeURI(join(dir, '%2E%2E', 'secret', 'keys.txt'))}`;
    expect((await get(escaped)).status).toBe(404);
    // A path under another folder, with the right token.
    const other = secretDir.split('/').map(encodeURIComponent).join('/');
    expect((await get(`${base.origin}/${token}${other}/keys.txt`)).status).toBe(404);
    // The right path without the token.
    expect((await get(`${base.origin}/nottoken${base.pathname.slice(token.length + 1)}`)).status).toBe(404);
  });

  it('lets only the markpage origin read, and answers the private-network preflight', async () => {
    const url = await server.share(join(dir, 'doc.md'));
    const foreign = await get(url, 'https://evil.example');
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: APP,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-private-network')).toBe('true');
    expect((await fetch(url, { method: 'POST', headers: { Origin: APP } })).status).toBe(405);
  });

  it('builds the markpage link with the document URL in base64url', () => {
    const doc = 'http://127.0.0.1:5/t/Users/y/My%20doc.md';
    const link = markpageUrlFor('https://markpage.org/', doc);
    const src = new URL(link).searchParams.get('src') ?? '';
    expect(src).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(src, 'base64url').toString()).toBe(doc);
  });
});
