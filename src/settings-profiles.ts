/********************************* settings-profiles.ts ************************
 *
 * Purpose: Persistence for the app-level settings that fall outside the
 *   document stack (STACK-SPEC §12) — language, author/organization, date,
 *   MathJax/mermaid tuning, duplex, … Historically a switchable multi-profile
 *   library (SPEC §9.4.6); that management layer and its UI are retired —
 *   style now lives in documents via `extends`/dotted keys — but the
 *   single-entry sha-blob store underneath still works fine as an implicit,
 *   unnamed settings blob, so it's kept as-is rather than rewritten.
 * How: public API parameterised by uuid, storage content-addressed by
 *   SHA-256 of the serialised PdfSettings. Three localStorage key spaces
 *   (`:index`, `:blob:<sha>`, `:current`) plus idempotent legacy-migration
 *   passes. `ensureActiveProfile` creates the one entry on first boot and
 *   it is never switched again.
 *
 *******************************************************************************/

// On-disk schema (localStorage):
//   markpage:settings-profiles:index       → JSON ProfileEntry[]
//   markpage:settings-profiles:blob:<sha>  → JSON PdfSettings
//   markpage:settings-profiles:current     → uuid
//
// Legacy keys migrated on first run with the SHA-based schema:
//   - markpage:settings (mono-profile, pre-§9.4) → first profile
//     named "Par défaut".
//   - markpage:settings-profiles:blob:<uuid> (uuid-keyed blobs from
//     the §9.4 draft implementation) → re-stored under their SHA.

import { t } from './i18n/strings';
import { sha256Hex } from './image-store';
import { DEFAULT_SETTINGS, mergeWithDefaults, type PdfSettings } from './settings';

const KEY_INDEX = 'markpage:settings-profiles:index';
const KEY_BLOB_PREFIX = 'markpage:settings-profiles:blob:';
const KEY_CURRENT = 'markpage:settings-profiles:current';
const KEY_LEGACY_SETTINGS = 'markpage:settings';

// Sentinel value stored in `ProfileEntry.name` for the auto-created
// default profile. Never displayed verbatim — `displayProfileName`
// resolves it to the localised label ("Par défaut" / "Default")
// derived from the active UI locale. Once the user renames the
// profile, the sentinel is gone and the chosen name is shown as-is.
const DEFAULT_PROFILE_NAME = '__default__';

/**
 * Purpose: User-facing label for a profile entry.
 * How: Translate the `__default__` sentinel on the fly via `t()`; pass
 *   any other name through as-is.
 */
export function displayProfileName(entry: ProfileEntry): string {
  return entry.name === DEFAULT_PROFILE_NAME
    ? t('profile.default-name')
    : entry.name;
}

/**
 * Purpose: One entry in the profile index — pointer at a SHA-keyed
 *   PdfSettings blob.
 */
export interface ProfileEntry {
  uuid: string;
  name: string;
  mtime: number;
  contentSha: string;
}

// ---- index ------------------------------------------------------------

/**
 * Purpose: Parse the profile index from localStorage, tolerant to corruption.
 * How: JSON parse + array filter through `isProfileEntry`; `[]` on failure.
 */
function readIndex(): ProfileEntry[] {
  const raw = localStorage.getItem(KEY_INDEX);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProfileEntry);
  } catch {
    return [];
  }
}

/**
 * Purpose: Persist the profile index back to localStorage.
 * How: `JSON.stringify` + `setItem(KEY_INDEX, …)`.
 */
function writeIndex(entries: ProfileEntry[]): void {
  localStorage.setItem(KEY_INDEX, JSON.stringify(entries));
}

/**
 * Purpose: Runtime guard checking that an unknown is a `ProfileEntry`.
 * How: Object presence + four `typeof` checks on uuid/name/mtime/contentSha.
 */
function isProfileEntry(x: unknown): x is ProfileEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Partial<ProfileEntry>;
  return (
    typeof e.uuid === 'string' &&
    typeof e.name === 'string' &&
    typeof e.mtime === 'number' &&
    typeof e.contentSha === 'string'
  );
}

/**
 * Purpose: Snapshot of the profile index sorted by mtime descending.
 * How: Read, shallow copy, sort by `b.mtime - a.mtime`.
 */
export function listProfiles(): ProfileEntry[] {
  return readIndex().slice().sort((a, b) => b.mtime - a.mtime);
}

// ---- blobs ------------------------------------------------------------

/**
 * Purpose: Build the localStorage key for a SHA-keyed settings blob.
 * How: Prefix concatenation with `KEY_BLOB_PREFIX`.
 */
function blobKey(sha: string): string {
  return KEY_BLOB_PREFIX + sha;
}

/**
 * Purpose: Load a settings blob and run it through the tolerant merge.
 * How: `getItem` + `JSON.parse` + `mergeWithDefaults`; null on miss / parse error.
 */
