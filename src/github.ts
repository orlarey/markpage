/********************************* github.ts ***********************************
 *
 * Purpose: Thin GitHub REST + Git Database client for the GitHub-sync feature
 *   (docs/GITHUB-SYNC-SPEC.md) — read/write files in a repo from the browser,
 *   no server. `api.github.com` is CORS-enabled, so a fine-grained PAT in the
 *   Authorization header is all we need.
 * How: All functions take the token explicitly and are pure over `fetch`
 *   (unit-testable by mocking `globalThis.fetch`). Reads use the *contents* API
 *   (inline ≤ 1 Mo) with a *git blobs* fallback (≤ 100 Mo) and a recursive
 *   *tree* listing; writes go through the **Git Database API** (blob → tree →
 *   commit → ref) so a Save is a single atomic commit (SPEC §5). `gitBlobSha`
 *   recomputes a blob's git SHA locally (on raw bytes) for the anti-overwrite
 *   check, with zero fetch. Token persistence (IndexedDB) lives at the bottom.
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

/** The repo coordinates of a linked document (no per-file path). */
export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface GhUser {
  login: string;
}

/** One entry of a recursive tree listing (blobs only are interesting here). */
export interface TreeEntry {
  path: string;
  sha: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
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

/** Percent-encode a repo path, segment by segment (keep the slashes). */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter((s) => s !== '')
    .map(encodeURIComponent)
    .join('/');
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    return j.message ?? '';
  } catch {
    return '';
  }
}

// ---- read ---------------------------------------------------------------

/** The authenticated user — used for the "connected as @x" status. */
export async function getUser(token: string): Promise<GhUser> {
  const res = await fetch(`${API}/user`, { headers: authHeaders(token) });
  if (!res.ok) throw new GithubError(res.status, `GitHub /user → ${res.status}`);
  const j = (await res.json()) as { login: string };
  return { login: j.login };
}

interface ContentsFile {
  /** Blob git SHA. */
  sha: string;
  /** Decoded bytes (empty when GitHub omits inline content for a big file). */
  bytes: Uint8Array<ArrayBuffer>;
  /** True when GitHub returned inline base64 (file ≤ 1 Mo). */
  inline: boolean;
  size: number;
}

/**
 * Read a file via the *contents* API. Returns `null` on 404. For files > 1 Mo
 * GitHub omits the inline `content`; we report `inline: false` so the caller
 * falls back to `getBlob(sha)`. Throws on a directory.
 */
async function getContents(token: string, loc: RepoLoc): Promise<ContentsFile | null> {
  const ref = loc.branch ? `?ref=${encodeURIComponent(loc.branch)}` : '';
  const url = `${API}/repos/${loc.owner}/${loc.repo}/contents/${encodePath(loc.path)}${ref}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub get ${loc.path} → ${res.status} ${await errorMessage(res)}`);
  }
  const j = (await res.json()) as
    | { type?: string; content?: string; encoding?: string; sha: string; size: number }
    | unknown[];
  if (Array.isArray(j)) throw new GithubError(422, `${loc.path} is a directory, not a file`);
  const inline = j.encoding === 'base64' && typeof j.content === 'string' && j.content.length > 0;
  return {
    sha: j.sha,
    size: j.size,
    inline,
    bytes: inline ? base64ToBytes(j.content as string) : new Uint8Array(0),
  };
}

/** Fetch a blob's bytes by its git SHA (the > 1 Mo / ≤ 100 Mo path). */
export async function getBlob(
  token: string,
  ref: { owner: string; repo: string },
  sha: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/blobs/${sha}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub blob ${sha} → ${res.status} ${await errorMessage(res)}`);
  }
  const j = (await res.json()) as { content: string; encoding: string };
  return base64ToBytes(j.content);
}

/** Read a file's full bytes + git SHA, transparently using the blob fallback. */
export async function readFileBytes(
  token: string,
  loc: RepoLoc,
): Promise<{ sha: string; bytes: Uint8Array<ArrayBuffer> } | null> {
  const f = await getContents(token, loc);
  if (!f) return null;
  if (f.inline) return { sha: f.sha, bytes: f.bytes };
  const bytes = await getBlob(token, loc, f.sha);
  return { sha: f.sha, bytes };
}

/** Read a UTF-8 text file (e.g. `foo.md`), verbatim. Null on 404. */
export async function readTextFile(
  token: string,
  loc: RepoLoc,
): Promise<{ sha: string; text: string } | null> {
  const f = await readFileBytes(token, loc);
  return f ? { sha: f.sha, text: bytesToUtf8(f.bytes) } : null;
}

/** Resolve a branch ref to its head commit SHA. Null if the branch is absent. */
export async function getBranchHead(token: string, ref: RepoRef): Promise<string | null> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodePath(ref.branch)}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub get ref ${ref.branch} → ${res.status} ${await errorMessage(res)}`);
  }
  const j = (await res.json()) as { object: { sha: string } };
  return j.object.sha;
}

