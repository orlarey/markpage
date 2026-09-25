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

// ET Book (Edward Tufte's book face, MIT) — vendored @font-face, not on Google.
import './assets/fonts/et-book/et-book.css';

import 'highlight.js/styles/atom-one-light.css';
import '@orlarey/blocks/styles.css';
import '@orlarey/markpage-render/constructs.css';
import './style.css';
// Side-effect import: registers our marked extensions ($$math$$, …) on the
// shared `marked` instance. Must run before any marked.parse / marked.lexer.
import '@orlarey/markpage-render';
import {
  migrateIDBBranding,
  migrateLocalStorageBranding,
} from './branding-migration';
import { initEditorTextColor } from './editor-color';
import { initEditorFont } from './editor-font';
import { initLocale, onLanguageChange } from './i18n/locale';
import { t } from './i18n/strings';
import { registerFallbackFonts } from './fonts';
import { loadSettingsFonts, registerCustomFonts } from './font-loader';
import { createEditor, type EditorShortcuts } from './editor';
import { debounce, applyPreviewStyles, annotateSourceLines } from './preview';
import { parseFrontmatter } from '@orlarey/markpage-render';
import {
  applyAnchorToEditor,
  applyAnchorToPreview,
  buildPreviewLineMap,
  currentPreviewAnchor,
  editorContentYForLine,
  editorCursorAnchor,
  editorLineAtViewportY,
  lineAtPreviewY,
  previewClickAnchor,
  previewYForLine,
  type LineEntry,
} from './scroll-sync';
import { ACCEPT_ATTRIBUTE, importFile } from './import';
import {
  ImportCancelled,
  promptForMissingResources,
} from './ui/missing-resources-modal';
import {
  addResource,
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
  setImagePlacer,
} from './image';
import { migrateImagesToOpfs } from './image-store';
import { requestPersistentStorage } from './opfs';
import { mountToolbar, type ToolbarControl } from './ui/toolbar';
import { attachStyleContextMenu, openStyleMenu } from './ui/style-menu';
import {
  allStyles,
  deleteUserStyle,
  appliedStyle,
  loadUserStyles,
  parseStyleFile,
  resolveDocumentSettings,
  saveUserStyle,
  serializeStyleFile,
  slugify,
  type NamedStyle,
} from './style-library';
import { openDocumentStyleMenu } from './ui/document-style-menu';
import { presentLayout, presentStep } from './presentation';
import { initPaneSplitter } from './ui/pane-splitter';
import { openHelp } from './ui/help-window';
import { hideNotice, showNotice } from './ui/notice';
import {
  UrlFetchError,
  decodeSrcParam,
  fetchDocText,
  isWritableUrl,
  normalizeDocUrl,
  putDocText,
  resolveAgainstDoc,
  urlChip,
} from './url-origin';
import {
  announceCurrentDoc,
  holdDocLock,
  initTabPresence,
  isLockedElsewhere,
  isOpenElsewhere,
  requestFocus,
} from './tab-presence';
import { openConflictMenu } from './ui/conflict-menu';
import { openFileMenu } from './ui/file-menu';
import { redo, undo } from '@codemirror/commands';
import helpMdFr from './HELP.fr.md?raw';
import helpMdEn from './HELP.en.md?raw';
import {
  clearDocGithubLink,
  clearDocLink,
  commitDoc,
  createDoc,
  deleteDoc,
  emptyTrash,
  gcContentBlobs,
  githubLinkOf,
  isGithubLinked,
  isLinked,
  isModified,
  isOneDriveLinked,
  linkKind,
  listDocs,
  listTrash,
  loadCommittedContent,
  loadDocContent,
  migrateLegacyDocIfNeeded,
  oneDriveLinkOf,
  purgeDoc,
  renameDoc,
  resolveCurrentDoc,
  resolveDocFromUrl,
  restoreDoc,
  revertDoc,
  saveDocContent,
  saveDraft,
  journalDraft,
  clearDraftJournal,
  replayDraftJournal,
  setCurrentDocId,
  listRecentDocs,
  onCurrentDocChange,
  adoptUrlDoc,
  clearDocUrlLink,
  markUrlFetched,
  urlLinkOf,
  urlSyncState,
  setDocGithubLink,
  setDocLink,
  setDocOneDriveLink,
  clearDocOneDriveLink,
  updateGithubBaseline,
  updateOneDriveBaseline,
  type DocEntry,
} from './docs';
import { GithubError, getUser, loadToken, saveToken } from './github';
import {
  type GithubTarget,
  GithubBranchAbsentError,
  createOnGithub,
  importFromGithub,
  placeImageForInsert,
  saveToGithub,
} from './github-sync';
import {
  DiskVolume,
  OneDriveVolume,
  RepoVolume,
  resolveWithinRoot,
  TRASH_DIR,
  type Volume,
  type VolumeEntry,
} from './volumes';
import {
  OneDriveConflictError,
  readOneDriveText,
  signInOneDrive,
  writeOneDriveText,
} from './onedrive';
import { listVolumes, mountDisk, mountRepo, unmountVolume } from './volume-registry';
import { type VolumeBrowserOptions, openVolumeBrowser } from './ui/volume-browser';
import {
  diskContentMtime,
  ensureRwPermission,
  fileHandleMtime,
  fsAccessAvailable,
  type LinkedHandle,
  loadHandle,
  loadSyncedMtime,
  pickDirectory,
  pickImportableFileHandle,
  queryRwGranted,
  readBundleFromDir,
  readFileHandle,
  removeHandle,
  saveHandle,
  saveSyncedMtime,
  writeBundleToDir,
  writeFileHandle,
} from './disk-link';
import { serializeFundamentalStyle, DEFAULT_SETTINGS, type PdfSettings } from './settings';
import { setFrontmatterKeys } from './frontmatter-edit';
import {
  applyPageFills,
  buildDocumentDom,
  renderContinuousSheet,
} from './document-render';
import { paginate } from './preview-paginated';
import { exportViaPrint } from './print-export';
import { exportLatex } from './export-latex';
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
 *   then event wiring (autosave, view toggle, doc handlers, hotkeys).
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

  // One-shot rebranding migration: rename every `md2pdf:` localStorage
  // key and the legacy IndexedDB database into the `markpage` namespace.
  // Idempotent, runs before any other storage module is touched.
  migrateLocalStorageBranding();
  await migrateIDBBranding().catch((err: unknown) => {
    console.error('IDB branding migration failed', err);
  });

  // Resolve the UI locale before any component reads `t(...)` at
  // construction time. First-launch detection via navigator.language;
  // subsequent runs read the persisted value (locale.ts, setLanguage).
  const uiLocale = initLocale();

  // Documents named by the URL — after the storage migrations (they write the
  // library) and the locale (their messages are translated).
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

  // `?url=<https://…>` (alias `?src=`) — a document whose origin is a URL
  // (url-origin.ts): the browser fetches it (no server in between), the library
  // keeps one copy per URL, and `?doc=` pins that copy for this tab. The param
  // stays in the address bar, so a bookmark reopens the latest version. Done
  // before the doc cascade below so the document opens straight away. (`src`
  // exists because Vite's dev server reserves a `?url` query: 403 in dev.)
  const openParams = new URL(window.location.href).searchParams;
  const rawUrlParam = openParams.get('url') ?? openParams.get('src');
  const urlParam = rawUrlParam === null ? null : decodeSrcParam(rawUrlParam);
  if (urlParam) {
    const sayUrl = (text: string): void =>
      showNotice(text, {
        id: 'mp-url',
        sticky: true,
        action: { label: 'OK', run: () => hideNotice('mp-url') },
      });
    try {
      const target = normalizeDocUrl(urlParam);
      const text = await fetchDocText(target);
      const { entry, remoteChanged } = await adoptUrlDoc(target, text);
      const url = new URL(window.location.href);
      url.searchParams.set('doc', entry.uuid);
      window.history.replaceState({}, '', url.toString());
      if (remoteChanged) {
        sayUrl(t(isWritableUrl(target) ? 'vscode.kept-local' : 'url.kept-local'));
      }
    } catch (err) {
      sayUrl(
        err instanceof UrlFetchError
          ? err.kind === 'http'
            ? t('url.http', { url: err.url, status: String(err.status) })
            : t('url.blocked', { url: err.url })
          : t('url.invalid', { url: urlParam }),
      );
    }
  }

  // Apply the editor-pane font + colour preferences before the
  // editor mounts — each writes a CSS custom property on :root which
  // #editor-pane consumes. Sane defaults; a persisted preference wins.
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
  const resizerEl = document.getElementById('pane-resizer') as HTMLElement;
  initPaneSplitter(panesEl, resizerEl);

  // Every document's settings resolve from this base: its named style (or the
  // default style) applied over DEFAULT_SETTINGS. The base language follows the
  // UI locale — `en-*` users get English hyphenation and dates unless the
  // document's front-matter says otherwise.
  const baseSettings: PdfSettings = { ...DEFAULT_SETTINGS, language: uiLocale };
  // A document overrides nothing: its look is its named style (`document-style:`,
  // default style when absent); only language and author come from its
  // front-matter (resolveDocumentSettings).
  const deriveDocSettings = (src: string): PdfSettings => {
    const r = resolveDocumentSettings(parseFrontmatter(src).meta, baseSettings);
    if (r.unknownStyle)
      console.warn(`[markpage] unknown document-style: "${r.unknownStyle}"`);
    return r.settings;
  };
  const state: { settings: PdfSettings } = {
    settings: deriveDocSettings(''),
  };

  // Custom fonts must be registered BEFORE loadSettingsFonts so the loader
  // sees them while resolving both global and per-element selections.
  registerCustomFonts(state.settings.customFonts);

  // Pre-load every font used by the active document settings.
  // Fire and forget — the page renders with the bundled fallback
  // until the Google Fonts CSS resolves. The next paginate() call
  // will pick up the right family because pagedCss is regenerated
  // each time.
  void loadSettingsFonts(state.settings).catch((err: unknown) => {
    console.error('Font preload failed', err);
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

  // Edits a tab typed just before being closed (journaled, not yet written).
  await replayDraftJournal(isLockedElsewhere);

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
  // `editor` = editor only. `preview` = the SPLIT (editor + live preview side
  // by side, the editor stays visible). The floating toggles drive both.
  let viewMode: 'editor' | 'preview' = 'editor';
  // Preview UI prefs in localStorage — distinct from the per-doc PdfSettings.
  // PREF_VISIBLE: is the split shown. PREF_PAGINATED: A4 paged.js pages (true)
  // vs a fast continuous flow (false, the live-typing default).
  const PREF_VISIBLE = 'markpage:preview-visible';
  const PREF_PAGINATED = 'markpage:preview-paginated';
  // `previewPaginated` is the user's PREFERENCE (persisted). Pagination is far
  // too slow to run on every keystroke, so an edit while paginated SUSPENDS it:
  // the active render drops to the fast continuous flow until the user clicks
  // "Repaginer". `paginatedSuspended` is that transient state (never persisted).
  let previewPaginated = localStorage.getItem(PREF_PAGINATED) === '1';
  let paginatedSuspended = false;
  // The mode actually rendered right now: paginated only when preferred AND not
  // suspended by an in-progress edit.
  const activePaginated = (): boolean => previewPaginated && !paginatedSuspended;
  const previewVisiblePref = localStorage.getItem(PREF_VISIBLE) === '1';
  // True when the on-screen preview is out of date with the current
  // editor state or settings. Set on every doc/settings change, cleared
  // after a successful paginate.
  let dirty = true;

  // We only show the latest paginate call's output. A previous in-flight
  // render must not overwrite a more recent one.
  let previewReqId = 0;

  // Presentation mode: a fullscreen overlay over the paginated preview, like a
  // PDF reader. Shows one page at a time (slides), or TWO side-by-side when the
  // page is portrait enough that a spread fills the screen better, navigated
  // with the keyboard. `presentAnchor` is the FIRST page of the current row (a
  // page index into `.pagedjs_page`), so the reading position survives a resize
  // even if the single↔double choice flips. `returnMode` remembers whether we
  // came from the editor or the preview. See enter/exitPresentation() below.
  let presenting = false;
  let presentAnchor = 0;
  // True when entering presentation forced a paginated render over a preview
  // that was continuous — so we know to restore the continuous flow on exit.
  let presentForcedPaginate = false;
  let returnMode: 'editor' | 'preview' = 'editor';

  // Page zoom. Invariant: the FULL page width is always visible — the page never
  // overflows the pane. DEFAULT is fit-to-width (`previewAutoFit`): the page fills
  // the pane width, up- or down-scaling as needed. Once the user drags a page side
  // edge it becomes manual absolute zoom z (`previewZoom`, 1 = 100% natural),
  // rendered at min(z, W_v / W_p) so it still never overflows; double-click an
  // edge restores fit-to-width. Driven by the `--mp-fit-zoom`
  // CSS var (applied to `.pagedjs_page` via `zoom`), so the page flow reflows
  // and vertical-scroll / click-to-source stay correct. No-op outside preview
  // and during fullscreen presentation (its own scaling).
  const PREVIEW_FIT_GUTTER = 28; // px breathing room + scrollbar allowance
  let previewZoom = 1; // z — the user's absolute page zoom (once they drag)
  // Default: FIT TO WIDTH — the page fills the pane width (upscaling on a wide/
  // fullscreen pane instead of stranding it at 100% in a sea of desk). Dragging a
  // page edge switches to manual absolute zoom; double-click restores auto-fit.
  let previewAutoFit = true;
  const previewFillFactor = (natural: number): number =>
    (previewEl.clientWidth - PREVIEW_FIT_GUTTER) / natural; // W_v / W_p
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
    const fill = previewFillFactor(natural);
    // auto-fit → fill the pane; manual → the user's zoom, capped so it never
    // overflows the pane (the full page width stays visible).
    previewEl.style.setProperty(
      '--mp-fit-zoom',
      String(previewAutoFit ? fill : Math.min(previewZoom, fill)),
    );
  };

  // Drag-to-zoom: hover a page side edge → ew-resize cursor; drag → set z so the
  // edge tracks the cursor (page stays centred); double-click an edge → z = 1.
  const PREVIEW_EDGE_PX = 8; // hot zone (px) around a page side
  let previewDragging = false;
  let previewDragNatural = 0; // W_p captured at drag start
  let previewDragCenter = 0; // page centre x (px) at drag start
  // Anchored zoom: the leaf element grabbed under the cursor, kept opposite the
  // cursor as the zoom changes (reading its real post-zoom rect avoids drift).
  let previewAnchorEl: Element | null = null;
  let previewAnchorR0 = 1; // applied zoom when grabbed
  let previewAnchorGrab = 0; // cursor offset within the anchor element (px)
  const previewPageRect = (): DOMRect | undefined =>
    previewEl.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect();
  const nearPreviewEdge = (x: number, y: number): boolean => {
    if (presenting || viewMode !== 'preview') return false;
    const pr = previewPageRect();
    if (!pr) return false;
    const vr = previewEl.getBoundingClientRect(); // grab the edge anywhere down the pane
    const inV = y >= vr.top && y <= vr.bottom;
    return (
      inV && (Math.abs(x - pr.left) <= PREVIEW_EDGE_PX || Math.abs(x - pr.right) <= PREVIEW_EDGE_PX)
    );
  };
  previewEl.addEventListener('pointermove', (e) => {
    if (previewDragging) return; // the window handler drives the drag
    previewEl.style.cursor = nearPreviewEdge(e.clientX, e.clientY) ? 'ew-resize' : '';
  });
  previewEl.addEventListener('pointerdown', (e) => {
    if (!nearPreviewEdge(e.clientX, e.clientY)) return;
    const pr = previewPageRect();
    if (!pr) return;
    // Back-compute the natural width from the currently-applied zoom (no flicker).
    const cur = parseFloat(previewEl.style.getPropertyValue('--mp-fit-zoom')) || 1;
    previewDragNatural = pr.width / cur;
    previewDragCenter = pr.left + pr.width / 2;
    // Anchor the leaf element under the cursor (sampled at the page centre) + the
    // cursor's offset within it, to keep it opposite the cursor while zooming.
    previewAnchorR0 = cur;
    const a = document.elementFromPoint(previewDragCenter, e.clientY);
    previewAnchorEl = a && previewEl.contains(a) && a !== previewEl ? a : null;
    previewAnchorGrab = previewAnchorEl
      ? e.clientY - previewAnchorEl.getBoundingClientRect().top
      : 0;
    previewAutoFit = false; // dragging switches to manual absolute zoom
    previewDragging = true;
    previewEl.style.cursor = 'ew-resize';
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!previewDragging) return;
    const half = Math.abs(e.clientX - previewDragCenter);
    previewZoom = Math.max(0.2, Math.min(3, (2 * half) / previewDragNatural));
    const r = Math.min(previewZoom, previewFillFactor(previewDragNatural));
    previewEl.style.setProperty('--mp-fit-zoom', String(r));
    // Keep the grabbed line opposite the cursor (anchored zoom) so the document
    // doesn't slide while resizing. Reading the element's real post-zoom rect
    // avoids cumulative `zoom` rounding drift.
    if (previewAnchorEl) {
      const top = previewAnchorEl.getBoundingClientRect().top;
      previewEl.scrollTop += top + previewAnchorGrab * (r / previewAnchorR0) - e.clientY;
    }
    e.preventDefault();
  });
  window.addEventListener('pointerup', () => {
    if (!previewDragging) return;
    previewDragging = false;
    previewEl.style.cursor = '';
  });
  previewEl.addEventListener('dblclick', (e) => {
    if (!nearPreviewEdge(e.clientX, e.clientY)) return;
    previewAutoFit = true; // restore fit-to-width
    fitPreviewWidth();
  });
  // Don't let an edge click fall through to the click-to-source handler.
  previewEl.addEventListener(
    'click',
    (e) => {
      if (nearPreviewEdge(e.clientX, e.clientY)) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true, // capture — runs before the source-jump click handler
  );

  state.settings = deriveDocSettings(initialDoc);

  // Auto-load relative images from the document's mounted folder. When a doc is
  // opened from a disk volume (`link.volume`/`link.dir`), a `![](rel/path.png)`
  // that was never imported is read live from that folder — resolved against the
  // doc's own directory, staying inside the mounted root. Blob URLs are cached
  // per (volume, path). Returns undefined for docs not linked to a disk volume.
  const folderImageCache = new Map<string, string>();
  // Read a relative resource path from a mounted disk volume, resolved against
  // `baseDir` (the referencing doc's own folder within the volume). Returns the
  // on-disk `File`, or null when the path escapes the root, the volume is gone,
  // or the file is missing. `vol` is passed directly so this works before a doc
  // link exists (import time) as well as after (render time).
  const readDiskFile = (
    vol: DiskVolume,
    baseDir: string,
  ): ((relPath: string) => Promise<File | null>) => {
    return async (relPath: string): Promise<File | null> => {
      const full = resolveWithinRoot(baseDir, relPath);
      if (full === null) return null;
      try {
        return await (await vol.fileHandle(full)).getFile();
      } catch {
        return null; // missing file / permission revoked → leave the ref as-is
      }
    };
  };
  // Same, but keyed off a linked document's `link.volume`/`link.dir` — used by
  // the render-time resolvers. Returns undefined for docs with no disk origin.
  const readFolderFile = (
    doc: DocEntry,
  ): ((relPath: string) => Promise<File | null>) | undefined => {
    const link = doc.link;
    if (!link?.volume) return undefined;
    const { volume, dir = '' } = link;
    return async (relPath: string): Promise<File | null> => {
      const vol = (await listVolumes()).find(
        (v) => v.kind === 'disk' && v.label === volume,
      );
      if (!(vol instanceof DiskVolume)) return null;
      return readDiskFile(vol, dir)(relPath);
    };
  };
  // Preview resolver: relative path -> blob URL, cached per (volume, path).
  const makeFolderImageResolver = (
    doc: DocEntry,
  ): ((relPath: string) => Promise<string | null>) | undefined => {
    // A URL document's relative images live next to it, at its URL.
    const ul = urlLinkOf(doc);
    if (ul) return (relPath) => Promise.resolve(resolveAgainstDoc(ul.url, relPath));
    const read = readFolderFile(doc);
    if (!read) return undefined;
    const volume = doc.link?.volume ?? '';
    return async (relPath: string): Promise<string | null> => {
      const key = `${volume}\u0000${relPath}`;
      const hit = folderImageCache.get(key);
      if (hit) return hit;
      const file = await read(relPath);
      if (!file) return null;
      const url = URL.createObjectURL(file);
      folderImageCache.set(key, url);
      return url;
    };
  };
  // PDF/print resolver: relative path -> base64 data URL, so the exported
  // markdown is self-contained (the print pipeline can't read blob: URLs).
  const makeFolderImageDataResolver = (
    doc: DocEntry,
  ): ((relPath: string) => Promise<string | null>) | undefined => {
    const ul = urlLinkOf(doc);
    if (ul) return (relPath) => Promise.resolve(resolveAgainstDoc(ul.url, relPath));
    const read = readFolderFile(doc);
    if (!read) return undefined;
    return async (relPath: string): Promise<string | null> => {
      const file = await read(relPath);
      if (!file) return null;
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    };
  };

  // Builds the rendered DOM subtree (Markdown + post-processing) shared by
  // both render modes. Returns null if a newer request superseded this one
  // (stale-guard via previewReqId), so callers can bail.
  const buildPreviewDom = async (
    source: string,
  ): Promise<{
    built: HTMLElement;
    effectiveSettings: PdfSettings;
    myReq: number;
  } | null> => {
    const myReq = ++previewReqId;
    const resolved = await expandRefsToBlobUrls(
      source,
      makeFolderImageResolver(currentDoc),
    );
    // Resolved from the source being rendered, not the debounced state.settings,
    // so a `document-style:` edit shows in the very render it triggers.
    const effectiveSettings = deriveDocSettings(source);
    const { built } = await buildDocumentDom(resolved, effectiveSettings, {
      beforeHydrate: (b) => annotateSourceLines(b, source),
    });
    if (myReq !== previewReqId) return null;
    return { built, effectiveSettings, myReq };
  };

  // Continuous (non-paginated) render: the built content in a single white
  // sheet of page width — no pagination, so it re-renders on every keystroke.
  const renderContinuous = (
    built: HTMLElement,
    effectiveSettings: PdfSettings,
  ): void => renderContinuousSheet(built, effectiveSettings, previewEl);

  // Render `source` into the preview pane, paginated (paged.js A4 pages) or
  // continuous, per `previewPaginated`. Called when entering preview, on a
  // settings change, and — debounced — live while typing.
  // Progress overlay for paginated rendering. The layout engine's work
  // dominates the wait (~85%, measured) and shows only its first page while it
  // runs, so a long document looks frozen. This covers the pane and reports the
  // live page count — Vivliostyle emits its `[data-vivliostyle-page-container]`
  // elements progressively — so the wait reads as work. Shown only after a
  // short delay so a fast render never flashes it, and torn down when
  // pagination resolves. Returns a stop() to call in a `finally`.
  const beginPaginationProgress = (pane: HTMLElement): (() => void) => {
    let overlay: HTMLElement | null = null;
    let poll = 0;
    const place = (el: HTMLElement): void => {
      const r = pane.getBoundingClientRect();
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    };
    const show = (): void => {
      overlay = document.createElement('div');
      overlay.className = 'mp-pagination-progress';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      const spinner = document.createElement('div');
      spinner.className = 'mp-pp-spinner';
      const label = document.createElement('div');
      label.className = 'mp-pp-label';
      label.textContent = t('preview.paginating');
      overlay.append(spinner, label);
      place(overlay);
      document.body.appendChild(overlay);
      // Count the page containers the engine has emitted so far and rebuild
      // the label each tick: "Mise en page… 34 pages".
      poll = window.setInterval(() => {
        const n = pane.querySelectorAll(
          '[data-vivliostyle-page-container]',
        ).length;
        label.textContent = t('preview.paginating');
        if (n > 0) {
          const count = document.createElement('span');
          count.className = 'mp-pp-count';
          count.textContent = String(n);
          label.append(' ', count, ` ${t('preview.paginating.pages')}`);
        }
      }, 200);
    };
    // The pane is cleared while a render runs, so surface the spinner quickly —
    // a short delay still lets a fast (small-doc) render finish first without a
    // flash, but a slow one shows "Mise en page… N pages" promptly instead of an
    // unexplained blank.
    const delay = window.setTimeout(show, 400);
    return () => {
      window.clearTimeout(delay);
      window.clearInterval(poll);
      overlay?.remove();
    };
  };

  // The settings of the last render — the resolved style — read by the
  // presentation layout and the style export.
  let lastEffectiveSettings: PdfSettings = state.settings;

  // Cached (source line → preview Y) map for the live scroll-follow. Y is
  // content-relative so it survives scrolling; invalidated on every re-render
  // (and on resize) and rebuilt lazily on the next sync. Read via
  // getPreviewLineMap() (defined with the follow controller).
  let previewLineMap: LineEntry[] | null = null;
  const invalidatePreviewLineMap = (): void => {
    previewLineMap = null;
  };
  // Timestamp of the last FOLLOW-DRIVEN (programmatic) scroll of each pane. Each
  // pane's scroll handler ignores its own events for a short window after, so
  // our animation is never mistaken for a user scroll and echoed back — which
  // is what made the two panes converge to a fixed point.
  let lastProgEditorScroll = 0;
  let lastProgPreviewScroll = 0;

  const updatePreview = async (
    source: string,
    opts: { forcePaginated?: boolean } = {},
  ): Promise<void> => {
    const r = await buildPreviewDom(source);
    if (!r) return;
    lastEffectiveSettings = r.effectiveSettings;
    // Style-editor page fill (STYLE-EDITOR-SPEC §4): a tinted title page can
    // sit over plain body pages.
    applyPageFills(previewEl, r.effectiveSettings);
    if (activePaginated() || opts.forcePaginated) {
      // Show a CLEAR "rendering" state: clear the stale pages now (so you never
      // wonder whether you're looking at the current render) and let the progress
      // spinner mark the wait — pages reappear only when the new render is ready.
      // We still render into a HIDDEN buffer inside the pane (so the scoped
      // pagedCss + fit-zoom apply and two overlapping renders never fight over
      // the pane) and swap it in on completion. No serialization: a newer edit
      // clears the pane again and supersedes this render (previewReqId guard).
      previewEl.classList.remove('continuous');
      const buffer = document.createElement('div');
      buffer.style.cssText =
        'position: absolute; top: 0; left: 0; width: 100%; ' +
        'visibility: hidden; pointer-events: none;';
      previewEl.replaceChildren(buffer); // clears old pages → pane goes blank
      const stopProgress = beginPaginationProgress(previewEl);
      try {
        await paginate(r.built, r.effectiveSettings, buffer);
      } finally {
        stopProgress();
      }
      // Superseded: a newer render already cleared the pane and owns it. Do
      // nothing (this render's buffer was detached by that replaceChildren).
      if (r.myReq !== previewReqId) return;
      // Reveal the freshly rendered pages, at the top (fresh content).
      previewEl.replaceChildren(...buffer.childNodes);
      previewEl.scrollTop = 0;
      dirty = false;
      fitPreviewWidth();
    } else {
      // Continuous mode draws per-element styles from the injected stylesheet
      // (not pagedCss), so refresh it from the per-doc effective settings —
      // otherwise frontmatter / stack style overrides wouldn't show here.
      applyPreviewStyles(r.effectiveSettings);
      renderContinuous(r.built, r.effectiveSettings);
      dirty = false;
      fitPreviewWidth();
    }
    // The DOM changed → the cached scroll-follow line-map is stale.
    invalidatePreviewLineMap();
  };

  // Autosave writes the *working copy* (draft), never the committed content
  // — the committed version stays the "version de départ" until an explicit
  // Save (Phase 2 working-copy model, SPEC §6). The uuid is captured at edit
  // time so a debounced save can't land on a doc switched-to meanwhile.
  // Edits made vs edits known written: while they differ, a closing tab
  // journals its text synchronously (see onTabHidden below).
  let editSeq = 0;
  let savedSeq = 0;
  const draftWritten = (uuid: string, seq: number): void => {
    savedSeq = Math.max(savedSeq, seq);
    if (savedSeq === editSeq) clearDraftJournal(uuid);
  };
  const debouncedSaveDraft = debounce((uuid: string, source: string) => {
    const seq = editSeq;
    void (async () => {
      try {
        const updated = await saveDraft(uuid, source);
        draftWritten(uuid, seq);
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

  // Keep the preview aligned with the edit point (caret) — assigned later,
  // where the scroll-follow driver lock lives. No-op until then.
  let followPreviewToCaret: () => void = () => {};

  // Live preview while typing — only when the split is shown. Continuous
  // re-renders fast on every keystroke (short debounce); A4 pagination is
  // heavier, so it waits for a typing pause. The previewReqId stale-guard in
  // buildPreviewDom drops any render a newer keystroke superseded.
  const scheduleContinuousPreview = debounce(() => {
    if (viewMode !== 'preview' || presenting || activePaginated()) return;
    void updatePreview(editor.getValue()).then(followPreviewToCaret);
  }, 120);
  const schedulePaginatedPreview = debounce(() => {
    if (viewMode !== 'preview' || presenting || !activePaginated()) return;
    void updatePreview(editor.getValue());
  }, 500);
  const scheduleLivePreview = (): void => {
    if (viewMode !== 'preview' || presenting) return;
    // An edit suspends a paginated preview (pagination can't keep up with
    // typing): drop to the fast continuous flow until the user re-paginates.
    if (previewPaginated && !paginatedSuspended) {
      paginatedSuspended = true;
      updatePreviewToggleUI();
    }
    if (activePaginated()) schedulePaginatedPreview();
    else scheduleContinuousPreview();
  };

  applyPreviewStyles(state.settings);

  // A front-matter edit can change the document's style (`document-style:`) or
  // language: re-derive the settings, then repaint the preview CSS and fonts.
  let scheduleSettingsFromFrontmatter: (source: string) => void = () => {};
  const frontmatterSnapshot = (source: string): string => {
    if (!source.startsWith('---\n')) return '';
    const end = source.indexOf('\n---', 4);
    return end < 0 ? source : source.slice(0, end + 4);
  };
  let lastAppliedSettingsFrontmatter = frontmatterSnapshot(initialDoc);

  // Whether this tab owns the current document (holds its edit lock). A tab
  // that doesn't is read-only and never writes it — see tab-presence.ts.
  let docEditable = true;

  // Also bound inside the editor keymap (filled in below, after the action fns
  // exist) so Cmd/Ctrl shortcuts fire while CodeMirror has focus — Firefox
  // doesn't bubble them to the window listener like Chromium does.
  const editorShortcuts: EditorShortcuts = {};
  const editor = createEditor(
    editorEl,
    initialDoc,
    (doc) => {
      // Edits mark the preview dirty, live-refresh the split (if shown), and
      // auto-persist the working copy.
      dirty = true;
      // A tab that doesn't own the document (read-only here, edited in another
      // tab) never writes it — its copy may be older than the owner's.
      if (docEditable) {
        editSeq++;
        debouncedSaveDraft(currentDoc.uuid, doc);
      }
      scheduleLivePreview();
      // Always feed the debouncer: a replace operation is emitted as
      // "delete, then insert". Keeping only the first changed snapshot would
      // derive the transient empty document and discard the final source.
      scheduleSettingsFromFrontmatter(doc);
    },
    editorShortcuts,
  );

  attachStyleContextMenu(editor.view.dom, editor.view);

  scheduleSettingsFromFrontmatter = debounce((source: string) => {
    const snapshot = frontmatterSnapshot(source);
    if (snapshot === lastAppliedSettingsFrontmatter) return;
    lastAppliedSettingsFrontmatter = snapshot;
    state.settings = deriveDocSettings(source);
    registerCustomFonts(state.settings.customFonts);
    applyPreviewStyles(state.settings);
    void loadSettingsFonts(state.settings).catch((err: unknown) => {
      console.error('Font load failed', err);
    });
  }, 180);

  // Assigned in renderToolbar() below before any user input has the
  // chance to fire setViewMode().
  let toolbarCtrl!: ToolbarControl;

  // Reassigned once the floating toggles are built (just below); a no-op until
  // then so setViewMode can call it unconditionally.
  let updatePreviewToggleUI: () => void = () => {};

  const setViewMode = (mode: 'editor' | 'preview'): void => {
    viewMode = mode;
    panesEl.dataset['view'] = mode;
    toolbarCtrl.setViewMode(mode);
    localStorage.setItem(PREF_VISIBLE, mode === 'preview' ? '1' : '0');
    updatePreviewToggleUI();
  };

  // editor → preview. Snapshot the cursor's anchor before flipping the
  // panes (the editor's measurements need to be read while it's still
  // visible), then paginate if dirty, then align the preview to the
  // snapshot so the same source line lands at the same viewport y.
  const enterPreview = async (): Promise<void> => {
    const anchor = editorCursorAnchor(editor.view);
    // Opening the preview shows the PREFERRED mode fresh — clear any stale
    // edit-suspension so a paginated preference paginates on open.
    paginatedSuspended = false;
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

  // Switch the visible preview between continuous flow and paged A4, persist
  // the choice, and re-render if the split is up.
  const setPreviewPaginated = (on: boolean): void => {
    if (previewPaginated === on && !paginatedSuspended) return;
    previewPaginated = on;
    paginatedSuspended = false; // an explicit choice always un-suspends
    localStorage.setItem(PREF_PAGINATED, on ? '1' : '0');
    updatePreviewToggleUI();
    if (viewMode === 'preview' && !presenting) {
      dirty = true;
      void updatePreview(editor.getValue());
    }
  };

  // Re-engage a paginated preview that an edit suspended: clear the suspension
  // and paginate the current text. Same cost as a normal paginate — run only on
  // the user's explicit request (the "Repaginer" button).
  const repaginate = (): void => {
    if (!previewPaginated || !paginatedSuspended) return;
    paginatedSuspended = false;
    updatePreviewToggleUI();
    if (viewMode === 'preview' && !presenting) {
      dirty = true;
      void updatePreview(editor.getValue());
    }
  };

  // ---- Floating preview toggles (top-left of the panes) ------------------
  // "Aperçu" shows/hides the split (= toggleView); "A4" flips the visible
  // preview between continuous flow and paged A4 pages. The A4 button is
  // hidden while the preview is off. The widget stays visible so a hidden
  // preview can be reopened.
  const previewToolbar = document.createElement('div');
  previewToolbar.className = 'mp-preview-toolbar';
  const showToggleBtn = document.createElement('button');
  showToggleBtn.className = 'mp-preview-toggle';
  showToggleBtn.textContent = t('preview-toggle.show');
  showToggleBtn.title = t('preview-toggle.show-title');
  const paginateToggleBtn = document.createElement('button');
  paginateToggleBtn.className = 'mp-preview-toggle';
  paginateToggleBtn.textContent = t('preview-toggle.paginate');
  paginateToggleBtn.title = t('preview-toggle.paginate-title');
  previewToolbar.append(showToggleBtn, paginateToggleBtn);
  panesEl.append(previewToolbar);

  updatePreviewToggleUI = (): void => {
    const on = viewMode === 'preview';
    showToggleBtn.classList.toggle('active', on);
    paginateToggleBtn.hidden = !on;
    // Three states: continuous (inactive), paginated (active), and
    // paginated-but-suspended-by-an-edit → the button becomes "Repaginer".
    const suspended = on && previewPaginated && paginatedSuspended;
    paginateToggleBtn.classList.toggle('active', on && activePaginated());
    paginateToggleBtn.classList.toggle('suspended', suspended);
    paginateToggleBtn.textContent = suspended
      ? t('preview-toggle.repaginate')
      : t('preview-toggle.paginate');
    paginateToggleBtn.title = suspended
      ? t('preview-toggle.repaginate-title')
      : t('preview-toggle.paginate-title');
  };

  showToggleBtn.addEventListener('click', () => toggleView());
  paginateToggleBtn.addEventListener('click', () => {
    // Suspended → re-engage the paginated view; otherwise flip the preference.
    if (previewPaginated && paginatedSuspended) repaginate();
    else setPreviewPaginated(!previewPaginated);
  });
  updatePreviewToggleUI();

  // Click inside the preview jumps the editor's cursor to that source line
  // (the editor stays visible in the split) — except when the click hits a
  // real hyperlink (cross-ref, footnote ref, citation back-link, external
  // link…). Then we honour the link: in-doc fragments scroll the preview,
  // external URLs open in a new tab so markpage stays put.
  previewEl.addEventListener('click', (e) => {
    if (viewMode !== 'preview') return;
    // While presenting, clicks advance the slideshow (handled by
    // onPresentClick); don't jump the editor.
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
    if (anchor) {
      // Preview-initiated: mark the editor scroll this triggers as programmatic
      // so the follow doesn't echo it back and re-scroll the preview away from
      // the clicked line (which would break the face-to-face alignment).
      lastProgEditorScroll = performance.now();
      applyAnchorToEditor(editor.view, anchor);
      editor.view.focus();
    }
  });

  // ---- Live scroll-follow: align at 1/3 of the viewport, lightly eased ---
  // The pane you scroll DRIVES the other. Principle (same as a click): take the
  // source line one third down the driver's viewport and put it one third down
  // the other pane. A cached line-map keeps it cheap; a light ease glides over
  // the per-block slope changes so it never lurches. Echo control is per pane:
  // while we animate a pane we timestamp it, and that pane's own scroll handler
  // ignores events within a short window — so our animation is never mistaken
  // for a user scroll and fed back (which made the two panes converge). Works
  // in continuous AND paginated modes (the [data-line] anchors survive
  // pagination). Inert while presenting.
  const REF_FRACTION = 1 / 3;
  const ECHO_MS = 120;
  const scrollSyncActive = (): boolean =>
    viewMode === 'preview' && !presenting;
  const getPreviewLineMap = (): LineEntry[] => {
    if (!previewLineMap || previewLineMap.length === 0) {
      // The source ends at its last non-blank line (trailing blank lines
      // render nothing): that is where the preview's content ends.
      const doc = editor.view.state.doc;
      let end = doc.lines;
      while (end > 1 && doc.line(end).text.trim() === '') end--;
      previewLineMap = buildPreviewLineMap(previewEl, end);
    }
    return previewLineMap;
  };
  const clampScroll = (el: HTMLElement, top: number): number =>
    Math.max(0, Math.min(el.scrollHeight - el.clientHeight, top));

  // One reusable glide (~50 ms). `mark` timestamps the eased pane every frame so
  // that pane's scroll handler treats the events it fires as echoes.
  let easeRAF = 0;
  let easeEl: HTMLElement | null = null;
  let easeTarget = 0;
  let easeMark: () => void = () => {};
  const easeScrollTo = (
    el: HTMLElement,
    target: number,
    mark: () => void,
  ): void => {
    easeEl = el;
    easeTarget = target;
    easeMark = mark;
    if (easeRAF) return;
    const step = (): void => {
      if (!easeEl) {
        easeRAF = 0;
        return;
      }
      easeMark();
      const d = easeTarget - easeEl.scrollTop;
      if (Math.abs(d) < 0.5) {
        easeEl.scrollTop = easeTarget;
        easeMark();
        easeEl = null;
        easeRAF = 0;
        return;
      }
      const prev = easeEl.scrollTop;
      easeEl.scrollTop += d * 0.34;
      // No progress (a sub-pixel step rounded away, a target out of reach):
      // stop — a glide that never ends would pin the pane and mask its own
      // user scrolls as echoes.
      if (easeEl.scrollTop === prev) {
        easeEl = null;
        easeRAF = 0;
        return;
      }
      easeRAF = requestAnimationFrame(step);
    };
    easeRAF = requestAnimationFrame(step);
  };
  // The user's hand on a pane (wheel, touch, press) makes it the driver at
  // once: cancel a glide still moving it, and stop masking its scroll events.
  const takeScrollControl = (el: HTMLElement, clearMark: () => void): void => {
    const handler = (): void => {
      if (easeEl === el) {
        cancelAnimationFrame(easeRAF);
        easeEl = null;
        easeRAF = 0;
      }
      clearMark();
    };
    for (const type of ['wheel', 'touchstart', 'pointerdown'] as const) {
      el.addEventListener(type, handler, { passive: true });
    }
  };
  takeScrollControl(previewEl, () => {
    lastProgPreviewScroll = 0;
  });
  takeScrollControl(editor.view.scrollDOM, () => {
    lastProgEditorScroll = 0;
  });
  const easePreviewTo = (target: number): void =>
    easeScrollTo(previewEl, clampScroll(previewEl, target), () => {
      lastProgPreviewScroll = performance.now();
    });
  const easeEditorTo = (target: number): void => {
    const s = editor.view.scrollDOM;
    easeScrollTo(s, clampScroll(s, target), () => {
      lastProgEditorScroll = performance.now();
    });
  };

  // Editor drives → align the preview.
  let editorScrollTick = false;
  editor.view.scrollDOM.addEventListener(
    'scroll',
    () => {
      if (editorScrollTick) return;
      editorScrollTick = true;
      requestAnimationFrame(() => {
        editorScrollTick = false;
        if (!scrollSyncActive()) return;
        if (performance.now() - lastProgEditorScroll < ECHO_MS) return; // echo
        const refY = editor.view.scrollDOM.clientHeight * REF_FRACTION;
        const line = editorLineAtViewportY(editor.view, refY);
        easePreviewTo(
          previewYForLine(line, getPreviewLineMap()) -
            previewEl.clientHeight * REF_FRACTION,
        );
      });
    },
    { passive: true },
  );

  // Preview drives → align the editor.
  let previewScrollTick = false;
  previewEl.addEventListener(
    'scroll',
    () => {
      if (previewScrollTick) return;
      previewScrollTick = true;
      requestAnimationFrame(() => {
        previewScrollTick = false;
        if (!scrollSyncActive()) return;
        if (performance.now() - lastProgPreviewScroll < ECHO_MS) return; // echo
        const refY = previewEl.clientHeight * REF_FRACTION;
        const line = lineAtPreviewY(
          previewEl.scrollTop + refY,
          getPreviewLineMap(),
        );
        const contentY = editorContentYForLine(editor.view, line);
        if (contentY === null) return;
        easeEditorTo(contentY - editor.view.scrollDOM.clientHeight * REF_FRACTION);
      });
    },
    { passive: true },
  );

  // Click in the EDITOR → align the preview so the clicked line sits at the
  // click's height (the mirror of a preview click aligning the editor).
  editor.view.dom.addEventListener('click', (e) => {
    if (!scrollSyncActive()) return;
    const pos = editor.view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    const line = editor.view.state.doc.lineAt(pos).number - 1;
    const y = e.clientY - previewEl.getBoundingClientRect().top;
    const map = getPreviewLineMap();
    const top = previewYForLine(line, map);
    // …but the whole rendered line must show: a click low in the editor would
    // otherwise leave its end (a wrapped line, the document's end) under the
    // bottom edge. Its top wins if it can't fit.
    const margin = 16;
    const bottom = previewYForLine(line + 1, map);
    let target = top - y;
    target = Math.max(target, bottom - (previewEl.clientHeight - margin));
    target = Math.min(target, top - margin);
    easePreviewTo(target);
  });

  // Resizing the split (or the window) re-wraps the preview WITHOUT a re-render,
  // so every line moves and the cached follow map goes stale — invalidate it so
  // the next sync rebuilds against the new layout. previewEl's own size changes
  // whenever the editor pane is resized (they share the split), so observing it
  // covers both. Skip the observer's synchronous first callback.
  let previewResizePrimed = false;
  const previewResizeObserver = new ResizeObserver(() => {
    if (!previewResizePrimed) {
      previewResizePrimed = true;
      return;
    }
    invalidatePreviewLineMap();
  });
  previewResizeObserver.observe(previewEl);

  // Edit path: keep the caret's line aligned in the preview while typing — only
  // when the editor has focus (never yank the preview if you're reading it).
  followPreviewToCaret = (): void => {
    if (!scrollSyncActive() || !editor.view.hasFocus) return;
    const a = editorCursorAnchor(editor.view);
    if (!a) return;
    easePreviewTo(previewYForLine(a.line, getPreviewLineMap()) - a.y);
  };

  // ---- Presentation mode -------------------------------------------------

  // Lay out the current slide: reveal only its page (via `.is-current`)
  // and scale it to fill the viewport while keeping its aspect ratio.
  // We read offsetWidth/Height — paged.js's fixed layout size in px,
  // unaffected by our own transform — so the ratio stays correct and the
  // computation is stable across repeated calls (e.g. on resize).
  const pagedPages = (): HTMLElement[] =>
    Array.from(previewEl.querySelectorAll<HTMLElement>('.pagedjs_page'));

  // Lay out the current row: reveal its page(s), position + scale them (single
  // centred, or two side-by-side for a spread — see presentation.ts for the
  // pure geometry). offsetWidth/Height is the engine's fixed px size, unaffected
  // by our own transform, so it is stable across repeated calls (e.g. resize).
  const renderPresent = (): void => {
    const pages = pagedPages();
    const first = pages[0];
    if (!first) return;
    const { boxes, anchor } = presentLayout({
      pageCount: pages.length,
      pw: first.offsetWidth,
      ph: first.offsetHeight,
      winW: window.innerWidth,
      winH: window.innerHeight,
      anchor: presentAnchor,
      duplex: !!lastEffectiveSettings.duplex,
    });
    if (boxes.length === 0) return;
    presentAnchor = anchor;
    const shown = new Set(boxes.map((b) => b.pageIndex));
    pages.forEach((p, i) => {
      if (!shown.has(i)) {
        p.classList.remove('is-current');
        p.style.transform = '';
      }
    });
    for (const b of boxes) {
      const p = pages[b.pageIndex];
      if (!p) continue;
      p.classList.add('is-current');
      p.style.transform = `translate(${b.x}px, ${b.y}px) scale(${b.scale})`;
    }
  };

  // Move by whole rows (a spread counts as one step). `delta` is clamped.
  const gotoRow = (delta: number): void => {
    const pages = pagedPages();
    const first = pages[0];
    if (!first) return;
    presentAnchor = presentStep({
      pageCount: pages.length,
      pw: first.offsetWidth,
      ph: first.offsetHeight,
      winW: window.innerWidth,
      winH: window.innerHeight,
      duplex: !!lastEffectiveSettings.duplex,
      anchor: presentAnchor,
      delta,
    });
    renderPresent();
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
        gotoRow(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
      case 'p':
        e.preventDefault();
        gotoRow(-1);
        break;
      case 'Home':
        e.preventDefault();
        gotoRow(-Number.MAX_SAFE_INTEGER);
        break;
      case 'End':
        e.preventDefault();
        gotoRow(Number.MAX_SAFE_INTEGER);
        break;
    }
  };

  // Click advances one row — except on a real hyperlink, so in-page links work.
  const onPresentClick = (e: MouseEvent): void => {
    if ((e.target as HTMLElement | null)?.closest('a[href]')) return;
    gotoRow(1);
  };

  const onPresentResize = (): void => {
    if (presenting) renderPresent();
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
      .querySelectorAll<HTMLElement>('.pagedjs_page.is-current')
      .forEach((p) => {
        p.classList.remove('is-current');
        p.style.transform = '';
      });
    if (document.fullscreenElement) void document.exitFullscreen();
    if (returnMode === 'editor') {
      enterEditor(null);
    } else if (presentForcedPaginate && !activePaginated()) {
      // We paginated over a continuous preview for the show — restore the
      // user's continuous flow now that we're back in the pane.
      void updatePreview(editor.getValue());
    } else {
      fitPreviewWidth(); // back to preview → re-fit to the pane
    }
    presentForcedPaginate = false;
  };

  // Enter fullscreen presentation. Works on ANY document (not just slides): it
  // reuses the paginated preview, so we force a paginated render when the
  // preview is continuous / suspended / stale — otherwise there are no pages to
  // show. requestFullscreen() MUST be called synchronously within the user
  // gesture — before any await — or the browser rejects it; pagination runs
  // alongside. The `.presentation` class is added only AFTER pagination: it
  // hides all but the current page, and the engine can't measure hidden pages —
  // applying it earlier collapses the layout to a single empty page.
  const enterPresentation = async (): Promise<void> => {
    if (presenting) return;
    returnMode = viewMode;
    setViewMode('preview'); // sync: makes #preview-pane visible
    const fsRequest = previewEl.requestFullscreen().catch((err) => {
      console.error('Fullscreen request failed', err);
      return 'denied' as const;
    });
    // Presentation needs paginated pages. If the visible preview isn't already
    // showing current pages (continuous, edit-suspended, or dirty), paginate now.
    presentForcedPaginate = !activePaginated();
    if (dirty || presentForcedPaginate) {
      try {
        await updatePreview(editor.getValue(), { forcePaginated: true });
      } catch (err) {
        console.error('Preview render failed', err);
      }
    }
    const fsResult = await fsRequest;
    if (fsResult === 'denied') {
      presentForcedPaginate = false;
      if (returnMode === 'editor') enterEditor(null);
      return;
    }
    presenting = true;
    presentAnchor = 0;
    previewEl.classList.add('presentation');
    fitPreviewWidth(); // drops the fit-zoom so presentation scaling is clean
    window.addEventListener('keydown', onPresentKeydown, true);
    previewEl.addEventListener('click', onPresentClick);
    window.addEventListener('resize', onPresentResize);
    renderPresent();
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
    if (!docEditable) return; // read-only here: another tab owns the document
    const seq = editSeq;
    try {
      const updated = await saveDraft(currentDoc.uuid, editor.getValue());
      draftWritten(updated.uuid, seq);
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
    await replayDraftJournal(isLockedElsewhere, uuid);
    const target = (await listDocs()).find((e) => e.uuid === uuid);
    if (!target) return;
    currentDoc = target;
    await setCurrentDocId(target.uuid);
    const content = (await loadDocContent(target)) ?? '';
    // Resolve the incoming doc's style before rendering, so nothing renders
    // with the outgoing doc's settings.
    state.settings = deriveDocSettings(content);
    editor.setValue(content);
    dirty = true;
    // Keep the split open across doc switches — refresh it for the new doc.
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setDocName(target.name);
    toolbarCtrl.setModified(isModified(target));
    toolbarCtrl.setOrigin(originOf(target));
    toolbarCtrl.setConflict(false);
    void checkSync();
  };

  // ---- one document per tab ---------------------------------------------
  // Opening a document gives it its own browser tab (its own window once the
  // app is installed), like a desktop editor; this tab is reused only when it
  // holds an empty, unmodified document. The new tab is opened INSIDE the click
  // (an about:blank placeholder, sent to the document once it exists): opened
  // after async work, a popup blocker would stop it. Blocked anyway → here.
  const reuseThisTab = (): boolean =>
    editor.getValue().trim() === '' && !isModified(currentDoc);
  const prepareDocTab = (): Window | null =>
    reuseThisTab() ? null : window.open('', '_blank');
  const docTabUrl = (uuid: string): string => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('doc', uuid);
    return url.toString();
  };
  // A document already open in another tab: ask that tab to come forward (the
  // browser may not let it take focus) and say so here.
  const pointToOtherTab = (uuid: string): void => {
    requestFocus(uuid);
    showNotice(t('tabs.open-elsewhere'));
  };
  // Show `entry` where it belongs: nowhere (null — cancelled or failed), in the
  // tab that already has it, in the prepared new tab, or here.
  const showDocIn = async (entry: DocEntry | null, win: Window | null): Promise<void> => {
    const placeholder = win && !win.closed ? win : null;
    if (!entry || entry.uuid === currentDoc.uuid) {
      placeholder?.close();
      return;
    }
    if (await isLockedElsewhere(entry.uuid)) {
      placeholder?.close();
      pointToOtherTab(entry.uuid);
      return;
    }
    if (placeholder) {
      placeholder.location.href = docTabUrl(entry.uuid);
      return;
    }
    await switchToDoc(entry.uuid);
  };

  const createNewDoc = async (): Promise<void> => {
    // A brand-new doc starts empty — it renders with the default style until
    // one is picked from the Style menu (document-style).
    const win = prepareDocTab();
    const entry = await createDoc('Sans titre', '');
    await showDocIn(entry, win);
  };

  const renameCurrentDoc = async (newName: string): Promise<void> => {
    const updated = await renameDoc(currentDoc.uuid, newName);
    if (!updated) return;
    currentDoc = updated;
    toolbarCtrl.setDocName(updated.name);
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
      state.settings = deriveDocSettings('');
      editor.setValue('');
    } else {
      const next = remaining[0];
      currentDoc = next;
      await setCurrentDocId(next.uuid);
      const content = (await loadDocContent(next)) ?? '';
      state.settings = deriveDocSettings(content);
      editor.setValue(content);
    }
    dirty = true;
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setDocName(currentDoc.name);
    toolbarCtrl.setModified(isModified(currentDoc));
    toolbarCtrl.setOrigin(originOf(currentDoc));
  };

  // ---- working-copy commands (Phase 2, SPEC §6) -------------------------

  // Save: commit the working copy (draft → committed version). If the doc is
  // linked to a disk folder, also push the committed bundle there. `force`:
  // the user chose to overwrite a file VS Code reports changed (conflict).
  const saveCurrentDoc = async (force = false): Promise<void> => {
    await flushSave(); // ensure the latest keystrokes are in the draft first
    currentDoc = await commitDoc(currentDoc.uuid);
    toolbarCtrl.setModified(false);
    if (isLinked(currentDoc)) await pushToDisk();
    if (isGithubLinked(currentDoc)) await pushToGithub();
    if (isOneDriveLinked(currentDoc)) await pushToOneDrive();
    if (vscodeLinked(currentDoc)) await pushToVsCode(force);
  };

  // Revert: discard the working copy and reload the committed content.
  const revertCurrentDoc = async (): Promise<void> => {
    if (!isModified(currentDoc)) return;
    currentDoc = await revertDoc(currentDoc.uuid);
    const content = (await loadCommittedContent(currentDoc)) ?? '';
    state.settings = deriveDocSettings(content);
    editor.setValue(content);
    dirty = true;
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setModified(false);
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
    state.settings = deriveDocSettings(content);
    editor.setValue(content);
    toolbarCtrl.setModified(false);
    dirty = true;
    if (presenting) {
      // paged.js can't measure the hidden (display:none) non-current pages, so
      // drop `.presentation` for the re-paginate, then restore it + the page.
      // Force paginated: presentation may run over an otherwise-continuous
      // preview, and a continuous re-render would leave no pages to show.
      previewEl.style.visibility = 'hidden';
      previewEl.classList.remove('presentation');
      try {
        await updatePreview(content, { forcePaginated: true });
      } finally {
        previewEl.classList.add('presentation');
        renderPresent(); // presentAnchor preserved (clamped if pages shrank)
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
    // Only the tab that owns the document syncs it with its origin.
    if (syncing || !docEditable || !isLinked(currentDoc)) return;
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
    if (vscodeLinked(currentDoc)) void reloadFromUrl(true);
    else void reloadFromDisk(true);
  };

  // ---- a local file VS Code serves ("Open in markpage.org") -------------
  // Edited in place: Save writes it back through VS Code (over the version
  // last read — else a conflict, never an overwrite), and edits made in VS
  // Code come in by the same poll as a disk file's.

  const vscodeLinked = (e: DocEntry): boolean => {
    const link = urlLinkOf(e);
    return link !== undefined && isWritableUrl(new URL(link.url));
  };

  const sayVsCode = (text: string): void =>
    showNotice(text, {
      id: 'mp-url',
      sticky: true,
      action: { label: 'OK', run: () => hideNotice('mp-url') },
    });

  const pushToVsCode = async (force: boolean): Promise<void> => {
    const link = urlLinkOf(currentDoc);
    if (!link) return;
    const content = (await loadCommittedContent(currentDoc)) ?? '';
    syncing = true; // no poll between the write and its baseline
    try {
      const r = await putDocText(new URL(link.url), content, { base: link.fetchedSha, force });
      if (r === 'conflict') {
        toolbarCtrl.setConflict(true);
        sayVsCode(t('vscode.conflict'));
        return;
      }
      currentDoc = (await markUrlFetched(currentDoc.uuid, content)) ?? currentDoc;
      toolbarCtrl.setConflict(false);
      hideNotice('mp-url');
    } catch {
      sayVsCode(t('vscode.unreachable'));
    } finally {
      syncing = false;
    }
  };

  // The poll: take VS Code's edits when markpage has none since the last
  // sync, flag a conflict when both sides changed. VS Code closed → quiet
  // for a while (no request storm on a dead port).
  let vscodeRetryAt = 0;
  const checkVsCodeSync = async (): Promise<void> => {
    const link = urlLinkOf(currentDoc);
    if (syncing || !docEditable || !link || !vscodeLinked(currentDoc)) return;
    if (performance.now() < vscodeRetryAt) return;
    syncing = true;
    const uuid = currentDoc.uuid;
    try {
      const text = await fetchDocText(new URL(link.url));
      if (currentDoc.uuid !== uuid) return;
      const state = await urlSyncState(currentDoc, text);
      if (state === 'same') return;
      // Typing during the fetch counts as a local change.
      if (state === 'conflict' || editSeq !== savedSeq) {
        toolbarCtrl.setConflict(true);
        return;
      }
      await applyDiskContent(text);
      currentDoc = (await markUrlFetched(currentDoc.uuid, text)) ?? currentDoc;
    } catch {
      vscodeRetryAt = performance.now() + 30_000;
    } finally {
      syncing = false;
    }
  };

  // Drop the disk link (the folder on disk is left untouched).
  const unlinkDoc = async (): Promise<void> => {
    await removeHandle(currentDoc.uuid);
    const updated = await clearDocLink(currentDoc.uuid);
    if (updated) currentDoc = updated;
    refreshLinkBadge();
  };

  // ---- GitHub sync (docs/GITHUB-SYNC-SPEC.md) ---------------------------

  // Whether the doc has an origin volume (disk / GitHub / OneDrive).
  const linkedAny = (e: DocEntry): boolean =>
    isLinked(e) || isGithubLinked(e) || isOneDriveLinked(e) || urlLinkOf(e) !== undefined;

  // The doc's origin for the toolbar (file name as read-only title + a chip of
  // volume + folder), or null for a pure Bibliothèque doc (VOLUMES-SPEC §7).
  const originOf = (e: DocEntry): { fileName: string; chip: string } | null => {
    const gh = githubLinkOf(e);
    if (gh) {
      const slash = gh.path.lastIndexOf('/');
      const dir = slash === -1 ? '' : gh.path.slice(0, slash);
      return {
        fileName: gh.path.slice(slash + 1),
        chip: `🐙 ${gh.owner}/${gh.repo}@${gh.branch}${dir === '' ? '' : ` ▸ ${dir}/`}`,
      };
    }
    if (e.link) {
      // Same schema as GitHub: <icon> <volume> [▸ <folder>/]. Older links that
      // predate volume/dir fall back to the file name alone.
      const vol = e.link.volume ?? e.link.name;
      const dir = e.link.dir ?? '';
      return {
        fileName: e.link.name,
        chip: `💻 ${vol}${dir === '' ? '' : ` ▸ ${dir}/`}`,
      };
    }
    const od = oneDriveLinkOf(e);
    if (od) {
      const slash = od.path.lastIndexOf('/');
      const dir = slash === -1 ? '' : od.path.slice(0, slash);
      return {
        fileName: od.path.slice(slash + 1),
        chip: `☁️ OneDrive${dir === '' ? '' : ` ▸ ${dir}/`}`,
      };
    }
    const ul = urlLinkOf(e);
    if (ul) {
      const u = new URL(ul.url);
      const file = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
      return { fileName: file !== '' ? file : `${e.name}.md`, chip: urlChip(u) };
    }
    return null;
  };

  // The origin chip + read-only title reflect whichever volume the doc belongs to.
  const refreshLinkBadge = (): void => {
    toolbarCtrl.setOrigin(originOf(currentDoc));
  };

  // One *Recharger* (V3): pull from whichever origin the doc has.
  const reloadFromOrigin = async (): Promise<void> => {
    if (isGithubLinked(currentDoc)) await reloadFromGithub();
    else if (isOneDriveLinked(currentDoc)) await reloadFromOneDrive();
    else if (isLinked(currentDoc)) await reloadFromDisk();
    else if (urlLinkOf(currentDoc)) await reloadFromUrl();
  };

  // Fetch the URL document again, replacing the local copy (asked first when
  // it has unsaved edits). `force`: the user already chose (conflict).
  const reloadFromUrl = async (force = false): Promise<void> => {
    const link = urlLinkOf(currentDoc);
    if (!link) return;
    if (!force && isModified(currentDoc) && !globalThis.confirm(t('disk.reload-confirm'))) {
      return;
    }
    try {
      const text = await fetchDocText(new URL(link.url));
      await applyDiskContent(text);
      currentDoc = (await markUrlFetched(currentDoc.uuid, text)) ?? currentDoc;
      toolbarCtrl.setConflict(false);
    } catch (err) {
      showNotice(
        err instanceof UrlFetchError && err.kind === 'http'
          ? t('url.http', { url: link.url, status: String(err.status) })
          : t('url.blocked', { url: link.url }),
      );
    }
  };

  // One *Délier* (V3): drop whatever origin link(s) the doc carries.
  const unlinkFromOrigin = async (): Promise<void> => {
    if (isGithubLinked(currentDoc)) await unlinkGithub();
    if (isOneDriveLinked(currentDoc)) await unlinkOneDrive();
    if (isLinked(currentDoc)) await unlinkDoc();
    if (urlLinkOf(currentDoc)) {
      currentDoc = (await clearDocUrlLink(currentDoc.uuid)) ?? currentDoc;
      refreshLinkBadge();
    }
  };

  // For a GitHub-linked doc, route new images through R3 placement (natural
  // relative path + resource mapping) so Save pushes them; otherwise fall back
  // to the internal assets/<sha> scheme (returns null).
  setImagePlacer(async ({ blob, originalName, view }) => {
    const link = githubLinkOf(currentDoc);
    if (!link) return null;
    return placeImageForInsert(
      view.state.doc.toString(),
      view.state.selection.main.from,
      link.path,
      blob,
      originalName,
    );
  });

  // Map a thrown GitHub error to a clear message.
  const handleGithubError = (err: unknown): void => {
    console.error('GitHub sync failed', err);
    if (err instanceof GithubBranchAbsentError) {
      globalThis.alert(t('github.branch-absent', { branch: err.branch }));
    } else if (err instanceof GithubError) {
      globalThis.alert(t('github.error', { status: String(err.status) }));
    } else {
      globalThis.alert(t('github.error', { status: '?' }));
    }
  };

  // Return a usable GitHub token. If none is stored, offer to paste one right
  // here (with the create-token URL) rather than bouncing the user to Settings;
  // the pasted token is validated and saved. Returns null if the user cancels.
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
  const ensureGithubToken = async (): Promise<string | null> => {
    const existing = await loadToken();
    if (existing) return existing;
    const pasted = globalThis.prompt(t('github.prompt-token', { url: TOKEN_URL }))?.trim();
    if (!pasted) return null;
    try {
      await getUser(pasted); // validate before storing
    } catch {
      globalThis.alert(t('settings.github.invalid'));
      return null;
    }
    await saveToken(pasted);
    return pasted;
  };

  // Push the linked doc to GitHub (R3/R4 state machine). Called from Save.
  const pushToGithub = async (): Promise<void> => {
    const token = await loadToken();
    const link = githubLinkOf(currentDoc);
    if (!token || !link) return;
    const content =
      (await loadCommittedContent(currentDoc)) ?? editor.getValue();
    try {
      const outcome = await saveToGithub(
        token,
        link,
        content,
        currentDoc.name,
        link.baselineSha,
      );
      switch (outcome.kind) {
        case 'noop':
          break;
        case 'pushed': {
          const updated = await updateGithubBaseline(
            currentDoc.uuid,
            outcome.baselineSha,
          );
          if (updated) currentDoc = updated;
          break;
        }
        case 'forked': {
          const updated = await setDocGithubLink(currentDoc.uuid, {
            ...link,
            path: outcome.path,
            baselineSha: outcome.baselineSha,
          });
          if (updated) currentDoc = updated;
          globalThis.alert(
            t('github.forked', { mine: outcome.path, theirs: link.path }),
          );
          break;
        }
        case 'reload-suggested':
          globalThis.alert(t('github.reload-suggested'));
          break;
        case 'remote-gone':
          globalThis.alert(t('github.remote-gone', { path: link.path }));
          break;
      }
    } catch (err) {
      handleGithubError(err);
    }
  };

  // Pull from GitHub (R2): refetch foo.md + images, replace content in place.
  const reloadFromGithub = async (): Promise<void> => {
    const token = await loadToken();
    const link = githubLinkOf(currentDoc);
    if (!token || !link) return;
    if (isModified(currentDoc) && !globalThis.confirm(t('disk.reload-confirm'))) {
      return;
    }
    try {
      const res = await importFromGithub(token, link);
      if (!res) {
        globalThis.alert(t('github.remote-gone', { path: link.path }));
        return;
      }
      await applyDiskContent(res.content);
      const updated = await updateGithubBaseline(currentDoc.uuid, res.baselineSha);
      if (updated) currentDoc = updated;
    } catch (err) {
      handleGithubError(err);
    }
  };

  // Drop the GitHub link (the repo is left untouched).
  const unlinkGithub = async (): Promise<void> => {
    const updated = await clearDocGithubLink(currentDoc.uuid);
    if (updated) currentDoc = updated;
    refreshLinkBadge();
  };

  // ---- OneDrive sync (docs/VOLUMES-SPEC.md — app-folder, eTag baseline) --

  const handleOneDriveError = (err: unknown): void => {
    console.error('OneDrive sync failed', err);
    globalThis.alert(
      t('onedrive.error', { msg: err instanceof Error ? err.message : String(err) }),
    );
  };

  // The library entry of a OneDrive app-folder `.md`: the one already linked to
  // it (reopening never duplicates), else a NEW library doc linked to it.
  const oneDriveEntry = async (path: string): Promise<DocEntry | null> => {
    const known = (await listDocs()).find((e) => oneDriveLinkOf(e)?.path === path);
    if (known) return known;
    try {
      const { text, etag } = await readOneDriveText(path);
      const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
      const entry = await createDoc(base === '' ? 'Document' : base, text);
      return (await setDocOneDriveLink(entry.uuid, { path, baselineEtag: etag })) ?? entry;
    } catch (err) {
      handleOneDriveError(err);
      return null;
    }
  };

  // Push the linked doc to OneDrive (V1: conditional overwrite via the baseline
  // eTag; a clash asks to overwrite — fork is deferred).
  const pushToOneDrive = async (): Promise<void> => {
    const link = oneDriveLinkOf(currentDoc);
    if (!link) return;
    const content = (await loadCommittedContent(currentDoc)) ?? editor.getValue();
    try {
      const { etag } = await writeOneDriveText(link.path, content, link.baselineEtag);
      const updated = await updateOneDriveBaseline(currentDoc.uuid, etag);
      if (updated) currentDoc = updated;
    } catch (err) {
      if (err instanceof OneDriveConflictError) {
        if (!globalThis.confirm(t('onedrive.conflict'))) return;
        const { etag } = await writeOneDriveText(link.path, content); // force
        const updated = await updateOneDriveBaseline(currentDoc.uuid, etag);
        if (updated) currentDoc = updated;
      } else {
        handleOneDriveError(err);
      }
    }
  };

  // Pull from OneDrive: replace content in place + refresh the eTag baseline.
  const reloadFromOneDrive = async (): Promise<void> => {
    const link = oneDriveLinkOf(currentDoc);
    if (!link) return;
    if (isModified(currentDoc) && !globalThis.confirm(t('disk.reload-confirm'))) return;
    try {
      const { text, etag } = await readOneDriveText(link.path);
      await applyDiskContent(text);
      const updated = await updateOneDriveBaseline(currentDoc.uuid, etag);
      if (updated) currentDoc = updated;
    } catch (err) {
      handleOneDriveError(err);
    }
  };

  // Drop the OneDrive link (the file in the app-folder is left untouched).
  const unlinkOneDrive = async (): Promise<void> => {
    const updated = await clearDocOneDriveLink(currentDoc.uuid);
    if (updated) currentDoc = updated;
    refreshLinkBadge();
  };

  // The library entry of a repo `foo.md`: the one already linked to it
  // (reopening never duplicates), else a NEW library doc linked to GitHub (R2).
  const githubEntry = async (
    token: string,
    target: GithubTarget,
  ): Promise<DocEntry | null> => {
    const known = (await listDocs()).find((e) => {
      const g = githubLinkOf(e);
      return (
        g !== null &&
        g !== undefined &&
        g.owner === target.owner &&
        g.repo === target.repo &&
        g.branch === target.branch &&
        g.path === target.path
      );
    });
    if (known) return known;
    const res = await importFromGithub(token, target);
    if (!res) {
      globalThis.alert(t('github.remote-gone', { path: target.path }));
      return null;
    }
    const base = target.path.slice(target.path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    const entry = await createDoc(base === '' ? 'Document' : base, res.content);
    return (
      (await setDocGithubLink(entry.uuid, { ...target, baselineSha: res.baselineSha })) ?? entry
    );
  };

  // Folder portion of a volume-relative path (`''` at the volume root).
  const dirOfPath = (p: string): string => {
    const i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
  };

  // The library entry of a disk `.md`: the one already linked to that very file
  // (reopening never duplicates — compared by handle, whatever the path it was
  // reached by), else a NEW library doc imported from it and linked to it.
  // `volume`/`path` (from the browser) feed the origin chip its volume + folder.
  const diskFileEntry = async (
    fh: FileSystemFileHandle,
    volume?: string,
    path?: string,
    vol?: DiskVolume,
  ): Promise<DocEntry | null> => {
    for (const e of await listDocs()) {
      if (!e.link || linkKind(e) !== 'file') continue;
      const h = await loadHandle(e.uuid);
      if (h && (await h.isSameEntry(fh))) return e;
    }
    // When we know the mounted volume, resolve same-folder resources silently
    // (siblings of the `.md`, resolved against its own directory) so the import
    // prompt only appears for files that genuinely aren't in the folder.
    const folderResolver =
      vol && path !== undefined
        ? readDiskFile(vol, dirOfPath(path))
        : undefined;
    const entry = await importToLibrary(await fh.getFile(), folderResolver);
    if (!entry) return null;
    if (!(await ensureRwPermission(fh))) return entry; // imported, just not linked
    await saveHandle(entry.uuid, fh);
    const linked =
      (await setDocLink(entry.uuid, {
        name: fh.name,
        kind: 'file',
        volume,
        dir: path === undefined ? undefined : dirOfPath(path),
      })) ?? entry;
    await markSynced(linked, fh);
    return linked;
  };

  // Route an open from the unified browser (V1/V3/V4): a Library entry switches
  // to the existing doc; a markdown file on Disk/Repo is imported + linked in
  // place; a foreign file is imported as a copy into the Bibliothèque (V4).
  const openFromVolume = async (
    vol: Volume,
    entry: VolumeEntry,
    win: Window | null,
  ): Promise<void> => {
    await showDocIn(await materializeFromVolume(vol, entry), win);
  };

  // The library entry for a volume entry (reusing the one already linked to the
  // same file) — or null when cancelled / not openable (said so to the user).
  const materializeFromVolume = async (
    vol: Volume,
    entry: VolumeEntry,
  ): Promise<DocEntry | null> => {
    let target: DocEntry | null = null;
    try {
      if (vol.kind === 'library' || vol.kind === 'recents') {
        target = (await listDocs()).find((d) => d.uuid === entry.path) ?? null; // path = uuid
      } else if (vol instanceof RepoVolume) {
        if (!entry.isMarkdown) globalThis.alert(t('volume.foreign-repo'));
        else {
          const token = await ensureGithubToken();
          if (token) target = await githubEntry(token, { ...vol.target, path: entry.path });
        }
      } else if (vol instanceof DiskVolume) {
        const fh = await vol.fileHandle(entry.path);
        target = entry.isMarkdown
          ? await diskFileEntry(fh, vol.label, entry.path, vol)
          : await importToLibrary(await fh.getFile());
      } else if (vol instanceof OneDriveVolume) {
        if (!entry.isMarkdown) globalThis.alert(t('volume.foreign-repo'));
        else target = await oneDriveEntry(entry.path);
      }
    } catch (err) {
      handleGithubError(err);
    }
    return target;
  };

  // `?open=<volume>/<path>` — a file in an already-mounted volume (a disk
  // folder by its name, `owner/repo@branch`, or `OneDrive`), opened in this tab.
  // A disk folder whose permission lapsed needs a click (the browser requires a
  // user gesture): a banner offers it. The param stays in the address bar, so a
  // bookmark reopens the file.
  const openFromParam = async (spec: string): Promise<void> => {
    const volumes = (await listVolumes()).filter((v) => v.kind !== 'library');
    const vol = volumes
      .filter((v) => spec === v.label || spec.startsWith(`${v.label}/`))
      .sort((a, b) => b.label.length - a.label.length)[0];
    if (!vol) {
      showNotice(t('open.unknown-volume', { spec }));
      return;
    }
    const path = spec.slice(vol.label.length + 1);
    const go = async (): Promise<void> => {
      hideNotice('mp-open');
      const name = path.split('/').pop() ?? path;
      const target = await materializeFromVolume(vol, {
        name,
        path,
        type: 'file',
        isMarkdown: /\.(md|markdown)$/i.test(name),
      });
      if (!target) return;
      // Pin the document BEFORE switching, so `?open=` survives in the URL.
      const url = new URL(window.location.href);
      url.searchParams.set('doc', target.uuid);
      window.history.replaceState({}, '', url.toString());
      if (target.uuid === currentDoc.uuid) return;
      if (await isLockedElsewhere(target.uuid)) pointToOtherTab(target.uuid);
      else await switchToDoc(target.uuid);
    };
    if ((await vol.state()) === 'needs-permission' && vol instanceof DiskVolume) {
      showNotice(t('open.needs-permission', { name: vol.label }), {
        id: 'mp-open',
        sticky: true,
        action: {
          label: t('open.authorize'),
          run: () =>
            void vol.requestPermission().then((ok) => (ok ? go() : undefined)),
        },
      });
      return;
    }
    await go();
  };

  // Mount a disk folder as a volume, then reopen the browser on it.
  const mountDiskFolder = async (): Promise<void> => {
    const dir = await pickDirectory();
    if (!dir) return;
    await mountDisk(dir);
    reopenBrowser();
  };

  // Mount a GitHub repo as a volume (PAT required), then reopen the browser.
  const mountRepoVolume = async (): Promise<void> => {
    const token = await ensureGithubToken();
    if (!token) return;
    const repo = globalThis.prompt(t('github.prompt-repo'), '')?.trim();
    if (!repo) return;
    const slash = repo.indexOf('/');
    if (slash <= 0 || slash >= repo.length - 1) {
      globalThis.alert(t('github.bad-repo'));
      return;
    }
    const branch = globalThis.prompt(t('github.prompt-branch'), 'main')?.trim();
    if (!branch) return;
    mountRepo({ owner: repo.slice(0, slash), repo: repo.slice(slash + 1), branch });
    reopenBrowser();
  };

  // Re-grant RW permission on a disk volume's handle (a user gesture — the
  // sidebar click — drives the prompt), then the browser re-selects it.
  const reauthorizeVolume = async (vol: Volume): Promise<boolean> => {
    if (vol instanceof DiskVolume) return vol.requestPermission();
    return true;
  };

  // Mount OneDrive: sign in (may redirect & reload the page), then reopen.
  const mountOneDrive = async (): Promise<void> => {
    try {
      await signInOneDrive(); // redirects away if no cached account
      reopenBrowser();
    } catch (err) {
      handleOneDriveError(err);
    }
  };

  // Unmount a volume (the backend is untouched), then refresh the browser.
  const unmountVolumeAndRefresh = async (vol: Volume): Promise<void> => {
    await unmountVolume(vol.id);
    reopenBrowser();
  };

  // Shared browser callbacks: mount, re-authorize, unmount.
  const mountActions = (): Pick<
    VolumeBrowserOptions,
    'onMountDisk' | 'onMountRepo' | 'onMountOneDrive' | 'onReauthorize' | 'onUnmount'
  > => ({
    onMountDisk: fsAccessAvailable()
      ? () => {
          void mountDiskFolder();
        }
      : undefined,
    onMountRepo: () => {
      void mountRepoVolume();
    },
    onMountOneDrive: () => {
      void mountOneDrive();
    },
    onReauthorize: reauthorizeVolume,
    onUnmount: (vol) => {
      void unmountVolumeAndRefresh(vol);
    },
  });

  let browserMode: 'open' | 'save' = 'open';

  // The browser's last position (volume + folder), remembered across sessions
  // so *Ouvrir* resumes where the user was. The Corbeille is never a place to
  // resume in: it maps to the Bibliothèque's root.
  const BROWSER_LOCATION_KEY = 'markpage:browser-location';
  const rememberBrowserLocation = (volumeId: string | null, path: string): void => {
    try {
      if (volumeId === null) localStorage.removeItem(BROWSER_LOCATION_KEY);
      else {
        const p = volumeId === 'library' && path === TRASH_DIR ? '' : path;
        localStorage.setItem(BROWSER_LOCATION_KEY, JSON.stringify({ volumeId, path: p }));
      }
    } catch {
      /* storage unavailable — the browser just opens on the root next time */
    }
  };
  const lastBrowserLocation = (
    volumes: Volume[],
  ): { volumeId: string; path: string } | undefined => {
    try {
      const raw = localStorage.getItem(BROWSER_LOCATION_KEY);
      if (!raw) return undefined;
      const loc = JSON.parse(raw) as { volumeId?: unknown; path?: unknown };
      if (typeof loc.volumeId !== 'string' || typeof loc.path !== 'string') return undefined;
      const { volumeId, path } = loc as { volumeId: string; path: string };
      return volumes.some((v) => v.id === volumeId) ? { volumeId, path } : undefined;
    } catch {
      return undefined;
    }
  };
  // Récents — a virtual volume at the top of the browser's root (open mode):
  // the documents opened last, whatever their source, most recent first, with
  // their origin under the name. Every opened document has an index entry, so
  // opening one is a plain switch (a linked doc re-syncs with its origin).
  const recentsVolume = (): Volume => ({
    id: 'recents',
    kind: 'recents',
    label: t('volume.recents'),
    state: () => Promise.resolve('ready'),
    list: async () =>
      (await listRecentDocs())
        .filter(({ entry }) => entry.uuid !== currentDoc.uuid)
        .map(({ entry, openedAt }) => {
          const origin = originOf(entry);
          return {
            name: origin?.fileName ?? `${entry.name}.md`,
            path: entry.uuid,
            type: 'file' as const,
            isMarkdown: true,
            modified: openedAt,
            detail: origin?.chip ?? 'Bibliothèque',
          };
        }),
    readText: async (uuid) => {
      const entry = (await listDocs()).find((d) => d.uuid === uuid);
      return (entry && (await loadDocContent(entry))) ?? '';
    },
  });

  // Where the browser starts: the folder the current document was opened from,
  // else the last folder visited, else the root.
  const browserStart = (volumes: Volume[]): { volumeId: string; path: string } | undefined =>
    originLocation(volumes, currentDoc) ?? lastBrowserLocation(volumes);

  // The unified browser (V1) — replaces Open / from-disk / from-GitHub / Import.
  const triggerOpen = async (): Promise<void> => {
    browserMode = 'open';
    const volumes = [recentsVolume(), ...(await listVolumes())];
    openVolumeBrowser({
      volumes,
      initial: browserStart(volumes),
      onNavigate: rememberBrowserLocation,
      onOpen: (vol, entry) => {
        // A document already known by uuid can be checked right away, inside the
        // click: this one, or open in another tab → no new tab at all.
        if (vol.kind === 'library' || vol.kind === 'recents') {
          if (entry.path === currentDoc.uuid) return;
          if (isOpenElsewhere(entry.path)) {
            // Presence can be stale (a tab gone without a word): the lock
            // decides — if nobody holds it after all, open it (here, since the
            // click's popup allowance is spent by then).
            void isLockedElsewhere(entry.path).then((locked) =>
              locked ? pointToOtherTab(entry.path) : openFromVolume(vol, entry, null),
            );
            return;
          }
        }
        void openFromVolume(vol, entry, prepareDocTab());
      },
      // "Ouvrir un fichier…" — a loose file from the device (folds in Import, V4).
      onOpenDeviceFile: () => {
        void openDeviceFile();
      },
      onOpenUrl: openUrlPrompt,
      // Bibliothèque management (replaces «Fichiers…»): entry.path = doc uuid.
      onDelete: (entry) => deleteAndAdjust(entry.path),
      onRestore: async (entry) => {
        await restoreDoc(entry.path);
      },
      onPurge: (entry) => purgeDoc(entry.path),
      onEmptyTrash: () => emptyTrash(),
      ...mountActions(),
    });
  };

  // The doc's origin as a browser location (volume + folder), when that volume
  // is mounted — so Save As opens in the origin folder (e.g. after a conflict).
  const originLocation = (
    volumes: Volume[],
    e: DocEntry,
  ): { volumeId: string; path: string } | undefined => {
    const dir = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
    const gh = githubLinkOf(e);
    if (gh) {
      const id = `repo:${gh.owner}/${gh.repo}@${gh.branch}`;
      return volumes.some((v) => v.id === id) ? { volumeId: id, path: dir(gh.path) } : undefined;
    }
    const od = oneDriveLinkOf(e);
    if (od) {
      return volumes.some((v) => v.id === 'onedrive')
        ? { volumeId: 'onedrive', path: dir(od.path) }
        : undefined;
    }
    if (e.link) {
      const v = volumes.find((vv) => vv.kind === 'disk' && vv.label === e.link?.volume);
      return v ? { volumeId: v.id, path: e.link.dir ?? '' } : undefined;
    }
    return undefined;
  };

  // *Enregistrer sous…* (V5) — pick a (volume, folder, name) target. Absorbs the
  // old "Lier à GitHub / au disque" and "Save As". For a linked doc, opens in
  // its origin folder with the origin file name prefilled (tweak & save).
  const triggerSaveAs = async (): Promise<void> => {
    browserMode = 'save';
    const volumes = await listVolumes();
    const origin = originOf(currentDoc);
    openVolumeBrowser({
      volumes,
      mode: 'save',
      defaultName: origin?.fileName ?? `${currentDoc.name.trim().replace(/\s+/g, '-')}.md`,
      initial: browserStart(volumes),
      onNavigate: rememberBrowserLocation,
      onSave: (vol, folder, name) => {
        void saveAsToVolume(vol, folder, name);
      },
      ...mountActions(),
    });
  };

  // Close any open browser instance and reopen it in the same mode (after a
  // mount changed the volume list). Single-instance → drop the old overlay.
  const reopenBrowser = (): void => {
    document.getElementById('volume-browser-overlay')?.remove();
    void (browserMode === 'save' ? triggerSaveAs() : triggerOpen());
  };

  // Publish the current document to a (volume, folder, name) target (V5).
  // Library → a new library doc (copy). Disk → write the file + link in place.
  // Repo → push the content + link (R1–R4 thereafter).
  // NOTE (v1): a Bibliothèque doc's existing images (img:// / assets) are not
  // yet materialised at the target — publish text-first, then add images on the
  // now-linked doc (R3 carries them at the next Save).
  const saveAsToVolume = async (
    vol: Volume,
    folderPath: string,
    name: string,
  ): Promise<void> => {
    try {
      await flushSave();
      currentDoc = await commitDoc(currentDoc.uuid);
      toolbarCtrl.setModified(false);
      const content = (await loadCommittedContent(currentDoc)) ?? editor.getValue();
      const fileName = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
      const base = fileName.replace(/\.(md|markdown)$/i, '');
      const fullPath = folderPath === '' ? fileName : `${folderPath}/${fileName}`;

      if (vol.kind === 'library') {
        const created = await createDoc(base === '' ? 'Document' : base, content);
        currentDoc = created;
        await setCurrentDocId(created.uuid);
        editor.setValue(content);
        if (viewMode === 'preview') void updatePreview(editor.getValue());
        toolbarCtrl.setDocName(currentDoc.name);
        toolbarCtrl.setModified(false);
        refreshLinkBadge();
        return;
      }

      if (vol instanceof DiskVolume) {
        const fh = await vol.createFileHandle(fullPath);
        if (!(await ensureRwPermission(fh))) {
          globalThis.alert(t('disk.permission-denied'));
          return;
        }
        await writeFileHandle(fh, content);
        await saveHandle(currentDoc.uuid, fh);
        const updated = await setDocLink(currentDoc.uuid, {
          name: fh.name,
          kind: 'file',
          volume: vol.label,
          dir: dirOfPath(fullPath),
        });
        if (updated) currentDoc = updated;
        refreshLinkBadge();
        await markSynced(currentDoc, fh);
        return;
      }

      if (vol instanceof RepoVolume) {
        const token = await ensureGithubToken();
        if (!token) return;
        const target = { ...vol.target, path: fullPath };
        const { baselineSha } = await createOnGithub(
          token,
          target,
          content,
          currentDoc.name,
        );
        const updated = await setDocGithubLink(currentDoc.uuid, { ...target, baselineSha });
        if (updated) currentDoc = updated;
        refreshLinkBadge();
        return;
      }

      if (vol instanceof OneDriveVolume) {
        const { etag } = await writeOneDriveText(fullPath, content);
        const updated = await setDocOneDriveLink(currentDoc.uuid, {
          path: fullPath,
          baselineEtag: etag,
        });
        if (updated) currentDoc = updated;
        refreshLinkBadge();
      }
    } catch (err) {
      handleGithubError(err);
    }
  };

  // Imports an external file (.md / .docx / .html / .txt) as a *new* doc in the
  // index — without opening it (callers decide where: showDocIn). The name is
  // derived from the source filename; createDoc uniques a colliding one.
  // Returns the created entry, or null on cancel/failure.
  const importToLibrary = async (
    file: File,
    // When the `.md` is opened from a mounted disk folder, this reads a sibling
    // resource live from that folder so same-folder images resolve silently —
    // no "missing resources" prompt for files that are right there next to it.
    folderResolver?: (relPath: string) => Promise<File | null>,
  ): Promise<DocEntry | null> => {
    try {
      const { content, baseName } = await importFile(file);
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
      let missing = externalPaths.filter((p) => !mapping[p]);
      // First, silently resolve anything sitting in the doc's own mounted
      // folder — persisting it into the mapping (+ IDB) exactly as the prompt
      // would. Only paths that aren't found on disk fall through to the prompt.
      if (missing.length > 0 && folderResolver) {
        const stillMissing: string[] = [];
        for (const p of missing) {
          const found = await folderResolver(p);
          if (found) await addResource(p, found);
          else stillMissing.push(p);
        }
        missing = stillMissing;
      }
      if (missing.length > 0) {
        try {
          await promptForMissingResources(missing);
        } catch (cancelErr) {
          if (cancelErr instanceof ImportCancelled) return null;
          throw cancelErr;
        }
      }
      const desired = baseName.trim() === '' ? 'Document importé' : baseName;
      return await createDoc(desired, cleaned);
    } catch (err: unknown) {
      console.error('Import failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      globalThis.alert(t('import.failed', { msg }));
      return null;
    }
  };

  // Import dialog: transient <input type=file>, hands the chosen file to
  // handleImport. The cross-browser fallback for "Ouvrir un fichier…" when the
  // File System Access pickers are absent (Safari/Firefox): always a copy,
  // since a plain <input> yields a File blob with no handle to link in place.
  const triggerImportDialog = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_ATTRIBUTE;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) {
        const win = prepareDocTab();
        void importToLibrary(file).then((e) => showDocIn(e, win));
      }
    });
    input.click();
  };

  // "Ouvrir un fichier…" (V4) — the single entry point that folds the old
  // *Importer* into *Ouvrir*: pick one file from the device, then route by
  // format. A `.md` opens **in place** (single-file disk link on Chromium); a
  // foreign format (`.docx`/`.html`/`.txt`) is imported as a Bibliothèque copy.
  // Off Chromium, falls back to the <input> path (always a copy).
  const openDeviceFile = async (): Promise<void> => {
    if (!fsAccessAvailable()) {
      triggerImportDialog();
      return;
    }
    const fh = await pickImportableFileHandle();
    if (!fh) return;
    const win = prepareDocTab();
    const target = /\.(md|markdown)$/i.test(fh.name)
      ? await diskFileEntry(fh) // in place, no mount needed (V4)
      : await importToLibrary(await fh.getFile()); // foreign → copy (V4)
    await showDocIn(target, win);
  };

  // *Ouvrir une URL…*: the document opens in a tab of its own, through the
  // `?url=` entry point (so it's bookmarkable). A blocked popup → this tab.
  const openUrlPrompt = (): void => {
    const input = globalThis.prompt(t('url.prompt'), 'https://');
    if (!input || input.trim() === '' || input.trim() === 'https://') return;
    let target: URL;
    try {
      target = normalizeDocUrl(input);
    } catch {
      showNotice(t('url.invalid', { url: input }));
      return;
    }
    const app = new URL(window.location.href);
    app.search = '';
    app.hash = '';
    app.searchParams.set('src', target.href);
    if (!window.open(app.toString(), '_blank')) window.location.assign(app.toString());
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
        const expanded = await expandRefsToInlineDataUrls(
          source,
          makeFolderImageDataResolver(currentDoc),
        );
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
        openFileMenu(anchor, {
          modified: isModified(currentDoc),
          linked: linkedAny(currentDoc),
          onReload: () => {
            void reloadFromOrigin();
          },
          onUnlink: () => {
            void unlinkFromOrigin();
          },
          onNew: () => {
            void createNewDoc();
          },
          onOpen: () => {
            void triggerOpen();
          },
          onSave: () => {
            void saveCurrentDoc();
          },
          onSaveAs: () => {
            void triggerSaveAs();
          },
          onRevert: () => {
            void revertCurrentDoc();
          },
          onDelete: () => {
            void deleteAndAdjust(currentDoc.uuid);
          },
          onMarkdown: triggerSave,
          onPdf: triggerDownload,
          onLatex: triggerLatexExport,
          onShareLink: triggerShareLink,
          onShareEmail: triggerShareEmail,
        });
      },
      onRenameCurrent: (name) => {
        void renameCurrentDoc(name);
      },
      onStyle(anchor) {
        openStyleMenu(editor.view, anchor.x, anchor.y);
      },
      onDocStyle(anchor) {
        // Set `document-style: <key>` in the doc front-matter; the change handler
        // re-derives + re-renders (deriveDocSettings applies the named style).
        const setDocStyle = (key: string): void => {
          editor.setValue(
            setFrontmatterKeys(
              editor.getValue(),
              new Map([['document-style', key]]),
            ),
          );
        };
        openDocumentStyleMenu(anchor, {
          // The style rendered — the default when the document names none.
          current: appliedStyle(parseFrontmatter(editor.getValue()).meta['document-style'])?.key,
          styles: allStyles(),
          userKeys: new Set(loadUserStyles().map((s) => s.key)),
          onPick: (style) => setDocStyle(style.key),
          onExport: () => {
            const src = appliedStyle(parseFrontmatter(editor.getValue()).meta['document-style']);
            const suggested = src?.name || 'Mon style';
            const name = (globalThis.prompt(t('docstyle.export'), suggested) ?? '').trim();
            if (!name) return;
            const entry: NamedStyle = {
              key: slugify(name),
              name,
              style: serializeFundamentalStyle(lastEffectiveSettings),
              // preserve attribution so it survives markpage's re-export too
              ...(src?.meta ? { meta: src.meta } : {}),
            };
            downloadTextFile(
              serializeStyleFile(entry),
              `${entry.key || 'style'}.mpstyle.json`,
              'application/json',
            );
            globalThis.alert(t('docstyle.exported'));
          },
          onDelete: (style) => {
            const ok = globalThis.confirm(
              t('docstyle.delete-confirm').replace('{name}', style.name),
            );
            if (!ok) return false;
            deleteUserStyle(style.key);
            // If the current document referenced it, leave the front-matter as
            // written — findStyle now misses and the doc falls back to base,
            // which the next re-render already handles gracefully.
            return true;
          },
          onImport: () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', () => {
              const file = input.files?.[0];
              input.remove();
              if (!file) return;
              void file.text().then((text) => {
                const entry = parseStyleFile(text);
                if (!entry) {
                  globalThis.alert(t('docstyle.import-none'));
                  return;
                }
                saveUserStyle(entry);
                setDocStyle(entry.key);
                globalThis.alert(
                  t('docstyle.imported').replace('{name}', entry.name),
                );
              });
            });
            input.click();
          },
        });
      },
      onHelp: triggerHelp,
      onTogglePreview: toggleView,
      onPresent: () => {
        void enterPresentation();
      },
      onToggleGuides: triggerGuides,
      onResolveConflict: (anchor) => {
        hideNotice('mp-url'); // it pointed here; it would cover the menu
        openConflictMenu(anchor, {
          onKeepMine: () => {
            void saveCurrentDoc(true); // commit + push my version, clears conflict
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
        void triggerOpen();
        break;
      case 'p':
        e.preventDefault();
        triggerDownload();
        break;
    }
  };
  globalThis.addEventListener('keydown', onAppKeydown);

  // Same actions, bound inside the editor keymap so they also fire when
  // CodeMirror has focus (the window handler above misses those on Firefox).
  // The window handler's `defaultPrevented` guard prevents a double trigger.
  editorShortcuts.preview = toggleView;
  editorShortcuts.present = () => {
    void enterPresentation();
  };
  editorShortcuts.save = () => {
    void saveCurrentDoc();
  };
  editorShortcuts.open = () => {
    void triggerOpen();
  };
  editorShortcuts.exportPdf = triggerDownload;
  editorShortcuts.guides = triggerGuides;

  renderToolbar();

  // ---- tab presence + edit lock (tab-presence.ts) -----------------------
  // One tab edits a document; another tab showing it (a duplicated tab, a URL
  // typed by hand) is read-only until the user takes the document over.
  const setEditable = (on: boolean): void => {
    docEditable = on;
    editor.setReadOnly(!on);
    if (on) hideNotice('mp-readonly');
  };
  const readOnlyNotice = (text: string): void =>
    showNotice(text, {
      id: 'mp-readonly',
      sticky: true,
      action: { label: t('tabs.take-over'), run: () => void takeOver() },
    });
  const claimDoc = async (uuid: string, steal = false): Promise<void> => {
    const status = await holdDocLock(
      uuid,
      () => {
        if (uuid !== currentDoc.uuid) return;
        setEditable(false);
        readOnlyNotice(t('tabs.taken-over'));
      },
      { steal },
    );
    if (uuid !== currentDoc.uuid) return; // switched meanwhile
    if (status === 'owner') setEditable(true);
    else {
      setEditable(false);
      readOnlyNotice(t('tabs.read-only'));
    }
  };
  // Reload the document as last saved (by whichever tab owns it) — a read-only
  // copy stays current, and taking over starts from the owner's latest work.
  const reloadFromStore = async (): Promise<void> => {
    const fresh = (await listDocs()).find((d) => d.uuid === currentDoc.uuid);
    if (!fresh) return;
    const content = (await loadDocContent(fresh)) ?? '';
    currentDoc = fresh;
    toolbarCtrl.setModified(isModified(fresh));
    if (content === editor.getValue()) return;
    editor.setValue(content);
    dirty = true;
    if (viewMode === 'preview') void updatePreview(editor.getValue());
  };
  const takeOver = async (): Promise<void> => {
    await claimDoc(currentDoc.uuid, true);
    await reloadFromStore();
  };
  initTabPresence(() => {
    // Another tab asked for this document: come forward (best effort) and
    // flag the tab title for a moment.
    window.focus();
    const title = document.title;
    document.title = `● ${title}`;
    setTimeout(() => {
      document.title = title;
    }, 3000);
  });
  onCurrentDocChange((uuid) => {
    announceCurrentDoc(uuid);
    void claimDoc(uuid);
  });
  announceCurrentDoc(currentDoc.uuid);
  void claimDoc(currentDoc.uuid);

  // `?open=<volume>/<path>` — needs the volumes and possibly a click, so it runs
  // once the app is up (see openFromParam).
  const openParam = new URL(window.location.href).searchParams.get('open');
  if (openParam) void openFromParam(openParam);

  // Reflect any resumed working copy (a draft persisted from a previous
  // session) in the "modified" indicator straight away.
  toolbarCtrl.setModified(isModified(currentDoc));
  toolbarCtrl.setOrigin(originOf(currentDoc));
  void checkSync();

  // Restore the live preview if it was shown last session (toolbar is ready).
  if (previewVisiblePref) void enterPreview();
  else updatePreviewToggleUI();

  // Two-way sync polling (Phase 4). The File System Access API has no
  // file-watching, so we poll the linked file's mtime when the tab is visible —
  // on focus / visibility change (immediate when the user returns after editing
  // the file externally) plus a ~2s interval for a near-live feel side-by-side.
  const pollSync = (): void => {
    if (document.visibilityState !== 'visible') return;
    // A read-only tab follows the owner's saved work instead of syncing.
    if (docEditable) {
      void checkSync();
      void checkVsCodeSync();
    } else void reloadFromStore();
  };
  globalThis.addEventListener('focus', pollSync);
  document.addEventListener('visibilitychange', pollSync);

  // Leaving the tab (hidden, closed, discarded): the async draft write may
  // never finish, so pending edits are first journaled synchronously — the
  // next tab to open the document writes them (replayDraftJournal).
  const onTabHidden = (): void => {
    if (!docEditable || savedSeq === editSeq) return;
    journalDraft(currentDoc.uuid, editor.getValue());
    void flushSave();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onTabHidden();
  });
  globalThis.addEventListener('pagehide', onTabHidden);
  globalThis.setInterval(pollSync, 2000);

  // When the UI language changes, rebuild the toolbar so its labels
  // translate in place; long-lived UI elements subscribe here.
  onLanguageChange(() => {
    renderToolbar();
    toolbarCtrl.setModified(isModified(currentDoc));
    toolbarCtrl.setOrigin(originOf(currentDoc));
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
      state.settings = deriveDocSettings(markdown);
      editor.setValue(markdown);
      dirty = true;
      if (viewMode === 'preview') void updatePreview(editor.getValue());
      toolbarCtrl.setDocName(entry.name);
      toolbarCtrl.setModified(false);
      toolbarCtrl.setOrigin(null);
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

    getSettings: () => ({
      settings: state.settings as unknown as Record<string, unknown>,
    }),
    // Profiles were retired — a document names its style (`document-style:`
    // front-matter) from the style library. Kept as inert stubs so older MCP
    // clients degrade gracefully instead of hitting an unknown-tool error.
    listProfiles: () => [],
    setProfile: () => {
      throw new Error('Profiles have been retired — set `document-style:` in the front-matter instead');
    },
  };
  initMcp(mcpContext);
}

await bootstrap();
