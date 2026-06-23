/****************************** github-sync.ts ********************************
 *
 * Purpose: Orchestrate the GitHub-sync invariants (docs/GITHUB-SYNC-SPEC.md)
 *   on top of the thin client `github.ts`, the resource mapping and the image
 *   store. This is where R1–R4 actually live:
 *     - R1  the linked `foo.md` is stored/pushed verbatim;
 *     - R2  import / reload fetches `foo.md` + every in-perimeter image into
 *           the resource mapping (so preview / PDF / offline already resolve);
 *     - R3  images are reconciled against the remote tree at Save, never
 *           overwriting a different blob at the same path (rename + hash);
 *     - R4  the Save state machine (No-op / Reload / Fast-forward / Fork),
 *           atomic via the Git Database API, with a 422 retry that re-evaluates.
 * How: pure functions over a token + a `GithubLink`-shaped target; path
 *   resolution is byte-exact on git paths (perimeter P). No DOM, no app state.
 *
 *******************************************************************************/

import {
  type RepoRef,
  type TreeEntry,
  GithubError,
  createBlob,
  createCommit,
  createTree,
  getBlob,
  getBranchHead,
  getCommitTree,
  getTreeRecursive,
  gitBlobSha,
  readTextFile,
  updateRef,
  utf8ToBytes,
} from './github';
import { getImage } from './image-store';
import {
  addResource,
  extractExternalRefs,
  isExternalRef,
  loadMapping,
} from './resource-mapping';

/** A linked document's GitHub target (mirrors docs.ts `GithubLink`). */
export interface GithubTarget {
  owner: string;
  repo: string;
  branch: string;
  /** Path of the `foo.md` file in the repo, e.g. `lettres/2026/devis.md`. */
  path: string;
}

/** Eager-fetch guard rails (SPEC §5 / R2). */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // skip a single huge file
const FIXED_COMMIT_PREFIX = 'markpage: ';

const refOf = (t: GithubTarget): RepoRef => ({ owner: t.owner, repo: t.repo, branch: t.branch });

// ---- path resolution (perimeter P — byte-exact on git paths) ------------

/** Directory portion of a repo path (`''` at the root). */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Base name (`logo.png`) of a repo path. */
function baseOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/**
 * Resolve a markdown-written relative ref to a repo path, relative to the
 * directory of `foo.md`. `..` is allowed while staying inside the repo root;
 * a ref that escapes the root (or is absolute-looking) returns `null` = out of
 * perimeter P. Matching is byte-exact, case-sensitive — never via the local FS.
 */
export function resolveRepoPath(fooPath: string, ref: string): string | null {
  // A leading slash means repo-root-relative; otherwise relative to foo's dir.
  const start = ref.startsWith('/') ? [] : dirOf(fooPath).split('/').filter((s) => s !== '');
  const segs = [...start];
  for (const raw of ref.split('/')) {
    if (raw === '' || raw === '.') continue;
    if (raw === '..') {
      if (segs.length === 0) return null; // escapes the repo root → out of P
      segs.pop();
      continue;
    }
    segs.push(raw);
  }
  return segs.join('/');
}

/** File extension for an image MIME (inverse of mimeForPath; DOM-free copy). */
function extForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'png';
  }
}

/** SHA-256 hex of a blob's bytes (content id, for R3 dedup / collision suffix). */
async function blobSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Guess an image MIME from a path extension (for blob storage). */
function mimeForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

/** Index a recursive tree by path for O(1) blob lookups. */
function indexTree(tree: TreeEntry[]): Map<string, TreeEntry> {
  const m = new Map<string, TreeEntry>();
  for (const e of tree) if (e.type === 'blob') m.set(e.path, e);
  return m;
}

// ---- R2 — import / reload ----------------------------------------------

export interface ImportResult {
  /** `foo.md` text, verbatim (R1). */
  content: string;
  /** Blob SHA of `foo.md` — the next `baselineSha`. */
  baselineSha: string;
  /** Paths fetched into the mapping, and those skipped (out of P / too big). */
  fetched: string[];
  skipped: string[];
}

/**
 * Import a linked `foo.md` (R2): store it verbatim and eagerly fetch every
 * in-perimeter image into the resource mapping, keyed by the **verbatim** ref
 * the markdown uses (so the existing renderer resolves it untouched). Pins to
 * the current branch head for a coherent snapshot. Returns `null` on 404.
 */
