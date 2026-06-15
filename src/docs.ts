/********************************* docs.ts *************************************
 *
 * Purpose: Multi-document store — user docs are envelopes (uuid, name,
 *   mtime, contentSha) pointing at content-addressed markdown blobs.
 * How: localStorage with three key spaces (`markpage:docs:index`,
 *   `markpage:blobs:<sha>`, `markpage:current-doc`); the `doc` URL
 *   query param can pin a doc per-tab. See SPEC §19.
 *
 *   NOTE (Phase 1, file-management refactor): the public API is async even
 *   though the current backing store is synchronous localStorage. This is
 *   deliberate "branch by abstraction" — the signatures already match the
 *   coming OPFS backing (fully async), so swapping the store later touches
 *   only the bodies here, not the call sites. The internal helpers stay
 *   sync for now (they'll be rewritten when the OPFS store lands).
 *
 *******************************************************************************/

// On-disk schema (localStorage):
//   markpage:docs:index   → JSON DocEntry[]    (by mtime desc)
//   markpage:blobs:<sha>  → string             (one markdown source)
//   markpage:current-doc  → uuid
//
// Legacy (mono-doc) keys `markpage:doc` and `markpage:filename` are
// migrated on first multi-doc run, then deleted.

import { sha256Hex } from './image-store';

const KEY_INDEX = 'markpage:docs:index';
const KEY_BLOB_PREFIX = 'markpage:blobs:';
const KEY_CURRENT = 'markpage:current-doc';
const KEY_LEGACY_DOC = 'markpage:doc';
const KEY_LEGACY_FILENAME = 'markpage:filename';

/**
 * Purpose: One entry in the docs index — lightweight pointer at a
 *   content-addressed blob.
 */
export interface DocEntry {
  uuid: string;
  name: string;
  mtime: number;
  contentSha: string;
}

// ---- index ------------------------------------------------------------

/**
 * Purpose: Parse the index from localStorage, tolerant to corruption.
 * How: JSON parse + array filter through `isDocEntry`; returns `[]` on
 *   any parse / shape failure.
 */
function readIndex(): DocEntry[] {
  const raw = localStorage.getItem(KEY_INDEX);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDocEntry);
  } catch {
    return [];
  }
}

/**
 * Purpose: Persist the index back to localStorage.
 * How: Stringify and overwrite `KEY_INDEX` in one call.
 */
function writeIndex(entries: DocEntry[]): void {
  localStorage.setItem(KEY_INDEX, JSON.stringify(entries));
}

/**
 * Purpose: Runtime guard checking that an unknown value is a `DocEntry`.
 * How: Object presence + four `typeof` checks on uuid/name/mtime/contentSha.
 */
function isDocEntry(x: unknown): x is DocEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Partial<DocEntry>;
  return (
    typeof e.uuid === 'string' &&
    typeof e.name === 'string' &&
    typeof e.mtime === 'number' &&
    typeof e.contentSha === 'string'
  );
}

/**
 * Purpose: Snapshot of the index sorted by mtime descending.
 * How: Read, shallow copy, sort by `b.mtime - a.mtime`.
 */
export async function listDocs(): Promise<DocEntry[]> {
  return readIndex().slice().sort((a, b) => b.mtime - a.mtime);
}

// ---- blobs ------------------------------------------------------------

/**
 * Purpose: Build the localStorage key for a content blob.
 * How: Prefix concatenation with `KEY_BLOB_PREFIX`.
 */
function blobKey(sha: string): string {
  return KEY_BLOB_PREFIX + sha;
}

/**
 * Purpose: Load the markdown blob stored under a SHA.
 * How: Direct `localStorage.getItem`, returning `null` on miss.
 */
function readBlob(sha: string): string | null {
  return localStorage.getItem(blobKey(sha));
}

/**
 * Purpose: Persist a blob if (and only if) it isn't already there.
 * How: Skip when the key exists — content-addressing means same SHA → same bytes.
 */
function writeBlob(sha: string, content: string): void {
  // No-op when the blob already exists — content-addressed, so the
  // value would be byte-identical anyway.
  if (localStorage.getItem(blobKey(sha)) === null) {
    localStorage.setItem(blobKey(sha), content);
  }
}

/**
 * Purpose: Compute the SHA-256 hex of a markdown string.
 * How: Wrap into a `Blob` and delegate to `sha256Hex` from image-store.
 */
