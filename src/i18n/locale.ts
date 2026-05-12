// User-interface locale. Independent from the document language
// (which lives in PdfSettings, per SPEC). Detected from
// navigator.language the first time and then pinned in localStorage
// under `markpage:ui-lang`. The user can override it from the
// Réglages select; switching triggers a full page reload because
// every toolbar / menu / form was built once on bootstrap and we'd
// otherwise have to track each translated text node.

const KEY = 'markpage:ui-lang';

export type Language = 'fr' | 'en';

const SUPPORTED: Language[] = ['fr', 'en'];

// Inspect `navigator.language` ("fr-FR", "en-US", "de-DE", …) and
// project onto the locales we ship. Default to English when we
// don't recognise the prefix.
export function detectLanguage(): Language {
  const raw = (globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase();
  return (SUPPORTED as string[]).includes(raw) ? (raw as Language) : 'en';
}

// Module-level cache so `t(key)` doesn't hit localStorage on every
// call. `initLocale()` populates this at bootstrap.
let current: Language = 'en';

export function initLocale(): Language {
  const stored = localStorage.getItem(KEY);
  if (stored && (SUPPORTED as string[]).includes(stored)) {
    current = stored as Language;
  } else {
    current = detectLanguage();
    localStorage.setItem(KEY, current);
  }
  // Mirror onto <html lang="…"> so screen readers / browser spell-
  // check pick up the user's choice.
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
  }
  return current;
}

export function getLanguage(): Language {
  return current;
}

// Subscribers called whenever the active locale changes. Used so the
// long-lived UI elements (toolbar, open help window, …) can rebuild
// themselves with the new strings without a full page reload — the
// reload approach broke the moment the change came from the
// detached Réglages popup (it reloaded the popup, not the parent).
const subscribers = new Set<() => void>();

export function onLanguageChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// Persists the new locale, updates the module cache, mirrors onto
// <html lang>, and fires every subscriber so each long-lived UI
// surface can repaint. Caller (typically the Réglages form's UI-lang
// select) is responsible for refreshing **itself** — the subscribers
// model handles the rest of the app.
export function setLanguage(lang: Language): void {
  if (lang === current) return;
  localStorage.setItem(KEY, lang);
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  // Snapshot first — a subscriber unsubscribing during iteration
  // would otherwise mutate the live Set.
  const callbacks = [...subscribers];
  for (const cb of callbacks) cb();
}
