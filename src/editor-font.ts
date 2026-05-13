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

function apply(font: EditorFont): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(CSS_VAR, FONT_CSS[font]);
  }
}

export function initEditorFont(): EditorFont {
  const stored = localStorage.getItem(KEY);
  current = (SUPPORTED as string[]).includes(stored ?? '')
    ? (stored as EditorFont)
    : 'sans';
  apply(current);
  return current;
}

export function getEditorFont(): EditorFont {
  return current;
}

const subscribers = new Set<() => void>();

export function onEditorFontChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

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
