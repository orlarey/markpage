/********************************* editor-font.ts ******************************
 *
 * Purpose: Manage the editor-pane font preference (sans / mono / serif),
 *   independent from the document's PDF fonts, persisted in localStorage.
 * How: Module-level cache + subscriber set; `apply` writes the `--editor-font-family`
 *   CSS var on `:root`; setter validates, persists, and notifies.
 *
 *******************************************************************************/

// Editor-pane font preference. Independent from PdfSettings (which
// drives the *document's* fonts in the preview / PDF); this one is
// a personal UI choice — some users want a monospace face for
// editing tables, others prefer the proportional Roboto used as the
// app default. Stored in localStorage so it persists across reloads
// and applies to every document / profile.
//
// Mirrors the UI-locale pattern (cf. i18n/locale.ts): module-level
// cache + subscriber set, applied by writing a CSS custom property
// on the root element so the editor picks up the change instantly,
// no reload.

const KEY = 'markpage:editor-font';
const CSS_VAR = '--editor-font-family';

export type EditorFont = 'sans' | 'mono' | 'serif';

const SUPPORTED: EditorFont[] = ['sans', 'mono', 'serif'];

// CSS font-family stacks for each choice. `Roboto` and `Roboto Mono`
// are bundled via @fontsource so they're guaranteed available
// regardless of network. Serif falls back to whatever the OS ships.
const FONT_CSS: Record<EditorFont, string> = {
  sans: "'Roboto', system-ui, sans-serif",
  mono: "'Roboto Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  serif: "Georgia, 'Times New Roman', serif",
};

let current: EditorFont = 'sans';

/**
 * Purpose: Write the chosen font stack to the `--editor-font-family` CSS var on `:root`.
 * How: Set the inline style on `document.documentElement`; no-op outside the DOM.
 */
function apply(font: EditorFont): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(CSS_VAR, FONT_CSS[font]);
  }
}

/**
 * Purpose: Load the stored font (or default `sans`), apply it to the DOM, return it.
 * How: Read localStorage, validate against `SUPPORTED`; call `apply`; cache in `current`.
 */
export function initEditorFont(): EditorFont {
  const stored = localStorage.getItem(KEY);
  current = (SUPPORTED as string[]).includes(stored ?? '')
    ? (stored as EditorFont)
    : 'sans';
  apply(current);
  return current;
}

/**
 * Purpose: Return the currently active editor font.
 * How: Direct read of the module-level cache.
 */
export function getEditorFont(): EditorFont {
  return current;
}

const subscribers = new Set<() => void>();

/**
 * Purpose: Register a callback that fires whenever the editor font changes.
 * How: Add to the subscriber `Set`; returned closure removes the entry.
 */
export function onEditorFontChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/**
 * Purpose: Update the editor font (persist, apply, notify subscribers).
 * How: Short-circuit if unchanged, write localStorage, apply, snapshot-iterate callbacks.
 */
export function setEditorFont(font: EditorFont): void {
  if (font === current) return;
  localStorage.setItem(KEY, font);
  current = font;
  apply(font);
  // Snapshot first — a subscriber unsubscribing during iteration
  // would otherwise mutate the live Set.
  const callbacks = [...subscribers];
  for (const cb of callbacks) cb();
}
