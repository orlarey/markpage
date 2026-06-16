/********************************* disk-link.ts ********************************
 *
 * Purpose: Phase 4 — link a document to a real folder on disk via the File
 *   System Access API, so it lives as plain files (content.md + assets/) that
 *   the user sees in their file manager and versions with git.
 * How: thin wrappers over showDirectoryPicker / showOpenFilePicker; directory
 *   handles persisted in a small IndexedDB (`markpage-fs`, structured clone);
 *   a bundle is written as `content.md` + `assets/<sha>.<ext>` (blobs pulled
 *   from the image store) and read back the same way. Chromium-only — callers
 *   gate UI on `fsAccessAvailable()`.
 *
 *******************************************************************************/

import { collectImageRefs, extForMime } from './image';
import { getImage, putBlobBySha } from './image-store';

// ---- File System Access typing (not all in the current TS DOM lib) -----

interface FsPermissionHandle {
  queryPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface FsPickerWindow {
  showDirectoryPicker(opts?: {
    mode?: 'read' | 'readwrite';
  }): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker(opts?: {
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
  }): Promise<FileSystemFileHandle[]>;
}
interface IterableDirHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

/** A persisted link target: a folder bundle or a single `.md` file. */
export type LinkedHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

const CONTENT_FILE = 'content.md';
const ASSETS_DIR = 'assets';

/** Whether the File System Access pickers are available (Chromium). */
export function fsAccessAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    'showOpenFilePicker' in window
  );
}

/** Prompt for a read-write directory; null if the user cancels. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (window as unknown as FsPickerWindow).showDirectoryPicker({
      mode: 'readwrite',
    });
  } catch {
    return null; // user dismissed the picker
  }
}

/** Prompt for a Markdown file handle; null if the user cancels. */
export async function pickMarkdownFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await (window as unknown as FsPickerWindow).showOpenFilePicker(
      {
        // Group each extension under a MIME type the OS actually owns:
        // listing `.txt` under `text/markdown` makes macOS resolve a UTType
        // that greys out matching files in the native dialog. Keep the
        // "All files" option so nothing is ever un-selectable.
        types: [
          {
            description: 'Markdown / text',
            accept: {
              'text/markdown': ['.md', '.markdown'],
              'text/plain': ['.txt'],
            },
          },
        ],
        excludeAcceptAllOption: false,
      },
    );
    return handle ?? null;
  } catch {
    return null;
  }
}

/** Ensure read-write permission on a persisted handle (needs a user gesture). */
export async function ensureRwPermission(
  handle: LinkedHandle,
): Promise<boolean> {
  const h = handle as unknown as FsPermissionHandle;
  const opts = { mode: 'readwrite' } as const;
  if ((await h.queryPermission(opts)) === 'granted') return true;
  return (await h.requestPermission(opts)) === 'granted';
}

/**
 * Purpose: Whether RW access is already granted — a *query only*, never a
 *   prompt. Used by the background divergence poller, which has no user
 *   gesture and must stay silent when permission has lapsed (e.g. after a
 *   tab reload, until the next Save/Reload re-grants it).
 */
export async function queryRwGranted(
  handle: LinkedHandle,
): Promise<boolean> {
  const h = handle as unknown as FsPermissionHandle;
  return (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
}

// ---- pure bundle layout ------------------------------------------------

export interface BundleAsset {
  sha: string;
  path: string; // e.g. "assets/<sha>.png"
}

/**
 * Purpose: The asset files a bundle needs on disk, derived purely from the
 *   markdown + a sha→mime lookup. Exported for unit testing.
 */
export function bundleAssetFiles(
  content: string,
  mimeOf: (sha: string) => string | undefined,
): BundleAsset[] {
  const out: BundleAsset[] = [];
  for (const sha of collectImageRefs(content)) {
    const mime = mimeOf(sha);
    if (mime === undefined) continue;
    out.push({ sha, path: `${ASSETS_DIR}/${sha}.${extForMime(mime)}` });
  }
  return out;
}

// ---- bundle I/O on a directory handle ----------------------------------

async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: Blob | string,
): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/**
 * Purpose: Write a document's bundle into `dir` — `content.md` plus an
 *   `assets/` folder with one `<sha>.<ext>` file per referenced image.
 */
