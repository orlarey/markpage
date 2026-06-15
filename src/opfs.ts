/********************************* opfs.ts *************************************
 *
 * Purpose: Thin Origin Private File System (OPFS) helpers — the single
 *   hierarchical store that backs the file-management refactor (SPEC
 *   `FILE-MANAGEMENT-SPEC.md` §4). Everything lives under one `library/`
 *   root; the deduplicated, SHA-keyed image pool lives in `library/.store/`.
 * How: `navigator.storage.getDirectory()` + the File System Access handle
 *   API. All ops are async. `opfsAvailable()` lets callers fall back to the
 *   legacy IndexedDB store on browsers without OPFS.
 *
 *******************************************************************************/

const LIBRARY_DIR = 'library';
const STORE_DIR = '.store';

/**
 * Purpose: Whether OPFS is usable in this environment.
 * How: Feature-detect `navigator.storage.getDirectory`. False in happy-dom
 *   (unit tests) and on legacy browsers, where callers use the IDB fallback.
 */
export function opfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

/**
 * Purpose: The memoised `library/` root directory handle.
 * How: Lazily resolve OPFS root → `library/` (created on first use).
 */
export async function libraryRoot(): Promise<FileSystemDirectoryHandle> {
  rootPromise ??= (async () => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(LIBRARY_DIR, { create: true });
  })();
  return rootPromise;
}

/** The `library/.store/` blob pool directory (created on first use). */
async function storeDir(): Promise<FileSystemDirectoryHandle> {
  const lib = await libraryRoot();
  return lib.getDirectoryHandle(STORE_DIR, { create: true });
}

/**
 * Purpose: Write a blob into the SHA-keyed pool (idempotent overwrite).
 * How: Create/open `.store/<sha>` and stream the blob through a writable.
 */
export async function storeWriteBlob(sha: string, blob: Blob): Promise<void> {
  const dir = await storeDir();
  const fh = await dir.getFileHandle(sha, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

/**
 * Purpose: Read a pooled blob, or `undefined` if absent.
 * How: Open `.store/<sha>` and return its File; missing handle → undefined.
 */
export async function storeReadBlob(sha: string): Promise<Blob | undefined> {
  try {
    const dir = await storeDir();
    const fh = await dir.getFileHandle(sha);
    return await fh.getFile();
  } catch {
    return undefined;
  }
}

/** Whether a blob exists in the pool (cheaper than reading its bytes). */
export async function storeHasBlob(sha: string): Promise<boolean> {
  try {
    const dir = await storeDir();
    await dir.getFileHandle(sha);
    return true;
  } catch {
    return false;
  }
}

/** Delete a pooled blob; a missing entry is not an error. */
export async function storeDeleteBlob(sha: string): Promise<void> {
  try {
    const dir = await storeDir();
    await dir.removeEntry(sha);
  } catch {
    /* already gone */
  }
}

// The async-iterator members of FileSystemDirectoryHandle (`values`/`keys`/
// `entries`) aren't in this TS version's DOM lib yet — declare the slice we use.
interface IterableDirHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

/** List every SHA present in the pool. */
export async function storeListShas(): Promise<string[]> {
  const dir = (await storeDir()) as unknown as IterableDirHandle;
  const out: string[] = [];
  for await (const handle of dir.values()) {
    if (handle.kind === 'file') out.push(handle.name);
  }
  return out;
}

/**
 * Purpose: Ask the browser to make storage persistent (anti-eviction).
 * How: `navigator.storage.persist()`; best-effort, never throws.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }
}
