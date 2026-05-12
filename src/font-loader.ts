// Loads Google Fonts on demand by injecting a <link rel="stylesheet">
// into <head>. The catalogue is bundled at build time
// (src/assets/google-fonts-catalog.json), so there's no runtime fetch
// of font metadata, no API key, and no third-party SDK — just one
// lightweight CSS request per requested family.
//
// Bundled families (Roboto Condensed, Roboto Mono, …) skip the
// network entirely: they're already available through @fontsource
// imports in main.ts.

import catalog from './assets/google-fonts-catalog.json';
import { t } from './i18n/strings';
import type { CustomFont } from './settings';

export interface FontEntry {
  name: string;
  family: 'sans' | 'serif' | 'mono';
  weights: number[];
  bundled?: boolean;
  // User-added via the "Polices personnalisées" section, not part of
  // the curated catalogue. Drives the trash-can affordance in the UI.
  custom?: boolean;
}

const CATALOG: FontEntry[] = catalog as FontEntry[];

// User-added fonts. Populated by `registerCustomFonts` at bootstrap
// and whenever the Réglages panel mutates the list. Kept as module-
// level mutable state because the loader and the catalogue-getter
// both read it and we never want them to drift.
let customFonts: CustomFont[] = [];

// Replace the active custom-font registry. Call sites: app bootstrap
// (right after loadSettings) and the Réglages add/remove handlers.
export function registerCustomFonts(fonts: CustomFont[]): void {
  customFonts = fonts;
}

export function getFontCatalog(): FontEntry[] {
  const customEntries: FontEntry[] = customFonts.map((f) => ({
    name: f.name,
    // We don't know the script category a custom Google Font belongs
    // to; tag it `sans` so it shows up in the headings / body slots
    // out of the box. The picker also includes custom fonts in the
    // mono slot via an explicit pass — see `fontField` in settings-form.
    family: 'sans',
    weights: [400],
    custom: true,
  }));
  return [...CATALOG, ...customEntries];
}

export function findFont(name: string): FontEntry | null {
  return getFontCatalog().find((f) => f.name === name) ?? null;
}

// Pulls one or more `family=` declarations out of a Google Fonts
// stylesheet URL. Discriminated union so the caller can branch on
// success vs. validation failure.
export function parseGoogleFontsUrl(
  raw: string,
): { ok: true; fonts: CustomFont[] } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: t('fonts.custom-fonts-invalid-url') };
  }
  if (parsed.host !== 'fonts.googleapis.com') {
    return { ok: false, error: t('fonts.custom-fonts-bad-host') };
  }
  const families = parsed.searchParams.getAll('family');
  if (families.length === 0) {
    return { ok: false, error: t('fonts.custom-fonts-no-family') };
  }
  // Each `family=` value is `Name+With+Spaces[:wght@…][:ital@…]`.
  // We only care about the name; the rest is the URL's job.
  const fonts = families.map((f) => ({
    name: f.split(':')[0].replaceAll('+', ' '),
    url: raw.trim(),
  }));
  return { ok: true, fonts };
}

// Whether the browser already has this family available without
// hitting the network (either bundled via @fontsource, or unknown to
// us — in which case the user has typed it manually and we trust the
// system fallback).
export function isBundled(name: string): boolean {
  return findFont(name)?.bundled === true;
}

// Used inside CSS `font-family` declarations. Wraps in quotes if the
// name contains spaces; leaves it bare otherwise. Generic fallback
// is the caller's job (e.g. ', sans-serif').
export function quoteFontFamily(name: string): string {
  return /\s/.test(name) ? `"${name}"` : name;
}

// Track the families we've already requested so a settings change
// that flips back to a previously-loaded font doesn't re-inject the
// same <link> — and so multiple paged renders don't pile up
// stylesheets.
const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();

// Builds the Google Fonts CSS2 URL for one entry. We always request
// `display=swap` so a slow network doesn't blank the document while
// the font loads — the user keeps reading in the fallback meanwhile.
function googleCssUrl(entry: FontEntry): string {
  const familyParam = entry.name.replaceAll(/\s+/g, '+');
  // The `:wght@…` syntax is what Google Fonts exposes via css2.
  const weights = entry.weights.slice().sort((a, b) => a - b).join(';');
  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weights}&display=swap`;
}

export async function loadGoogleFont(name: string): Promise<void> {
  if (loaded.has(name)) return;
  const cached = inflight.get(name);
  if (cached !== undefined) return cached;
  // Custom (user-pasted) fonts: we already have the full CSS URL,
  // skip the catalogue lookup and inject directly.
  const customEntry = customFonts.find((f) => f.name === name);
  if (customEntry !== undefined) {
    const promise = injectStylesheet(customEntry.url).then(async () => {
      try {
        await document.fonts.load(`400 16px "${name}"`);
      } catch {
        // Ignore: see comment in the catalogue path below.
      }
      loaded.add(name);
    });
    inflight.set(name, promise);
    try {
      await promise;
    } finally {
      inflight.delete(name);
    }
    return;
  }
  const entry = findFont(name);
  if (!entry || entry.bundled) {
    // Either we don't know the font (treat as already loaded — the
    // browser will resolve it however it can) or it's bundled
    // through @fontsource and there's nothing more to do.
    loaded.add(name);
    return;
  }
  const url = googleCssUrl(entry);
  const promise = injectStylesheet(url).then(async () => {
    // Wait for the actual font files to be ready, not just the CSS,
    // so the caller can repaginate confidently. document.fonts.load
    // accepts a CSS shorthand `Xpx "Family"`; we ask for one of the
    // declared weights.
    const weight = entry.weights[0];
    try {
      await document.fonts.load(`${weight} 16px "${entry.name}"`);
    } catch {
      // FontFaceSet rejects on parse errors but never on missing
      // glyphs — we ignore so a typo'd family name doesn't keep us
      // re-trying forever.
    }
    loaded.add(name);
  });
  inflight.set(name, promise);
  try {
    await promise;
  } finally {
    inflight.delete(name);
  }
}

function injectStylesheet(href: string): Promise<void> {
  return new Promise((resolve) => {
    // Reuse if the same href was injected by a prior call (idempotent
    // even across hot reloads).
    const existing = document.head.querySelector<HTMLLinkElement>(
      `link[data-markpage-font="${cssEscape(href)}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset['markpageFont'] = href;
    // Resolve on either load or error — a network failure shouldn't
    // block the whole render; the document will fall back to its
    // generic family (the CSS we generate always tails with one).
    const settle = (): void => resolve();
    link.addEventListener('load', settle, { once: true });
    link.addEventListener('error', settle, { once: true });
    document.head.appendChild(link);
  });
}

// Minimal CSS attribute-selector escape — the catalogue is curated,
// so the only special character we expect inside a Google Fonts URL
// is the colon between hostname / port and the path. We escape the
// quote in case a future entry slips one through.
function cssEscape(s: string): string {
  return s.replaceAll('"', String.raw`\"`);
}

// Convenience for callers (bootstrap, settings change handler) that
// need to make sure all three slots — headings / body / code — are
// available before re-rendering.
export async function loadFontTrio(
  trio: { headings: string; body: string; code: string },
): Promise<void> {
  // Dedup so we don't issue two parallel loads when two slots share
  // the same family (a common configuration).
  const families = new Set([trio.headings, trio.body, trio.code]);
  await Promise.all([...families].map((f) => loadGoogleFont(f)));
}