export async function importFromGithub(
  token: string,
  target: GithubTarget,
): Promise<ImportResult | null> {
  const ref = refOf(target);
  const file = await readTextFile(token, { ...ref, path: target.path });
  if (!file) return null;

  const head = await getBranchHead(token, ref);
  const tree = head ? indexTree(await getTreeRecursive(token, ref, await getCommitTree(token, ref, head))) : new Map<string, TreeEntry>();

  const fetched: string[] = [];
  const skipped: string[] = [];
  for (const imgRef of extractExternalRefs(file.text)) {
    const repoPath = resolveRepoPath(target.path, imgRef);
    const entry = repoPath ? tree.get(repoPath) : undefined;
    if (!repoPath || !entry) {
      skipped.push(imgRef); // out of P, or unresolved in the repo (R2: don't fail)
      continue;
    }
    if ((entry.size ?? 0) > MAX_IMAGE_BYTES) {
      skipped.push(imgRef);
      console.warn(`github-sync: image too large, skipped: ${repoPath}`);
      continue;
    }
    const bytes = await getBlob(token, ref, entry.sha);
    await addResource(imgRef, new Blob([bytes], { type: mimeForPath(repoPath) }));
    fetched.push(imgRef);
  }
  return { content: file.text, baselineSha: file.sha, fetched, skipped };
}

// ---- R3 — placing a newly-added image -----------------------------------

/** Folder of the in-perimeter image ref nearest the cursor, or null. */
function nearestNeighborFolder(content: string, cursor: number): string | null {
  const re = /!\[[^\]\n]*\]\(\s*([^)\s]+)/g;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const m of content.matchAll(re)) {
    const url = m[1];
    if (!isExternalRef(url)) continue; // only relative, in-P refs
    const dist = Math.abs((m.index ?? 0) - cursor);
    if (dist < bestDist) {
      bestDist = dist;
      best = url;
    }
  }
  return best === null ? null : dirOf(best);
}

/** Turn an original filename into a clean, URL-safe base (no extension). */
function sanitizeBase(originalName: string | null): string {
  const noDir = (originalName ?? '').slice((originalName ?? '').lastIndexOf('/') + 1);
  const noExt = noDir.replace(/\.[^.]+$/, '');
  const clean = noExt.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean === '' ? 'image' : clean;
}

/**
 * Place a freshly-added image (drop / paste / pick) into a GitHub-linked doc
 * (R3): pick the folder (nearest neighbour image, else `images/`), keep the
 * original name (collision with a *different* blob → lengthen the content hash,
 * never an ordinal), dedup by content, register it in the resource mapping and
 * return the **verbatim relative ref** to insert (`![](ref)`). The actual push
 * happens at the next Save (`prepareImages`).
 */
export async function placeImageForInsert(
  content: string,
  cursorOffset: number,
  fooPath: string,
  blob: Blob,
  originalName: string | null,
): Promise<string> {
  void fooPath; // refs are relative to foo.md; resolution happens at Save
  const sha = await blobSha256(blob);
  const mapping = loadMapping();

  // Dedup by content: reuse a path already mapped to this exact blob.
  for (const [path, entry] of Object.entries(mapping)) {
    if (entry.sha === sha) return path;
  }

  const ext = extForMime(blob.type);
  const base = sanitizeBase(originalName);
  const folder = nearestNeighborFolder(content, cursorOffset) ?? 'images';
  const join = (name: string): string => (folder === '' ? name : `${folder}/${name}`);

  let ref = join(`${base}.${ext}`);
  if (mapping[ref] && mapping[ref].sha !== sha) {
    for (let len = 8; len <= 40; len += 4) {
      const candidate = join(`${base}-${sha.slice(0, len)}.${ext}`);
      if (!mapping[candidate] || mapping[candidate].sha === sha) {
        ref = candidate;
        break;
      }
    }
  }
  await addResource(ref, blob);
  return ref;
}

// ---- R3/R4 — Save state machine ----------------------------------------

export type SaveOutcome =
  | { kind: 'noop' }
  | { kind: 'reload-suggested' } // L = B, R ≠ B (no local edit; remote moved)
  | { kind: 'remote-gone' } // branch or foo.md deleted/moved remotely
  | { kind: 'pushed'; baselineSha: string; content: string }
  | { kind: 'forked'; path: string; baselineSha: string; content: string };

interface PreparedImages {
  /** Blob placements to add to the commit tree. */
  changes: { path: string; bytes: Uint8Array }[];
  /** Possibly-rewritten content (image collisions renamed). */
  content: string;
}

