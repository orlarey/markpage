/********************************* docs.ts *************************************
 *
 * Purpose: Multi-document store — user docs are envelopes (uuid, name,
 *   mtime, contentSha) addressing their markdown content.
 * How: The canonical store is OPFS bundles (SPEC `FILE-MANAGEMENT-SPEC.md`):
 *     library/index.json        → { docs: DocEntry[], currentDoc }
 *     library/<uuid>/content.md  → one doc's markdown
 *   An in-memory cache fronts index.json (write-through). On browsers without
 *   OPFS we fall back to the legacy localStorage store (kept intact below).
 *   The first OPFS boot migrates the legacy localStorage docs into bundles,
 *   leaving the old keys as a safety net (cleanup deferred — SPEC §10).
 *   The `doc` URL query param can pin a doc per-tab. See SPEC §19.
 *
 *******************************************************************************/

import { sha256Hex } from './image-store';
import {
  deleteEntry,
  opfsAvailable,
  readTextFile,
  writeTextFile,
} from './opfs';

const KEY_INDEX = 'markpage:docs:index';
const KEY_BLOB_PREFIX = 'markpage:blobs:';
const KEY_CURRENT = 'markpage:current-doc';
const KEY_LEGACY_DOC = 'markpage:doc';
const KEY_LEGACY_FILENAME = 'markpage:filename';

const INDEX_FILE = 'index.json';
const URL_PARAM = 'doc';

/**
 * Purpose: One entry in the docs index — a lightweight envelope.
 */
export interface DocEntry {
  uuid: string;
  name: string;
  mtime: number;
  // The committed (saved) content fingerprint.
  contentSha: string;
  // The auto-persisted working copy's fingerprint, present only while the doc
  // has unsaved edits. `contentSha` is never touched until an explicit Save.
  dirtySha?: string;
  // Soft-delete timestamp (Phase 3 trash). Present ⇒ the doc is in the
  // Trash: hidden from listDocs, restorable, kept on disk until purged.
  deletedAt?: number;
}

interface Library {
  docs: DocEntry[];
  currentDoc: string | null;
}

const bundlePath = (uuid: string): string => `${uuid}/content.md`;
const draftPath = (uuid: string): string => `${uuid}/draft.md`;

/** A copy of `e` with no `dirtySha` (i.e. a clean / committed entry). */
function clearDirty(e: DocEntry): DocEntry {
  const copy = { ...e };
  delete copy.dirtySha;
  return copy;
}

/** A copy of `e` with no `deletedAt` (i.e. restored out of the Trash). */
function clearDeleted(e: DocEntry): DocEntry {
  const copy = { ...e };
  delete copy.deletedAt;
  return copy;
}

/** Whether a doc has unsaved working-copy edits. */
export function isModified(entry: DocEntry): boolean {
  return entry.dirtySha != null && entry.dirtySha !== entry.contentSha;
}

/**
 * Purpose: Runtime guard checking that an unknown value is a `DocEntry`.
 */
function isDocEntry(x: unknown): x is DocEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Partial<DocEntry>;
  return (
    typeof e.uuid === 'string' &&
    typeof e.name === 'string' &&
    typeof e.mtime === 'number' &&
    typeof e.contentSha === 'string' &&
    (e.dirtySha === undefined || typeof e.dirtySha === 'string') &&
    (e.deletedAt === undefined || typeof e.deletedAt === 'number')
  );
}

/** Compute the SHA-256 hex of a markdown string (content fingerprint). */
async function hashContent(content: string): Promise<string> {
  return sha256Hex(new Blob([content]));
}

/** Disambiguate a candidate name against a set of taken names. */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/** Mirror the active doc into the `?doc=<uuid>` URL bar (per-tab pinning). */
function mirrorDocInUrl(uuid: string): void {
  if (
    typeof globalThis.history === 'undefined' ||
    typeof globalThis.location === 'undefined'
  ) {
    return;
  }
  const url = new URL(globalThis.location.href);
  if (url.searchParams.get(URL_PARAM) !== uuid) {
    url.searchParams.set(URL_PARAM, uuid);
    globalThis.history.replaceState({}, '', url);
  }
}

/** Read the `?doc=<uuid>` URL parameter, or null. */
function urlDocId(): string | null {
  if (typeof globalThis.location === 'undefined') return null;
  return new URL(globalThis.location.href).searchParams.get(URL_PARAM);
}

