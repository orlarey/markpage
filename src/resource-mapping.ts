/********************************* resource-mapping.ts *************************
 *
 * Purpose: Persistent mapping between *external* resource references (the
 *   relative paths a Markdown author writes, e.g. `images/foo.png`) and the
 *   *internal* content-addressed blob storage that backs them (SHA-256 hex
 *   key in the shared IDB `images` store).
 *
 *   The mapping is what lets an imported `.md` keep its original
 *   `![](images/foo.png)` references intact (round-trip identity on export)
 *   while the renderer still resolves the URL to a real blob. Re-importing
 *   the same `.md` later only prompts for resources we don't already know;
 *   sharing a resource between documents reuses the same mapping entry.
 *
 *   Scope choices (SPEC §6.5):
 *   - Mapping is **global** to the markpage instance (shared by every doc).
 *   - Conflict policy: when a path already maps to a SHA and a new file with
 *     a different SHA is offered, the caller decides (`onConflict` hook);
 *     the import UI surfaces a confirm dialog.
 *   - The mapping does NOT own blob storage. Blobs live in the shared IDB
 *     `images` store and are GC'd by the main orchestrator after the union
 *     of `img://<sha>` refs *and* mapped external paths has been walked.
 *
 * How: localStorage carries a single JSON record under
 *   `markpage:resources:mapping`. `addResource(path, blob)` hashes the blob,
 *   stores it via `putBlobBySha`, then writes the `{ sha, firstSeen }` entry
 *   for the path. `extractExternalRefs(text)` walks markdown image
 *   references (inline + ref-style) and returns the unique paths that count
 *   as external (i.e., not `img://`, `data:`, http(s), protocol-relative, …).
 *
 *******************************************************************************/

import { putBlobBySha } from './image-store';

const KEY = 'markpage:resources:mapping';

/**
 * Purpose: One entry of the persisted mapping — what we know about an external
 *   path the user has resolved at least once.
 */
export interface ResourceEntry {
  /** SHA-256 hex digest of the blob (also the IDB `images` key). */
  sha: string;
  /** ms epoch — when this path was first resolved. */
  firstSeen: number;
}

export type Mapping = Record<string, ResourceEntry>;

/**
 * Purpose: Load the persisted mapping, falling back to an empty object on
 *   any parse failure (corrupted localStorage entry).
 * How: JSON parse the storage value; replace with `{}` on any throw.
 */
export function loadMapping(): Mapping {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null) return parsed as Mapping;
    return {};
  } catch {
    return {};
  }
}

/**
 * Purpose: Persist the entire mapping object to localStorage.
 * How: JSON stringify under `KEY`; called from `addResource` /
 *   `removeResource` after a single-entry mutation.
 */
function saveMapping(m: Mapping): void {
  localStorage.setItem(KEY, JSON.stringify(m));
}

/**
 * Purpose: Resolve an external path to its known SHA, or `null` when no
 *   mapping entry exists yet.
 * How: Single-key lookup in the loaded mapping.
 */
export function lookupResource(externalPath: string): string | null {
  const m = loadMapping();
  return m[externalPath]?.sha ?? null;
}

/**
 * Purpose: Outcome reported by `addResource` so callers can react when an
 *   existing entry got replaced (conflict UI, log line, …).
 */
export interface AddOutcome {
  sha: string;
  replaced: boolean;
}

/** Conflict-resolution hook for `addResource`. */
export type ConflictDecision = 'overwrite' | 'keep';
export type ConflictResolver = (
  externalPath: string,
  existingSha: string,
  newSha: string,
) => Promise<ConflictDecision> | ConflictDecision;

/**
 * Purpose: Register an external path against a blob, hashing the blob into
 *   the shared IDB store and updating the mapping entry. Returns the SHA
 *   that the path now resolves to.
 * How:
 *   1. Hash + store the blob via `putBlobBySha` (idempotent on existing
 *      content — two paths can therefore point at one blob).
 *   2. Look up any current mapping entry for `path`.
 *   3. If absent or already pointing at the new SHA, write the entry and
 *      return `{ sha, replaced: false }`.
 *   4. If a conflict is detected, consult the `onConflict` hook (defaults to
 *      `'overwrite'` — the import flow swaps in a UI prompt). On `'keep'`,
 *      return the existing SHA without touching the mapping.
 */
export async function addResource(
  externalPath: string,
  blob: Blob,
  onConflict?: ConflictResolver,
): Promise<AddOutcome> {
  const sha = await putBlobBySha(blob);
  const m = loadMapping();
  const existing = m[externalPath];
  if (!existing || existing.sha === sha) {
    m[externalPath] = { sha, firstSeen: existing?.firstSeen ?? Date.now() };
    saveMapping(m);
    return { sha, replaced: false };
  }
  const decision: ConflictDecision = onConflict
    ? await onConflict(externalPath, existing.sha, sha)
    : 'overwrite';
  if (decision === 'keep') return { sha: existing.sha, replaced: false };
  m[externalPath] = { sha, firstSeen: existing.firstSeen };
  saveMapping(m);
  return { sha, replaced: true };
}

