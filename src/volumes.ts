/********************************* volumes.ts **********************************
 *
 * Purpose: The unified file-system model (docs/VOLUMES-SPEC.md). A `Volume` is
 *   a mounted, browsable tree backed by one of three engines that already
 *   exist: the Library (OPFS, `docs.ts`), the Disk (File System Access), and a
 *   GitHub Repo (`github.ts`). This module is the **façade** (voie A): it
 *   re-presents those engines behind one read interface (`list` / `readText` /
 *   `state`) so a single browser can drive *Ouvrir* across all of them.
 * How: one adapter class per kind; pure tree-listing helpers are exported for
 *   unit testing. Write / save still flows through the existing per-document
 *   link logic — this façade is read-side first.
 *
 *******************************************************************************/

import { type DocEntry, listDocs, listTrash, loadDocContent } from './docs';
import {
  type RepoRef,
  type TreeEntry,
  getBranchHead,
  getCommitTree,
  getTreeRecursive,
  readTextFile,
} from './github';

export type VolumeKind = 'library' | 'disk' | 'repo';

/** Health of a volume — drives the browser's availability hints. */
export type VolumeState =
  | 'ready'
  | 'needs-permission' // Disk: handle present but RW not granted
  | 'offline' // Repo: network unreachable
  | 'error';

/** One entry of a directory listing within a volume. */
export interface VolumeEntry {
  /** Display name (file or folder name, e.g. `devis.md` or `images`). */
  name: string;
  /** Path within the volume, used to read / open (root-relative, no leading /). */
  path: string;
  type: 'file' | 'dir';
  /** True for a markdown file → opens in place; else import (V4). */
  isMarkdown: boolean;
}

/** A mounted, browsable tree. Read-side façade over an existing engine. */
export interface Volume {
  readonly id: string;
  readonly kind: VolumeKind;
  readonly label: string;
  state(): Promise<VolumeState>;
  /** List a directory (`''` = root). Folders first is the caller's concern. */
  list(path: string): Promise<VolumeEntry[]>;
  /** Read a markdown file's text. */
  readText(path: string): Promise<string>;
}

const MD_RE = /\.(md|markdown)$/i;
const isMd = (name: string): boolean => MD_RE.test(name);

// ---- pure helpers (unit-tested) ----------------------------------------

/** Immediate children of `dir` within a flat recursive git tree (SPEC §2). */
export function childrenFromTree(tree: TreeEntry[], dir: string): VolumeEntry[] {
  const prefix = dir === '' ? '' : `${dir}/`;
  const out: VolumeEntry[] = [];
  for (const e of tree) {
    if (e.type !== 'blob' && e.type !== 'tree') continue;
    if (!e.path.startsWith(prefix)) continue;
    const rest = e.path.slice(prefix.length);
    if (rest === '' || rest.includes('/')) continue; // not an immediate child
    out.push({
      name: rest,
      path: e.path,
      type: e.type === 'tree' ? 'dir' : 'file',
      isMarkdown: e.type === 'blob' && isMd(rest),
    });
  }
  return out;
}

/** Order entries: folders first, then files, each alphabetical (fr locale). */
export function sortEntries(entries: VolumeEntry[]): VolumeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr');
  });
}

// ---- Library volume (OPFS / docs.ts) -----------------------------------

export const TRASH_DIR = 'Corbeille';

/**
 * The browser's private file system (always mounted, offline, flat in v1).
 * Shows only documents as `<name>.md`; their images are an internal substrate
 * (SPEC §2). A single virtual `Corbeille` folder holds soft-deleted docs.
 * Entry `path` is the doc UUID (opaque, stable) — `name` is the display title.
 */
export class LibraryVolume implements Volume {
  readonly id = 'library';
  readonly kind = 'library' as const;
  readonly label = 'Bibliothèque';

  state(): Promise<VolumeState> {
    return Promise.resolve('ready');
  }

  private entryOf(doc: DocEntry): VolumeEntry {
    return { name: `${doc.name}.md`, path: doc.uuid, type: 'file', isMarkdown: true };
  }

  async list(path: string): Promise<VolumeEntry[]> {
    if (path === TRASH_DIR) {
      return sortEntries((await listTrash()).map((d) => this.entryOf(d)));
    }
    const docs = (await listDocs()).map((d) => this.entryOf(d));
    const trash = await listTrash();
    const out = sortEntries(docs);
    if (trash.length > 0) {
      out.unshift({ name: TRASH_DIR, path: TRASH_DIR, type: 'dir', isMarkdown: false });
    }
    return out;
  }

