// Library of named PdfSettings profiles, parallel to the multi-doc
// store from docs.ts. The user toggles between profiles from the
// [Mon profil ▾] dropdown in the Réglages window header; the active
// profile drives the preview / PDF / LaTeX render. Cf. SPEC §9.4.
//
// Two-layer design (cf. SPEC §9.4.6):
//   - Public API: every operation is parameterised by uuid (handle)
//     and named in the docs.ts style (createProfile, renameProfile,
//     etc.). The API thinks in (name, content) pairs and never
//     exposes SHA / blobs.
//   - Storage layer: content-addressed by SHA-256 of the serialised
//     PdfSettings, mirroring how docs.ts stores markdown blobs.
//     Two profiles with identical content share a single blob; a
//     duplicate is a new entry pointing at the same SHA.
//
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
import { DEFAULT_SETTINGS, type PdfSettings } from './settings';

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

// User-facing name for a profile entry. The default profile carries
// a sentinel value (cf. above) that we translate on the fly so a
// French user sees "Par défaut" and an English user sees "Default" —
// without renaming the underlying entry when the locale flips. All
// other profiles render with their stored name.
export function displayProfileName(entry: ProfileEntry): string {
  return entry.name === DEFAULT_PROFILE_NAME
    ? t('profile.default-name')
    : entry.name;
}

export interface ProfileEntry {
  uuid: string;
  name: string;
  mtime: number;
  contentSha: string;
}

// ---- index ------------------------------------------------------------

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

function writeIndex(entries: ProfileEntry[]): void {
  localStorage.setItem(KEY_INDEX, JSON.stringify(entries));
}

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

export function listProfiles(): ProfileEntry[] {
  return readIndex().slice().sort((a, b) => b.mtime - a.mtime);
}

// ---- blobs ------------------------------------------------------------

function blobKey(sha: string): string {
  return KEY_BLOB_PREFIX + sha;
}

function readBlob(sha: string): PdfSettings | null {
  const raw = localStorage.getItem(blobKey(sha));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PdfSettings;
  } catch {
    return null;
  }
}

// Idempotent: skips the write when the same SHA is already on disk.
// Content-addressed = bytes at the key would be identical anyway.
function writeBlob(sha: string, settings: PdfSettings): void {
  if (localStorage.getItem(blobKey(sha)) === null) {
    localStorage.setItem(blobKey(sha), JSON.stringify(settings));
  }
}

async function hashSettings(settings: PdfSettings): Promise<string> {
  return sha256Hex(new Blob([JSON.stringify(settings)]));
}

// ---- current profile --------------------------------------------------

export function getCurrentProfileId(): string | null {
  return localStorage.getItem(KEY_CURRENT);
}

export function setCurrentProfileId(uuid: string): void {
  localStorage.setItem(KEY_CURRENT, uuid);
}

// Resolves the profile the app should activate on this run. Falls
// back to the freshest entry when `current` is missing or invalid.
// Returns null only if the index is genuinely empty — the caller
// must follow with `ensureActiveProfile` in that case.
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

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// ---- create / rename / duplicate / delete ------------------------------

// Hashes `settings`, writes the blob if new, appends an entry with a
// fresh uuid. Auto-renames on name collision.
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

// Index-only mutation: name field, no blob touched. Returns null if
// the uuid is unknown. No-op (returns the existing entry untouched)
// when the new name is identical to the old one.
export function renameProfile(
  uuid: string,
  newName: string,
): ProfileEntry | null {
  const trimmed = newName.trim();
  if (trimmed === '') return null;
  const index = readIndex();
  const i = index.findIndex((e) => e.uuid === uuid);
  if (i < 0) return null;
  if (index[i].name === trimmed) return index[i];
  const taken = new Set(
    index.filter((e) => e.uuid !== uuid).map((e) => e.name),
  );
  const name = uniqueName(trimmed, taken);
  const updated: ProfileEntry = { ...index[i], name };
  index[i] = updated;
  writeIndex(index);
  return updated;
}

// New entry pointing at the same blob (same SHA). Cheap: no second
// blob written, just the index entry.
export function duplicateProfile(uuid: string): ProfileEntry | null {
  const index = readIndex();
  const src = index.find((e) => e.uuid === uuid);
  if (!src) return null;
  const taken = new Set(index.map((e) => e.name));
  const name = uniqueName(`Copie de ${src.name}`, taken);
  const entry: ProfileEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
    contentSha: src.contentSha,
  };
  index.push(entry);
  writeIndex(index);
  return entry;
}

