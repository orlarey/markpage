/********************************* github.ts ***********************************
 *
 * Purpose: Minimal GitHub REST client for the GitHub-sync feature
 *   (docs/GITHUB-SYNC-SPEC.md) — read/write a file in a repo from the browser,
 *   no server. `api.github.com` is CORS-enabled, so a fine-grained PAT in the
 *   Authorization header is all we need.
 * How: The REST functions take the token explicitly and are pure over
 *   `fetch` (unit-testable by mocking `globalThis.fetch`). Token persistence
 *   (IndexedDB) is kept separate at the bottom.
 *
 *******************************************************************************/

const API = 'https://api.github.com';

/** A file/dir location in a repo. `branch` defaults to the repo default. */
export interface RepoLoc {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
}

export interface GhFile {
  sha: string;
  contentBase64: string; // raw base64 (newline-stripped) — for binary assets
  text: string; // UTF-8 decoded — for content.md
}

export interface GhEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}

export interface GhUser {
  login: string;
}

/** A GitHub API error carrying the HTTP status (404 is handled, not thrown). */
export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function contentsUrl(loc: RepoLoc, withRef = true): string {
  const path = loc.path
    .split('/')
    .filter((s) => s !== '')
    .map(encodeURIComponent)
    .join('/');
  const ref = withRef && loc.branch ? `?ref=${encodeURIComponent(loc.branch)}` : '';
  return `${API}/repos/${loc.owner}/${loc.repo}/contents/${path}${ref}`;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    return j.message ?? '';
  } catch {
    return '';
  }
}

/** The authenticated user — used for the "connected as @x" status. */
export async function getUser(token: string): Promise<GhUser> {
  const res = await fetch(`${API}/user`, { headers: authHeaders(token) });
  if (!res.ok) throw new GithubError(res.status, `GitHub /user → ${res.status}`);
  const j = (await res.json()) as { login: string };
  return { login: j.login };
}

/** Read a file. Returns `null` on 404 (absent). Throws on a directory. */
export async function getFile(token: string, loc: RepoLoc): Promise<GhFile | null> {
  const res = await fetch(contentsUrl(loc), { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GithubError(res.status, `GitHub get ${loc.path} → ${res.status}`);
  const j = (await res.json()) as { content?: string; sha: string } | unknown[];
  if (Array.isArray(j)) throw new GithubError(422, `${loc.path} is a directory, not a file`);
  const b64 = (j.content ?? '').replace(/\n/g, '');
  return { sha: j.sha, contentBase64: b64, text: base64ToUtf8(b64) };
}

/** List a directory. Returns `null` on 404. Throws on a file. */
export async function listDir(token: string, loc: RepoLoc): Promise<GhEntry[] | null> {
  const res = await fetch(contentsUrl(loc), { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GithubError(res.status, `GitHub list ${loc.path} → ${res.status}`);
  const j = (await res.json()) as unknown;
  if (!Array.isArray(j)) throw new GithubError(422, `${loc.path} is a file, not a directory`);
  return (j as GhEntry[]).map((e) => ({
    name: e.name,
    path: e.path,
    type: e.type,
    sha: e.sha,
  }));
}

/**
 * Create or update a file (one commit). Pass `sha` to update an existing file
 * (GitHub requires the current blob sha for updates); omit it to create.
 * Returns the new blob sha.
 */
export async function putFile(
  token: string,
  loc: RepoLoc,
  opts: { contentBase64: string; message: string; sha?: string },
): Promise<{ sha: string }> {
  const body: Record<string, unknown> = {
    message: opts.message,
    content: opts.contentBase64,
  };
  if (loc.branch) body.branch = loc.branch;
  if (opts.sha) body.sha = opts.sha;
  const res = await fetch(contentsUrl(loc, false), {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub put ${loc.path} → ${res.status} ${await errorMessage(res)}`);
  }
  const j = (await res.json()) as { content?: { sha?: string } };
  return { sha: j.content?.sha ?? '' };
}

// ---- base64 / UTF-8 helpers ---------------------------------------------
// GitHub's contents API exchanges file bodies as base64. Text (content.md)
// round-trips through UTF-8; binary assets stay as raw base64.

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000; // stay under String.fromCharCode's arg-count limit
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\n/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

export function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

// ---- token persistence (IndexedDB) --------------------------------------
// One fine-grained PAT, stored locally, reused for every linked document.

const DB_NAME = 'markpage-github';
const STORE = 'kv';
const TOKEN_KEY = 'token';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key: string, value: string | null): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (value === null) store.delete(key);
      else store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function kvGet(key: string): Promise<string | null> {
  const db = await openDb();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveToken = (token: string): Promise<void> => kvSet(TOKEN_KEY, token);
export const loadToken = (): Promise<string | null> => kvGet(TOKEN_KEY);
export const clearToken = (): Promise<void> => kvSet(TOKEN_KEY, null);
export async function hasToken(): Promise<boolean> {
  return (await loadToken()) !== null;
}
