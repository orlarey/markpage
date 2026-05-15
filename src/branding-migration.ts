/********************************* branding-migration.ts ***********************
 *
 * Purpose: One-shot rebranding from `md2pdf` to `markpage` for both
 *   localStorage keys (prefix swap) and IndexedDB database name.
 * How: Two idempotent passes — sync prefix walk for localStorage, async
 *   copy-then-delete for IndexedDB; both safe to re-run after interrupt.
 *
 *******************************************************************************/

// ---- localStorage -----------------------------------------------------

const OLD_PREFIX = 'md2pdf:';
const NEW_PREFIX = 'markpage:';

/**
 * Purpose: Rename every `md2pdf:` localStorage key to `markpage:`.
 * How: Collect old keys, copy each value into the new slot if absent,
 *   then drop the old key. Idempotent and interrupt-safe.
 */
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

/**
 * Purpose: Move every `images` entry from the legacy `md2pdf` IDB
 *   database into `markpage`, then delete the legacy DB.
 * How: Open old DB, read all entries, copy into new DB, delete old DB.
 *   Idempotent because keys are SHAs; safe against interruption.
 */
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

/**
 * Purpose: Open (or create) the named IDB DB with our `images` store.
 * How: Standard `indexedDB.open` with an upgrade handler that creates
 *   the store on first open.
 */
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

/**
 * Purpose: Snapshot every (key, value) pair from the `images` store.
 * How: Issue paired `getAllKeys` / `getAll` in one readonly transaction
 *   and zip the result arrays on `oncomplete`.
 */
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

/**
 * Purpose: Bulk-insert entries into the target `images` store.
 * How: Single readwrite transaction with one `put` per entry; idempotent
 *   because `put` overwrites under the same key.
 */
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

/**
 * Purpose: Delete an IDB database by name.
 * How: `indexedDB.deleteDatabase`; `onblocked` is logged but resolved so
 *   bootstrap never deadlocks on a stale connection.
 */
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
