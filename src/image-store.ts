/********************************* image-store.ts ******************************
 *
 * Purpose: Image blob store keyed by SHA-256 hex. Two docs sharing an image
 *   automatically share a single entry (content-addressed dedup).
 * How: The canonical store is OPFS (`library/.store/<sha>`, see opfs.ts). The
 *   legacy IndexedDB store is kept as a read fallback and as the migration
 *   source — `migrateImagesToOpfs()` copies it into OPFS at boot (and maps any
 *   legacy UUID keys to their SHA). On browsers without OPFS we transparently
 *   fall back to IndexedDB, so nothing breaks.
 *
 *******************************************************************************/

import {
  opfsAvailable,
  storeDeleteBlob,
  storeHasBlob,
  storeListShas,
  storeReadBlob,
  storeWriteBlob,
} from './opfs';

const DB_NAME = 'markpage';
const STORE_NAME = 'images';
const DB_VERSION = 1;

const SHA_HEX_RE = /^[a-f0-9]{64}$/;

/**
 * Purpose: Tell whether an id is in our 64-char lowercase hex SHA form.
 * How: Single regex test against `SHA_HEX_RE`.
 */
export function isSha(id: string): boolean {
  return SHA_HEX_RE.test(id);
}

/**
 * Purpose: SHA-256 hex digest of a blob's bytes.
 * How: `crypto.subtle.digest` on the ArrayBuffer, then hex-encode each byte.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

// ---- legacy IndexedDB store (read fallback + migration source) ---------

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Purpose: Lazily open (and cache) the shared IDB connection.
 * How: One-shot `indexedDB.open` memoised in `dbPromise`; `onupgradeneeded`
 *   creates the `images` store on first run.
 */
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

async function idbPut(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
  });
}

async function idbGet(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
}

async function idbGetAllIds(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB getAllKeys failed'));
  });
}

// ---- public store API (OPFS canonical, IDB fallback) -------------------

/**
 * Purpose: Store `blob` under `id`. `id` is always a SHA in current code.
 * How: OPFS when available, else legacy IndexedDB.
 */
export async function putImage(id: string, blob: Blob): Promise<void> {
  if (opfsAvailable()) {
    await storeWriteBlob(id, blob);
  } else {
    await idbPut(id, blob);
  }
}

/**
 * Purpose: Fetch the blob stored under `id`, or `undefined` if missing.
 * How: OPFS first; on a miss (e.g. not migrated yet) fall back to IndexedDB.
 */
export async function getImage(id: string): Promise<Blob | undefined> {
  if (opfsAvailable()) {
    return (await storeReadBlob(id)) ?? (await idbGet(id));
  }
  return idbGet(id);
}

/**
 * Purpose: Remove the entry stored under `id` from every backing store.
 * How: Delete from OPFS and IndexedDB (idempotent on both).
 */
export async function deleteImage(id: string): Promise<void> {
  if (opfsAvailable()) await storeDeleteBlob(id);
  await idbDelete(id);
}

/**
 * Purpose: List every blob id known to the store.
 * How: Union of OPFS pool SHAs and legacy IndexedDB keys, so GC considers
 *   both and reaps unreferenced entries wherever they live.
 */
export async function getAllIds(): Promise<string[]> {
  const idb = await idbGetAllIds().catch(() => [] as string[]);
  if (!opfsAvailable()) return idb;
  const opfs = await storeListShas().catch(() => [] as string[]);
  return [...new Set([...opfs, ...idb])];
}

/**
 * Purpose: Insert a blob keyed by its own SHA, returning that SHA.
 * How: Compute SHA, no-op when the key already exists, else `putImage`.
 */
export async function putBlobBySha(blob: Blob): Promise<string> {
  const sha = await sha256Hex(blob);
  const existing = await getImage(sha);
  if (!existing) await putImage(sha, blob);
  return sha;
}

/**
 * Purpose: Migrate the legacy IndexedDB blobs into the OPFS pool, and map any
 *   legacy UUID-keyed entries to their SHA (for rewriting doc refs).
 * How: Walk every IDB key; copy its blob into OPFS under its SHA (UUID keys
 *   are hashed to their SHA, and recorded in the returned `{uuid → sha}` map).
 *   IndexedDB is left intact — it stays as a read fallback / safety net until
 *   the cleanup window (SPEC §10). Idempotent: skips blobs already in OPFS.
 *   No-op (empty map) when OPFS is unavailable.
 */
export async function migrateImagesToOpfs(): Promise<Map<string, string>> {
  if (!opfsAvailable()) return new Map();
  const ids = await idbGetAllIds().catch(() => [] as string[]);
  const mapping = new Map<string, string>();
  for (const id of ids) {
    const blob = await idbGet(id);
    if (!blob) continue;
    const sha = isSha(id) ? id : await sha256Hex(blob);
    if (!isSha(id)) mapping.set(id, sha);
    if (!(await storeHasBlob(sha))) await storeWriteBlob(sha, blob);
    // Keep the IDB entry as a fallback — do not delete here.
  }
  return mapping;
}