// =======================================================================
//  OPFS bundle store (canonical when OPFS is available)
// =======================================================================

let libPromise: Promise<Library> | null = null;

/**
 * Purpose: Load (and memoise) the library index from OPFS.
 * How: Read `index.json`; if absent/corrupt, migrate the legacy localStorage
 *   store into bundles and write a fresh index. Idempotent and crash-safe:
 *   a partial migration re-runs from localStorage on the next boot.
 */
async function loadLibrary(): Promise<Library> {
  libPromise ??= (async () => {
    const raw = await readTextFile(INDEX_FILE);
    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw) as Partial<Library>;
        const docs = Array.isArray(parsed.docs)
          ? parsed.docs.filter(isDocEntry)
          : [];
        const currentDoc =
          typeof parsed.currentDoc === 'string' ? parsed.currentDoc : null;
        return { docs, currentDoc };
      } catch {
        /* corrupt index → rebuild from localStorage below */
      }
    }
    return migrateFromLocalStorage();
  })();
  return libPromise;
}

/** Persist the in-memory library back to `index.json`. */
async function saveLibrary(lib: Library): Promise<void> {
  await writeTextFile(INDEX_FILE, JSON.stringify(lib));
}

/**
 * Purpose: One-time migration of the legacy localStorage docs into OPFS
 *   bundles. Old keys are left in place as a safety net (SPEC §10).
 */
async function migrateFromLocalStorage(): Promise<Library> {
  const docs: DocEntry[] = [];
  for (const e of legacyReadIndex()) {
    const content = legacyReadBlob(e.contentSha) ?? '';
    await writeTextFile(bundlePath(e.uuid), content);
    if (e.dirtySha) {
      const draft = legacyReadBlob(e.dirtySha);
      if (draft != null) await writeTextFile(draftPath(e.uuid), draft);
    }
    docs.push({ ...e });
  }
  const currentDoc = localStorage.getItem(KEY_CURRENT);
  const lib: Library = { docs, currentDoc };
  await saveLibrary(lib);
  return lib;
}

// =======================================================================
//  Legacy localStorage store (fallback when OPFS is unavailable)
// =======================================================================

function legacyReadIndex(): DocEntry[] {
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

function legacyWriteIndex(entries: DocEntry[]): void {
  localStorage.setItem(KEY_INDEX, JSON.stringify(entries));
}

const legacyBlobKey = (sha: string): string => KEY_BLOB_PREFIX + sha;

function legacyReadBlob(sha: string): string | null {
  return localStorage.getItem(legacyBlobKey(sha));
}

function legacyWriteBlob(sha: string, content: string): void {
  if (localStorage.getItem(legacyBlobKey(sha)) === null) {
    localStorage.setItem(legacyBlobKey(sha), content);
  }
}

async function legacyCreateDoc(
  desiredName: string,
  initialContent: string,
): Promise<DocEntry> {
  const sha = await hashContent(initialContent);
  legacyWriteBlob(sha, initialContent);
  const index = legacyReadIndex();
  const name = uniqueName(
    desiredName.trim() || 'Sans titre',
    new Set(index.map((e) => e.name)),
  );
  const entry: DocEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
    contentSha: sha,
  };
  index.push(entry);
  legacyWriteIndex(index);
  return entry;
}

// =======================================================================
//  Public API (async; OPFS when available, else legacy localStorage)
// =======================================================================

/** The full index for the active backend (includes trashed docs). */
async function rawDocs(): Promise<DocEntry[]> {
  return opfsAvailable() ? (await loadLibrary()).docs : legacyReadIndex();
}

/** Active (non-trashed) documents, sorted by mtime descending. */
export async function listDocs(): Promise<DocEntry[]> {
  return (await rawDocs())
    .filter((e) => e.deletedAt == null)
    .sort((a, b) => b.mtime - a.mtime);
}

