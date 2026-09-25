/********************************* docs.ts *************************************
 *
 * Purpose: Multi-document store — user docs are envelopes (uuid, name,
 *   mtime, contentSha) addressing their markdown content.
 * How: The canonical store is OPFS bundles (SPEC `docs/FILE-MANAGEMENT-SPEC.md`):
 *     library/index.json        → { docs: DocEntry[], currentDoc }
 *     library/<uuid>/content.md  → one doc's markdown
 *   An in-memory cache fronts index.json (write-through). On browsers without
 *   OPFS we fall back to the legacy localStorage store (kept intact below).
 *   The first OPFS boot migrates the legacy localStorage docs into bundles,
 *   leaving the old keys as a safety net (cleanup deferred — SPEC §10).
 *   The `doc` URL query param can pin a doc per-tab. See SPEC §19.
 *
 *******************************************************************************/

import { docNameFromUrl, urlDocKey } from './url-origin';
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
  // Disk link (Phase 4). Present ⇒ the doc mirrors a real file/folder on disk;
  // `name` is the file/folder name, `kind` tells a single `.md` file apart from
  // a folder bundle (absent ⇒ 'folder', for back-compat). `volume`/`dir` (filled
  // when linked via the volume browser) give the origin chip its volume + folder
  // (VOLUMES-SPEC §7). The handle lives in IndexedDB (see disk-link.ts).
  link?: { name: string; kind?: 'file' | 'folder'; volume?: string; dir?: string };
  // GitHub-sync link (docs/GITHUB-SYNC-SPEC.md). Present ⇒ the doc is linked to
  // a natural `foo.md` file in a repo. `path` is that file's repo path (NOT a
  // bundle dir); `baselineSha` is the blob SHA we are last in sync with (R4).
  githubLink?: GithubLink;
  // OneDrive-sync link (docs/VOLUMES-SPEC.md). Present ⇒ the doc lives in the
  // OneDrive app-folder; `path` is its app-folder-relative path, `baselineEtag`
  // the eTag we last synced with (V1: overwrite + conflict, no fork).
  oneDriveLink?: OneDriveLink;
  // URL origin (url-origin.ts). Present ⇒ the doc is a library copy of a
  // document fetched from a URL: reopening that URL reuses this entry,
  // *Recharger* fetches it again. Written back only when VS Code serves it
  // (a local file: url-origin.ts, putDocText).
  urlLink?: UrlLink;
}

/** A URL origin — where the document was fetched from, and what it was. */
export interface UrlLink {
  /** The URL last fetched (for a loopback one, this session's port + token). */
  url: string;
  /** Its identity across reopenings (url-origin.ts, urlDocKey). */
  key: string;
  /** Content hash of what was last fetched: equal to the committed content ⇒
   *  the local copy is untouched and a reopen may refresh it silently. */
  fetchedSha: string;
}

/** A OneDrive-sync link target — a file in the app-folder + its sync baseline. */
export interface OneDriveLink {
  /** App-folder-relative path, e.g. `lettres/devis.md`. */
  path: string;
  /** eTag at the last successful sync (the conditional-write baseline). */
  baselineEtag: string;
}