// Removes the profile. **Refuses to delete the last remaining one**
// (callers should disable the action in that case anyway). Hands the
// active slot to the freshest survivor when the deleted profile was
// current. Returns true when the deletion went through.
export function deleteProfile(uuid: string): boolean {
  const index = readIndex();
  if (index.length <= 1) return false;
  const remaining = index.filter((e) => e.uuid !== uuid);
  if (remaining.length === index.length) return false;
  writeIndex(remaining);
  // The deleted entry's blob might still be referenced by another
  // entry (typical after a duplicate); only GC it if it's truly
  // orphan now.
  gcProfileBlobs();
  if (getCurrentProfileId() === uuid) {
    const next = remaining.slice().sort((a, b) => b.mtime - a.mtime)[0];
    if (next) setCurrentProfileId(next.uuid);
  }
  return true;
}

// ---- read / write the content of an entry ------------------------------

export function loadProfileSettings(uuid: string): PdfSettings {
  const index = readIndex();
  const entry = index.find((e) => e.uuid === uuid);
  if (!entry) return DEFAULT_SETTINGS;
  return readBlob(entry.contentSha) ?? DEFAULT_SETTINGS;
}

// Edits the content of the named profile. Idempotent: when the new
// content hashes to the same SHA as the existing one, leaves both
// the blob and the entry's mtime untouched — keeps the dropdown's
// recency sort from flipping while the user just hovers around the
// form. Returns the (possibly unchanged) entry.
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

// Convenience: edit content to DEFAULT_SETTINGS without touching the
// name. Behaves exactly like saveProfileSettings(uuid, DEFAULT_SETTINGS)
// but reads better at the call site.
export async function resetProfile(
  uuid: string,
): Promise<ProfileEntry | null> {
  return saveProfileSettings(uuid, DEFAULT_SETTINGS);
}

// ---- garbage collection -----------------------------------------------

// Drops every blob whose SHA isn't referenced by any entry. Cheap
// linear walk over the localStorage keys with our prefix. Returns
// the number of blobs removed.
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

// Idempotent migration from the mono-profile world: the legacy
// `markpage:settings` key (a single PdfSettings JSON) becomes the
// first profile named "Par défaut".
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

// Idempotent migration from the uuid-keyed blob schema (the §9.4
// draft, commit 24c009d). For each index entry without contentSha,
// look up its uuid-keyed blob, hash it, store under SHA, attach
// contentSha. The old uuid-keyed blob is then dropped.
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

// Pre-i18n installs created the auto-default profile under the
// literal string "Par défaut". Convert any such entry to the
// `__default__` sentinel so the name follows the active UI locale
// going forward. Idempotent: once converted, no entry matches the
// literal strings and the function is a no-op. Also picks up
// "Default" for symmetry, in case a profile was created with the
// English seed (which used the same code path).
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

// Runs every supported migration in order. Each inner migration is
// a no-op when its trigger is absent, so this is cheap and
// idempotent — safe to call at every bootstrap.
export async function migrateLegacySettingsIfNeeded(): Promise<void> {
  await migrateUuidKeyedBlobs();
  if (localStorage.getItem(KEY_INDEX) === null) {
    await migrateMonoProfile();
  }
  migrateLiteralDefaultName();
}

// Returns the existing or freshly-created active profile. Called at
// bootstrap to guarantee the rest of the app always has *some*
// settings to render against. Run migrateLegacySettingsIfNeeded
// before this so a legacy install lands in the right place.
//
// `seedLanguage` controls the doc language baked into the brand-new
// "Par défaut" profile we create when the index is empty; callers
// pass the detected UI locale so an English user lands with English
// defaults. Existing profiles are untouched.
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

// ---- JSON import / export --------------------------------------------

// Wire format (v1):
//   {
//     "version": 1,
//     "name": "Mon profil",
//     "settings": { …PdfSettings… }
//   }
interface ExportEnvelope {
  version: number;
  name: string;
  settings: PdfSettings;
}

const EXPORT_VERSION = 1;

export function exportProfileJson(uuid: string): string | null {
  const index = readIndex();
  const entry = index.find((e) => e.uuid === uuid);
  if (!entry) return null;
  const settings = readBlob(entry.contentSha);
  if (!settings) return null;
  const envelope: ExportEnvelope = {
    version: EXPORT_VERSION,
    name: entry.name,
    settings,
  };
  return JSON.stringify(envelope, null, 2);
}

export type ImportResult =
  | { ok: true; profile: ProfileEntry }
  | { ok: false; error: string };

export async function importProfileJson(json: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: t('profile-import.invalid-json') };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: t('profile-import.unexpected-format') };
  }
  const env = parsed as Partial<ExportEnvelope>;
  if (typeof env.version !== 'number' || env.version > EXPORT_VERSION) {
    return { ok: false, error: t('profile-import.unknown-version') };
  }
  if (typeof env.name !== 'string' || !env.settings) {
    return { ok: false, error: t('profile-import.missing-fields') };
  }
  const profile = await createProfile(env.name, env.settings);
  return { ok: true, profile };
}