/** Trashed documents, most-recently-deleted first. */
export async function listTrash(): Promise<DocEntry[]> {
  return (await rawDocs())
    .filter((e) => e.deletedAt != null)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** Read the persisted current-doc uuid (or null). */
export async function getCurrentDocId(): Promise<string | null> {
  if (!opfsAvailable()) return localStorage.getItem(KEY_CURRENT);
  return (await loadLibrary()).currentDoc;
}

/** Record the active doc (persisted store + URL bar). */
export async function setCurrentDocId(uuid: string): Promise<void> {
  if (opfsAvailable()) {
    const lib = await loadLibrary();
    lib.currentDoc = uuid;
    await saveLibrary(lib);
  } else {
    localStorage.setItem(KEY_CURRENT, uuid);
  }
  mirrorDocInUrl(uuid);
}

/** Resolve a doc from the `?doc=<uuid>` URL parameter, if any. */
export async function resolveDocFromUrl(): Promise<DocEntry | null> {
  const id = urlDocId();
  if (!id) return null;
  return (
    (await rawDocs()).find((e) => e.uuid === id && e.deletedAt == null) ?? null
  );
}

/**
 * Purpose: Pick the doc to display on this run.
 * How: Prefer the persisted current-doc; fall back to the freshest entry;
 *   null only when the store is empty.
 */
export async function resolveCurrentDoc(): Promise<DocEntry | null> {
  const docs = await listDocs(); // active only, mtime desc
  if (docs.length === 0) return null;
  const id = await getCurrentDocId();
  const direct = id ? docs.find((e) => e.uuid === id) : null;
  return direct ?? docs[0] ?? null;
}

/**
 * Load the working copy of a doc — the draft if one exists (so reopening
 * resumes unsaved edits), else the committed content.
 */
export async function loadDocContent(entry: DocEntry): Promise<string | null> {
  if (!opfsAvailable()) {
    return legacyReadBlob(entry.dirtySha ?? entry.contentSha);
  }
  if (entry.dirtySha) {
    return (
      (await readTextFile(draftPath(entry.uuid))) ??
      (await readTextFile(bundlePath(entry.uuid))) ??
      null
    );
  }
  return (await readTextFile(bundlePath(entry.uuid))) ?? null;
}

/** Load the committed (saved) content, ignoring any draft. */
export async function loadCommittedContent(
  entry: DocEntry,
): Promise<string | null> {
  if (!opfsAvailable()) return legacyReadBlob(entry.contentSha);
  return (await readTextFile(bundlePath(entry.uuid))) ?? null;
}

/**
 * Auto-persist the working copy (autosave). Writes the draft and stamps
 * `dirtySha`; if the content matches the committed version, the draft is
 * dropped instead (back to clean). Never touches the committed content.
 */
export async function saveDraft(
  uuid: string,
  content: string,
): Promise<DocEntry> {
  const sha = await hashContent(content);
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) throw new Error(`saveDraft: unknown uuid ${uuid}`);
    const updated =
      sha === index[i].contentSha
        ? clearDirty(index[i])
        : ((): DocEntry => {
            legacyWriteBlob(sha, content);
            return { ...index[i], dirtySha: sha };
          })();
    index[i] = updated;
    legacyWriteIndex(index);
    return updated;
  }
  const lib = await loadLibrary();
  const i = lib.docs.findIndex((e) => e.uuid === uuid);
  if (i < 0) throw new Error(`saveDraft: unknown uuid ${uuid}`);
  if (sha === lib.docs[i].contentSha) {
    await deleteEntry(draftPath(uuid));
    lib.docs[i] = clearDirty(lib.docs[i]);
  } else {
    await writeTextFile(draftPath(uuid), content);
    lib.docs[i] = { ...lib.docs[i], dirtySha: sha };
  }
  await saveLibrary(lib);
  return lib.docs[i];
}

/** Commit the working copy: the draft becomes the new committed content (Save). */
export async function commitDoc(uuid: string): Promise<DocEntry> {
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) throw new Error(`commitDoc: unknown uuid ${uuid}`);
    if (!index[i].dirtySha) return index[i];
    const updated = clearDirty({
      ...index[i],
      contentSha: index[i].dirtySha,
      mtime: Date.now(),
    });
    index[i] = updated;
    legacyWriteIndex(index);
    return updated;
  }
  const lib = await loadLibrary();
  const i = lib.docs.findIndex((e) => e.uuid === uuid);
  if (i < 0) throw new Error(`commitDoc: unknown uuid ${uuid}`);
  const entry = lib.docs[i];
  if (!entry.dirtySha) return entry;
  const draft = (await readTextFile(draftPath(uuid))) ?? '';
  await writeTextFile(bundlePath(uuid), draft);
  await deleteEntry(draftPath(uuid));
  const updated = clearDirty({
    ...entry,
    contentSha: entry.dirtySha,
    mtime: Date.now(),
  });
  lib.docs[i] = updated;
  await saveLibrary(lib);
  return updated;
}