async function hashContent(content: string): Promise<string> {
  return sha256Hex(new Blob([content]));
}

// ---- current doc ------------------------------------------------------

// URL query-param the editor uses to pin a specific document. When
// present at bootstrap, takes precedence over the persisted "current"
// key — so a bookmark or a second tab can each open their own doc
// independently of the last-used global pointer.
const URL_PARAM = 'doc';

/**
 * Purpose: Read the persisted current-doc uuid (or null).
 * How: `localStorage.getItem(KEY_CURRENT)`.
 */
export async function getCurrentDocId(): Promise<string | null> {
  return localStorage.getItem(KEY_CURRENT);
}

/**
 * Purpose: Record the active doc in both localStorage and the URL bar.
 * How: Set `KEY_CURRENT`, then `history.replaceState` with `?doc=<uuid>`
 *   so reloads, shares and parallel tabs each pin their own doc.
 */
export async function setCurrentDocId(uuid: string): Promise<void> {
  localStorage.setItem(KEY_CURRENT, uuid);
  if (
    typeof globalThis.history !== 'undefined' &&
    typeof globalThis.location !== 'undefined'
  ) {
    const url = new URL(globalThis.location.href);
    if (url.searchParams.get(URL_PARAM) !== uuid) {
      url.searchParams.set(URL_PARAM, uuid);
      globalThis.history.replaceState({}, '', url);
    }
  }
}

/**
 * Purpose: Resolve a doc from the `?doc=<uuid>` URL parameter, if any.
 * How: Parse `location.href`, look up the index, return the match or null.
 */
export async function resolveDocFromUrl(): Promise<DocEntry | null> {
  if (typeof globalThis.location === 'undefined') return null;
  const id = new URL(globalThis.location.href).searchParams.get(URL_PARAM);
  if (!id) return null;
  return readIndex().find((e) => e.uuid === id) ?? null;
}

/**
 * Purpose: Pick the doc to display on this run.
 * How: Prefer the persisted current-doc; fall back to the freshest entry;
 *   null only when the index is empty.
 */
export async function resolveCurrentDoc(): Promise<DocEntry | null> {
  const index = readIndex();
  if (index.length === 0) return null;
  const id = await getCurrentDocId();
  const direct = id ? index.find((e) => e.uuid === id) : null;
  if (direct) return direct;
  // No (or stale) current-doc → pick the freshest entry.
  const sorted = await listDocs();
  return sorted[0] ?? null;
}

/**
 * Purpose: Load the markdown body for a doc entry.
 * How: `readBlob(entry.contentSha)`; null on missing/GC-ed blob.
 */
export async function loadDocContent(entry: DocEntry): Promise<string | null> {
  return readBlob(entry.contentSha);
}

/**
 * Purpose: Persist new content for the named doc, return the updated entry.
 * How: Hash, write blob (no-op if SHA unchanged), patch the index entry's
 *   contentSha + mtime; no-op edits leave mtime alone.
 */
export async function saveDocContent(
  uuid: string,
  content: string,
): Promise<DocEntry> {
  const sha = await hashContent(content);
  writeBlob(sha, content);
  const index = readIndex();
  const i = index.findIndex((e) => e.uuid === uuid);
  if (i < 0) throw new Error(`saveDocContent: unknown uuid ${uuid}`);
  const entry = index[i];
  if (entry.contentSha === sha) {
    // Same content — only the mtime changes, and only if the caller
    // explicitly wants to bump it. We don't bump on no-op saves so
    // an idle reopen doesn't reorder the dropdown.
    return entry;
  }
  const updated: DocEntry = { ...entry, contentSha: sha, mtime: Date.now() };
  index[i] = updated;
  writeIndex(index);
  return updated;
}

// ---- create / rename / delete / duplicate -----------------------------

/**
 * Purpose: Disambiguate a candidate name against a set of taken names.
 * How: Return `base` unchanged when free; else append " 2", " 3", … until free.
 */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/**
 * Purpose: Create a new doc with an initial content blob.
 * How: Hash + writeBlob, then push a fresh entry (uuid, unique name,
 *   mtime=now, SHA) into the index.
 */
