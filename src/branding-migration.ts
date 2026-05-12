// One-shot rebranding migration: the storage prefix changed from
// `md2pdf:` to `markpage:` (localStorage) and the IndexedDB database
// renamed from `md2pdf` to `markpage`. This module runs at bootstrap,
// before any other storage module is touched, and is idempotent so
// re-running is a no-op.

// ---- localStorage -----------------------------------------------------

const OLD_PREFIX = 'md2pdf:';
const NEW_PREFIX = 'markpage:';

// Renames every `md2pdf:` key to `markpage:`. Sync, cheap.
// Idempotent: keys already migrated stay put; remaining ones are
// finished off. Safe against interruption — re-run picks up the
// leftovers because the new key is only deleted from the old slot
// after it lands in the new one.
export function migrateLocalStorageBranding(): void {
  const oldKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(OLD_PREFIX)) oldKeys.push(k);
  }
  for (const oldKey of oldKeys) {
    const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
    const value = localStorage.getItem(oldKey);
    if (value === null) continue;
    if (localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value);
    }
    localStorage.removeItem(oldKey);
  }
}

// ---- IndexedDB --------------------------------------------------------

const OLD_DB_NAME = 'md2pdf';
const NEW_DB_NAME = 'markpage';
const STORE_NAME = 'images';
const DB_VERSION = 1;

// Copies every entry of the `images` store from the legacy `md2pdf`
// IDB database into the `markpage` one, then drops the legacy DB.
// Idempotent. Safe against interruption: we only delete the old DB
// after the new one has all entries — re-running just re-copies any
// entries that were already moved (idempotent since the key is the
// SHA of the blob).
export async function migrateIDBBranding(): Promise<void> {
  // We don't gate on `indexedDB.databases()` (Firefox doesn't
  // expose it). Instead we open the legacy DB and check whether it
  // has any data; if empty, we just delete it.
  const oldDb = await openImagesDb(OLD_DB_NAME);
  const entries = await readAllImageEntries(oldDb);
  oldDb.close();

  if (entries.length === 0) {
    await deleteIdbDatabase(OLD_DB_NAME);
    return;
  }

  const newDb = await openImagesDb(NEW_DB_NAME);
  try {
    await writeImageEntries(newDb, entries);
  } finally {
    newDb.close();
  }
  await deleteIdbDatabase(OLD_DB_NAME);
}

function openImagesDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error(`IndexedDB open failed for ${name}`));
  });
}

interface ImageEntry {
  key: IDBValidKey;
  value: unknown;
}

function readAllImageEntries(db: IDBDatabase): Promise<ImageEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const keysReq = store.getAllKeys();
    const valuesReq = store.getAll();
    tx.oncomplete = () => {
      const keys = keysReq.result;
      const values = valuesReq.result as unknown[];
      const out: ImageEntry[] = [];
      for (let i = 0; i < keys.length; i += 1) {
        out.push({ key: keys[i], value: values[i] });
      }
      resolve(out);
    };
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB read failed'));
  });
}

function writeImageEntries(
  db: IDBDatabase,
  entries: ImageEntry[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const e of entries) {
      // `put` overwrites, so re-running on already-migrated data
      // just re-writes byte-identical entries.
      store.put(e.value, e.key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB write failed'));
  });
}

function deleteIdbDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error(`IndexedDB delete failed for ${name}`));
    // Some browsers block deletion if a connection is still open.
    // We close everything before calling delete, so this should not
    // fire — log if it does.
    req.onblocked = () => {
      console.warn(`IndexedDB delete blocked for ${name}`);
      resolve();
    };
  });
}
