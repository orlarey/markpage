// Multi-profile settings store. Mirrors the multi-doc store from
// docs.ts: a lightweight index (uuid + name + mtime) lives alongside
// one localStorage entry per profile blob. The user toggles between
// profiles from the dropdown in the Réglages window header; the
// active profile drives the preview / PDF render. Cf. SPEC §9.4.
//
// On-disk schema (localStorage):
//   md2pdf:settings-profiles:index       → JSON ProfileEntry[]
//   md2pdf:settings-profiles:blob:<uuid> → JSON PdfSettings
//   md2pdf:settings-profiles:current     → uuid
//
// Legacy key `md2pdf:settings` (single-profile world) is migrated on
// first multi-profile run, then removed.

import {
  DEFAULT_SETTINGS,
  type PdfSettings,
} from './settings';

const KEY_INDEX = 'md2pdf:settings-profiles:index';
const KEY_BLOB_PREFIX = 'md2pdf:settings-profiles:blob:';
const KEY_CURRENT = 'md2pdf:settings-profiles:current';
const KEY_LEGACY = 'md2pdf:settings';

const DEFAULT_PROFILE_NAME = 'Par défaut';

export interface ProfileEntry {
  uuid: string;
  name: string;
  mtime: number;
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
    typeof e.mtime === 'number'
  );
}

export function listProfiles(): ProfileEntry[] {
  return readIndex().slice().sort((a, b) => b.mtime - a.mtime);
}

// ---- blobs ------------------------------------------------------------

function blobKey(uuid: string): string {
  return KEY_BLOB_PREFIX + uuid;
}

function readBlob(uuid: string): PdfSettings | null {
  const raw = localStorage.getItem(blobKey(uuid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PdfSettings;
  } catch {
    return null;
  }
}

function writeBlob(uuid: string, settings: PdfSettings): void {
  localStorage.setItem(blobKey(uuid), JSON.stringify(settings));
}

function deleteBlob(uuid: string): void {
  localStorage.removeItem(blobKey(uuid));
}

// ---- current profile --------------------------------------------------

export function getCurrentProfileId(): string | null {
  return localStorage.getItem(KEY_CURRENT);
}

export function setCurrentProfileId(uuid: string): void {
  localStorage.setItem(KEY_CURRENT, uuid);
}

// Resolves the profile the app should activate on this run. Falls
// back to the freshest entry when current-profile is missing or
// invalid. Returns null only if the index is genuinely empty (caller
// is then expected to call ensureAtLeastOneProfile).
export function resolveCurrentProfile(): ProfileEntry | null {
  const index = readIndex();
  if (index.length === 0) return null;
  const id = getCurrentProfileId();
  const direct = id ? index.find((e) => e.uuid === id) : null;
  if (direct) return direct;
  const sorted = listProfiles();
  return sorted[0] ?? null;
}

// ---- create / rename / delete / duplicate -----------------------------

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// Creates a profile with the given (or default) settings. Returns
// the index entry. The caller decides whether to call
// `setCurrentProfileId` afterwards.
export function createProfile(
  desiredName: string,
  settings: PdfSettings = DEFAULT_SETTINGS,
): ProfileEntry {
  const index = readIndex();
  const taken = new Set(index.map((e) => e.name));
  const name = uniqueName(desiredName.trim() || 'Profil', taken);
  const entry: ProfileEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
  };
  writeBlob(entry.uuid, settings);
  index.push(entry);
  writeIndex(index);
  return entry;
}

