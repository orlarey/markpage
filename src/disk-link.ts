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
  }): Promise<FileSystemFileHandle[]>;
}
interface IterableDirHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

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

/** Prompt for a Markdown file; null if the user cancels. */
export async function pickMarkdownFile(): Promise<File | null> {
  try {
    const [handle] = await (window as unknown as FsPickerWindow).showOpenFilePicker(
      {
        types: [
          {
            description: 'Markdown',
            accept: { 'text/markdown': ['.md', '.markdown', '.txt'] },
          },
        ],
      },
    );
    return handle ? await handle.getFile() : null;
  } catch {
    return null;
  }
}

/** Ensure read-write permission on a persisted handle (needs a user gesture). */
export async function ensureRwPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const h = handle as unknown as FsPermissionHandle;
  const opts = { mode: 'readwrite' } as const;
  if ((await h.queryPermission(opts)) === 'granted') return true;
  return (await h.requestPermission(opts)) === 'granted';
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

/** Persist a directory handle for a doc (structured clone). */
export async function saveHandle(
  uuid: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, uuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('saveHandle failed'));
  });
}

/** Load a doc's persisted directory handle (or undefined). */
export async function loadHandle(
  uuid: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(uuid);
    req.onsuccess = () =>
      resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error ?? new Error('loadHandle failed'));
  });
}

/** Forget a doc's persisted handle. */
export async function removeHandle(uuid: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(uuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('removeHandle failed'));
  });
}
