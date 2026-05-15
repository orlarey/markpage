/********************************* image-store.ts ******************************
 *
 * Purpose: Thin IndexedDB wrapper for image blobs keyed by SHA-256 hex.
 *   Two docs sharing an image automatically share a single store entry.
 * How: Single shared DB connection (`openDb`); CRUD helpers each wrap one
 *   IDB transaction in a Promise. UUID-keyed legacy entries coexist via
 *   `migrateToContentAddressed`.
 *
 *******************************************************************************/

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
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

/**
 * Purpose: Store `blob` under `id` in the images store.
 * How: One readwrite transaction with a single `put`; resolves on `oncomplete`.
 */
export async function putImage(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB put failed'));
  });
}

/**
 * Purpose: Fetch the blob stored under `id`, or `undefined` if missing.
 * How: Readonly `get` request wrapped in a Promise.
 */
export async function getImage(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB get failed'));
  });
}

/**
 * Purpose: Remove the entry stored under `id`.
 * How: Readwrite transaction with a single `delete`; resolves on `oncomplete`.
 */
export async function deleteImage(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
}

/**
 * Purpose: List every key currently in the images store.
 * How: Readonly `getAllKeys` request wrapped in a Promise.
 */
export async function getAllIds(): Promise<string[]> {
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
 * Purpose: Migrate legacy UUID-keyed entries to SHA-keyed ones.
 * How: Walk every id; for non-SHA keys, hash the blob, rewrite under the
 *   SHA, delete the old key, and accumulate a `{ uuid → sha }` map.
 */
export async function migrateToContentAddressed(): Promise<Map<string, string>> {
  const ids = await getAllIds();
  const mapping = new Map<string, string>();
  for (const id of ids) {
    if (isSha(id)) continue;
    const blob = await getImage(id);
    if (!blob) {
      // Stale key with no value — drop it.
      await deleteImage(id);
      continue;
    }
    const sha = await sha256Hex(blob);
    mapping.set(id, sha);
    const already = await getImage(sha);
    if (!already) await putImage(sha, blob);
    await deleteImage(id);
  }
  return mapping;
}