export async function createDoc(
  desiredName: string,
  initialContent = '',
): Promise<DocEntry> {
  const sha = await hashContent(initialContent);
  writeBlob(sha, initialContent);
  const index = readIndex();
  const taken = new Set(index.map((e) => e.name));
  const name = uniqueName(desiredName.trim() || 'Sans titre', taken);
  const entry: DocEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
    contentSha: sha,
  };
  index.push(entry);
  writeIndex(index);
  return entry;
}

/**
 * Purpose: Rename a doc; reject empty names and unknown uuids.
 * How: Patch the index entry's `name`, leave `mtime` and `contentSha` alone.
 */
export async function renameDoc(
  uuid: string,
  newName: string,
): Promise<DocEntry | null> {
  const trimmed = newName.trim();
  if (trimmed === '') return null;
  const index = readIndex();
  const i = index.findIndex((e) => e.uuid === uuid);
  if (i < 0) return null;
  const updated: DocEntry = { ...index[i], name: trimmed };
  index[i] = updated;
  writeIndex(index);
  return updated;
}

/**
 * Purpose: Remove a doc from the index (blob GC is separate).
 * How: Filter the index; also drop `KEY_CURRENT` when it pointed at the deleted doc.
 */
export async function deleteDoc(uuid: string): Promise<void> {
  const index = readIndex().filter((e) => e.uuid !== uuid);
  writeIndex(index);
  if ((await getCurrentDocId()) === uuid) {
    localStorage.removeItem(KEY_CURRENT);
  }
}

/**
 * Purpose: Duplicate a doc cheaply via shared blob reference.
 * How: Push a new index entry with a fresh uuid + unique "Copie de …"
 *   name, reusing the source `contentSha` (no new blob).
 */
export async function duplicateDoc(uuid: string): Promise<DocEntry | null> {
  const index = readIndex();
  const src = index.find((e) => e.uuid === uuid);
  if (!src) return null;
  const taken = new Set(index.map((e) => e.name));
  // The blob is shared via the SHA — no new blob to write.
  const name = uniqueName(`Copie de ${src.name}`, taken);
  const entry: DocEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
    contentSha: src.contentSha,
  };
  index.push(entry);
  writeIndex(index);
  return entry;
}

// ---- legacy migration -------------------------------------------------

/**
 * Purpose: One-shot migration of the pre-§19 mono-doc schema.
 * How: When `KEY_INDEX` is absent and `markpage:doc` exists, create a
 *   doc from it (name derived from `markpage:filename`), then drop both
 *   legacy keys. Idempotent.
 */
export async function migrateLegacyDocIfNeeded(): Promise<void> {
  if (localStorage.getItem(KEY_INDEX) !== null) return;
  const legacy = localStorage.getItem(KEY_LEGACY_DOC);
  if (legacy === null) return;
  const filename = localStorage.getItem(KEY_LEGACY_FILENAME) ?? '';
  const baseName = filename.replace(/\.(pdf|md)$/i, '').trim();
  const name = baseName === '' ? 'Mon document' : baseName;
  const entry = await createDoc(name, legacy);
  await setCurrentDocId(entry.uuid);
  // Drop the legacy keys so we don't run the migration twice.
  localStorage.removeItem(KEY_LEGACY_DOC);
  localStorage.removeItem(KEY_LEGACY_FILENAME);
}

/**
 * Purpose: Set of SHAs currently referenced by at least one doc.
 * How: Map the index entries to their `contentSha`. Used by the GC pass.
 */
function referencedContentShas(): Set<string> {
  return new Set(readIndex().map((e) => e.contentSha));
}

/**
 * Purpose: List every SHA backed by a `markpage:blobs:` localStorage entry.
 * How: Linear walk over `localStorage` keys with the blob prefix.
 */
function allBlobShas(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k?.startsWith(KEY_BLOB_PREFIX)) {
      out.push(k.slice(KEY_BLOB_PREFIX.length));
    }
  }
  return out;
}

/**
 * Purpose: Drop every content blob whose SHA isn't referenced anymore.
 * How: Iterate `allBlobShas`, delete the ones missing from
 *   `referencedContentShas`, return the count removed.
 */
export async function gcContentBlobs(): Promise<number> {
  const referenced = referencedContentShas();
  let removed = 0;
  for (const sha of allBlobShas()) {
    if (referenced.has(sha)) continue;
    localStorage.removeItem(blobKey(sha));
    removed += 1;
  }
  return removed;
}