/**
 * Purpose: Remove a single mapping entry. Does NOT delete the underlying blob —
 *   the orchestrator's GC pass takes care of blobs that are no longer referenced
 *   anywhere (no `img://<sha>` use AND no remaining mapped path).
 * How: Drop the key and persist.
 */
export function removeResource(externalPath: string): void {
  const m = loadMapping();
  if (!(externalPath in m)) return;
  delete m[externalPath];
  saveMapping(m);
}

/**
 * Purpose: Return the SHA set of every blob currently kept alive by a mapping
 *   entry — used by the GC orchestrator to compute the union with `img://`
 *   refs before sweeping IDB.
 * How: Project the mapping to its `sha` values.
 */
export function mappedShas(): Set<string> {
  const m = loadMapping();
  const out = new Set<string>();
  for (const k of Object.keys(m)) out.add(m[k].sha);
  return out;
}

/**
 * Purpose: Decide whether a URL is an *external* resource path that the
 *   mapping should resolve. Keep the answer narrow — the mapping is for
 *   local-filesystem-style references that the renderer would otherwise
 *   render as broken.
 * How: Reject every protocol we recognise; reject `img://` (internal),
 *   `data:` (already inlined), `http://` / `https://` / `//` (remote), and
 *   a few rarer schemes (`blob:`, `mailto:`, `javascript:`, `file:`,
 *   `tel:`, `ftp:`, `ftps:`, `sftp:`). Anything else is treated as a
 *   relative resource path.
 */
export function isExternalRef(url: string): boolean {
  if (url === '') return false;
  if (url.startsWith('img://')) return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('blob:')) return false;
  if (url.startsWith('http://')) return false;
  if (url.startsWith('https://')) return false;
  if (url.startsWith('//')) return false;
  if (url.startsWith('mailto:')) return false;
  if (url.startsWith('javascript:')) return false;
  if (url.startsWith('file:')) return false;
  if (url.startsWith('tel:')) return false;
  if (url.startsWith('ftp:')) return false;
  if (url.startsWith('ftps:')) return false;
  if (url.startsWith('sftp:')) return false;
  if (url.startsWith('#')) return false; // intra-doc anchor
  return true;
}

// Match an inline image `![alt](url[ "title"])`. We accept any url that
// doesn't itself contain whitespace or `)` — the standard CommonMark inline
// shape. Reference-style and definition forms are handled separately below.
const INLINE_IMAGE_RE = /!\[([^\]\n]*)\]\(\s*([^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g;

// Match a reference definition line `[label]: url[ "title"]`. We deliberately
// scan with the `m` flag so each line is considered independently; URLs that
// span lines aren't worth supporting (CommonMark allows it; markpage docs
// don't use it).
const REF_DEF_RE = /^[ \t]{0,3}\[([^\]\n]+)\]:\s*(\S+)(?:\s+"[^"\n]*")?\s*$/gm;

/**
 * Purpose: Walk a markdown source and return every external path it
 *   references (inline + reference-style image), deduplicated.
 * How: Run two regexes — one for `![…](url)`, one for `[label]: url` — over
 *   the source, then keep only URLs that `isExternalRef` accepts. Skipping
 *   non-image reference definitions (e.g., plain `[link]: …` for hyperlinks)
 *   is acceptable here: the import flow asks for missing files, and over-
 *   collecting non-image refs would just produce a benign prompt the user
 *   can dismiss. We trade a tiny over-collection for a much simpler parser.
 *   `extractDataUrls` and the rest of the pipeline rely on the same kind of
 *   regex-level matching, so the precision is consistent.
 */
export function extractExternalRefs(source: string): string[] {
  const seen = new Set<string>();
  for (const m of source.matchAll(INLINE_IMAGE_RE)) {
    const url = m[2];
    if (isExternalRef(url)) seen.add(url);
  }
  for (const m of source.matchAll(REF_DEF_RE)) {
    const url = m[2];
    if (isExternalRef(url)) seen.add(url);
  }
  return [...seen];
}

/**
 * Purpose: Substitute every external image URL in a markdown source via
 *   `resolver`. Non-external URLs and URLs the resolver returns `null` for
 *   pass through untouched.
 * How: Two `replaceAll` passes mirroring `extractExternalRefs` — one over
 *   inline `![alt](url)` shapes, one over `[label]: url` definitions. The
 *   surrounding syntax (brackets, parens, label, etc.) is preserved; only
 *   the URL itself is swapped.
 */
export function rewriteExternalRefs(
  source: string,
  resolver: (path: string) => string | null,
): string {
  let out = source.replaceAll(INLINE_IMAGE_RE, (match, alt: string, url: string) => {
    if (!isExternalRef(url)) return match;
    const replacement = resolver(url);
    return replacement === null ? match : `![${alt}](${replacement})`;
  });
  out = out.replaceAll(REF_DEF_RE, (match, label: string, url: string) => {
    if (!isExternalRef(url)) return match;
    const replacement = resolver(url);
    return replacement === null ? match : `[${label}]: ${replacement}`;
  });
  return out;
}