/** Discard the working copy, returning to the committed content (Revert). */
export async function revertDoc(uuid: string): Promise<DocEntry> {
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) throw new Error(`revertDoc: unknown uuid ${uuid}`);
    index[i] = clearDirty(index[i]);
    legacyWriteIndex(index);
    return index[i];
  }
  const lib = await loadLibrary();
  const i = lib.docs.findIndex((e) => e.uuid === uuid);
  if (i < 0) throw new Error(`revertDoc: unknown uuid ${uuid}`);
  await deleteEntry(draftPath(uuid));
  lib.docs[i] = clearDirty(lib.docs[i]);
  await saveLibrary(lib);
  return lib.docs[i];
}

/**
 * Purpose: Persist new content for a doc, return the updated entry.
 * How: Hash; if unchanged, no-op (leaves mtime/order alone). Else write the
 *   bundle's content.md and bump the index entry's contentSha + mtime.
 */
export async function saveDocContent(
  uuid: string,
  content: string,
): Promise<DocEntry> {
  const sha = await hashContent(content);
  if (!opfsAvailable()) {
    legacyWriteBlob(sha, content);
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) throw new Error(`saveDocContent: unknown uuid ${uuid}`);
    if (index[i].contentSha === sha) return index[i];
    const updated: DocEntry = { ...index[i], contentSha: sha, mtime: Date.now() };
    index[i] = updated;
    legacyWriteIndex(index);
    return updated;
  }
  const lib = await loadLibrary();
  const i = lib.docs.findIndex((e) => e.uuid === uuid);
  if (i < 0) throw new Error(`saveDocContent: unknown uuid ${uuid}`);
  if (lib.docs[i].contentSha === sha) return lib.docs[i];
  await writeTextFile(bundlePath(uuid), content);
  const updated: DocEntry = { ...lib.docs[i], contentSha: sha, mtime: Date.now() };
  lib.docs[i] = updated;
  await saveLibrary(lib);
  return updated;
}

/** Create a new doc with initial content. */
export async function createDoc(
  desiredName: string,
  initialContent = '',
): Promise<DocEntry> {
  if (!opfsAvailable()) return legacyCreateDoc(desiredName, initialContent);
  const sha = await hashContent(initialContent);
  const lib = await loadLibrary();
  const name = uniqueName(
    desiredName.trim() || 'Sans titre',
    new Set(lib.docs.map((e) => e.name)),
  );
  const entry: DocEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
    contentSha: sha,
  };
  await writeTextFile(bundlePath(entry.uuid), initialContent);
  lib.docs.push(entry);
  await saveLibrary(lib);
  return entry;
}

/** Rename a doc; reject empty names and unknown uuids. */
export async function renameDoc(
  uuid: string,
  newName: string,
): Promise<DocEntry | null> {
  const trimmed = newName.trim();
  if (trimmed === '') return null;
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) return null;
    const updated: DocEntry = { ...index[i], name: trimmed };
    index[i] = updated;
    legacyWriteIndex(index);
    return updated;
  }
  const lib = await loadLibrary();
  const i = lib.docs.findIndex((e) => e.uuid === uuid);
  if (i < 0) return null;
  const updated: DocEntry = { ...lib.docs[i], name: trimmed };
  lib.docs[i] = updated;
  await saveLibrary(lib);
  return updated;
}

/** Remove a doc (and, on OPFS, its bundle). */
export async function deleteDoc(uuid: string): Promise<void> {
  const now = Date.now();
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) return;
    index[i] = { ...index[i], deletedAt: now };
    legacyWriteIndex(index);
    if (localStorage.getItem(KEY_CURRENT) === uuid) {
      localStorage.removeItem(KEY_CURRENT);
    }
    return;
  }
  const lib = await loadLibrary();
  const i = lib.docs.findIndex((e) => e.uuid === uuid);
  if (i < 0) return;
  lib.docs[i] = { ...lib.docs[i], deletedAt: now };
  if (lib.currentDoc === uuid) lib.currentDoc = null;
  await saveLibrary(lib);
}