/** The tree SHA of a commit (the ref only gives the commit; SPEC §5). */
export async function getCommitTree(token: string, ref: RepoRef, commitSha: string): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/commits/${commitSha}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub get commit ${commitSha} → ${res.status} ${await errorMessage(res)}`);
  }
  const j = (await res.json()) as { tree: { sha: string } };
  return j.tree.sha;
}

/** List a tree recursively — one call to enumerate the whole repo (SPEC §5). */
export async function getTreeRecursive(token: string, ref: RepoRef, treeSha: string): Promise<TreeEntry[]> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/trees/${treeSha}?recursive=1`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub get tree ${treeSha} → ${res.status} ${await errorMessage(res)}`);
  }
  const j = (await res.json()) as { tree: TreeEntry[]; truncated?: boolean };
  return j.tree;
}

// ---- write (Git Database API) -------------------------------------------

/** Create a blob from raw bytes; returns its git SHA. */
export async function createBlob(token: string, ref: RepoRef, bytes: Uint8Array): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/blobs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: bytesToBase64(bytes), encoding: 'base64' }),
  });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub create blob → ${res.status} ${await errorMessage(res)}`);
  }
  return ((await res.json()) as { sha: string }).sha;
}

/** One file to place in a new tree (mode 100644 = a normal blob). */
export interface TreeChange {
  path: string;
  sha: string; // blob sha created beforehand
}

/** Create a tree from `base` plus the given blob placements; returns its SHA. */
export async function createTree(
  token: string,
  ref: RepoRef,
  baseTreeSha: string,
  changes: TreeChange[],
): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/trees`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: changes.map((c) => ({ path: c.path, mode: '100644', type: 'blob', sha: c.sha })),
    }),
  });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub create tree → ${res.status} ${await errorMessage(res)}`);
  }
  return ((await res.json()) as { sha: string }).sha;
}

/** Create a commit pointing at `treeSha` with parent `parentSha`. */
export async function createCommit(
  token: string,
  ref: RepoRef,
  message: string,
  treeSha: string,
  parentSha: string,
): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/commits`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
  });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub create commit → ${res.status} ${await errorMessage(res)}`);
  }
  return ((await res.json()) as { sha: string }).sha;
}

/**
 * Fast-forward a branch ref to `commitSha` (`force: false`). Returns `false`
 * when GitHub rejects a non-fast-forward (422) — the concurrency guard that
 * triggers a retry (SPEC §5 / R4). Other failures throw.
 */
export async function updateRef(
  token: string,
  ref: RepoRef,
  commitSha: string,
): Promise<boolean> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/refs/heads/${encodePath(ref.branch)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commitSha, force: false }),
  });
  if (res.ok) return true;
  if (res.status === 422) return false; // not a fast-forward — caller retries
  throw new GithubError(res.status, `GitHub update ref → ${res.status} ${await errorMessage(res)}`);
}

/**
 * Create a branch ref pointing at `commitSha`. Used when linking to a brand-new
 * branch. Returns false on 422 (already exists). Other failures throw.
 */
export async function createRef(token: string, ref: RepoRef, commitSha: string): Promise<boolean> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/refs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${ref.branch}`, sha: commitSha }),
  });
  if (res.ok) return true;
  if (res.status === 422) return false;
  throw new GithubError(res.status, `GitHub create ref → ${res.status} ${await errorMessage(res)}`);
}

// ---- local git blob SHA (anti-overwrite, zero fetch — SPEC R3) ----------

/**
 * Recompute a blob's git SHA-1 locally, on **raw bytes** (never a string):
 * `sha1("blob " + byteLength + "\0" + content)`. Operating on a `Uint8Array`
 * is essential — `"é".length === 1` but 2 bytes in UTF-8 — or R1 (verbatim)
 * would be silently violated for non-ASCII content.
 */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const buf = new Uint8Array(header.length + bytes.length);
  buf.set(header, 0);
  buf.set(bytes, header.length);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- base64 / UTF-8 helpers ---------------------------------------------
// GitHub exchanges file bodies as base64. Everything is bytes-first.

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000; // stay under String.fromCharCode's arg-count limit
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\n/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8ToBytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
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
