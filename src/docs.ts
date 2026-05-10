// Multi-document store. The user-visible "document" is a lightweight
// envelope (uuid, name, mtime, contentSha) pointing at a content-
// addressed blob. Blobs live under `md2pdf:blobs:<sha>` so two docs
// with identical content share a single entry; the same SHA scheme
// also runs the IndexedDB image pool. See SPEC §19.
//
// On-disk schema (localStorage):
//   md2pdf:docs:index   → JSON DocEntry[]    (by mtime desc)
//   md2pdf:blobs:<sha>  → string             (one markdown source)
//   md2pdf:current-doc  → uuid
//
// Legacy (mono-doc) keys `md2pdf:doc` and `md2pdf:filename` are
// migrated on first multi-doc run, then deleted.

import { sha256Hex } from './image-store';

const KEY_INDEX = 'md2pdf:docs:index';
const KEY_BLOB_PREFIX = 'md2pdf:blobs:';
const KEY_CURRENT = 'md2pdf:current-doc';
const KEY_LEGACY_DOC = 'md2pdf:doc';
const KEY_LEGACY_FILENAME = 'md2pdf:filename';

export interface DocEntry {
  uuid: string;
  name: string;
  mtime: number;
  contentSha: string;
}

// ---- index ------------------------------------------------------------

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

function writeIndex(entries: DocEntry[]): void {
  localStorage.setItem(KEY_INDEX, JSON.stringify(entries));
}

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

export function listDocs(): DocEntry[] {
  return readIndex().slice().sort((a, b) => b.mtime - a.mtime);
}

// ---- blobs ------------------------------------------------------------

function blobKey(sha: string): string {
  return KEY_BLOB_PREFIX + sha;
}

function readBlob(sha: string): string | null {
  return localStorage.getItem(blobKey(sha));
}

function writeBlob(sha: string, content: string): void {
  // No-op when the blob already exists — content-addressed, so the
  // value would be byte-identical anyway.
  if (localStorage.getItem(blobKey(sha)) === null) {
    localStorage.setItem(blobKey(sha), content);
  }
}

async function hashContent(content: string): Promise<string> {
  return sha256Hex(new Blob([content]));
}

// ---- current doc ------------------------------------------------------

export function getCurrentDocId(): string | null {
  return localStorage.getItem(KEY_CURRENT);
}

export function setCurrentDocId(uuid: string): void {
  localStorage.setItem(KEY_CURRENT, uuid);
}

// Resolves the doc the app should show on this run. Falls back to the
// most recently modified doc when current-doc is missing or invalid.
// Returns null only when the index is empty.
export function resolveCurrentDoc(): DocEntry | null {
  const index = readIndex();
  if (index.length === 0) return null;
  const id = getCurrentDocId();
  const direct = id ? index.find((e) => e.uuid === id) : null;
  if (direct) return direct;
  // No (or stale) current-doc → pick the freshest entry.
  const sorted = listDocs();
  return sorted[0] ?? null;
}

// Loads the markdown content for an entry. Returns null if the blob
// has been GC-ed or the storage was tampered with.
export function loadDocContent(entry: DocEntry): string | null {
  return readBlob(entry.contentSha);
}

// Persists a new content for the given doc: hashes it, writes the
// blob if new, updates the entry's contentSha and mtime in the index.
// Cheap on no-op edits because the SHA stays the same.
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

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

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

export function renameDoc(uuid: string, newName: string): DocEntry | null {
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

export function deleteDoc(uuid: string): void {
  const index = readIndex().filter((e) => e.uuid !== uuid);
  writeIndex(index);
  if (getCurrentDocId() === uuid) {
    localStorage.removeItem(KEY_CURRENT);
  }
}

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

// One-shot migration of the mono-doc schema (md2pdf:doc + md2pdf:filename)
// into the multi-doc index. Idempotent — once md2pdf:docs:index exists,
// this returns without touching anything.
export async function migrateLegacyDocIfNeeded(): Promise<void> {
  if (localStorage.getItem(KEY_INDEX) !== null) return;
  const legacy = localStorage.getItem(KEY_LEGACY_DOC);
  if (legacy === null) return;
  const filename = localStorage.getItem(KEY_LEGACY_FILENAME) ?? '';
  const baseName = filename.replace(/\.(pdf|md)$/i, '').trim();
  const name = baseName === '' ? 'Mon document' : baseName;
  const entry = await createDoc(name, legacy);
  setCurrentDocId(entry.uuid);
  // Drop the legacy keys so we don't run the migration twice.
  localStorage.removeItem(KEY_LEGACY_DOC);
}

// Set of SHA referenced by at least one doc in the index. Used by the
// localStorage GC pass.
export function referencedContentShas(): Set<string> {
  return new Set(readIndex().map((e) => e.contentSha));
}

// Iterates over every blob currently held in localStorage under the
// `md2pdf:blobs:` prefix. Used by GC.
export function allBlobShas(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(KEY_BLOB_PREFIX)) {
      out.push(k.slice(KEY_BLOB_PREFIX.length));
    }
  }
  return out;
}

export function deleteBlob(sha: string): void {
  localStorage.removeItem(blobKey(sha));
}