/**
 * Reconcile every in-perimeter image ref against the remote tree (R3 anti-
 * overwrite). Absent path → push; same blob → skip (dedup); different blob →
 * rename (lengthen content hash), rewrite the ref in `content`, push at the new
 * path. The local git blob SHA is recomputed on raw bytes (zero fetch).
 */
async function prepareImages(
  content: string,
  target: GithubTarget,
  tree: Map<string, TreeEntry>,
): Promise<PreparedImages> {
  const mapping = loadMapping();
  const changes: { path: string; bytes: Uint8Array }[] = [];
  let out = content;

  for (const imgRef of extractExternalRefs(content)) {
    let repoPath = resolveRepoPath(target.path, imgRef);
    if (!repoPath) continue; // out of P — leave verbatim
    const sha = mapping[imgRef]?.sha;
    if (!sha) continue; // not held locally (unresolved) — leave
    const blob = await getImage(sha);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const localSha = await gitBlobSha(bytes);

    let entry = tree.get(repoPath);
    if (entry && entry.sha === localSha) continue; // already in the repo (dedup)

    if (entry && entry.sha !== localSha) {
      // Collision: a *different* blob already occupies this path. Rename by
      // lengthening the content hash until the path is free or matches us.
      let ref2 = imgRef;
      for (let len = 8; len <= 40; len += 4) {
        const candidate = nameWithHash(imgRef, localSha.slice(0, len));
        const candPath = resolveRepoPath(target.path, candidate);
        if (!candPath) break;
        const candEntry = tree.get(candPath);
        if (!candEntry || candEntry.sha === localSha) {
          ref2 = candidate;
          repoPath = candPath;
          entry = candEntry;
          break;
        }
      }
      if (ref2 !== imgRef) {
        out = rewriteRef(out, imgRef, ref2);
        await addResource(ref2, blob);
        if (entry && entry.sha === localSha) continue; // renamed onto an identical blob
      }
    }
    changes.push({ path: repoPath, bytes });
  }
  return { changes, content: out };
}

/** Insert `-suffix` before the extension: `images/logo.png` → `images/logo-ab12.png`. */
function nameWithHash(ref: string, suffix: string): string {
  const dir = dirOf(ref);
  const base = baseOf(ref);
  const dot = base.lastIndexOf('.');
  const named = dot === -1 ? `${base}-${suffix}` : `${base.slice(0, dot)}-${suffix}${base.slice(dot)}`;
  return dir === '' ? named : `${dir}/${named}`;
}

/** Replace a specific image ref URL (inline + ref-def) with `to`, verbatim elsewhere. */
function rewriteRef(content: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content
    .replaceAll(new RegExp(`(!\\[[^\\]\\n]*\\]\\(\\s*)${esc}(\\s*(?:"[^"\\n]*")?\\s*\\))`, 'g'), `$1${to}$2`)
    .replaceAll(new RegExp(`(^[ \\t]{0,3}\\[[^\\]\\n]+\\]:\\s*)${esc}(\\s*(?:"[^"\\n]*")?\\s*)$`, 'gm'), `$1${to}$2`);
}

/** Build the `foo-<sha>.md` sibling path next to `foo.md`. */
function forkPath(fooPath: string, hash: string): string {
  const dir = dirOf(fooPath);
  const base = baseOf(fooPath);
  const dot = base.lastIndexOf('.');
  const named = dot === -1 ? `${base}-${hash}` : `${base.slice(0, dot)}-${hash}${base.slice(dot)}`;
  return dir === '' ? named : `${dir}/${named}`;
}

/** Commit `changes` (blobs) onto the current head as one atomic commit. */
async function commitChanges(
  token: string,
  ref: RepoRef,
  headCommit: string,
  treeSha: string,
  changes: { path: string; bytes: Uint8Array }[],
  message: string,
): Promise<boolean> {
  const treeChanges = await Promise.all(
    changes.map(async (c) => ({ path: c.path, sha: await createBlob(token, ref, c.bytes) })),
  );
  const newTree = await createTree(token, ref, treeSha, treeChanges);
  const commit = await createCommit(token, ref, message, newTree, headCommit);
  return updateRef(token, ref, commit);
}

const MAX_SAVE_RETRIES = 5;

/**
 * Save the document to GitHub — the R4 state machine. `content` is the current
 * editor text; `baselineSha` is the blob SHA `foo.md` was last in sync with.
 * Returns the outcome plus the new baseline (and, on a fork, the new path the
 * caller must re-link to). Atomic: one commit; a 422 (ref advanced) retries and
 * re-evaluates the whole decision.
 */