/** Restore a doc out of the Trash. */
export async function restoreDoc(uuid: string): Promise<DocEntry | null> {
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) return null;
    index[i] = clearDeleted(index[i]);
    legacyWriteIndex(index);
    return index[i];
  }
  const lib = await loadLibrary();
  const i = lib.docs.findIndex((e) => e.uuid === uuid);
  if (i < 0) return null;
  lib.docs[i] = clearDeleted(lib.docs[i]);
  await saveLibrary(lib);
  return lib.docs[i];
}

/** Permanently delete a doc and its bundle (no undo). */
export async function purgeDoc(uuid: string): Promise<void> {
  if (!opfsAvailable()) {
    legacyWriteIndex(legacyReadIndex().filter((e) => e.uuid !== uuid));
    if (localStorage.getItem(KEY_CURRENT) === uuid) {
      localStorage.removeItem(KEY_CURRENT);
    }
    return;
  }
  const lib = await loadLibrary();
  lib.docs = lib.docs.filter((e) => e.uuid !== uuid);
  if (lib.currentDoc === uuid) lib.currentDoc = null;
  await saveLibrary(lib);
  await deleteEntry(uuid, true);
}

/** Permanently delete every trashed doc. */
export async function emptyTrash(): Promise<void> {
  for (const e of await listTrash()) {
    await purgeDoc(e.uuid);
  }
}

/** Duplicate a doc into a fresh bundle ("Copie de …"). */
export async function duplicateDoc(uuid: string): Promise<DocEntry | null> {
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const src = index.find((e) => e.uuid === uuid);
    if (!src) return null;
    const name = uniqueName(
      `Copie de ${src.name}`,
      new Set(index.map((e) => e.name)),
    );
    const entry: DocEntry = {
      uuid: crypto.randomUUID(),
      name,
      mtime: Date.now(),
      contentSha: src.contentSha,
    };
    index.push(entry);
    legacyWriteIndex(index);
    return entry;
  }
  const lib = await loadLibrary();
  const src = lib.docs.find((e) => e.uuid === uuid);
  if (!src) return null;
  const content = (await readTextFile(bundlePath(src.uuid))) ?? '';
  const name = uniqueName(
    `Copie de ${src.name}`,
    new Set(lib.docs.map((e) => e.name)),
  );
  const entry: DocEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
    contentSha: src.contentSha,
  };
  await writeTextFile(bundlePath(entry.uuid), content);
  lib.docs.push(entry);
  await saveLibrary(lib);
  return entry;
}

/**
 * Purpose: One-shot migration of the pre-§19 mono-doc schema.
 * How: When `KEY_INDEX` is absent and `markpage:doc` exists, seed the legacy
 *   localStorage index from it; the OPFS migration (loadLibrary) then folds
 *   it into bundles. Operates purely on localStorage so it composes with the
 *   localStorage→OPFS migration. Idempotent.
 */
export async function migrateLegacyDocIfNeeded(): Promise<void> {
  if (localStorage.getItem(KEY_INDEX) !== null) return;
  const legacy = localStorage.getItem(KEY_LEGACY_DOC);
  if (legacy === null) return;
  const filename = localStorage.getItem(KEY_LEGACY_FILENAME) ?? '';
  const baseName = filename.replace(/\.(pdf|md)$/i, '').trim();
  const name = baseName === '' ? 'Mon document' : baseName;
  const entry = await legacyCreateDoc(name, legacy);
  localStorage.setItem(KEY_CURRENT, entry.uuid);
  localStorage.removeItem(KEY_LEGACY_DOC);
  localStorage.removeItem(KEY_LEGACY_FILENAME);
}

/**
 * Purpose: Drop orphaned legacy content blobs (localStorage fallback only).
 * How: No-op under OPFS — each doc owns its bundle, so deleting a doc removes
 *   its content; there is no shared content pool to sweep.
 */
export async function gcContentBlobs(): Promise<number> {
  if (opfsAvailable()) return 0;
  const referenced = new Set(legacyReadIndex().map((e) => e.contentSha));
  let removed = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k?.startsWith(KEY_BLOB_PREFIX)) continue;
    if (referenced.has(k.slice(KEY_BLOB_PREFIX.length))) continue;
    localStorage.removeItem(k);
    removed += 1;
    i -= 1; // length shifted after removal
  }
  return removed;
}