function readBlob(sha: string): PdfSettings | null {
  const raw = localStorage.getItem(blobKey(sha));
  if (!raw) return null;
  try {
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Purpose: Persist a settings blob if (and only if) the SHA isn't already stored.
 * How: Skip when the key exists — content-addressed, same SHA implies same bytes.
 */
function writeBlob(sha: string, settings: PdfSettings): void {
  if (localStorage.getItem(blobKey(sha)) === null) {
    localStorage.setItem(blobKey(sha), JSON.stringify(settings));
  }
}

/**
 * Purpose: Compute the SHA-256 hex of a serialised settings object.
 * How: Wrap `JSON.stringify(settings)` in a `Blob` and delegate to `sha256Hex`.
 */
async function hashSettings(settings: PdfSettings): Promise<string> {
  return sha256Hex(new Blob([JSON.stringify(settings)]));
}

// ---- current profile --------------------------------------------------

/**
 * Purpose: Read the persisted active-profile uuid (or null).
 * How: `localStorage.getItem(KEY_CURRENT)`.
 */
export function getCurrentProfileId(): string | null {
  return localStorage.getItem(KEY_CURRENT);
}

/**
 * Purpose: Persist the active-profile uuid.
 * How: `localStorage.setItem(KEY_CURRENT, uuid)`.
 */
export function setCurrentProfileId(uuid: string): void {
  localStorage.setItem(KEY_CURRENT, uuid);
}

/**
 * Purpose: Pick the profile to activate on this run.
 * How: Prefer the persisted current-profile; fall back to the freshest
 *   entry; null when the index is empty.
 */
export function resolveCurrentProfile(): ProfileEntry | null {
  const index = readIndex();
  if (index.length === 0) return null;
  const id = getCurrentProfileId();
  const direct = id ? index.find((e) => e.uuid === id) : null;
  if (direct) return direct;
  const sorted = listProfiles();
  return sorted[0] ?? null;
}

// ---- name helpers -----------------------------------------------------

/**
 * Purpose: Disambiguate a candidate name against a set of taken names.
 * How: Return `base` unchanged when free; else append " 2", " 3", … until free.
 */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// ---- create / rename / duplicate / delete ------------------------------

/**
 * Purpose: Create a new profile with the given name and settings.
 * How: Hash + writeBlob, push a fresh entry (uuid, unique name, mtime=now,
 *   SHA) into the index.
 */
export async function createProfile(
  desiredName: string,
  settings: PdfSettings,
): Promise<ProfileEntry> {
  const sha = await hashSettings(settings);
  writeBlob(sha, settings);
  const index = readIndex();
  const taken = new Set(index.map((e) => e.name));
  const name = uniqueName(desiredName.trim() || 'Profil', taken);
  const entry: ProfileEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
    contentSha: sha,
  };
  index.push(entry);
  writeIndex(index);
  return entry;
}

// ---- read / write the content of an entry ------------------------------

/**
 * Purpose: Load the `PdfSettings` payload of the named profile.
 * How: Index lookup + `readBlob`; falls back to `DEFAULT_SETTINGS` on miss.
 */
export function loadProfileSettings(uuid: string): PdfSettings {
  const index = readIndex();
  const entry = index.find((e) => e.uuid === uuid);
  if (!entry) return DEFAULT_SETTINGS;
  return readBlob(entry.contentSha) ?? DEFAULT_SETTINGS;
}

/**
 * Purpose: Persist new content for a profile; idempotent on identical SHA.
 * How: Hash, writeBlob, then update the entry's `contentSha` + `mtime`
 *   only when the SHA actually changed; orphan old SHA via `gcProfileBlobs`.
 */
export async function saveProfileSettings(
  uuid: string,
  settings: PdfSettings,
): Promise<ProfileEntry | null> {
  const sha = await hashSettings(settings);
  const index = readIndex();
  const i = index.findIndex((e) => e.uuid === uuid);
  if (i < 0) return null;
  writeBlob(sha, settings);
  if (index[i].contentSha === sha) return index[i];
  const updated: ProfileEntry = {
    ...index[i],
    contentSha: sha,
    mtime: Date.now(),
  };
  index[i] = updated;
  writeIndex(index);
  // The old SHA may now be orphan; cheap to check.
  gcProfileBlobs();
  return updated;
}

// ---- garbage collection -----------------------------------------------

/**
 * Purpose: Drop every settings blob whose SHA isn't referenced anymore.
 * How: Walk localStorage keys with `KEY_BLOB_PREFIX`; remove unreferenced
 *   ones, rewinding the index after each removal to handle browser reordering.
 */
export function gcProfileBlobs(): number {
  const referenced = new Set(readIndex().map((e) => e.contentSha));
  let removed = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k?.startsWith(KEY_BLOB_PREFIX)) continue;
    const sha = k.slice(KEY_BLOB_PREFIX.length);
    if (referenced.has(sha)) continue;
    localStorage.removeItem(k);
    removed += 1;
    // Removing a key shifts the index in some browsers; rewind by 1
    // so we don't skip the next entry.
    i -= 1;
  }
  return removed;
}