  async readText(uuid: string): Promise<string> {
    const all = [...(await listDocs()), ...(await listTrash())];
    const entry = all.find((d) => d.uuid === uuid);
    if (!entry) throw new Error(`Document introuvable : ${uuid}`);
    return (await loadDocContent(entry)) ?? '';
  }
}

// ---- Disk volume (File System Access) -----------------------------------
// Talks to the FS Access API directly (no disk-link import → keeps volumes.ts
// off the CodeMirror dependency chain). A mount is a directory handle.

interface FsDirHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}

/** A real folder on the machine, mounted via a directory handle (Chromium). */
export class DiskVolume implements Volume {
  readonly kind = 'disk' as const;
  readonly id: string;
  readonly label: string;
  constructor(
    private readonly root: FileSystemDirectoryHandle,
    id: string,
  ) {
    this.id = id;
    this.label = root.name;
  }

  async state(): Promise<VolumeState> {
    const h = this.root as FsDirHandle;
    if (!h.queryPermission) return 'ready';
    return (await h.queryPermission({ mode: 'readwrite' })) === 'granted'
      ? 'ready'
      : 'needs-permission';
  }

  /** Re-request RW permission on the existing handle (needs a user gesture). */
  async requestPermission(): Promise<boolean> {
    const h = this.root as FsDirHandle;
    if (!h.requestPermission) return true;
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  private async dirAt(path: string): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const seg of path.split('/').filter((s) => s !== '')) {
      dir = await dir.getDirectoryHandle(seg);
    }
    return dir;
  }

  async list(path: string): Promise<VolumeEntry[]> {
    const dir = (await this.dirAt(path)) as FsDirHandle;
    const out: VolumeEntry[] = [];
    for await (const h of dir.values()) {
      const child = path === '' ? h.name : `${path}/${h.name}`;
      out.push({
        name: h.name,
        path: child,
        type: h.kind === 'directory' ? 'dir' : 'file',
        isMarkdown: h.kind === 'file' && isMd(h.name),
      });
    }
    return sortEntries(out);
  }

  async readText(path: string): Promise<string> {
    return (await (await this.fileHandle(path)).getFile()).text();
  }

  /** The file handle for `path` — lets the app link a disk doc in place (V3). */
  async fileHandle(path: string): Promise<FileSystemFileHandle> {
    const segs = path.split('/').filter((s) => s !== '');
    const name = segs.pop();
    if (name === undefined) throw new Error('Chemin vide');
    const dir = await this.dirAt(segs.join('/'));
    return dir.getFileHandle(name);
  }

  /** Create (or get) a file handle at `path`, creating folders as needed (V5). */
  async createFileHandle(path: string): Promise<FileSystemFileHandle> {
    const segs = path.split('/').filter((s) => s !== '');
    const name = segs.pop();
    if (name === undefined) throw new Error('Chemin vide');
    let dir = this.root;
    for (const seg of segs) dir = await dir.getDirectoryHandle(seg, { create: true });
    return dir.getFileHandle(name, { create: true });
  }

  /** The mounted root directory handle (for permission prompts). */
  get rootHandle(): FileSystemDirectoryHandle {
    return this.root;
  }
}

// ---- Repo volume (GitHub) ----------------------------------------------

/** A mounted GitHub repo `owner/repo@branch` (needs a PAT). */
export class RepoVolume implements Volume {
  readonly kind = 'repo' as const;
  readonly id: string;
  readonly label: string;
  private treeCache: Promise<TreeEntry[]> | null = null;

  constructor(
    private readonly token: string,
    private readonly ref: RepoRef,
  ) {
    this.id = `repo:${ref.owner}/${ref.repo}@${ref.branch}`;
    this.label = `${ref.owner}/${ref.repo}@${ref.branch}`;
  }

  /** The repo coordinates — lets the app link/import a file in place (V3). */
  get target(): RepoRef {
    return this.ref;
  }

  private async tree(): Promise<TreeEntry[]> {
    this.treeCache ??= (async () => {
      const head = await getBranchHead(this.token, this.ref);
      if (!head) return [];
      return getTreeRecursive(this.token, this.ref, await getCommitTree(this.token, this.ref, head));
    })();
    return this.treeCache;
  }

  /** Drop the cached tree (after a remote change / manual refresh). */
  refresh(): void {
    this.treeCache = null;
  }

  async state(): Promise<VolumeState> {
    try {
      await this.tree();
      return 'ready';
    } catch {
      return 'offline';
    }
  }

  async list(path: string): Promise<VolumeEntry[]> {
    return sortEntries(childrenFromTree(await this.tree(), path));
  }

  async readText(path: string): Promise<string> {
    const f = await readTextFile(this.token, { ...this.ref, path });
    if (!f) throw new Error(`Fichier introuvable : ${path}`);
    return f.text;
  }
}