/** A GitHub-sync link target — a `foo.md` file in a repo + the sync baseline. */
export interface GithubLink {
  owner: string;
  repo: string;
  branch: string;
  /** Repo path of the linked `foo.md`, e.g. `lettres/2026/devis.md`. */
  path: string;
  /** Blob SHA of `foo.md` at the last successful sync (R4 baseline). */
  baselineSha: string;
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

/** Whether a doc is linked to a folder on disk (Phase 4). */
export function isLinked(entry: DocEntry): boolean {
  return entry.link != null;
}

/** A copy of `e` with no disk `link`. */
function clearLink(e: DocEntry): DocEntry {
  const copy = { ...e };
  delete copy.link;
  return copy;
}

/** Patch a doc entry in place in the active backend; returns the updated entry. */
async function patchEntry(
  uuid: string,
  patch: (e: DocEntry) => DocEntry,
): Promise<DocEntry | null> {
  if (!opfsAvailable()) {
    const index = legacyReadIndex();
    const i = index.findIndex((e) => e.uuid === uuid);
    if (i < 0) return null;
    index[i] = patch(index[i]);
    legacyWriteIndex(index);
    return index[i];
  }
  return withLibrary(async (lib) => {
    const i = lib.docs.findIndex((e) => e.uuid === uuid);
    if (i < 0) return null;
    lib.docs[i] = patch(lib.docs[i]);
    await saveLibrary(lib);
    return lib.docs[i];
  });
}

/** The kind of a doc's disk link ('folder' when unset, for back-compat). */
export function linkKind(entry: DocEntry): 'file' | 'folder' {
  return entry.link?.kind ?? 'folder';
}

/** Mark a doc as linked to a disk file/folder (name + kind, optional volume/dir). */
export async function setDocLink(
  uuid: string,
  link: { name: string; kind: 'file' | 'folder'; volume?: string; dir?: string },
): Promise<DocEntry | null> {
  return patchEntry(uuid, (e) => ({ ...e, link }));
}

/** Drop a doc's disk link. */
export async function clearDocLink(uuid: string): Promise<DocEntry | null> {
  return patchEntry(uuid, clearLink);
}

// ---- GitHub-sync link (docs/GITHUB-SYNC-SPEC.md) ------------------------

/** Whether a doc is linked to a GitHub `foo.md` file. */
export function isGithubLinked(entry: DocEntry): boolean {
  return entry.githubLink != null;
}

/** The doc's GitHub link, or undefined. */
export function githubLinkOf(entry: DocEntry): GithubLink | undefined {
  return entry.githubLink;
}

/** A copy of `e` with no GitHub link. */
function clearGithub(e: DocEntry): DocEntry {
  const copy = { ...e };
  delete copy.githubLink;
  return copy;
}

/** Set / replace a doc's GitHub link. */
export async function setDocGithubLink(
  uuid: string,
  link: GithubLink,
): Promise<DocEntry | null> {
  return patchEntry(uuid, (e) => ({ ...e, githubLink: link }));
}

/** Update only the sync baseline (foo.md blob sha) after a push/pull (R4). */
export async function updateGithubBaseline(
  uuid: string,
  baselineSha: string,
): Promise<DocEntry | null> {
  return patchEntry(uuid, (e) =>
    e.githubLink ? { ...e, githubLink: { ...e.githubLink, baselineSha } } : e,
  );
}

/** Drop a doc's GitHub link. */
export async function clearDocGithubLink(uuid: string): Promise<DocEntry | null> {
  return patchEntry(uuid, clearGithub);
}

// ---- OneDrive-sync link (docs/VOLUMES-SPEC.md) --------------------------

/** Whether a doc is linked to a OneDrive app-folder file. */
export function isOneDriveLinked(entry: DocEntry): boolean {
  return entry.oneDriveLink != null;
}

/** The doc's OneDrive link, or undefined. */
export function oneDriveLinkOf(entry: DocEntry): OneDriveLink | undefined {
  return entry.oneDriveLink;
}

function clearOneDrive(e: DocEntry): DocEntry {
  const copy = { ...e };
  delete copy.oneDriveLink;
  return copy;
}

/** Set / replace a doc's OneDrive link. */
export async function setDocOneDriveLink(
  uuid: string,
  link: OneDriveLink,
): Promise<DocEntry | null> {
  return patchEntry(uuid, (e) => ({ ...e, oneDriveLink: link }));
}

/** Update only the sync baseline (eTag) after a push/pull. */
export async function updateOneDriveBaseline(
  uuid: string,
  baselineEtag: string,
): Promise<DocEntry | null> {
  return patchEntry(uuid, (e) =>
    e.oneDriveLink ? { ...e, oneDriveLink: { ...e.oneDriveLink, baselineEtag } } : e,
  );
}

/** Drop a doc's OneDrive link. */
export async function clearDocOneDriveLink(uuid: string): Promise<DocEntry | null> {
  return patchEntry(uuid, clearOneDrive);
}

/** The doc's URL origin, or undefined. */
export function urlLinkOf(entry: DocEntry): UrlLink | undefined {
  return entry.urlLink;
}

/** Set / replace a doc's URL origin. */
export async function setDocUrlLink(uuid: string, link: UrlLink): Promise<DocEntry | null> {
  return patchEntry(uuid, (e) => ({ ...e, urlLink: link }));
}

/**
 * Purpose: Bring a document fetched from `url` into the library — the one
 *   entry for that URL (urlDocKey), created on first open.
 * How: an untouched local copy (no draft, committed = last fetched) takes the
 *   fetched text silently; a locally edited one is kept as is — `remoteChanged`
 *   tells the caller the URL moved on meanwhile. The link always records this
 *   session's URL (a loopback port/token changes between sessions).
 */
export async function adoptUrlDoc(
  url: URL,
  text: string,
): Promise<{ entry: DocEntry; remoteChanged: boolean }> {
  const key = urlDocKey(url);
  const fetchedSha = await hashContent(text);
  const known = (await listDocs()).find((e) => e.urlLink?.key === key);
  if (!known) {
    const created = await createDoc(docNameFromUrl(url), text);
    const entry =
      (await setDocUrlLink(created.uuid, { url: url.href, key, fetchedSha })) ?? created;
    return { entry, remoteChanged: false };
  }
  const link = known.urlLink as UrlLink;
  const untouched = !known.dirtySha && known.contentSha === link.fetchedSha;
  if (untouched) {
    if (known.contentSha !== fetchedSha) await saveDocContent(known.uuid, text);
    const entry =
      (await setDocUrlLink(known.uuid, { url: url.href, key, fetchedSha })) ?? known;
    return { entry, remoteChanged: false };
  }
  const entry = (await setDocUrlLink(known.uuid, { ...link, url: url.href })) ?? known;
  return { entry, remoteChanged: fetchedSha !== link.fetchedSha };
}

/** Record that the local copy now matches what `url` served (after a reload). */
export async function markUrlFetched(uuid: string, text: string): Promise<DocEntry | null> {
  const fetchedSha = await hashContent(text);
  return patchEntry(uuid, (e) => (e.urlLink ? { ...e, urlLink: { ...e.urlLink, fetchedSha } } : e));
}

/**
 * How a URL document stands against its URL's current text: unchanged
 * (`same`), changed there only — safe to take (`pull`) — or changed on both
 * sides since the last sync (`conflict`).
 */
export async function urlSyncState(
  entry: DocEntry,
  remoteText: string,
): Promise<'same' | 'pull' | 'conflict'> {
  const link = entry.urlLink;
  if (!link || (await hashContent(remoteText)) === link.fetchedSha) return 'same';
  const localChanged = isModified(entry) || entry.contentSha !== link.fetchedSha;
  return localChanged ? 'conflict' : 'pull';
}

/** Drop a doc's URL origin (it becomes a plain library document). */
export async function clearDocUrlLink(uuid: string): Promise<DocEntry | null> {
  return patchEntry(uuid, (e) => {
    const copy = { ...e };
    delete copy.urlLink;
    return copy;
  });
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
    (e.deletedAt === undefined || typeof e.deletedAt === 'number') &&
    (e.link === undefined ||
      (typeof e.link === 'object' &&
        e.link !== null &&
        typeof (e.link as { name?: unknown }).name === 'string' &&
        ((e.link as { kind?: unknown }).kind === undefined ||
          (e.link as { kind?: unknown }).kind === 'file' ||
          (e.link as { kind?: unknown }).kind === 'folder'))) &&
    (e.githubLink === undefined || isGithubLink(e.githubLink)) &&
    (e.oneDriveLink === undefined || isOneDriveLink(e.oneDriveLink)) &&
    (e.urlLink === undefined || isUrlLink(e.urlLink))
  );
}