export async function saveToGithub(
  token: string,
  target: GithubTarget,
  content: string,
  docName: string,
  baselineSha: string,
): Promise<SaveOutcome> {
  const ref = refOf(target);
  const message = `${FIXED_COMMIT_PREFIX}${docName}`;
  const localSha = await gitBlobSha(utf8ToBytes(content));

  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt += 1) {
    const head = await getBranchHead(token, ref);
    if (!head) return { kind: 'remote-gone' }; // branch vanished
    const treeSha = await getCommitTree(token, ref, head);
    const tree = indexTree(await getTreeRecursive(token, ref, treeSha));
    const remote = tree.get(target.path);
    if (!remote) return { kind: 'remote-gone' }; // foo.md deleted / moved

    const editedLocally = localSha !== baselineSha;
    const remoteMoved = remote.sha !== baselineSha;

    // (L = B, R = B) → No-op ; (L = B, R ≠ B) → Reload suggested.
    if (!editedLocally) {
      return remoteMoved ? { kind: 'reload-suggested' } : { kind: 'noop' };
    }

    if (!remoteMoved) {
      // Fast-forward: foo.md + new images in one commit.
      const prepared = await prepareImages(content, target, tree);
      const fooBytes = utf8ToBytes(prepared.content);
      const changes = [{ path: target.path, bytes: fooBytes }, ...prepared.changes];
      const ok = await commitChanges(token, ref, head, treeSha, changes, message);
      if (!ok) continue; // 422 — re-evaluate from a fresh head
      return { kind: 'pushed', baselineSha: await gitBlobSha(fooBytes), content: prepared.content };
    }

    // Divergence → Fork. Sibling foo-<sha>.md, foo.md left intact.
    const prepared = await prepareImages(content, target, tree);
    const fooBytes = utf8ToBytes(prepared.content);
    const localForkSha = await gitBlobSha(fooBytes);
    let path = forkPath(target.path, localForkSha.slice(0, 8));
    for (let len = 8; len <= 40; len += 4) {
      const candidate = forkPath(target.path, localForkSha.slice(0, len));
      const entry = tree.get(candidate);
      if (!entry) {
        path = candidate;
        break;
      }
      if (entry.sha === localForkSha) {
        // Identical sibling already there → idempotent re-link, no new commit.
        return { kind: 'forked', path: candidate, baselineSha: entry.sha, content: prepared.content };
      }
    }
    const changes = [{ path, bytes: fooBytes }, ...prepared.changes];
    const ok = await commitChanges(token, ref, head, treeSha, changes, message);
    if (!ok) continue; // 422 — re-evaluate
    return { kind: 'forked', path, baselineSha: localForkSha, content: prepared.content };
  }
  // Exhausted retries — surface as remote-moved so the caller can reload.
  return { kind: 'reload-suggested' };
}

/** Raised when linking targets a branch that doesn't exist yet (v1: no auto-create). */
export class GithubBranchAbsentError extends Error {
  branch: string;
  constructor(branch: string) {
    super(`La branche « ${branch} » n'existe pas encore dans le dépôt.`);
    this.name = 'GithubBranchAbsentError';
    this.branch = branch;
  }
}

/**
 * Create the first commit for a newly-linked file whose `foo.md` is absent
 * remotely (link to an existing branch). Pushes `foo.md` + in-perimeter images
 * atomically and returns the new baseline SHA. A missing branch throws
 * `GithubBranchAbsentError` (v1 does not auto-create branches).
 */
export async function createOnGithub(
  token: string,
  target: GithubTarget,
  content: string,
  docName: string,
): Promise<{ baselineSha: string }> {
  const ref = refOf(target);
  const message = `${FIXED_COMMIT_PREFIX}${docName}`;
  let head = await getBranchHead(token, ref);
  if (!head) throw new GithubBranchAbsentError(target.branch);

  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt += 1) {
    const treeSha = await getCommitTree(token, ref, head);
    const tree = indexTree(await getTreeRecursive(token, ref, treeSha));
    const prepared = await prepareImages(content, target, tree);
    const bytes = utf8ToBytes(prepared.content);
    const changes = [{ path: target.path, bytes }, ...prepared.changes];
    const ok = await commitChanges(token, ref, head, treeSha, changes, message);
    if (ok) return { baselineSha: await gitBlobSha(bytes) };
    const h = await getBranchHead(token, ref); // 422 — re-read and retry
    if (!h) throw new GithubBranchAbsentError(target.branch);
    head = h;
  }
  throw new GithubError(409, 'Impossible de créer le fichier (la branche bouge sans cesse).');
}
