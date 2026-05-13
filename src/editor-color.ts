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

function apply(color: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(CSS_VAR, color);
  }
}

// Cheap validation — anything that doesn't look like a `#rrggbb` or
// `#rgb` literal is treated as missing so we fall back to the
// default rather than letting a stray value reach the CSS.
function isHexColor(s: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

export function initEditorTextColor(): string {
  const stored = localStorage.getItem(KEY);
  current = stored && isHexColor(stored) ? stored : DEFAULT_EDITOR_TEXT_COLOR;
  apply(current);
  return current;
}

export function getEditorTextColor(): string {
  return current;
}

const subscribers = new Set<() => void>();

export function onEditorTextColorChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function setEditorTextColor(color: string): void {
  if (!isHexColor(color)) return;
  if (color === current) return;
  localStorage.setItem(KEY, color);
  current = color;
  apply(color);
  const callbacks = [...subscribers];
  for (const cb of callbacks) cb();
}
