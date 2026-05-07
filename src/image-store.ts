// Tiny IndexedDB wrapper for image blobs. Keys are opaque strings (UUIDs in
// our case). The store survives page reloads, so the editor doc can carry
// short `img://uuid` references while the actual binary stays out of the
// way until we need to render or export.

const DB_NAME = 'md2pdf';
const STORE_NAME = 'images';
const DB_VERSION = 1;

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