export async function writeBundleToDir(
  dir: FileSystemDirectoryHandle,
  content: string,
): Promise<void> {
  await writeFile(dir, CONTENT_FILE, content);
  const shas = [...collectImageRefs(content)];
  if (shas.length === 0) return;
  const assets = await dir.getDirectoryHandle(ASSETS_DIR, { create: true });
  for (const sha of shas) {
    const blob = await getImage(sha);
    if (!blob) continue;
    await writeFile(assets, `${sha}.${extForMime(blob.type)}`, blob);
  }
}

/**
 * Purpose: Read a bundle from `dir` — load every `assets/*` file into the
 *   image store (content-addressed) and return `content.md`'s text.
 */
export async function readBundleFromDir(
  dir: FileSystemDirectoryHandle,
): Promise<string> {
  const content = await (
    await (await dir.getFileHandle(CONTENT_FILE)).getFile()
  ).text();
  try {
    const assets = (await dir.getDirectoryHandle(
      ASSETS_DIR,
    )) as unknown as IterableDirHandle;
    for await (const h of assets.values()) {
      if (h.kind === 'file') {
        await putBlobBySha(await (h as FileSystemFileHandle).getFile());
      }
    }
  } catch {
    /* no assets dir — fine */
  }
  return content;
}

/**
 * Purpose: The `content.md` file's last-modified timestamp (ms), or null if it
 *   can't be read (missing / permission lapsed). Used as the sync baseline for
 *   divergence detection — an external editor writing the file advances it.
 */
export async function diskContentMtime(
  dir: FileSystemDirectoryHandle,
): Promise<number | null> {
  try {
    return (await (await dir.getFileHandle(CONTENT_FILE)).getFile()).lastModified;
  } catch {
    return null;
  }
}

// ---- single-file link I/O (no bundle / assets) -------------------------

/** Overwrite a single `.md` file handle with `content`. */
export async function writeFileHandle(
  fh: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

/** Read a single `.md` file handle's text. */
export async function readFileHandle(fh: FileSystemFileHandle): Promise<string> {
  return (await fh.getFile()).text();
}

/** A single file handle's last-modified timestamp (ms), or null if unreadable. */
export async function fileHandleMtime(
  fh: FileSystemFileHandle,
): Promise<number | null> {
  try {
    return (await fh.getFile()).lastModified;
  } catch {
    return null;
  }
}

/** Whether `dir` already holds a bundle (a content.md). */
export async function dirHasBundle(
  dir: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    await dir.getFileHandle(CONTENT_FILE);
    return true;
  } catch {
    return false;
  }
}

// ---- handle persistence (IndexedDB markpage-fs / handles) --------------

const DB_NAME = 'markpage-fs';
const STORE = 'handles';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('markpage-fs open failed'));
  });
  return dbPromise;
}

/** Persist a directory/file handle for a doc (structured clone). */
export async function saveHandle(
  uuid: string,
  handle: LinkedHandle,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, uuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('saveHandle failed'));
  });
}

/** Load a doc's persisted directory/file handle (or undefined). */
export async function loadHandle(
  uuid: string,
): Promise<LinkedHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(uuid);
    req.onsuccess = () => resolve(req.result as LinkedHandle | undefined);
    req.onerror = () => reject(req.error ?? new Error('loadHandle failed'));
  });
}

/** Forget a doc's persisted handle (and its sync baseline). */
export async function removeHandle(uuid: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(uuid);
    tx.objectStore(STORE).delete(mtimeKey(uuid));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('removeHandle failed'));
  });
}

// Sync baseline: the content.md mtime as of our last push/pull, kept next to
// the handle in the same keyspace. Divergence = current disk mtime > baseline.
const mtimeKey = (uuid: string): string => `mtime:${uuid}`;

/** Record the content.md mtime we are now in sync with. */
export async function saveSyncedMtime(uuid: string, mtime: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(mtime, mtimeKey(uuid));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('saveSyncedMtime failed'));
  });
}

/** The last-synced content.md mtime for a doc (or undefined). */
export async function loadSyncedMtime(uuid: string): Promise<number | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE, 'readonly')
      .objectStore(STORE)
      .get(mtimeKey(uuid));
    req.onsuccess = () => resolve(req.result as number | undefined);
    req.onerror = () => reject(req.error ?? new Error('loadSyncedMtime failed'));
  });
}
