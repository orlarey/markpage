/******************************** font-loader.ts *******************************
 *
 * Purpose: On-demand loading of Google Fonts via injected `<link>` stylesheets,
 *   plus user-managed custom-font registry on top of a curated bundled catalogue.
 * How: Static JSON catalogue + module-level custom-fonts state; load() dedups
 *   via two maps (`loaded` for done, `inflight` for in-progress promises).
 *
 *******************************************************************************/

import catalog from './assets/google-fonts-catalog.json';
import { t } from './i18n/strings';
import type { CustomFont } from './settings';

/**
 * Purpose: One entry in the font catalogue (curated or user-added).
 * How: `bundled` skips network; `custom` flags user entries for the UI affordance.
 */
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

/**
 * Purpose: Replace the active custom-font registry.
 * How: Overwrites the module-level `customFonts` array.
 */
export function registerCustomFonts(fonts: CustomFont[]): void {
  customFonts = fonts;
}

/**
 * Purpose: Return the full (curated + custom) font catalogue.
 * How: Maps each custom font to a `FontEntry` shape and concatenates.
 */
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

/**
 * Purpose: Look up a catalogue entry by exact family name.
 * How: Linear search over `getFontCatalog()`; null when not found.
 */
export function findFont(name: string): FontEntry | null {
  return getFontCatalog().find((f) => f.name === name) ?? null;
}

/**
 * Purpose: Parse one or more `family=` declarations from a Google Fonts URL.
 * How: Validate host/`family=` params, then split each value at `:` for the name.
 */
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

/**
 * Purpose: Tell whether a family is already locally available (no network).
 * How: True iff the catalogue marks it `bundled: true`.
 */
export function isBundled(name: string): boolean {
  return findFont(name)?.bundled === true;
}

/**
 * Purpose: Quote a family name for use inside a CSS `font-family` declaration.
 * How: Wrap in double quotes when the name contains whitespace; bare otherwise.
 */
export function quoteFontFamily(name: string): string {
  return /\s/.test(name) ? `"${name}"` : name;
}

// Track the families we've already requested so a settings change
// that flips back to a previously-loaded font doesn't re-inject the
// same <link> — and so multiple paged renders don't pile up
// stylesheets.
const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();

/**
 * Purpose: Build the Google Fonts CSS2 URL for one catalogue entry.
 * How: URL-encodes the name and the sorted weight list, with `display=swap`.
 */
function googleCssUrl(entry: FontEntry): string {
  const familyParam = entry.name.replaceAll(/\s+/g, '+');
  // The `:wght@…` syntax is what Google Fonts exposes via css2.
  const weights = entry.weights.slice().sort((a, b) => a - b).join(';');
  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weights}&display=swap`;
}

/**
 * Purpose: Idempotently load a Google Font family, awaiting the actual face load.
 * How: Custom-fonts path uses their URL directly; catalogue path builds the URL.
 */
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

/**
 * Purpose: Inject one `<link rel="stylesheet">` into `<head>` and resolve when ready.
 * How: Reuse an existing tagged link, else create one and resolve on load/error.
 */
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

/**
 * Purpose: Minimal CSS attribute-selector escape for our `link[data-…]` query.
 * How: Escape `"` (catalogue URLs don't contain anything else needing escape).
 */
function cssEscape(s: string): string {
  return s.replaceAll('"', String.raw`\"`);
}

/**
 * Purpose: Return every font family referenced by effective document settings.
 * How: Start with the three global slots, then add non-empty per-element overrides;
 *   a Set both removes duplicates and preserves a stable loading order.
 */
export function settingsFontFamilies(settings: {
  fonts: { headings: string; body: string; code: string };
  styles: Record<string, { family?: string }>;
}): string[] {
  const families = new Set([
    settings.fonts.headings,
    settings.fonts.body,
    settings.fonts.code,
  ]);
  for (const style of Object.values(settings.styles)) {
    const family = style.family?.trim();
    if (family) families.add(family);
  }
  return [...families].filter((family) => family.trim() !== '');
}

/**
 * Purpose: Load all fonts that can affect one document, including element-level
 *   overrides selected in the typography cards.
 * How: Collect the effective family names, then use the same idempotent loader
 *   as the global trio. This prevents an override such as body = EB Garamond
 *   from silently falling through to Roboto because only the trio was loaded.
 */
export async function loadSettingsFonts(settings: {
  fonts: { headings: string; body: string; code: string };
  styles: Record<string, { family?: string }>;
}): Promise<void> {
  await Promise.all(settingsFontFamilies(settings).map(loadGoogleFont));
}
