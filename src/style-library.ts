/******************************** style-library.ts ***************************
 *
 * The named-style LIBRARY (docs/FUNDAMENTAL-SETTINGS.md — "document-style" model).
 *
 * A document references a style by NAME (`document-style:` front-matter key); the
 * complete fundamental style lives here, never in the document. The library is:
 *   - a small set of hard-coded, polished BUILT-IN styles, plus
 *   - the user's own styles, imported from a style file and kept in localStorage.
 *
 * Sharing a `.md` that references an unknown style falls back to a default —
 * a deliberate trade-off (simplicity over self-containment): the style is NOT
 * embedded in the document.
 *
 *****************************************************************************/

import builtinData from './assets/builtin-styles.json';
import {
  applyFundamentalStyle,
  DEFAULT_SETTINGS,
  type FundamentalStyle,
  type PdfSettings,
} from './settings';

export interface NamedStyle {
  /** Stable slug used in `document-style:` and as the library key. */
  key: string;
  /** Human-readable name shown in the Style menu. */
  name: string;
  /** The complete fundamental style (FUNDAMENTAL_STYLE_KEYS), metadata excluded. */
  style: FundamentalStyle;
}

export const BUILTIN_STYLES: NamedStyle[] = builtinData as NamedStyle[];

/** The default style applied when a document names no style (or an unknown one). */
export const DEFAULT_STYLE_KEY = 'note-technique';

const USER_KEY = 'markpage:style-library';

/** Load the user's imported styles from localStorage (tolerant). */
export function loadUserStyles(): NamedStyle[] {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as NamedStyle[]) : [];
  } catch {
    return [];
  }
}

function saveUserStyles(list: NamedStyle[]): void {
  localStorage.setItem(USER_KEY, JSON.stringify(list));
}

/** Add (or replace, by key) a user style. Returns the stored entry. */
export function saveUserStyle(entry: NamedStyle): NamedStyle {
  const list = loadUserStyles().filter((s) => s.key !== entry.key);
  list.push(entry);
  saveUserStyles(list);
  return entry;
}

/** Remove a user style by key (built-ins are untouched). */
export function deleteUserStyle(key: string): void {
  saveUserStyles(loadUserStyles().filter((s) => s.key !== key));
}

/** All styles, user first (a user style may shadow a built-in of the same key). */
export function allStyles(): NamedStyle[] {
  const user = loadUserStyles();
  const seen = new Set(user.map((s) => s.key));
  return [...user, ...BUILTIN_STYLES.filter((s) => !seen.has(s.key))];
}

/** Case-insensitive, slug-tolerant name → NamedStyle lookup. */
export function findStyle(name: string): NamedStyle | null {
  const norm = name.trim().toLowerCase();
  return (
    allStyles().find(
      (s) => s.key.toLowerCase() === norm || s.name.toLowerCase() === norm,
    ) ?? null
  );
}

/**
 * Apply the named style over `base`, returning resolved settings. Unknown name →
 * `base` unchanged and `{ found: false }` so the caller can warn. An empty/absent
 * name is not an error (found: false, base unchanged).
 */
export function applyNamedStyle(
  name: string | undefined,
  base: PdfSettings,
): { settings: PdfSettings; found: boolean; resolvedName?: string } {
  if (!name || !name.trim()) return { settings: base, found: false };
  const hit = findStyle(name);
  if (!hit) return { settings: base, found: false };
  return {
    settings: applyFundamentalStyle(base, hit.style),
    found: true,
    resolvedName: hit.name,
  };
}

/** The default style's resolved settings (over DEFAULT_SETTINGS). */
export function defaultStyledSettings(): PdfSettings {
  const hit = findStyle(DEFAULT_STYLE_KEY);
  return hit
    ? applyFundamentalStyle(DEFAULT_SETTINGS, hit.style)
    : DEFAULT_SETTINGS;
}

// ── Style file interchange (import / export a single named style) ──────────
// A style file is JSON: { "markpage-style-file": 1, "name", "key", "style" }.

const FILE_MARKER = 'markpage-style-file';

export function serializeStyleFile(entry: NamedStyle): string {
  return JSON.stringify(
    { [FILE_MARKER]: 1, name: entry.name, key: entry.key, style: entry.style },
    null,
    2,
  );
}

/** Parse a style file (tolerant). Returns null if it isn't a valid style file. */
export function parseStyleFile(text: string): NamedStyle | null {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    const style = o.style;
    const name = typeof o.name === 'string' ? o.name : undefined;
    if (!style || typeof style !== 'object' || !name) return null;
    const key =
      typeof o.key === 'string' && o.key.trim()
        ? o.key
        : slugify(name);
    return { key, name, style: style as FundamentalStyle };
  } catch {
    return null;
  }
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
