/********************************* editor-color.ts *****************************
 *
 * Purpose: Manage the editor-pane text color preference (independent from PDF
 *   document colors), persisted in localStorage and applied via a CSS var.
 * How: Module-level cache + subscriber set; `apply` writes `--editor-text-color`
 *   on `:root`; setter validates hex, persists, notifies subscribers.
 *
 *******************************************************************************/

// Editor-pane text colour preference. Like editor-font.ts, this is a
// personal UI choice — independent from the document's preview/PDF
// colours (those live in PdfSettings.styles per heading level).
// Stored in localStorage so it persists, applied via a CSS custom
// property on :root so the change is live without an editor reload.

const KEY = 'markpage:editor-text-color';
const CSS_VAR = '--editor-text-color';

// Matches the current --text token (near-black). Used both as the
// initial value when no preference is stored and as the visible
// "default" choice in the picker.
export const DEFAULT_EDITOR_TEXT_COLOR = '#1f2328';

let current: string = DEFAULT_EDITOR_TEXT_COLOR;

/**
 * Purpose: Write the color to the `--editor-text-color` CSS var on `:root`.
 * How: Set the inline style on `document.documentElement`; no-op outside the DOM.
 */
function apply(color: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(CSS_VAR, color);
  }
}

/**
 * Purpose: Cheap validation that a string is a `#rgb` or `#rrggbb` literal.
 * How: Single regex test; everything else falls back to the default elsewhere.
 */
// Cheap validation — anything that doesn't look like a `#rrggbb` or
// `#rgb` literal is treated as missing so we fall back to the
// default rather than letting a stray value reach the CSS.
function isHexColor(s: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

/**
 * Purpose: Load the stored color (or default), apply it to the DOM, return it.
 * How: Read localStorage, validate; call `apply`; cache in `current`.
 */
export function initEditorTextColor(): string {
  const stored = localStorage.getItem(KEY);
  current = stored && isHexColor(stored) ? stored : DEFAULT_EDITOR_TEXT_COLOR;
  apply(current);
  return current;
}

/**
 * Purpose: Return the currently active editor text color.
 * How: Direct read of the module-level cache.
 */
export function getEditorTextColor(): string {
  return current;
}

const subscribers = new Set<() => void>();

/**
 * Purpose: Register a callback that fires whenever the editor color changes.
 * How: Add to the subscriber `Set`; returned closure removes the entry.
 */
export function onEditorTextColorChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/**
 * Purpose: Update the editor text color (persist, apply, notify subscribers).
 * How: Validate, short-circuit if unchanged, write localStorage, apply, snapshot-iterate callbacks.
 */
export function setEditorTextColor(color: string): void {
  if (!isHexColor(color)) return;
  if (color === current) return;
  localStorage.setItem(KEY, color);
  current = color;
  apply(color);
  const callbacks = [...subscribers];
  for (const cb of callbacks) cb();
}