export function renameProfile(
  uuid: string,
  newName: string,
): ProfileEntry | null {
  const trimmed = newName.trim();
  if (trimmed === '') return null;
  const index = readIndex();
  const i = index.findIndex((e) => e.uuid === uuid);
  if (i < 0) return null;
  // Disambiguate against the other entries' names. If the user
  // didn't change the name, skip the uniqueness check so we don't
  // accidentally append " 2" when the input is unchanged.
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

// Removes a profile. Refuses to drop the last remaining one — the
// caller's UI should disable the action in that case anyway.
// Returns true when the deletion went through.
export function deleteProfile(uuid: string): boolean {
  const index = readIndex();
  if (index.length <= 1) return false;
  const remaining = index.filter((e) => e.uuid !== uuid);
  if (remaining.length === index.length) return false;
  writeIndex(remaining);
  deleteBlob(uuid);
  if (getCurrentProfileId() === uuid) {
    // Hand the active slot to the freshest survivor so the next
    // render doesn't flap to whatever the runtime picks.
    const next = remaining.slice().sort((a, b) => b.mtime - a.mtime)[0];
    if (next) setCurrentProfileId(next.uuid);
  }
  return true;
}

export function duplicateProfile(uuid: string): ProfileEntry | null {
  const index = readIndex();
  const src = index.find((e) => e.uuid === uuid);
  if (!src) return null;
  const settings = readBlob(uuid) ?? DEFAULT_SETTINGS;
  const taken = new Set(index.map((e) => e.name));
  const name = uniqueName(`Copie de ${src.name}`, taken);
  const entry: ProfileEntry = {
    uuid: crypto.randomUUID(),
    name,
    mtime: Date.now(),
  };
  writeBlob(entry.uuid, settings);
  index.push(entry);
  writeIndex(index);
  return entry;
}

// ---- read / write the active settings ---------------------------------

// Returns the settings for the named profile (or DEFAULT_SETTINGS as a
// last-resort fallback). Always goes through mergeWithDefaults via
// the json shape so legacy fields are tolerated.
export function loadProfileSettings(uuid: string): PdfSettings {
  return readBlob(uuid) ?? DEFAULT_SETTINGS;
}

export function saveProfileSettings(
  uuid: string,
  settings: PdfSettings,
): ProfileEntry | null {
  const index = readIndex();
  const i = index.findIndex((e) => e.uuid === uuid);
  if (i < 0) return null;
  writeBlob(uuid, settings);
  // Bump mtime so the dropdown reorders by recency.
  const updated: ProfileEntry = { ...index[i], mtime: Date.now() };
  index[i] = updated;
  writeIndex(index);
  return updated;
}

// ---- bootstrap --------------------------------------------------------

// One-shot migration of the mono-profile schema (md2pdf:settings)
// into the multi-profile index. Idempotent — once the index exists
// this returns without touching anything.
export function migrateLegacySettingsIfNeeded(): void {
  if (localStorage.getItem(KEY_INDEX) !== null) return;
  const legacy = localStorage.getItem(KEY_LEGACY);
  if (legacy === null) return;
  let parsed: PdfSettings;
  try {
    parsed = JSON.parse(legacy) as PdfSettings;
  } catch {
    return;
  }
  const entry = createProfile(DEFAULT_PROFILE_NAME, parsed);
  setCurrentProfileId(entry.uuid);
  localStorage.removeItem(KEY_LEGACY);
}

// Returns the existing or freshly-created active profile. Called at
// bootstrap to guarantee the rest of the app always has *some*
// settings to render against. Run migrateLegacySettingsIfNeeded
// before this so a legacy install lands in the right place.
export function ensureActiveProfile(): ProfileEntry {
  const existing = resolveCurrentProfile();
  if (existing) {
    setCurrentProfileId(existing.uuid); // pin in case it was fallback'd
    return existing;
  }
  const entry = createProfile(DEFAULT_PROFILE_NAME, DEFAULT_SETTINGS);
  setCurrentProfileId(entry.uuid);
  return entry;
}

// ---- JSON import / export --------------------------------------------

// Format on disk (v1):
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
  const settings = readBlob(uuid);
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

// Parses a profile JSON file and adds it as a new profile. Doesn't
// switch the active profile — caller decides. The new profile is
// renamed if a profile with the same name already exists.
export function importProfileJson(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Format inattendu' };
  }
  const env = parsed as Partial<ExportEnvelope>;
  if (typeof env.version !== 'number' || env.version > EXPORT_VERSION) {
    return {
      ok: false,
      error: 'Version d’export non reconnue (mise à jour de md2pdf nécessaire ?)',
    };
  }
  if (typeof env.name !== 'string' || !env.settings) {
    return { ok: false, error: 'Champ "name" ou "settings" manquant' };
  }
  const entry = createProfile(env.name, env.settings);
  return { ok: true, profile: entry };
}