/** Runtime guard for a `UrlLink` shape (used by `isDocEntry`). */
function isUrlLink(x: unknown): x is UrlLink {
  if (!x || typeof x !== 'object') return false;
  const u = x as Partial<UrlLink>;
  return typeof u.url === 'string' && typeof u.key === 'string' && typeof u.fetchedSha === 'string';
}

/** Runtime guard for a `GithubLink` shape (used by `isDocEntry`). */
function isGithubLink(x: unknown): x is GithubLink {
  if (!x || typeof x !== 'object') return false;
  const g = x as Partial<GithubLink>;
  return (
    typeof g.owner === 'string' &&
    typeof g.repo === 'string' &&
    typeof g.branch === 'string' &&
    typeof g.path === 'string' &&
    typeof g.baselineSha === 'string'
  );
}

/** Runtime guard for a `OneDriveLink` shape (used by `isDocEntry`). */
function isOneDriveLink(x: unknown): x is OneDriveLink {
  if (!x || typeof x !== 'object') return false;
  const o = x as Partial<OneDriveLink>;
  return typeof o.path === 'string' && typeof o.baselineEtag === 'string';
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
  const previous = url.searchParams.get(URL_PARAM);
  if (previous !== uuid) {
    url.searchParams.set(URL_PARAM, uuid);
    // `?url=` / `?open=` named the document this tab opened with; once the tab
    // switches to another one, drop them — a reload must reopen what's on
    // screen. (Not on the first pinning at boot: they are still to be honoured.)
    if (previous !== null) {
      url.searchParams.delete('url');
      url.searchParams.delete('src');
      url.searchParams.delete('open');
    }
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
  indexChannel?.postMessage('changed');
}

// Several tabs share one index.json. Each tab caches it (libPromise), so a
// write from a stale copy would drop what another tab just added. Every change
// therefore runs under one cross-tab lock and starts from a FRESH read; after a
// write, the other tabs are told to drop their cached copy.
const INDEX_LOCK = 'markpage-index';
const indexChannel =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel('markpage-index') : null;
if (indexChannel) {
  indexChannel.onmessage = () => {
    libPromise = null; // another tab wrote the index — re-read on next access
  };
}

/** Run a read-modify-write of the index exclusively across tabs, on a fresh
 *  copy (`fn` calls saveLibrary itself when it changes something). */
async function withLibrary<T>(fn: (lib: Library) => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    libPromise = null;
    return fn(await loadLibrary());
  };
  const locks = (globalThis.navigator as Navigator & { locks?: LockManager } | undefined)?.locks;
  return locks ? locks.request(INDEX_LOCK, run) : run();
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

// ---- recently opened documents -------------------------------------------
// Every opened document — whatever its source — has an entry in the index, so
// the Récents list is just the last opened uuids with their time. Kept in
// localStorage (a small per-browser preference, not document data).

const KEY_RECENTS = 'markpage:recent-docs';
const MAX_RECENTS = 20;

interface RecentMark {
  uuid: string;
  at: number;
}

function readRecents(): RecentMark[] {
  try {
    const raw = localStorage.getItem(KEY_RECENTS);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter(
          (r): r is RecentMark =>
            typeof r?.uuid === 'string' && typeof r?.at === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

/** Mark `uuid` as just opened (most recent first, deduplicated, capped). */
export function noteRecentDoc(uuid: string): void {
  const list = [
    { uuid, at: Date.now() },
    ...readRecents().filter((r) => r.uuid !== uuid),
  ].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(KEY_RECENTS, JSON.stringify(list));
  } catch {
    /* storage unavailable — no Récents, nothing else breaks */
  }
}

/** Recently opened documents still in the library (trashed ones skipped),
 *  most recent first, with when each was last opened. */
export async function listRecentDocs(): Promise<{ entry: DocEntry; openedAt: number }[]> {
  const byId = new Map((await listDocs()).map((d) => [d.uuid, d]));
  const out: { entry: DocEntry; openedAt: number }[] = [];
  for (const r of readRecents()) {
    const entry = byId.get(r.uuid);
    if (entry) out.push({ entry, openedAt: r.at });
  }
  return out;
}

// Listeners told whenever a tab changes its current document (tab presence,
// edit lock).
const currentDocListeners = new Set<(uuid: string) => void>();

/** Be told each time this tab's current document changes. */
export function onCurrentDocChange(cb: (uuid: string) => void): void {
  currentDocListeners.add(cb);
}

/** Record the active doc (persisted store + URL bar + Récents). */
export async function setCurrentDocId(uuid: string): Promise<void> {
  noteRecentDoc(uuid);
  for (const cb of currentDocListeners) cb(uuid);
  if (opfsAvailable()) {
    await withLibrary(async (lib) => {
      lib.currentDoc = uuid;
      await saveLibrary(lib);
    });
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
  return withLibrary(async (lib) => {
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
  });
}

// Unsaved-edits journal: a tab being closed can't be trusted to finish an
// async draft write, so it first records its pending text synchronously here;
// the next tab that boots (or opens that document) writes it as the draft.
const JOURNAL_PREFIX = 'markpage:unsaved:';

/** Record `content` as `uuid`'s not-yet-written draft (synchronous). */
export function journalDraft(uuid: string, content: string): void {
  try {
    localStorage.setItem(JOURNAL_PREFIX + uuid, content);
  } catch {
    /* quota / storage disabled: the async flush is all we have */
  }
}

/** The draft for `uuid` reached the store: forget its journal entry. */
export function clearDraftJournal(uuid: string): void {
  try {
    localStorage.removeItem(JOURNAL_PREFIX + uuid);
  } catch {
    /* storage disabled */
  }
}

/**
 * Write the journaled drafts (all, or `uuid`'s) to the store. `skip` names the
 * documents still owned by a live tab — that tab is the authority, and its
 * own write will clear the entry.
 */
export async function replayDraftJournal(
  skip: (uuid: string) => Promise<boolean>,
  uuid?: string,
): Promise<void> {
  let keys: string[];
  try {
    keys = uuid
      ? [JOURNAL_PREFIX + uuid]
      : Object.keys(localStorage).filter((k) => k.startsWith(JOURNAL_PREFIX));
  } catch {
    return;
  }
  const known = new Set((await listDocs()).map((e) => e.uuid));
  for (const key of keys) {
    const id = key.slice(JOURNAL_PREFIX.length);
    const content = localStorage.getItem(key);
    if (content === null) continue;
    if (!known.has(id)) {
      localStorage.removeItem(key); // deleted since
      continue;
    }
    if (await skip(id)) continue;
    try {
      await saveDraft(id, content);
      localStorage.removeItem(key);
    } catch (err) {
      console.error('Replaying an unsaved draft failed', err);
    }
  }
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
  return withLibrary(async (lib) => {
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
  });
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
  return withLibrary(async (lib) => {
    const i = lib.docs.findIndex((e) => e.uuid === uuid);
    if (i < 0) throw new Error(`revertDoc: unknown uuid ${uuid}`);
    await deleteEntry(draftPath(uuid));
    lib.docs[i] = clearDirty(lib.docs[i]);
    await saveLibrary(lib);
    return lib.docs[i];
  });
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
  return withLibrary(async (lib) => {
    const i = lib.docs.findIndex((e) => e.uuid === uuid);
    if (i < 0) throw new Error(`saveDocContent: unknown uuid ${uuid}`);
    if (lib.docs[i].contentSha === sha) return lib.docs[i];
    await writeTextFile(bundlePath(uuid), content);
    const updated: DocEntry = { ...lib.docs[i], contentSha: sha, mtime: Date.now() };
    lib.docs[i] = updated;
    await saveLibrary(lib);
    return updated;
  });
}

/** Create a new doc with initial content. */
export async function createDoc(
  desiredName: string,
  initialContent = '',
): Promise<DocEntry> {
  if (!opfsAvailable()) return legacyCreateDoc(desiredName, initialContent);
  const sha = await hashContent(initialContent);
  return withLibrary(async (lib) => {
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
  });
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
  return withLibrary(async (lib) => {
    const i = lib.docs.findIndex((e) => e.uuid === uuid);
    if (i < 0) return null;
    const updated: DocEntry = { ...lib.docs[i], name: trimmed };
    lib.docs[i] = updated;
    await saveLibrary(lib);
    return updated;
  });
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
  return withLibrary(async (lib) => {
    const i = lib.docs.findIndex((e) => e.uuid === uuid);
    if (i < 0) return;
    lib.docs[i] = { ...lib.docs[i], deletedAt: now };
    if (lib.currentDoc === uuid) lib.currentDoc = null;
    await saveLibrary(lib);
  });
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
  return withLibrary(async (lib) => {
    const i = lib.docs.findIndex((e) => e.uuid === uuid);
    if (i < 0) return null;
    lib.docs[i] = clearDeleted(lib.docs[i]);
    await saveLibrary(lib);
    return lib.docs[i];
  });
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
  return withLibrary(async (lib) => {
    lib.docs = lib.docs.filter((e) => e.uuid !== uuid);
    if (lib.currentDoc === uuid) lib.currentDoc = null;
    await saveLibrary(lib);
    await deleteEntry(uuid, true);
  });
}

/** Permanently delete every trashed doc. */
export async function emptyTrash(): Promise<void> {
  for (const e of await listTrash()) {
    await purgeDoc(e.uuid);
  }
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
