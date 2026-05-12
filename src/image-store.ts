// Tiny IndexedDB wrapper for image blobs. Keys are the SHA-256 of the
// blob (64-char lowercase hex), so two documents that embed the same
// image automatically share a single store entry. Older documents may
// still reference UUID keys until migrateToContentAddressed has run on
// them — both regimes coexist transparently because the lookup is by
// opaque string.

const DB_NAME = 'markpage';
const STORE_NAME = 'images';
const DB_VERSION = 1;

const SHA_HEX_RE = /^[a-f0-9]{64}$/;

export function isSha(id: string): boolean {
  return SHA_HEX_RE.test(id);
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

let dbPromise: Promise<IDBDatabase> | null = null;

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

// Computes the SHA of a blob and stores it under that key, no-op if a
// blob with the same SHA is already in the store. Returns the SHA so
// the caller can build the `img://<sha>` reference.
export async function putBlobBySha(blob: Blob): Promise<string> {
  const sha = await sha256Hex(blob);
  const existing = await getImage(sha);
  if (!existing) await putImage(sha, blob);
  return sha;
}

// One-shot migration from UUID-keyed entries to SHA-keyed entries.
// Walks every key, hashes its blob, rewrites the entry under the SHA
// key, and returns a map { uuid → sha } so the caller can rewrite the
// `img://uuid` references inside its markdown documents. Idempotent —
// if every key is already a SHA, the result is an empty map.
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
