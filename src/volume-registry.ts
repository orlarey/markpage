/**************************** volume-registry.ts ******************************
 *
 * Purpose: The set of **mounted** volumes (docs/VOLUMES-SPEC.md §3) — what the
 *   unified browser lists. The Bibliothèque is always mounted; Disk folders and
 *   GitHub repos are mounted/unmounted by the user and persisted across
 *   sessions. Mounting/unmounting never touches the backend's content (V2).
 * How: Disk directory handles live in IndexedDB (`markpage-volumes`/`disk`,
 *   structured clone); repo mounts are a JSON list in localStorage. `listVolumes`
 *   builds the live `Volume[]` over the existing adapters.
 *
 *******************************************************************************/

import { type RepoRef, loadToken } from './github';
import { oneDriveConnected, signOutOneDrive } from './onedrive';
import {
  DiskVolume,
  LibraryVolume,
  OneDriveVolume,
  RepoVolume,
  type Volume,
} from './volumes';

// ---- disk mounts (directory handles in IndexedDB) ----------------------

const DB_NAME = 'markpage-volumes';
const DISK_STORE = 'disk';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DISK_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('markpage-volumes open failed'));
  });
}

interface DiskMount {
  id: string;
  handle: FileSystemDirectoryHandle;
}

interface ComparableHandle {
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
}

/**
 * Persist a mounted directory handle; returns its mount id. **Idempotent on the
 * folder**: if the same directory is already mounted (`isSameEntry`), reuse its
 * id instead of creating a duplicate volume.
 */
export async function mountDisk(handle: FileSystemDirectoryHandle): Promise<string> {
  const cmp = handle as unknown as ComparableHandle;
  for (const m of await loadDiskMounts()) {
    try {
      if (await cmp.isSameEntry(m.handle)) return m.id; // already mounted
    } catch {
      /* isSameEntry unsupported — fall through to a fresh mount */
    }
  }
  const id = crypto.randomUUID();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DISK_STORE, 'readwrite');
    tx.objectStore(DISK_STORE).put(handle, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('mountDisk failed'));
  });
  db.close();
  return id;
}

/** Forget a mounted directory (the folder on disk is untouched). */
export async function unmountDisk(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DISK_STORE, 'readwrite');
    tx.objectStore(DISK_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('unmountDisk failed'));
  });
  db.close();
}

async function loadDiskMounts(): Promise<DiskMount[]> {
  const db = await openDb();
  try {
    return await new Promise<DiskMount[]>((resolve, reject) => {
      const tx = db.transaction(DISK_STORE, 'readonly');
      const store = tx.objectStore(DISK_STORE);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      tx.oncomplete = () => {
        const keys = keysReq.result as string[];
        const vals = valsReq.result as FileSystemDirectoryHandle[];
        resolve(keys.map((id, i) => ({ id, handle: vals[i] })));
      };
      tx.onerror = () => reject(tx.error ?? new Error('loadDiskMounts failed'));
    });
  } finally {
    db.close();
  }
}

// ---- repo mounts (JSON list in localStorage) ---------------------------

const REPO_KEY = 'markpage:volumes:repos';

/** A persisted repo mount = its coordinates (the PAT is global, not stored here). */
export type RepoMount = RepoRef;

const repoKey = (r: RepoRef): string => `${r.owner}/${r.repo}@${r.branch}`;

export function loadRepoMounts(): RepoMount[] {
  try {
    const raw = localStorage.getItem(REPO_KEY);
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown);
    return Array.isArray(parsed) ? (parsed as RepoMount[]) : [];
  } catch {
    return [];
  }
}

function saveRepoMounts(list: RepoMount[]): void {
  localStorage.setItem(REPO_KEY, JSON.stringify(list));
}

/** Mount a repo (idempotent on its `owner/repo@branch` key). */
export function mountRepo(ref: RepoRef): void {
  const list = loadRepoMounts();
  if (list.some((r) => repoKey(r) === repoKey(ref))) return;
  list.push({ owner: ref.owner, repo: ref.repo, branch: ref.branch });
  saveRepoMounts(list);
}

/** Unmount a repo by its `owner/repo@branch` key (the repo is untouched). */
export function unmountRepo(key: string): void {
  saveRepoMounts(loadRepoMounts().filter((r) => repoKey(r) !== key));
}

/** Unmount any volume by its `Volume.id` (`disk:<uuid>` / `repo:<key>` / `onedrive`). */
export async function unmountVolume(volumeId: string): Promise<void> {
  if (volumeId.startsWith('disk:')) await unmountDisk(volumeId.slice('disk:'.length));
  else if (volumeId.startsWith('repo:')) unmountRepo(volumeId.slice('repo:'.length));
  else if (volumeId === 'onedrive') signOutOneDrive();
}

// ---- the live volume list ----------------------------------------------

/**
 * Build the current set of mounted volumes: Bibliothèque (always) + every
 * mounted Disk folder + every mounted Repo (only when a PAT is present, since a
 * repo volume can't function without one).
 */
export async function listVolumes(): Promise<Volume[]> {
  const volumes: Volume[] = [new LibraryVolume()];
  for (const { id, handle } of await loadDiskMounts()) {
    volumes.push(new DiskVolume(handle, `disk:${id}`));
  }
  const token = await loadToken();
  if (token) {
    for (const ref of loadRepoMounts()) volumes.push(new RepoVolume(token, ref));
  }
  if (oneDriveConnected()) volumes.push(new OneDriveVolume());
  return volumes;
}