// ---- bootstrap --------------------------------------------------------

/**
 * Purpose: Idempotent migration from the mono-profile world.
 * How: If `markpage:settings` exists, create a `__default__` profile from
 *   it, mark it current, then drop the legacy key.
 */
async function migrateMonoProfile(): Promise<void> {
  const legacy = localStorage.getItem(KEY_LEGACY_SETTINGS);
  if (legacy === null) return;
  let parsed: PdfSettings;
  try {
    parsed = JSON.parse(legacy) as PdfSettings;
  } catch {
    localStorage.removeItem(KEY_LEGACY_SETTINGS);
    return;
  }
  const entry = await createProfile(DEFAULT_PROFILE_NAME, parsed);
  setCurrentProfileId(entry.uuid);
  localStorage.removeItem(KEY_LEGACY_SETTINGS);
}

/**
 * Purpose: Idempotent migration from the §9.4 draft's uuid-keyed blobs.
 * How: For each entry missing `contentSha`, hash its uuid-keyed blob,
 *   re-store under the SHA, attach the SHA to the entry, drop the old key.
 */
async function migrateUuidKeyedBlobs(): Promise<void> {
  // Index entries from the draft schema lacked `contentSha`. We
  // detect them by reading the raw JSON (since isProfileEntry now
  // rejects them).
  const raw = localStorage.getItem(KEY_INDEX);
  if (!raw) return;
  let entries: Array<Partial<ProfileEntry> & { uuid: string }>;
  try {
    entries = JSON.parse(raw) as typeof entries;
  } catch {
    return;
  }
  if (!Array.isArray(entries)) return;
  const needsMigration = entries.some((e) => typeof e.contentSha !== 'string');
  if (!needsMigration) return;
  const migrated: ProfileEntry[] = [];
  for (const e of entries) {
    if (typeof e.contentSha === 'string') {
      migrated.push(e as ProfileEntry);
      continue;
    }
    const oldBlobKey = KEY_BLOB_PREFIX + e.uuid;
    const blob = localStorage.getItem(oldBlobKey);
    const settings: PdfSettings = blob
      ? (JSON.parse(blob) as PdfSettings)
      : DEFAULT_SETTINGS;
    const sha = await hashSettings(settings);
    writeBlob(sha, settings);
    if (blob) localStorage.removeItem(oldBlobKey);
    migrated.push({
      uuid: e.uuid,
      name: typeof e.name === 'string' ? e.name : 'Profil',
      mtime: typeof e.mtime === 'number' ? e.mtime : Date.now(),
      contentSha: sha,
    });
  }
  writeIndex(migrated);
}

/**
 * Purpose: Idempotent migration of pre-i18n literal default names.
 * How: Rewrite any entry named "Par défaut" / "Default" to the
 *   `__default__` sentinel so it follows the active UI locale.
 */
function migrateLiteralDefaultName(): void {
  const index = readIndex();
  let dirty = false;
  for (const entry of index) {
    if (entry.name === 'Par défaut' || entry.name === 'Default') {
      entry.name = DEFAULT_PROFILE_NAME;
      dirty = true;
    }
  }
  if (dirty) writeIndex(index);
}

/**
 * Purpose: Run every settings-profile migration in order.
 * How: uuid-keyed-blobs → mono-profile (only if index still absent) →
 *   literal-default-name; each inner pass is idempotent.
 */
export async function migrateLegacySettingsIfNeeded(): Promise<void> {
  await migrateUuidKeyedBlobs();
  if (localStorage.getItem(KEY_INDEX) === null) {
    await migrateMonoProfile();
  }
  migrateLiteralDefaultName();
}

/**
 * Purpose: Return the active profile, creating a default one if the
 *   index is empty. Bootstraps the rest of the app's settings.
 * How: `resolveCurrentProfile` first; otherwise `createProfile(__default__)`
 *   seeded with `seedLanguage` (detected UI locale), then set current.
 */
export async function ensureActiveProfile(
  seedLanguage: 'fr' | 'en' = 'fr',
): Promise<ProfileEntry> {
  const existing = resolveCurrentProfile();
  if (existing) {
    setCurrentProfileId(existing.uuid);
    return existing;
  }
  const entry = await createProfile(DEFAULT_PROFILE_NAME, {
    ...DEFAULT_SETTINGS,
    language: seedLanguage,
  });
  setCurrentProfileId(entry.uuid);
  return entry;
}
