/********************************* main.ts *************************************
 *
 * Purpose: Application entry point — wires the editor, preview, toolbar,
 *   menus, settings, autosave, GC and exports together at bootstrap.
 * How: Imports static assets (fonts / CSS / marked extensions), then runs
 *   `bootstrap()` which resolves locale, migrates storage, mounts UI and
 *   binds global shortcuts.
 *
 *******************************************************************************/

// Embedded Roboto Condensed, in the four variants we use in the PDF:
// regular (400), medium (500, used as "bold"), and their italics. Self-hosted
// so the app keeps working offline (SPEC §7.5).
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/500.css';
import '@fontsource/roboto-condensed/400-italic.css';
import '@fontsource/roboto-condensed/500-italic.css';
// Roboto Mono powers the inline `code` and code blocks in the HTML preview,
// matching the monospace font we register in pdfmake.
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';
import '@fontsource/roboto-mono/400-italic.css';
// Plain Roboto for the brand mark (the `page` half of "markpage").
// Bundled rather than lazy-loaded so the logo paints correctly on
// first frame, before the Google Fonts catalog has had a chance to
// resolve anything.
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';

import 'highlight.js/styles/atom-one-light.css';
import '@orlarey/blocks/styles.css';
import './style.css';
// Side-effect import: registers our marked extensions ($$math$$, …) on the
// shared `marked` instance. Must run before any marked.parse / marked.lexer.
import './marked-config';
import {
  migrateIDBBranding,
  migrateLocalStorageBranding,
} from './branding-migration';
import { initEditorTextColor } from './editor-color';
import { initEditorFont } from './editor-font';
import { initLocale, onLanguageChange } from './i18n/locale';
import { t } from './i18n/strings';
import { registerFallbackFonts } from './fonts';
import { loadFontTrio, registerCustomFonts } from './font-loader';
import { createEditor } from './editor';
import {
  renderPreview,
  debounce,
  applyPreviewStyles,
  applyPreviewMetadata,
  annotateSourceLines,
  renderMermaidBlocks,
  renderMathBlocks,
  renderMathInlines,
} from './preview';
import { parseFrontmatter } from './frontmatter';
import { layoutMosaicBlocks } from './mosaic';
import {
  applyAnchorToEditor,
  applyAnchorToPreview,
  currentPreviewAnchor,
  editorCursorAnchor,
  previewClickAnchor,
} from './scroll-sync';
import { ACCEPT_ATTRIBUTE, importFile } from './import';
import {
  ImportCancelled,
  promptForMissingResources,
} from './ui/missing-resources-modal';
import {
  extractExternalRefs,
  loadMapping,
  mappedShas,
} from './resource-mapping';
import {
  collectImageRefs,
  expandRefsToBlobUrls,
  expandRefsToDataUrls,
  expandRefsToInlineDataUrls,
  extractDataUrlsToStore,
  gcUnusedImages,
  refifyImageUrls,
  rewriteImageRefs,
} from './image';
import { migrateImagesToOpfs } from './image-store';
import { requestPersistentStorage } from './opfs';
import { mountToolbar, type ToolbarControl } from './ui/toolbar';
import { attachStyleContextMenu, openStyleMenu } from './ui/style-menu';
import { openSettingsWindow } from './ui/settings-window';
import { openHelp } from './ui/help-window';
import { openConflictMenu } from './ui/conflict-menu';
import { openFileMenu } from './ui/file-menu';
import { openFilesModal } from './ui/files-modal';
import { openOpenModal } from './ui/open-modal';
import { redo, undo } from '@codemirror/commands';
import helpMdFr from './HELP.fr.md?raw';
import helpMdEn from './HELP.en.md?raw';
import {
  clearDocGithubLink,
  clearDocLink,
  commitDoc,
  createDoc,
  deleteDoc,
  duplicateDoc,
  emptyTrash,
  gcContentBlobs,
  githubLinkOf,
  isGithubLinked,
  isLinked,
  isModified,
  setDocGithubLink,
  updateGithubBaseline,
  linkKind,
  listDocs,
  listTrash,
  loadCommittedContent,
  loadDocContent,
  migrateLegacyDocIfNeeded,
  purgeDoc,
  renameDoc,
  resolveCurrentDoc,
  resolveDocFromUrl,
  restoreDoc,
  revertDoc,
  saveDocContent,
  saveDraft,
  setCurrentDocId,
  setDocLink,
  type DocEntry,
} from './docs';
import {
  dirHasBundle,
  diskContentMtime,
  ensureRwPermission,
  fileHandleMtime,
  fsAccessAvailable,
  type LinkedHandle,
  loadHandle,
  loadSyncedMtime,
  pickDirectory,
  pickMarkdownFileHandle,
  queryRwGranted,
  readBundleFromDir,
  readFileHandle,
  removeHandle,
  saveHandle,
  saveSyncedMtime,
  writeBundleToDir,
  writeFileHandle,
} from './disk-link';
import { applyFrontmatterToSettings, type PdfSettings } from './settings';
import {
  createProfile,
  deleteProfile,
  displayProfileName,
  duplicateProfile,
  ensureActiveProfile,
  exportProfileJson,
  getCurrentProfileId,
  importProfileJson,
  listProfiles,
  loadProfileSettings,
  migrateLegacySettingsIfNeeded,
  renameProfile,
  resetProfile,
  saveProfileSettings,
  setCurrentProfileId,
  type ProfileEntry,
} from './settings-profiles';
import { pageContentGeomPx, paginate } from './preview-paginated';
import { exportViaPrint } from './print-export';
import { exportLatex } from './export-latex';
import {
  GithubError,
  getRemoteContentSha,
  hasToken,
  loadToken,
  pullBundle,
  pushBundle,
  type GithubTarget,
} from './github';
import { initMcp } from './mcp';
import type { McpContext } from './mcp/context';

/**
 * Purpose: Pick the bundled help tutorial matching the active UI locale.
 * How: Switch on the language tag; both blobs are imported as raw strings.
 */
// First-run document is the bundled help tutorial in whichever locale
// matches the resolved UI language. The user can edit or erase it;
// once a doc lives in localStorage, that one wins on reopen and HELP
// stays accessible only via the Aide button.
function helpMdForLocale(lang: 'fr' | 'en'): string {
  return lang === 'fr' ? helpMdFr : helpMdEn;
}

/**
 * Purpose: Filesystem-safe slug for export filenames.
 * How: Strip diacritics, swap non-`[a-zA-Z0-9._-]` for `-`, collapse runs.
 */
// Cheap slug for export filenames. Keeps letters / digits / dashes /
// underscores / dots, replaces anything else with '-', collapses
// runs, trims dashes from the ends. Falls back to "document" when the
// result is empty (e.g. an emoji-only doc name).
function slugifyDocName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return slug === '' ? 'document' : slug;
}

// Base64-encode raw bytes for the MCP export_latex artifact channel (the Go
// bridge decodes them to a temp file). Chunked to stay clear of the
// String.fromCharCode argument-count limit on large buffers.
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

/** Whether a doc is linked to either a disk file/folder or a GitHub repo —
 *  drives the shared 🔗 link badge. */
function linkedAny(e: DocEntry): boolean {
  return isLinked(e) || isGithubLinked(e);
}

/**
 * Purpose: Trigger a browser download of `content` under `filename`.
 * How: Build a Blob, mint a transient object URL, click a synthetic `<a>`.
 */
