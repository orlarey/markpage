/********************************* demo.ts *************************************
 *
 * Purpose: Minimal entry point for the showcase iframe — renders a single
 *   snippet through the paginated preview pipeline (no editor, no storage).
 * How: Parse URL params (`?id`, `?lang`, `?style`), resolve the snippet, then
 *   build + paginate the same DOM subtree the main preview produces.
 *
 *******************************************************************************/

// Minimal entry point for the showcase iframe.
// URL params:
//   ?id=<snippet-id>     (defaults to "playground", which is an empty doc)
//   ?lang=fr|en          (optional; overrides the visitor's UI locale)
//   ?style=<preset-id>   (optional; picks a curated PdfSettings preset
//                         from style-presets.ts — used by the "compare
//                         stylings" showcase segment)
//
// The runtime is intentionally tiny: no toolbar, no editor, no
// storage. We just paginate the snippet through the same paged.js
// pipeline as the main app's preview, so the iframe is a faithful
// render of what the PDF would look like.

// Same `@fontsource` bundle as main.ts so the iframe paints in the
// expected fonts on first frame instead of falling back to the
// system stack.
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/500.css';
import '@fontsource/roboto-condensed/400-italic.css';
import '@fontsource/roboto-condensed/500-italic.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';

import 'highlight.js/styles/atom-one-light.css';
import '@orlarey/blocks/styles.css';
import '@orlarey/markpage-render/constructs.css';
import './style.css';
import '@orlarey/markpage-render'; // side-effect: registers admonitions / math / etc.

import { registerFallbackFonts } from './fonts';
import { loadSettingsFonts } from './font-loader';
import { initLocale } from './i18n/locale';
import {
  annotateSourceLines,
  applyPreviewMetadata,
  applyPreviewStyles,
  renderPreview,
} from './preview';
import {
  renderMathBlocks,
  renderMathInlines,
  renderMermaidBlocks,
} from '@orlarey/markpage-render';
import { parseFrontmatter } from '@orlarey/markpage-render';
import { layoutMosaicBlocks } from '@orlarey/markpage-render';
import { pageContentGeomPx, paginate } from './preview-paginated';
import { applyFrontmatterToSettings, DEFAULT_SETTINGS, type PdfSettings } from './settings';
import {
  findShowcaseEntry,
  HERO_DEMO_ENTRY,
  PLAYGROUND_ENTRY,
} from './showcase-data';
import type { ShowcaseEntry } from './showcase-types';
import { applyStylePreset } from './style-presets';

/**
 * Purpose: Entry — resolve params, build preview DOM, paginate into `#preview-pane`.
 * How: Read URL params, pick the showcase entry, apply style preset on default settings.
 */
async function run(): Promise<void> {
  const params = new URLSearchParams(globalThis.location.search);
  const id = params.get('id') ?? 'playground';
  const langOverride = params.get('lang');
  if (langOverride === 'fr' || langOverride === 'en') {
    // Persist before initLocale so the iframe picks up the parent's
    // language. This writes to localStorage but the demo iframe is
    // a same-origin sandbox the visitor never sees, so it's fine.
    localStorage.setItem('markpage:ui-lang', langOverride);
  }
  initLocale();

  document.body.classList.add('demo-frame-body');

  // Hero iframe gets a curated rich snippet so the hero looks
  // populated above the fold (cf. showcase.ts). `playground` keeps
  // the empty-canvas slot. Everything else looks up the curated
  // section snippets.
  const resolveEntry = (): ShowcaseEntry => {
    if (id === 'hero') return HERO_DEMO_ENTRY;
    if (id === 'playground') return PLAYGROUND_ENTRY;
    return findShowcaseEntry(id) ?? PLAYGROUND_ENTRY;
  };
  const entry = resolveEntry();

  // The demo runs on default typography but blanks the metadata
  // (author / organisation / date) — the snippet is a feature
  // sample, not someone's actual document. If `?style=<id>` is
  // present, the preset overrides apply on top of the defaults so
  // the same source can be compared under several stylings.
  const baseSettings: PdfSettings = {
    ...DEFAULT_SETTINGS,
    author: { ...DEFAULT_SETTINGS.author, show: false },
    organization: { ...DEFAULT_SETTINGS.organization, show: false },
    date: { mode: 'none', custom: '' },
  };
  const settings = applyStylePreset(baseSettings, params.get('style'));

  applyPreviewStyles(settings);

  // Fire-and-forget the font loading. paged.js' first render uses
  // whatever's available; once the fonts resolve the next paint
  // picks them up.
  void registerFallbackFonts().catch(() => undefined);
  void loadSettingsFonts(settings).catch(() => undefined);

  const previewEl = document.getElementById('preview-pane') as HTMLElement;

  // Build the same DOM subtree as the main preview pipeline, then
  // hand it to paged.js.
  const built = document.createElement('div');
  const { meta } = parseFrontmatter(entry.source);
  const effectiveSettings = applyFrontmatterToSettings(settings, meta);
  renderPreview(built, entry.source);
  applyPreviewMetadata(built, effectiveSettings, meta);
  annotateSourceLines(built, entry.source);
  const preamble = meta['mathjax-preamble'] ?? '';
  await Promise.all([
    renderMermaidBlocks(built),
    renderMathBlocks(built, effectiveSettings.mathFontSet, preamble),
    renderMathInlines(built, effectiveSettings.mathFontSet, preamble),
    layoutMosaicBlocks(built, pageContentGeomPx(effectiveSettings)),
  ]);
  await paginate(built, effectiveSettings, previewEl);
}

void run().catch((err: unknown) => {
  console.error('Demo render failed', err);
});
