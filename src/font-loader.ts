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

export interface FontEntry {
  name: string;
  family: 'sans' | 'serif' | 'mono';
  weights: number[];
  bundled?: boolean;
}

const CATALOG: FontEntry[] = catalog as FontEntry[];

export function getFontCatalog(): FontEntry[] {
  return CATALOG;
}

export function findFont(name: string): FontEntry | null {
  return CATALOG.find((f) => f.name === name) ?? null;
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
  if (cached) return cached;
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
      `link[data-md2pdf-font="${cssEscape(href)}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset['md2pdfFont'] = href;
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
  return s.replaceAll('"', '\\"');
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