function downloadTextFile(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Purpose: Sweep IndexedDB image blobs and content blobs not referenced by any doc.
 * How: Collect every `img://<sha>` ref across docs, then `gcUnusedImages` + `gcContentBlobs`.
 */
// Walks every doc, collects every `img://<sha>` ref it carries,
// then drops IndexedDB blobs (resource pool) and `markpage:blobs:*`
// entries (content pool) outside that live set. SPEC §19.3. Run at
// boot and after every autosave so the storage stays bounded.
async function runGC(): Promise<void> {
  try {
    const referenced = new Set<string>();
    // Internal `img://<sha>` refs from every doc — active AND trashed, so
    // trashing a doc (then a GC sweep) never reaps the images it still needs
    // for a later restore.
    for (const e of [...(await listDocs()), ...(await listTrash())]) {
      const c = await loadDocContent(e);
      if (c == null) continue;
      for (const id of collectImageRefs(c)) referenced.add(id);
    }
    // External resource mappings — every SHA the mapping points at is live
    // for as long as any path-entry references it (SPEC §6.5). This keeps
    // imported images alive across docs even when the only thing holding
    // them is the mapping table, not an inline `img://`.
    for (const sha of mappedShas()) referenced.add(sha);
    await gcUnusedImages(referenced);
    await gcContentBlobs();
  } catch (err) {
    console.error('GC failed', err);
  }
}

/**
 * Purpose: One-shot app bootstrap — migrations, locale, fonts, UI, shortcuts.
 * How: Sequenced calls to storage migrations, then editor + toolbar mount,
 *   then event wiring (autosave, view toggle, profile/doc handlers, hotkeys).
 */
async function bootstrap(): Promise<void> {
  // If this page load is returning from the OneDrive OAuth redirect (or
  // the previous click queued a pending upload), let MSAL parse the hash
  // and tell us whether to resume the in-flight save once bootstrap is
  // finished mounting the rest of the app. Restore the original `?doc=`
  // — Microsoft does not preserve query strings across the auth bounce.
  let onedriveResumeUuid: string | null = null;
  if (
    window.location.hash.includes('code=') ||
    window.location.hash.includes('error=') ||
    sessionStorage.getItem('markpage:onedrive-pending')
  ) {
    const { processOAuthRedirect } = await import('./onedrive');
    const r = await processOAuthRedirect();
    onedriveResumeUuid = r.resumeDocUuid;
    if (onedriveResumeUuid) {
      const url = new URL(window.location.href);
      url.searchParams.set('doc', onedriveResumeUuid);
      url.hash = '';
      window.history.replaceState({}, '', url.toString());
    }
  }

  // `?import=<encoded>` is a self-contained share link: gunzip the
  // payload, create a new local doc from it, then rewrite the URL to
  // `?doc=<uuid>` so a refresh won't re-import. We do this BEFORE the
  // doc-resolution cascade below so the new doc lands as `currentDoc`.
  const importParam = new URL(window.location.href).searchParams.get('import');
  if (importParam) {
    try {
      const { decodeShareContent } = await import('./share-url');
      const source = await decodeShareContent(importParam);
      const created = await createDoc(t('share.imported-doc-name'), source);
      const url = new URL(window.location.href);
      url.searchParams.delete('import');
      url.searchParams.set('doc', created.uuid);
      window.history.replaceState({}, '', url.toString());
    } catch (err) {
      console.error('Share import failed', err);
      globalThis.alert(
        t('share.import-failed', {
          msg: err instanceof Error ? err.message : String(err),
        }),
      );
      // Strip the bad param so refresh doesn't loop the error.
      const url = new URL(window.location.href);
      url.searchParams.delete('import');
      window.history.replaceState({}, '', url.toString());
    }
  }

  // One-shot rebranding migration: rename every `md2pdf:` localStorage
  // key and the legacy IndexedDB database into the `markpage` namespace.
  // Idempotent, runs before any other storage module is touched.
  migrateLocalStorageBranding();
  await migrateIDBBranding().catch((err: unknown) => {
    console.error('IDB branding migration failed', err);
  });

  // Resolve the UI locale before any component reads `t(...)` at
  // construction time. First-launch detection via navigator.language;
  // subsequent runs read the value the user pinned via Réglages.
  const uiLocale = initLocale();

  // Apply the editor-pane font + colour preferences before the
  // editor mounts — each writes a CSS custom property on :root which
  // #editor-pane consumes. Sane defaults; the user can switch from
  // Réglages.
  initEditorFont();
  initEditorTextColor();

  // Register the Noto fallback fonts (full TTFs, not subsetted) so the HTML
  // preview's font cascade has the same coverage as the PDF. Fire and
  // forget — the browser starts using the fonts as soon as they're loaded.
  void registerFallbackFonts().catch((err: unknown) => {
    console.error('Fallback font registration failed', err);
  });

  const toolbarEl = document.getElementById('toolbar') as HTMLElement;
  const panesEl = document.getElementById('panes') as HTMLElement;
  const editorEl = document.getElementById('editor-pane') as HTMLElement;
  const previewEl = document.getElementById('preview-pane') as HTMLElement;

  // Bring any legacy single-settings install into the multi-profile
  // schema, then guarantee at least one profile exists so the rest of
  // bootstrap has *some* settings to render against.
  await migrateLegacySettingsIfNeeded();
  // Seed the very first profile's doc language with whatever locale
  // we resolved for the UI (above) — `en-*` users get an English doc
  // (English babel, English-style date) by default.
  const activeProfile = await ensureActiveProfile(uiLocale);
  const state: {
    settings: PdfSettings;
    profileId: string;
  } = {
    settings: loadProfileSettings(activeProfile.uuid),
    profileId: activeProfile.uuid,
  };

  // Custom fonts must be registered BEFORE loadFontTrio so the loader
  // sees them when the trio resolves the active heading / body / code
  // selections (any of which may point at a custom family).
  registerCustomFonts(state.settings.customFonts);

  // Pre-load the user's active font trio (headings / body / code).
  // Fire and forget — the page renders with the bundled fallback
  // until the Google Fonts CSS resolves. The next paginate() call
  // will pick up the right family because pagedCss is regenerated
  // each time.
  void loadFontTrio(state.settings.fonts).catch((err: unknown) => {
    console.error('Font trio preload failed', err);
  });

  // Storage migrations, in order:
  //  1. Mono-doc legacy (markpage:doc) → first entry in the new doc
  //     index. Idempotent.
  //  2. IndexedDB image keys: UUID → SHA-256. Returns a mapping the
  //     caller applies to every doc's markdown so `img://<uuid>`
  //     references follow.
  //  3. If step 2 produced any rewrites, patch each doc's content in
  //     place (saveDocContent re-hashes and updates the index).
  // Ask the browser to make OPFS storage persistent (anti-eviction).
  // Best-effort, fire-and-forget — never blocks boot.
  void requestPersistentStorage();
  await migrateLegacyDocIfNeeded();
  try {
    const mapping = await migrateImagesToOpfs();
    if (mapping.size > 0) {
      for (const e of await listDocs()) {
        const c = await loadDocContent(e);
        if (c == null) continue;
        const rewrote = rewriteImageRefs(c, mapping);
        if (rewrote !== c) await saveDocContent(e.uuid, rewrote);
      }
    }
  } catch (err) {
    console.error('Image store migration failed', err);
  }

  // Doc selection cascade at boot:
  //   1. `?doc=<uuid>` in the URL — lets bookmarks, shared links, and
  //      a second tab address a specific doc independently of the
  //      persisted "current" pointer.
  //   2. `markpage:current-doc` in localStorage — the last doc the
  //      user worked on in this browser.
  //   3. Empty index → seed with the bundled help tutorial.
  // `currentDoc` is mutable: switching, creating, or deleting a doc
  // points it at the new entry, and the toolbar / autosave read its
  // current value via the closure.
  let currentDoc: DocEntry =
    (await resolveDocFromUrl()) ??
    (await resolveCurrentDoc()) ??
    (await createDoc(t('default.help-doc-name'), helpMdForLocale(uiLocale)));
  // setCurrentDocId now also mirrors the active doc into the URL, so
  // a reload (no param) and a parallel tab (with this param) both
  // converge on the same source of truth.
  await setCurrentDocId(currentDoc.uuid);
  const initialDoc = (await loadDocContent(currentDoc)) ?? '';

  // Boot-time GC. Cleans up anything left over from a crash mid-save
  // or from a previous version that didn't run content GC. Fire and
  // forget — nothing in the editor pipeline depends on the storage
  // being tight at startup.
  void runGC();

  // Single-pane UX: only one of editor/preview is visible at a time.
  // The user toggles with Cmd/Ctrl+Enter; clicking inside the preview
  // also returns to the editor with the cursor placed on the clicked
  // line. This decouples editing from pagination — re-paginate fires
  // only when the user explicitly enters preview mode (and the doc has
  // changed since the last render), never during a typing burst.
  let viewMode: 'editor' | 'preview' = 'editor';
  // True when the on-screen preview is out of date with the current
  // editor state or settings. Set on every doc/settings change, cleared
  // after a successful paginate.
  let dirty = true;

  // We only show the latest paginate call's output. A previous in-flight
  // render must not overwrite a more recent one.
  let previewReqId = 0;

  // Presentation mode: a fullscreen overlay laid over the existing
  // paginated preview. We reuse the same paged.js render — no separate
  // DOM, no re-pagination — and just show one `.pagedjs_page` at a time,
  // scaled to fill the screen, navigated with the keyboard. `returnMode`
  // remembers whether we came from the editor or the preview so we can
  // restore it on exit. See enterPresentation() / exitPresentation() below.
  let presenting = false;
  let slideIndex = 0;
  let returnMode: 'editor' | 'preview' = 'editor';

  // Auto-fit-to-width: shrink the paginated pages so a page fits the preview
  // pane — never upscale past 100% (wide screens keep the natural centred
  // look; narrow panes / phones stop overflowing). Driven by the
  // `--mp-fit-zoom` CSS var (applied to `.pagedjs_page` via `zoom`), so the
  // page flow reflows and vertical-scroll / click-to-source stay correct.
  // No-op outside preview and during fullscreen presentation (its own scaling).
  const PREVIEW_FIT_GUTTER = 28; // px breathing room + scrollbar allowance
  const fitPreviewWidth = (): void => {
    const firstPage = previewEl.querySelector<HTMLElement>('.pagedjs_page');
    if (!firstPage) return;
    if (presenting || viewMode !== 'preview' || previewEl.clientWidth === 0) {
      previewEl.style.removeProperty('--mp-fit-zoom');
      return;
    }
    previewEl.style.setProperty('--mp-fit-zoom', '1'); // reset to read natural width
    const natural = firstPage.getBoundingClientRect().width;
    if (natural === 0) return;
    const factor = Math.min(
      1,
      (previewEl.clientWidth - PREVIEW_FIT_GUTTER) / natural,
    );
    previewEl.style.setProperty('--mp-fit-zoom', String(factor));
  };

  // Builds the rendered DOM subtree (Markdown + post-processing) and
  // hands it to paged.js. Called only when entering preview mode (or on
  // settings change while in preview); never during typing.
  const updatePreview = async (source: string): Promise<void> => {
    const myReq = ++previewReqId;
    const resolved = await expandRefsToBlobUrls(source);
    const { meta } = parseFrontmatter(resolved);
    // Frontmatter can override page-format-level settings (e.g.
    // `slides: true` forces `pageSize: SLIDES_16_9`); compute the
    // effective settings once and use them for pagination.
    const effectiveSettings = applyFrontmatterToSettings(state.settings, meta);
    const built = document.createElement('div');
    renderPreview(built, resolved);
    applyPreviewMetadata(built, effectiveSettings, meta);
    annotateSourceLines(built, source);
    const preamble = meta['mathjax-preamble'] ?? '';
    // Mosaic packing needs the text-block size. Compute it deterministically
    // from settings (NOT by measuring a prior render) so the row count is the
    // same on a cold/first render as on subsequent ones.
    const mosaicGeom = pageContentGeomPx(effectiveSettings);
    await Promise.all([
      renderMermaidBlocks(built),
      renderMathBlocks(built, effectiveSettings.mathFontSet, preamble),
      renderMathInlines(built, effectiveSettings.mathFontSet, preamble),
      layoutMosaicBlocks(built, mosaicGeom),
    ]);
    if (myReq !== previewReqId) return;
    await paginate(built, effectiveSettings, previewEl);
    if (myReq !== previewReqId) return;
    dirty = false;
    fitPreviewWidth();
  };

  // Autosave writes the *working copy* (draft), never the committed content
  // — the committed version stays the "version de départ" until an explicit
  // Save (Phase 2 working-copy model, SPEC §6). The uuid is captured at edit
  // time so a debounced save can't land on a doc switched-to meanwhile.
  const debouncedSaveDraft = debounce((uuid: string, source: string) => {
    void (async () => {
      try {
        const updated = await saveDraft(uuid, source);
        // No image-GC here: a cut-paste cycle would otherwise drop the blob
        // between the cut and the paste; orphans are reaped by runGC at boot.
        if (currentDoc.uuid === uuid) {
          currentDoc = updated;
          toolbarCtrl.setModified(isModified(updated));
        }
      } catch (err) {
        console.error('Autosave (draft) failed', err);
      }
    })();
  }, 200);

  applyPreviewStyles(state.settings);

  const editor = createEditor(editorEl, initialDoc, (doc) => {
    // Edits mark the preview dirty (re-paginate on next toggle) and
    // auto-persist the working copy.
    dirty = true;
    debouncedSaveDraft(currentDoc.uuid, doc);
  });

  attachStyleContextMenu(editor.view.dom, editor.view);

  // Assigned in renderToolbar() below before any user input has the
  // chance to fire setViewMode().
  let toolbarCtrl!: ToolbarControl;

  const setViewMode = (mode: 'editor' | 'preview'): void => {
    viewMode = mode;
    panesEl.dataset['view'] = mode;
    toolbarCtrl.setViewMode(mode);
  };

  // editor → preview. Snapshot the cursor's anchor before flipping the
  // panes (the editor's measurements need to be read while it's still
  // visible), then paginate if dirty, then align the preview to the
  // snapshot so the same source line lands at the same viewport y.
  const enterPreview = async (): Promise<void> => {
    const anchor = editorCursorAnchor(editor.view);
    setViewMode('preview');
    if (dirty) {
      try {
        await updatePreview(editor.getValue());
      } catch (err) {
        console.error('Preview render failed', err);
      }
    }
    fitPreviewWidth();
    if (anchor) applyAnchorToPreview(previewEl, anchor);
    previewEl.focus();
  };

  // preview → editor. If `anchor` is provided (preview click), the
  // cursor lands on the matching line at the click's viewport y;
  // otherwise we just unhide the editor with the cursor wherever it
  // already was.
  const enterEditor = (anchor: { line: number; y: number } | null): void => {
    setViewMode('editor');
    if (anchor) applyAnchorToEditor(editor.view, anchor);
    editor.view.focus();
  };

  const toggleView = (): void => {
    if (viewMode === 'editor') void enterPreview();
    else enterEditor(null);
  };

  // Click inside the preview returns to the editor at that source line —
  // except when the click hits a real hyperlink (cross-ref, footnote
  // ref, citation back-link, external link…). Then we honour the link:
  // in-doc fragments scroll the preview, external URLs open in a new
  // tab so markpage stays put.
  previewEl.addEventListener('click', (e) => {
    if (viewMode !== 'preview') return;
    // While presenting, clicks advance the slideshow (handled by
    // onPresentClick); don't bounce back to the editor.
    if (presenting) return;
    const link = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
      'a[href]',
    );
    if (link) {
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('#')) return; // browser handles anchor scroll
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener');
      return;
    }
    const anchor = previewClickAnchor(e, previewEl);
    if (anchor) enterEditor(anchor);
  });

  // ---- Presentation mode -------------------------------------------------

  // Lay out the current slide: reveal only its page (via `.is-current`)
  // and scale it to fill the viewport while keeping its aspect ratio.
  // We read offsetWidth/Height — paged.js's fixed layout size in px,
  // unaffected by our own transform — so the ratio stays correct and the
  // computation is stable across repeated calls (e.g. on resize).
  const renderSlide = (): void => {
    const pages = Array.from(
      previewEl.querySelectorAll<HTMLElement>('.pagedjs_page'),
    );
    if (pages.length === 0) return;
    slideIndex = Math.max(0, Math.min(slideIndex, pages.length - 1));
    pages.forEach((p, i) =>
      p.classList.toggle('is-current', i === slideIndex),
    );
    const page = pages[slideIndex];
    if (!page) return;
    const pw = page.offsetWidth;
    const ph = page.offsetHeight;
    if (pw === 0 || ph === 0) return;
    const scale = Math.min(window.innerWidth / pw, window.innerHeight / ph);
    previewEl.style.setProperty('--present-scale', String(scale));
  };

  const gotoSlide = (i: number): void => {
    slideIndex = i;
    renderSlide();
  };

  // Keyboard nav, live only while presenting (capture phase so it wins
  // over the editor / app shortcuts). Advance: → Space PageDown n.
  // Back: ← PageUp p. Home/End jump to the ends. Esc is left to the
  // browser, which exits fullscreen → fullscreenchange → exitPresentation.
  const onPresentKeydown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
      case 'n':
        e.preventDefault();
        gotoSlide(slideIndex + 1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
      case 'p':
        e.preventDefault();
        gotoSlide(slideIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        gotoSlide(0);
        break;
      case 'End':
        e.preventDefault();
        gotoSlide(Number.MAX_SAFE_INTEGER);
        break;
    }
  };

  // Click on the slide advances — except on a real hyperlink, so in-slide
  // links still work.
  const onPresentClick = (e: MouseEvent): void => {
    if ((e.target as HTMLElement | null)?.closest('a[href]')) return;
    gotoSlide(slideIndex + 1);
  };

  const onPresentResize = (): void => {
    if (presenting) renderSlide();
  };

  // Tear down the presentation overlay and restore the mode we came from.
  // Idempotent and the single exit path — reached from Esc / OS chrome /
  // our own exitFullscreen, all funnelled here via fullscreenchange.
  const exitPresentation = (): void => {
    if (!presenting) return;
    presenting = false;
    window.removeEventListener('keydown', onPresentKeydown, true);
    previewEl.removeEventListener('click', onPresentClick);
    window.removeEventListener('resize', onPresentResize);
    previewEl.classList.remove('presentation');
    previewEl.style.removeProperty('--present-scale');
    previewEl
      .querySelectorAll('.pagedjs_page.is-current')
      .forEach((p) => p.classList.remove('is-current'));
    if (document.fullscreenElement) void document.exitFullscreen();
    if (returnMode === 'editor') enterEditor(null);
    else fitPreviewWidth(); // back to preview → re-fit to the pane
  };

  // Enter fullscreen presentation. We reuse the preview render, so we
  // first force preview mode (paginating if stale). requestFullscreen()
  // MUST be called synchronously within the user gesture — before any
  // await — or the browser rejects it; pagination, if needed, runs
  // alongside. The `.presentation` class is added only AFTER pagination:
  // it hides all but the current page (display:none), and paged.js can't
  // measure hidden pages — applying it earlier collapses the layout to a
  // single empty page.
  const enterPresentation = async (): Promise<void> => {
    if (presenting) return;
    returnMode = viewMode;
    setViewMode('preview'); // sync: makes #preview-pane visible
    const fsRequest = previewEl.requestFullscreen().catch((err) => {
      console.error('Fullscreen request failed', err);
      return 'denied' as const;
    });
    if (dirty) {
      try {
        await updatePreview(editor.getValue());
      } catch (err) {
        console.error('Preview render failed', err);
      }
    }
    const fsResult = await fsRequest;
    if (fsResult === 'denied') {
      if (returnMode === 'editor') enterEditor(null);
      return;
    }
    presenting = true;
    slideIndex = 0;
    previewEl.classList.add('presentation');
    fitPreviewWidth(); // drops the fit-zoom so presentation scaling is clean
    window.addEventListener('keydown', onPresentKeydown, true);
    previewEl.addEventListener('click', onPresentClick);
    window.addEventListener('resize', onPresentResize);
    renderSlide();
  };

  // Single exit trigger: anything that drops us out of fullscreen (Esc,
  // OS chrome, our own exitFullscreen) lands here.
  document.addEventListener('fullscreenchange', () => {
    if (presenting && !document.fullscreenElement) exitPresentation();
  });

  // Re-fit the paginated preview when the pane resizes (window resize,
  // entering preview, panel show/hide). Preview-only, downscale-only.
  const previewResize = new ResizeObserver(() => {
    if (viewMode === 'preview' && !presenting) fitPreviewWidth();
  });
  previewResize.observe(previewEl);

  // Flushes the pending autosave to the *working copy* (draft) if the
  // debounce hasn't fired yet. Called before any operation that swaps the
  // current doc, so unsaved keystrokes persist as the outgoing doc's draft
  // (never committed).
  const flushSave = async (): Promise<void> => {
    try {
      const updated = await saveDraft(currentDoc.uuid, editor.getValue());
      if (currentDoc.uuid === updated.uuid) currentDoc = updated;
    } catch (err) {
      console.error('Flush save failed', err);
    }
  };

  // Loads a different doc into the editor. Saves the outgoing one,
  // swaps `currentDoc`, refreshes the editor's value, drops back to
  // editor mode (any preview rendered for the previous doc is
  // invalid), and notifies the toolbar.
  const switchToDoc = async (uuid: string): Promise<void> => {
    if (uuid === currentDoc.uuid) return;
    await flushSave();
    const target = (await listDocs()).find((e) => e.uuid === uuid);
    if (!target) return;
    currentDoc = target;
    await setCurrentDocId(target.uuid);
    const content = (await loadDocContent(target)) ?? '';
    editor.setValue(content);
    dirty = true;
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setDocName(target.name);
    toolbarCtrl.setModified(isModified(target));
    toolbarCtrl.setLinked(linkedAny(target));
    toolbarCtrl.setConflict(false);
    void checkSync();
  };

  const createNewDoc = async (): Promise<void> => {
    await flushSave();
    const entry = await createDoc('Sans titre');
    currentDoc = entry;
    await setCurrentDocId(entry.uuid);
    editor.setValue('');
    dirty = true;
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setModified(false);
    toolbarCtrl.setLinked(false);
    toolbarCtrl.setDocName(entry.name);
  };

  const renameCurrentDoc = async (newName: string): Promise<void> => {
    const updated = await renameDoc(currentDoc.uuid, newName);
    if (!updated) return;
    currentDoc = updated;
    toolbarCtrl.setDocName(updated.name);
  };

  const renameOtherDoc = async (uuid: string, newName: string): Promise<void> => {
    if (uuid === currentDoc.uuid) {
      await renameCurrentDoc(newName);
      return;
    }
    await renameDoc(uuid, newName);
  };

  // Reloads a doc's content from a file picked via a transient
  // <input type=file>. Replaces the doc's content in place (same uuid,
  // same name); if the doc is the current one the editor is updated
  // live, otherwise we switch to it so the user sees the result.
  const reloadDocFromFile = async (uuid: string): Promise<void> => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = ACCEPT_ATTRIBUTE;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    // Browsers don't fire a reliable cancel event, so we wait only for
    // `change` and leave the transient input attached in the cancel
    // path (it's harmless — display:none, no event handlers leaking).
    const file = await new Promise<File | null>((resolve) => {
      fileInput.addEventListener('change', () => {
        resolve(fileInput.files?.[0] ?? null);
      });
      fileInput.click();
    });
    fileInput.remove();
    if (!file) return;
    try {
      const { content } = await importFile(file);
      // Hoist any inline data URLs into IndexedDB, like the regular
      // import path does.
      const cleaned = await extractDataUrlsToStore(content);
      const updated = await saveDocContent(uuid, cleaned);
      if (uuid === currentDoc.uuid) {
        currentDoc = updated;
        editor.setValue(cleaned);
        dirty = true;
        if (viewMode === 'preview') setViewMode('editor');
        toolbarCtrl.setModified(false);
      } else {
        await switchToDoc(uuid);
      }
    } catch (err: unknown) {
      console.error('Reload failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      globalThis.alert(t('import.failed', { msg }));
    }
  };

  // Deletes a doc. If it was the current one, fall back to the most
  // recent remaining doc, or seed a fresh empty one if the list
  // becomes empty.
  const deleteAndAdjust = async (uuid: string): Promise<void> => {
    const wasCurrent = uuid === currentDoc.uuid;
    await deleteDoc(uuid);
    if (!wasCurrent) {
        return;
    }
    const remaining = await listDocs();
    if (remaining.length === 0) {
      const fresh = await createDoc('Sans titre');
      currentDoc = fresh;
      await setCurrentDocId(fresh.uuid);
      editor.setValue('');
    } else {
      const next = remaining[0];
      currentDoc = next;
      await setCurrentDocId(next.uuid);
      editor.setValue((await loadDocContent(next)) ?? '');
    }
    dirty = true;
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setDocName(currentDoc.name);
    toolbarCtrl.setModified(isModified(currentDoc));
    toolbarCtrl.setLinked(linkedAny(currentDoc));
  };

  // ---- working-copy commands (Phase 2, SPEC §6) -------------------------

  // Save: commit the working copy (draft → committed version). If the doc is
  // linked to a disk folder, also push the committed bundle there.
  const saveCurrentDoc = async (): Promise<void> => {
    await flushSave(); // ensure the latest keystrokes are in the draft first
    currentDoc = await commitDoc(currentDoc.uuid);
    toolbarCtrl.setModified(false);
    if (isLinked(currentDoc)) await pushToDisk();
    if (isGithubLinked(currentDoc)) await pushToGithub();
  };

  // Revert: discard the working copy and reload the committed content.
  const revertCurrentDoc = async (): Promise<void> => {
    if (!isModified(currentDoc)) return;
    currentDoc = await revertDoc(currentDoc.uuid);
    editor.setValue((await loadCommittedContent(currentDoc)) ?? '');
    dirty = true;
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setModified(false);
  };

  // Save As (option a): branch the current working content into a new doc;
  // the original reverts to its committed version; we switch to editing B.
  const saveAsNewDoc = async (): Promise<void> => {
    const content = editor.getValue();
    const origUuid = currentDoc.uuid;
    const created = await createDoc(currentDoc.name, content);
    await revertDoc(origUuid); // original drops its pending draft → clean
    currentDoc = created;
    await setCurrentDocId(created.uuid);
    // The editor already shows `content`; just retarget to the new doc.
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setDocName(created.name);
    toolbarCtrl.setModified(false);
    toolbarCtrl.setLinked(false);
  };

  // ---- disk link (Phase 4, File System Access — Chromium only) ----------

  // Dispatch disk I/O on the link kind: a single `.md` file handle vs a folder
  // bundle (content.md + assets/). The cast is safe — the persisted handle type
  // always matches the kind recorded at link time.
  const diskMtimeOf = (entry: DocEntry, handle: LinkedHandle): Promise<number | null> =>
    linkKind(entry) === 'file'
      ? fileHandleMtime(handle as FileSystemFileHandle)
      : diskContentMtime(handle as FileSystemDirectoryHandle);
  const writeToDisk = (
    entry: DocEntry,
    handle: LinkedHandle,
    content: string,
  ): Promise<void> =>
    linkKind(entry) === 'file'
      ? writeFileHandle(handle as FileSystemFileHandle, content)
      : writeBundleToDir(handle as FileSystemDirectoryHandle, content);
  const readFromDisk = (entry: DocEntry, handle: LinkedHandle): Promise<string> =>
    linkKind(entry) === 'file'
      ? readFileHandle(handle as FileSystemFileHandle)
      : readBundleFromDir(handle as FileSystemDirectoryHandle);

  // Record the current disk mtime as the synced baseline and clear the conflict
  // badge — called after every push/pull/link (i.e. whenever sides realign).
  const markSynced = async (
    entry: DocEntry,
    handle: LinkedHandle,
  ): Promise<void> => {
    const mtime = await diskMtimeOf(entry, handle);
    if (mtime != null) await saveSyncedMtime(entry.uuid, mtime);
    if (entry.uuid === currentDoc.uuid) toolbarCtrl.setConflict(false);
  };

  // Replace the current doc's content with `content` from disk, as a *clean
  // commit* (draft → commit, so no leftover "modified" state), while staying in
  // whatever view the user is in — editor, preview, or fullscreen presentation
  // — and restoring their scroll position / slide index best-effort. This is
  // the shared body of auto-pull, manual Reload, and conflict "take the disk".
  const applyDiskContent = async (content: string): Promise<void> => {
    await saveDraft(currentDoc.uuid, content);
    currentDoc = await commitDoc(currentDoc.uuid);
    editor.setValue(content);
    toolbarCtrl.setModified(false);
    dirty = true;
    if (presenting) {
      // paged.js can't measure the hidden (display:none) non-current pages, so
      // drop `.presentation` for the re-paginate, then restore it + the slide.
      previewEl.style.visibility = 'hidden';
      previewEl.classList.remove('presentation');
      try {
        await updatePreview(content);
      } finally {
        previewEl.classList.add('presentation');
        renderSlide(); // slideIndex preserved (clamped if pages shrank)
        previewEl.style.visibility = '';
      }
    } else if (viewMode === 'preview') {
      const anchor = currentPreviewAnchor(previewEl);
      previewEl.style.visibility = 'hidden';
      try {
        await updatePreview(content);
        if (anchor) applyAnchorToPreview(previewEl, anchor);
      } finally {
        previewEl.style.visibility = '';
      }
    }
  };

  // Push the linked doc's committed content to disk, then refresh the baseline
  // (so our own write doesn't read back as an external divergence).
  const pushToDisk = async (): Promise<void> => {
    const handle = await loadHandle(currentDoc.uuid);
    if (!handle) return;
    if (!(await ensureRwPermission(handle))) {
      globalThis.alert(t('disk.permission-denied'));
      return;
    }
    const content = (await loadCommittedContent(currentDoc)) ?? '';
    await writeToDisk(currentDoc, handle, content);
    await markSynced(currentDoc, handle);
  };

  // Open a .md from disk → import as a new library doc, then auto-link it to
  // the file it came from (the picker hands us a durable handle, unlike the
  // classic <input> import). If the user declines write access, the doc stays
  // imported but unlinked.
  const openFromDisk = async (): Promise<void> => {
    const fh = await pickMarkdownFileHandle();
    if (!fh) return;
    const entry = await handleImport(await fh.getFile());
    if (!entry) return;
    if (!(await ensureRwPermission(fh))) return; // imported, just not linked
    await saveHandle(entry.uuid, fh);
    const updated = await setDocLink(entry.uuid, fh.name, 'file');
    if (updated) currentDoc = updated;
    toolbarCtrl.setLinked(true);
    await markSynced(currentDoc, fh);
  };

  // Link the current doc to a folder: write its bundle there + remember it.
  const linkToFolder = async (): Promise<void> => {
    const dir = await pickDirectory();
    if (!dir) return;
    if (
      (await dirHasBundle(dir)) &&
      !globalThis.confirm(t('disk.overwrite-confirm', { name: dir.name }))
    ) {
      return;
    }
    try {
      const content =
        (await loadCommittedContent(currentDoc)) ?? editor.getValue();
      await writeBundleToDir(dir, content);
      await saveHandle(currentDoc.uuid, dir);
      const updated = await setDocLink(currentDoc.uuid, dir.name, 'folder');
      if (updated) currentDoc = updated;
      toolbarCtrl.setLinked(true);
      await markSynced(currentDoc, dir);
    } catch (err) {
      console.error('Link to folder failed', err);
      globalThis.alert(t('disk.write-failed'));
    }
  };

  // Link the current doc to a single `.md` file on disk. An empty target is
  // "published" (the current doc is written into it); a non-empty target is
  // "adopted" (its content replaces the doc, guarding unsaved local edits).
  const linkToFile = async (): Promise<void> => {
    const fh = await pickMarkdownFileHandle();
    if (!fh) return;
    if (!(await ensureRwPermission(fh))) {
      globalThis.alert(t('disk.permission-denied'));
      return;
    }
    try {
      const diskText = await readFileHandle(fh);
      if (diskText.trim() === '') {
        const content =
          (await loadCommittedContent(currentDoc)) ?? editor.getValue();
        await writeFileHandle(fh, content);
      } else {
        if (
          editor.getValue().trim() !== '' &&
          !globalThis.confirm(t('disk.adopt-confirm', { name: fh.name }))
        ) {
          return;
        }
        // Adopt = a clean commit of the file's content, staying in view.
        await applyDiskContent(diskText);
      }
      await saveHandle(currentDoc.uuid, fh);
      const updated = await setDocLink(currentDoc.uuid, fh.name, 'file');
      if (updated) currentDoc = updated;
      toolbarCtrl.setLinked(true);
      await markSynced(currentDoc, fh);
    } catch (err) {
      console.error('Link to file failed', err);
      globalThis.alert(t('disk.write-failed'));
    }
  };

  // Pull: replace the doc's content from its linked file/folder on disk, in
  // place (keeps the current view). `force` skips the unsaved-edits guard — used
  // by conflict "take the disk", where the user has already chosen.
  const reloadFromDisk = async (force = false): Promise<void> => {
    const handle = await loadHandle(currentDoc.uuid);
    if (!handle) return;
    if (
      !force &&
      isModified(currentDoc) &&
      !globalThis.confirm(t('disk.reload-confirm'))
    ) {
      return;
    }
    if (!(await ensureRwPermission(handle))) {
      globalThis.alert(t('disk.permission-denied'));
      return;
    }
    try {
      const content = await readFromDisk(currentDoc, handle);
      await applyDiskContent(content);
      await markSynced(currentDoc, handle);
    } catch (err) {
      console.error('Reload from disk failed', err);
      globalThis.alert(t('disk.read-failed'));
    }
  };

  // Two-way sync poll (Phase 4). When the linked file changed on disk since our
  // last sync: if markpage has no unsaved edits, AUTO-PULL it in place; if it
  // does (both sides diverged), flag a CONFLICT (the ⛓️‍💥 badge). Query-only on
  // permission — never prompts (no user gesture here). `syncing` guards against
  // overlapping auto-pulls. Push stays explicit (Save), so it isn't here.
  let syncing = false;
  const checkSync = async (): Promise<void> => {
    if (syncing || !isLinked(currentDoc)) return;
    const handle = await loadHandle(currentDoc.uuid);
    if (!handle || !(await queryRwGranted(handle))) return;
    const [mtime, baseline] = await Promise.all([
      diskMtimeOf(currentDoc, handle),
      loadSyncedMtime(currentDoc.uuid),
    ]);
    if (mtime == null || baseline == null || mtime <= baseline) return;
    if (isModified(currentDoc)) {
      toolbarCtrl.setConflict(true);
      return;
    }
    syncing = true;
    try {
      const content = await readFromDisk(currentDoc, handle);
      // The user may have started typing during the async read — re-check.
      if (isModified(currentDoc)) {
        toolbarCtrl.setConflict(true);
        return;
      }
      await applyDiskContent(content);
      await markSynced(currentDoc, handle);
    } catch (err) {
      console.error('Auto-pull failed', err);
    } finally {
      syncing = false;
    }
  };

  // Conflict resolution — "take the disk" = a forced pull (discard local edits).
  // "Keep mine" is just Save (commit + push), wired at the call site.
  const takeDiskVersion = (): void => {
    void reloadFromDisk(true);
  };

  // Drop the disk link (the folder on disk is left untouched).
  const unlinkDoc = async (): Promise<void> => {
    await removeHandle(currentDoc.uuid);
    const updated = await clearDocLink(currentDoc.uuid);
    if (updated) currentDoc = updated;
    toolbarCtrl.setLinked(linkedAny(currentDoc));
  };

  // ---- GitHub sync (docs/GITHUB-SYNC-SPEC.md, Phase 3) ------------------

  const githubMessage = (): string => `markpage: ${currentDoc.name}`;
  const githubTargetOf = (e: DocEntry): GithubTarget | null => {
    const l = githubLinkOf(e);
    return l ? { owner: l.owner, repo: l.repo, branch: l.branch, path: l.path } : null;
  };
  const githubErr = (err: unknown): string =>
    err instanceof GithubError
      ? t('github.error', { status: String(err.status) })
      : err instanceof Error
        ? err.message
        : String(err);

  // Link the current doc to a GitHub repo path and push its bundle there.
  const linkToGithub = async (): Promise<void> => {
    const token = await loadToken();
    if (!token) {
      globalThis.alert(t('github.no-token'));
      return;
    }
    const repoIn = globalThis.prompt(t('github.prompt-repo'), 'orlarey/markpage');
    if (!repoIn) return;
    const [owner, repo] = repoIn.split('/').map((s) => s.trim());
    if (!owner || !repo) {
      globalThis.alert(t('github.bad-repo'));
      return;
    }
    const branch =
      (globalThis.prompt(t('github.prompt-branch'), 'main') ?? '').trim() || 'main';
    const path = (
      globalThis.prompt(
        t('github.prompt-path'),
        `sandbox/${slugifyDocName(currentDoc.name)}`,
      ) ?? ''
    ).trim();
    if (!path) return;
    const target: GithubTarget = { owner, repo, branch, path };
    try {
      const existingSha = await getRemoteContentSha(token, target);
      if (
        existingSha !== null &&
        !globalThis.confirm(t('github.overwrite-confirm', { path }))
      ) {
        return;
      }
      // Commit first so we push the doc's real content, not a stale (often
      // empty) committed version — linking a freshly-typed, never-saved doc
      // would otherwise push an empty content.md.
      await flushSave();
      currentDoc = await commitDoc(currentDoc.uuid);
      toolbarCtrl.setModified(false);
      const content = (await loadCommittedContent(currentDoc)) ?? '';
      const { contentSha } = await pushBundle(
        token,
        target,
        content,
        githubMessage(),
        existingSha ?? undefined,
      );
      const updated = await setDocGithubLink(currentDoc.uuid, {
        owner,
        repo,
        branch,
        path,
        baselineSha: contentSha,
      });
      if (updated) currentDoc = updated;
      toolbarCtrl.setLinked(true);
      toolbarCtrl.setConflict(false);
    } catch (err) {
      console.error('GitHub link failed', err);
      globalThis.alert(githubErr(err));
    }
  };

  // Push the committed bundle. Detects divergence (remote content.md sha ≠
  // baseline) and flags a conflict (⛓️‍💥) instead of overwriting.
  const pushToGithub = async (): Promise<void> => {
    const token = await loadToken();
    const link = githubLinkOf(currentDoc);
    const target = githubTargetOf(currentDoc);
    if (!token || !link || !target) return;
    try {
      const remoteSha = await getRemoteContentSha(token, target);
      if (remoteSha !== null && remoteSha !== link.baselineSha) {
        toolbarCtrl.setConflict(true);
        return;
      }
      const content = (await loadCommittedContent(currentDoc)) ?? '';
      const { contentSha } = await pushBundle(
        token,
        target,
        content,
        githubMessage(),
        remoteSha ?? undefined,
      );
      const updated = await updateGithubBaseline(currentDoc.uuid, contentSha);
      if (updated) currentDoc = updated;
      toolbarCtrl.setConflict(false);
    } catch (err) {
      console.error('GitHub push failed', err);
      globalThis.alert(githubErr(err));
    }
  };

  // Pull the bundle from GitHub, replacing the doc's content in place.
  const reloadFromGithub = async (force = false): Promise<void> => {
    const token = await loadToken();
    const target = githubTargetOf(currentDoc);
    if (!token || !target) return;
    if (
      !force &&
      isModified(currentDoc) &&
      !globalThis.confirm(t('disk.reload-confirm'))
    ) {
      return;
    }
    try {
      const pulled = await pullBundle(token, target);
      if (!pulled) {
        globalThis.alert(t('github.not-found'));
        return;
      }
      await applyDiskContent(pulled.content);
      const updated = await updateGithubBaseline(currentDoc.uuid, pulled.contentSha);
      if (updated) currentDoc = updated;
      toolbarCtrl.setConflict(false);
    } catch (err) {
      console.error('GitHub reload failed', err);
      globalThis.alert(githubErr(err));
    }
  };

  // Conflict "keep mine" for GitHub: force-push over the current remote.
  const keepMineGithub = async (): Promise<void> => {
    const token = await loadToken();
    const target = githubTargetOf(currentDoc);
    if (!token || !target) return;
    try {
      currentDoc = await commitDoc(currentDoc.uuid);
      toolbarCtrl.setModified(false);
      const content = (await loadCommittedContent(currentDoc)) ?? '';
      const remoteSha = await getRemoteContentSha(token, target);
      const { contentSha } = await pushBundle(
        token,
        target,
        content,
        githubMessage(),
        remoteSha ?? undefined,
      );
      const updated = await updateGithubBaseline(currentDoc.uuid, contentSha);
      if (updated) currentDoc = updated;
      toolbarCtrl.setConflict(false);
    } catch (err) {
      console.error('GitHub keep-mine failed', err);
      globalThis.alert(githubErr(err));
    }
  };

  // Drop the GitHub link (the repo is left untouched).
  const unlinkGithub = async (): Promise<void> => {
    const updated = await clearDocGithubLink(currentDoc.uuid);
    if (updated) currentDoc = updated;
    toolbarCtrl.setLinked(linkedAny(currentDoc));
  };

  const handleSettingsChange = (s: PdfSettings) => {
    state.settings = s;
    // Fire-and-forget: the SHA hash + localStorage write is fast and
    // the form's onChange is sync. Any error stays in the console.
    void saveProfileSettings(state.profileId, s).catch((err: unknown) => {
      console.error('Profile save failed', err);
    });
    // The settings form mutates its own customFonts list before
    // calling us, but registering here too keeps things consistent
    // when a settings change arrives from another path (cross-window
    // sync, reset-to-defaults, etc.).
    registerCustomFonts(s.customFonts);
    applyPreviewStyles(s);
    // Kick off loading any newly-selected Google Font in parallel.
    // We don't block on it: the preview repaints with the bundled
    // fallback, then the browser swaps in the real font as soon as
    // its CSS resolves (display=swap).
    void loadFontTrio(s.fonts).catch((err: unknown) => {
      console.error('Font load failed', err);
    });
    // The @page CSS depends on settings (page size, margins, page-number
    // position). Mark dirty so we repaginate on the next toggle into
    // preview; if we're already in preview, refresh now. paged.js
    // rebuilds the entire DOM, so capture the current viewport's top
    // line first and re-apply it once the new render lands.
    dirty = true;
    if (viewMode === 'preview') {
      const anchor = currentPreviewAnchor(previewEl);
      // Hide the preview while paged.js wipes and rebuilds + while we
      // re-apply the captured scroll position. Otherwise the user sees
      // a blank, then content appearing at the top, then a jump back —
      // three frames of visual noise. visibility:hidden is instant and
      // preserves scroll geometry.
      previewEl.style.visibility = 'hidden';
      void updatePreview(editor.getValue())
        .then(() => {
          if (anchor) applyAnchorToPreview(previewEl, anchor);
        })
        .catch((err: unknown) => {
          console.error('Preview render failed', err);
        })
        .finally(() => {
          previewEl.style.visibility = '';
        });
    }
  };

  // Imports an external file (.md / .docx / .html / .txt) as a *new*
  // doc in the index, switches to it. Unlike the mono-doc era, this
  // never overwrites the current doc, so no confirmation is needed.
  // The new doc's name is derived from the source filename — if the
  // base name collides with an existing doc, createDoc uniques it.
  // Import a file as a new library doc; returns the created entry (or null on
  // cancel/failure) so callers like Open-from-disk can link it afterwards.
  const handleImport = async (file: File): Promise<DocEntry | null> => {
    try {
      const { content, baseName } = await importFile(file);
      // Persist the outgoing doc before we switch focus — debounce
      // may not have fired yet.
      await flushSave();
      // Hoist any inline data URLs into IndexedDB and replace them
      // with short `img://<sha>` refs. Keeps the new doc readable.
      const cleaned = await extractDataUrlsToStore(content);
      // SPEC §6.5 — resolve external (relative-path) image references.
      // For each path the doc points at, look up the global mapping;
      // anything unknown is collected and we prompt the user to provide
      // the binaries in one modal. Resolved files are persisted in the
      // mapping (and the IDB images store, shared with img:// refs) so
      // future imports of the same .md (or any other doc that shares a
      // path) skip the prompt entirely.
      const externalPaths = extractExternalRefs(cleaned);
      const mapping = loadMapping();
      const missing = externalPaths.filter((p) => !mapping[p]);
      if (missing.length > 0) {
        try {
          await promptForMissingResources(missing);
        } catch (cancelErr) {
          if (cancelErr instanceof ImportCancelled) return null;
          throw cancelErr;
        }
      }
      const desired = baseName.trim() === '' ? 'Document importé' : baseName;
      const entry = await createDoc(desired, cleaned);
      currentDoc = entry;
      await setCurrentDocId(entry.uuid);
      editor.setValue(cleaned);
      // Stay in editor mode after import — the user typically wants
      // to see the markdown they just opened. The preview is dirty
      // and will repaginate on the next Cmd/Ctrl+Enter.
      dirty = true;
      if (viewMode === 'preview') setViewMode('editor');
      toolbarCtrl.setDocName(entry.name);
      toolbarCtrl.setLinked(false);
      return entry;
    } catch (err: unknown) {
      console.error('Import failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      globalThis.alert(t('import.failed', { msg }));
      return null;
    }
  };

  // Open… picker (Cmd/Ctrl+O). A pure selector — pick a doc to edit.
  const triggerOpenModal = async (): Promise<void> => {
    openOpenModal({
      docs: await listDocs(),
      currentUuid: currentDoc.uuid,
      onOpen: (uuid) => {
        void switchToDoc(uuid);
      },
    });
  };

  // Files… manager (documents + Trash). Opened via Cmd/Ctrl+Shift+O until the
  // File menu (Phase 3d) gives it a visible entry.
  const triggerFilesModal = (): void => {
    openFilesModal({
      loadDocs: () => listDocs(),
      loadTrash: () => listTrash(),
      currentUuid: currentDoc.uuid,
      onOpen: (uuid) => {
        void switchToDoc(uuid);
      },
      onNew: () => {
        void createNewDoc();
      },
      onImport: triggerImportDialog,
      onRename: (uuid, name) => renameOtherDoc(uuid, name),
      onDuplicate: async (uuid) => {
        await duplicateDoc(uuid);
      },
      onReload: (uuid) => {
        void reloadDocFromFile(uuid);
      },
      onDelete: (uuid) => deleteAndAdjust(uuid),
      onRestore: async (uuid) => {
        await restoreDoc(uuid);
      },
      onPurge: (uuid) => purgeDoc(uuid),
      onEmptyTrash: () => emptyTrash(),
    });
  };

  // Import dialog: transient <input type=file>, hands the chosen
  // file to handleImport. Shared by the toolbar [Importer] button.
  const triggerImportDialog = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_ATTRIBUTE;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void handleImport(file);
    });
    input.click();
  };

  const triggerSave = (): void => {
    const source = editor.getValue();
    void (async () => {
      try {
        const refified = refifyImageUrls(source);
        const expanded = await expandRefsToDataUrls(refified);
        downloadTextFile(
          expanded,
          `${slugifyDocName(currentDoc.name)}.md`,
          'text/markdown',
        );
      } catch (err) {
        console.error('Save failed', err);
      }
    })();
  };

  // Upload the same self-contained .md to the user's OneDrive app-folder
  // via Microsoft Graph. First call: stores a pending marker + redirects
  // to Microsoft login, then resumes here on return. Subsequent calls hit
  // the silent token path and upload immediately. Also generates an
  // anonymous view-only share link and copies it to the clipboard.
  const triggerSaveToOneDrive = (): void => {
    const source = editor.getValue();
    void (async () => {
      try {
        const refified = refifyImageUrls(source);
        const expanded = await expandRefsToDataUrls(refified);
        const filename = `${slugifyDocName(currentDoc.name)}.md`;
        const { uploadToOneDrive } = await import('./onedrive');
        const result = await uploadToOneDrive(
          filename,
          expanded,
          currentDoc.uuid,
          { createShareLink: true },
        );
        if (result === null) return; // redirecting for login
        if (!result.ok) {
          globalThis.alert(t('onedrive.failed', { msg: result.error }));
          return;
        }
        if (result.shareUrl) {
          try {
            await navigator.clipboard.writeText(result.shareUrl);
            globalThis.alert(t('onedrive.uploaded-with-link'));
          } catch {
            globalThis.alert(
              t('onedrive.uploaded-link-shown', { url: result.shareUrl }),
            );
          }
        } else {
          globalThis.alert(t('onedrive.uploaded'));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('OneDrive save failed', err);
        globalThis.alert(t('onedrive.failed', { msg }));
      }
    })();
  };

  // Self-contained share link: gzip the current doc (images inlined as
  // data URLs) + URL-safe base64 it into the `?import=…` query string.
  // The recipient opens the URL in markpage and the doc is auto-imported
  // as a fresh local copy. Hard-capped at MAX_SHARE_PAYLOAD chars so the
  // URL still works in mail clients / chat apps.
  const buildShareUrlForCurrent = async (): Promise<string | null> => {
    const source = editor.getValue();
    const refified = refifyImageUrls(source);
    const expanded = await expandRefsToDataUrls(refified);
    const { encodeShareContent, buildShareUrl, MAX_SHARE_PAYLOAD } =
      await import('./share-url');
    const payload = await encodeShareContent(expanded);
    if (payload.length > MAX_SHARE_PAYLOAD) {
      globalThis.alert(
        t('share.too-large', {
          size: String(payload.length),
          max: String(MAX_SHARE_PAYLOAD),
        }),
      );
      return null;
    }
    return buildShareUrl(payload);
  };

  const triggerShareLink = (): void => {
    void (async () => {
      try {
        const url = await buildShareUrlForCurrent();
        if (!url) return;
        try {
          await navigator.clipboard.writeText(url);
          globalThis.alert(t('share.link-copied'));
        } catch {
          globalThis.alert(t('share.link-shown', { url }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Share link failed', err);
        globalThis.alert(t('share.failed', { msg }));
      }
    })();
  };

  const triggerShareEmail = (): void => {
    void (async () => {
      try {
        const url = await buildShareUrlForCurrent();
        if (!url) return;
        const subject = encodeURIComponent(currentDoc.name);
        const body = encodeURIComponent(t('share.email-body', { url }));
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Share email failed', err);
        globalThis.alert(t('share.failed', { msg }));
      }
    })();
  };

  // SPEC §21 — Markdown → LaTeX conversion via marked.lexer + our
  // own token walker (export-latex.ts). Single `.tex` when the doc
  // references no images / mermaid / chart blocks ; otherwise a
  // `.zip` carrying the .tex plus an `images/` folder with every
  // resource at its content-addressed name (or numbered slot, for
  // mermaid / chart SVGs).
  const triggerLatexExport = (): void => {
    const source = editor.getValue();
    void (async () => {
      try {
        const slug = slugifyDocName(currentDoc.name);
        const { tex, resources } = await exportLatex(source, state.settings);
        if (resources.size === 0) {
          downloadTextFile(tex, `${slug}.tex`, 'application/x-tex');
          return;
        }
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        zip.file(`${slug}.tex`, tex);
        for (const [path, blob] of resources) zip.file(path, blob);
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('LaTeX export failed', err);
        globalThis.alert(
          t('latex-export.failed', {
            msg: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    })();
  };

  const triggerDownload = (): void => {
    const source = editor.getValue();
    void (async () => {
      try {
        const expanded = await expandRefsToInlineDataUrls(source);
        // SPEC §13.6: every export goes through the browser print pipeline.
        // The result is identical to what the paginated preview shows,
        // selectable text included.
        await exportViaPrint(
          expanded,
          state.settings,
          `${slugifyDocName(currentDoc.name)}.pdf`,
        );
      } catch (err) {
        console.error('PDF export failed', err);
      }
    })();
  };

  // After any profile-library mutation, we may need to update the
  // form (rename of the active profile, or arrival of a new one). The
  // form's refresh is exposed via openSettingsWindow's return value,
  // but we wire through the handlers directly so the menu's callbacks
  // can request a refresh without holding onto a stale reference.
  let refreshSettingsForm: (() => void) | null = null;

  const applyProfile = (entry: ProfileEntry): void => {
    setCurrentProfileId(entry.uuid);
    state.profileId = entry.uuid;
    state.settings = loadProfileSettings(entry.uuid);
    // Funnel through the existing path so font registration, paged
    // CSS, and preview repaint all happen as if the user had touched
    // a control. The save inside handleSettingsChange is a no-op
    // round-trip — same content, same SHA — and keeps mtime fresh.
    handleSettingsChange(state.settings);
    refreshSettingsForm?.();
  };

  const profileHandlers = {
    getCurrentProfileId: () => state.profileId,
    listProfiles,
    onSwitchProfile: (uuid: string) => {
      const entry = listProfiles().find((p) => p.uuid === uuid);
      if (entry) applyProfile(entry);
    },
    onCreateProfile: () => {
      void (async () => {
        // Seed a new profile from the active one so the user keeps
        // their current look as a starting point.
        const entry = await createProfile(t('default.new-profile-name'), {
          ...state.settings,
        });
        applyProfile(entry);
      })();
    },
    onRenameProfile: (uuid: string, name: string) => {
      renameProfile(uuid, name);
      refreshSettingsForm?.();
    },
    onDuplicateProfile: (uuid: string) => {
      const entry = duplicateProfile(uuid);
      if (entry) applyProfile(entry);
    },
    onDeleteProfile: (uuid: string) => {
      const ok = deleteProfile(uuid);
      if (!ok) return;
      // Active-profile id may have flipped inside deleteProfile;
      // re-resolve it instead of guessing.
      const next = getCurrentProfileId();
      if (next && next !== state.profileId) {
        const entry = listProfiles().find((p) => p.uuid === next);
        if (entry) applyProfile(entry);
      } else {
        refreshSettingsForm?.();
      }
    },
    onResetProfile: () => {
      // resetProfile = saveProfileSettings(current, DEFAULT_SETTINGS).
      // We go through applyProfile so the preview / PDF / font-loader
      // see the reset settings without a manual repaint.
      void (async () => {
        const entry = await resetProfile(state.profileId);
        if (entry) applyProfile(entry);
      })();
    },
    onImportProfile: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        void (async () => {
          const text = await file.text();
          const result = await importProfileJson(text);
          if (!result.ok) {
            globalThis.alert(
              t('profile-menu.import-failed', { error: result.error }),
            );
            return;
          }
          applyProfile(result.profile);
        })();
      });
      input.click();
    },
    onExportProfile: () => {
      const json = exportProfileJson(state.profileId);
      if (!json) return;
      const entry = listProfiles().find((p) => p.uuid === state.profileId);
      // Use the *displayed* name for the slug so the export of the
      // default profile lands as "par-defaut.json" / "default.json"
      // rather than the internal "_default_" sentinel.
      const slug = slugifyDocName(
        entry ? displayProfileName(entry) : 'profil',
      );
      downloadTextFile(json, `${slug}.json`, 'application/json');
    },
  };

  const triggerSettings = (): void => {
    const handle = openSettingsWindow({
      getSettings: () => state.settings,
      onChange: handleSettingsChange,
      ...profileHandlers,
    });
    refreshSettingsForm = handle?.refresh ?? null;
  };

  // Debug-guides overlay (toolbar [Guides] button + Cmd/Ctrl+Shift+G).
  // Non-persistent across reloads — toggles the .debug-layout class on
  // #preview-pane, which the static CSS in style.css wires to the
  // overlays (page-area outline, live-area outline, diagonals SVG).
  const triggerGuides = (): void => {
    const pane = document.getElementById('preview-pane');
    if (!pane) return;
    const next = !pane.classList.contains('debug-layout');
    pane.classList.toggle('debug-layout', next);
    toolbarCtrl?.setGuidesPressed(next);
  };

  // Inserts a markdown snippet (sent from the help window) at the
  // editor's current cursor / selection. We wrap the source in blank
  // lines so a fenced code block / heading / list always sits as its
  // own paragraph in the resulting markdown, even when the cursor was
  // mid-paragraph. Extra blank lines collapse in CommonMark, so
  // over-wrapping is harmless. Single transaction, single undo step.
  const insertFromHelp = (source: string): void => {
    const view = editor.view;
    const sel = view.state.selection.main;
    const wrapped = `\n\n${source}\n\n`;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: wrapped },
      selection: { anchor: sel.from + wrapped.length },
    });
    dirty = true;
    // If the user is currently looking at the preview, refresh it so
    // the inserted block becomes visible without forcing a switch
    // back to the editor. Sync the preview to the start of the
    // insertion (skipping the leading blank lines we just added) so
    // the new content is what the user sees, anchored near the top
    // of the viewport.
    if (viewMode === 'preview') {
      const insertedStart = sel.from + 2;
      void (async () => {
        try {
          await updatePreview(editor.getValue());
          const line =
            editor.view.state.doc.lineAt(insertedStart).number - 1;
          applyAnchorToPreview(previewEl, { line, y: 60 });
        } catch (err) {
          console.error('Preview refresh after help insert failed', err);
        }
      })();
    }
  };

  const triggerHelp = (): void => {
    const helpMd = helpMdForLocale(uiLocale);
    openHelp(helpMd, {
      onInsert: insertFromHelp,
      onUndo: () => {
        undo(editor.view);
      },
      onRedo: () => {
        redo(editor.view);
      },
      onExportPdf: async () => {
        // Use the user's current typography / page setup, but blank out
        // the personal metadata (author / organisation / date) — the
        // help is a generic tutorial, not the user's own document.
        const helpSettings: PdfSettings = {
          ...state.settings,
          author: { ...state.settings.author, show: false },
          organization: { ...state.settings.organization, show: false },
          date: { mode: 'none', custom: '' },
        };
        await exportViaPrint(helpMd, helpSettings, 'markpage-aide.pdf');
      },
    });
  };

  const renderToolbar = (): void => {
    toolbarCtrl = mountToolbar(toolbarEl, {
      initialDocName: currentDoc.name,
      initialViewMode: viewMode,
      onFileMenu(anchor) {
        void (async () => {
        const githubAvailable = await hasToken();
        openFileMenu(anchor, {
          modified: isModified(currentDoc),
          diskAvailable: fsAccessAvailable(),
          linked: isLinked(currentDoc),
          githubAvailable,
          githubLinked: isGithubLinked(currentDoc),
          onGithubLink: () => {
            void linkToGithub();
          },
          onGithubReload: () => {
            void reloadFromGithub();
          },
          onGithubUnlink: () => {
            void unlinkGithub();
          },
          onOpenFromDisk: () => {
            void openFromDisk();
          },
          onLinkFile: () => {
            void linkToFile();
          },
          onLinkFolder: () => {
            void linkToFolder();
          },
          onReloadDisk: () => {
            void reloadFromDisk();
          },
          onUnlink: () => {
            void unlinkDoc();
          },
          onNew: () => {
            void createNewDoc();
          },
          onOpen: () => {
            void triggerOpenModal();
          },
          onFiles: triggerFilesModal,
          onSave: () => {
            void saveCurrentDoc();
          },
          onSaveAs: () => {
            void saveAsNewDoc();
          },
          onRevert: () => {
            void revertCurrentDoc();
          },
          onImport: triggerImportDialog,
          onMarkdown: triggerSave,
          onPdf: triggerDownload,
          onLatex: triggerLatexExport,
          onOneDrive: triggerSaveToOneDrive,
          onShareLink: triggerShareLink,
          onShareEmail: triggerShareEmail,
        });
        })();
      },
      onRenameCurrent: (name) => {
        void renameCurrentDoc(name);
      },
      onStyle(anchor) {
        openStyleMenu(editor.view, anchor.x, anchor.y);
      },
      onHelp: triggerHelp,
      onSettings: triggerSettings,
      onTogglePreview: toggleView,
      onPresent: () => {
        void enterPresentation();
      },
      onToggleGuides: triggerGuides,
      onResolveConflict: (anchor) => {
        if (isGithubLinked(currentDoc) && !isLinked(currentDoc)) {
          openConflictMenu(anchor, {
            onKeepMine: () => {
              void keepMineGithub(); // force-push over the remote
            },
            onTakeDisk: () => {
              void reloadFromGithub(true); // take the remote version
            },
          });
          return;
        }
        openConflictMenu(anchor, {
          onKeepMine: () => {
            void saveCurrentDoc(); // commit + push my version, clears conflict
          },
          onTakeDisk: takeDiskVersion,
        });
      },
    });
  };

  // Application-level keyboard shortcuts. The format shortcuts (Cmd+B,
  // Cmd+I, …) are bound at the editor level inside src/editor.ts so they
  // only fire when the editor has focus. The shortcuts here are global and
  // independent of focus, so Cmd+S works even when the user is in the
  // filename input or the settings panel.
  const onAppKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey) return;
    // Cmd/Ctrl+Shift+G: toggle the typographic-guides debug overlay.
    // Caught BEFORE the "no shift" early-return below.
    if (e.shiftKey) {
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        triggerGuides();
      } else if (e.key.toLowerCase() === 'o') {
        // Cmd/Ctrl+Shift+O: open the Files… manager (temp until Phase 3d).
        e.preventDefault();
        triggerFilesModal();
      } else if (e.key === 'Enter') {
        // Cmd/Ctrl+Shift+Enter: start the fullscreen presentation.
        e.preventDefault();
        void enterPresentation();
      }
      return;
    }
    // Cmd/Ctrl+Enter: toggle between editor and preview. We compare on
    // `e.key === 'Enter'` rather than going through the lowercase
    // switch because Enter has no lowercase form.
    if (e.key === 'Enter') {
      e.preventDefault();
      toggleView();
      return;
    }
    switch (e.key.toLowerCase()) {
      case 's':
        // Cmd/Ctrl+S commits the working copy (Save). Markdown export keeps
        // its place in the Exporter menu; PDF export stays on Cmd/Ctrl+P.
        e.preventDefault();
        void saveCurrentDoc();
        break;
      case 'o':
        e.preventDefault();
        void triggerOpenModal();
        break;
      case 'p':
        e.preventDefault();
        triggerDownload();
        break;
      case ',':
        e.preventDefault();
        triggerSettings();
        break;
    }
  };
  globalThis.addEventListener('keydown', onAppKeydown);

  renderToolbar();
  // Reflect any resumed working copy (a draft persisted from a previous
  // session) in the "modified" indicator straight away.
  toolbarCtrl.setModified(isModified(currentDoc));
  toolbarCtrl.setLinked(linkedAny(currentDoc));
  void checkSync();

  // Two-way sync polling (Phase 4). The File System Access API has no
  // file-watching, so we poll the linked file's mtime when the tab is visible —
  // on focus / visibility change (immediate when the user returns after editing
  // the file externally) plus a ~2s interval for a near-live feel side-by-side.
  const pollSync = (): void => {
    if (document.visibilityState === 'visible') void checkSync();
  };
  globalThis.addEventListener('focus', pollSync);
  document.addEventListener('visibilitychange', pollSync);
  globalThis.setInterval(pollSync, 2000);

  // When the UI language changes (typically from the Réglages
  // popup's "Langue de l'interface" select), rebuild the toolbar so
  // its labels translate in place. The Réglages form itself
  // refreshes locally; long-lived UI elements subscribe here.
  onLanguageChange(() => {
    renderToolbar();
    toolbarCtrl.setModified(isModified(currentDoc));
    toolbarCtrl.setLinked(linkedAny(currentDoc));
    void checkSync();
  });

  // ---- MCP bridge (optional) --------------------------------------------
  // Expose the app's actions to an AI client via the markpage-mcp bridge.
  // The context is the single coupling point: src/mcp/ never reaches into
  // the closure except through these methods. Connection is opt-in (a ?mcp=
  // URL param, a saved preference, or the pill's Connect button).
  const docSummary = (e: DocEntry) => ({
    uuid: e.uuid,
    name: e.name,
    mtime: e.mtime,
    modified: isModified(e),
    linked: isLinked(e),
  });
  const profileSummary = (e: ProfileEntry) => ({
    uuid: e.uuid,
    name: displayProfileName(e),
    active: e.uuid === getCurrentProfileId(),
  });
  const pageCountNow = (): number =>
    previewEl.querySelectorAll('.pagedjs_page').length;

  const mcpContext: McpContext = {
    getDocument: () => ({ ...docSummary(currentDoc), markdown: editor.getValue() }),
    setDocument: async (markdown) => {
      editor.setValue(markdown);
      dirty = true;
      const updated = await saveDraft(currentDoc.uuid, markdown);
      if (currentDoc.uuid === updated.uuid) {
        currentDoc = updated;
        toolbarCtrl.setModified(isModified(updated));
      }
      if (viewMode === 'preview') await updatePreview(markdown);
      return { uuid: currentDoc.uuid, bytes: new TextEncoder().encode(markdown).length };
    },
    insertText: (text) => {
      const v = editor.view;
      const sel = v.state.selection.main;
      const cursor = sel.from + text.length;
      v.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        selection: { anchor: cursor },
      });
      dirty = true;
      debouncedSaveDraft(currentDoc.uuid, editor.getValue());
      return { uuid: currentDoc.uuid, cursor };
    },

    listDocuments: async (trash) =>
      (trash ? await listTrash() : await listDocs()).map(docSummary),
    openDocument: async (uuid) => {
      const target = (await listDocs()).find((e) => e.uuid === uuid);
      if (!target) throw new Error(`no document ${uuid}`);
      await switchToDoc(uuid);
      return docSummary(currentDoc);
    },
    createDocument: async (name, markdown) => {
      await flushSave();
      const entry = await createDoc(name ?? 'Sans titre', markdown);
      currentDoc = entry;
      await setCurrentDocId(entry.uuid);
      editor.setValue(markdown);
      dirty = true;
      if (viewMode === 'preview') setViewMode('editor');
      toolbarCtrl.setDocName(entry.name);
      toolbarCtrl.setModified(false);
      toolbarCtrl.setLinked(false);
      return docSummary(entry);
    },
    renameDocument: async (uuid, name) => {
      const updated = await renameDoc(uuid, name);
      if (!updated) throw new Error(`no document ${uuid}`);
      if (uuid === currentDoc.uuid) {
        currentDoc = updated;
        toolbarCtrl.setDocName(updated.name);
      }
      return docSummary(updated);
    },
    deleteDocument: (uuid) => deleteAndAdjust(uuid),
    restoreDocument: async (uuid) => {
      const updated = await restoreDoc(uuid);
      if (!updated) throw new Error(`no document ${uuid}`);
      return docSummary(updated);
    },
    saveDocument: async () => {
      await saveCurrentDoc();
      return docSummary(currentDoc);
    },
    revertDocument: async () => {
      await revertCurrentDoc();
      return docSummary(currentDoc);
    },
    getState: async () => ({
      document: docSummary(currentDoc),
      view: presenting ? 'presentation' : viewMode,
      pageCount: pageCountNow(),
      modified: isModified(currentDoc),
    }),

    setView: async (view) => {
      if (view === 'editor') enterEditor(null);
      else if (view === 'preview') await enterPreview();
      else await enterPresentation();
      return { view, pageCount: pageCountNow() };
    },
    ensurePreview: async () => {
      await enterPreview();
      return previewEl;
    },

    exportMarkdown: async () => {
      const expanded = await expandRefsToDataUrls(refifyImageUrls(editor.getValue()));
      return { markdown: expanded, bytes: new TextEncoder().encode(expanded).length };
    },
    exportLatex: async () => {
      const slug = slugifyDocName(currentDoc.name);
      const { tex, resources } = await exportLatex(editor.getValue(), state.settings);
      if (resources.size === 0) {
        return { filenameHint: `${slug}.tex`, base64: utf8ToBase64(tex), resources: 0 };
      }
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file(`${slug}.tex`, tex);
      for (const [path, blob] of resources) zip.file(path, blob);
      const u8 = await zip.generateAsync({ type: 'uint8array' });
      return { filenameHint: `${slug}.zip`, base64: bytesToBase64(u8), resources: resources.size };
    },
    exportPdf: async () => {
      triggerDownload();
      return { started: true };
    },

    getSettings: () => {
      const active = listProfiles().find((p) => p.uuid === getCurrentProfileId());
      return {
        profile: active ? profileSummary(active) : undefined,
        settings: state.settings as unknown as Record<string, unknown>,
      };
    },
    listProfiles: () => listProfiles().map(profileSummary),
    setProfile: (uuid) => {
      const entry = listProfiles().find((p) => p.uuid === uuid);
      if (!entry) throw new Error(`no profile ${uuid}`);
      applyProfile(entry);
      return { profile: profileSummary(entry) };
    },
  };
  initMcp(mcpContext);

  // If we just returned from the OneDrive OAuth flow with a pending
  // upload, resume it now that everything (doc loaded, editor mounted,
  // settings applied) is in place.
  if (onedriveResumeUuid) {
    triggerSaveToOneDrive();
  }
}

await bootstrap();
