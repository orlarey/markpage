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
import { loadFontTrio, registerCustomFonts } from './font-loader';
import { createEditor, type EditorShortcuts } from './editor';
import {
  renderPreview,
  debounce,
  applyPreviewStyles,
  applyPreviewMetadata,
  annotateSourceLines,
} from './preview';
import {
  renderMermaidBlocks,
  renderMathBlocks,
  renderMathInlines,
} from '@orlarey/markpage-render';
import { parseFrontmatter, embedProfileInFrontmatter, parseStackDoc, extractStyle, type StackDoc } from '@orlarey/markpage-render';
import { layoutMosaicBlocks } from '@orlarey/markpage-render';
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
  setImagePlacer,
} from './image';
import { migrateImagesToOpfs } from './image-store';
import { requestPersistentStorage } from './opfs';
import { mountToolbar, type ToolbarControl } from './ui/toolbar';
import { attachStyleContextMenu, openStyleMenu } from './ui/style-menu';
import { openSettingsWindow } from './ui/settings-window';
import { openHelp } from './ui/help-window';
import { openConflictMenu } from './ui/conflict-menu';
import { openFileMenu } from './ui/file-menu';
import { openNewFromModal } from './ui/new-from-modal';
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
  setCurrentDocId,
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
import { applyFrontmatterToSettings, serializeProfile, type PdfSettings } from './settings';
import { flattenForRender, applyProfilePatch } from './stack-render';
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
import { pageContentGeomPx, pageSizeMm, paginate } from './preview-paginated';
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
  // `editor` = editor only. `preview` = the SPLIT (editor + live preview side
  // by side, the editor stays visible). The floating toggles drive both.
  let viewMode: 'editor' | 'preview' = 'editor';
  // Preview UI prefs in localStorage — distinct from the per-doc PdfSettings.
  // PREF_VISIBLE: is the split shown. PREF_PAGINATED: A4 paged.js pages (true)
  // vs a fast continuous flow (false, the live-typing default).
  const PREF_VISIBLE = 'markpage:preview-visible';
  const PREF_PAGINATED = 'markpage:preview-paginated';
  let previewPaginated = localStorage.getItem(PREF_PAGINATED) === '1';
  const previewVisiblePref = localStorage.getItem(PREF_VISIBLE) === '1';
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

  // Page zoom. Invariant: the FULL page width is always visible — pages render
  // at r = min(z, W_v / W_p), where z (`previewZoom`) is the user's absolute
  // zoom (1 = 100% of the natural page width, the default) and the min() caps
  // it at the pane width so a page never overflows. Default z = 1 reproduces
  // the old auto-fit (shrink to fit, never upscale past 100%). The user changes
  // z by dragging a page side edge (see below). Driven by the `--mp-fit-zoom`
  // CSS var (applied to `.pagedjs_page` via `zoom`), so the page flow reflows
  // and vertical-scroll / click-to-source stay correct. No-op outside preview
  // and during fullscreen presentation (its own scaling).
  const PREVIEW_FIT_GUTTER = 28; // px breathing room + scrollbar allowance
  let previewZoom = 1; // z — the user's absolute page zoom
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
    previewEl.style.setProperty(
      '--mp-fit-zoom',
      String(Math.min(previewZoom, previewFillFactor(natural))),
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
    previewZoom = 1;
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

  // Resolve a stack `extends` reference (a library doc name) to its parsed
  // source, for the document-stack flatten. A doc can't be its own parent, so
  // the current doc is excluded. Returns null when no doc bears that name.
  const resolveByName = async (name: string): Promise<StackDoc | null> => {
    for (const entry of await listDocs()) {
      if (entry.name !== name || entry.uuid === currentDoc.uuid) continue;
      const content = (await loadDocContent(entry)) ?? '';
      return parseStackDoc(content, name);
    }
    return null;
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
    // Document-stack (STACK-SPEC): resolve the `extends` chain, flatten (merged
    // front-matter + tokens + folded body) and keep the per-element style patch.
    // Gated to documents that use a stack feature; guarded so any error (cycle,
    // missing parent, undefined token) degrades to the un-flattened render.
    let toRender = source;
    let stylePatch = null as Awaited<ReturnType<typeof flattenForRender>>;
    try {
      const flat = await flattenForRender(source, {
        settings: state.settings,
        resolveByName,
      });
      if (flat) {
        toRender = flat.md;
        stylePatch = flat;
      }
    } catch (err) {
      console.warn('[markpage] stack flatten failed', err);
    }
    const resolved = await expandRefsToBlobUrls(toRender);
    const { meta } = parseFrontmatter(resolved);
    // Frontmatter can override page-format-level settings (e.g.
    // `slides: true` forces `pageSize: SLIDES_16_9`); compute the
    // effective settings once and use them for pagination.
    let effectiveSettings = applyFrontmatterToSettings(state.settings, meta);
    if (stylePatch) effectiveSettings = applyProfilePatch(effectiveSettings, stylePatch.patch);
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
    if (myReq !== previewReqId) return null;
    return { built, effectiveSettings, myReq };
  };

  // Continuous (non-paginated) render: drop the built content into a single
  // white sheet of page width — no paged.js, so it re-renders fast on every
  // keystroke. The page geometry is taken from the document's settings.
  const renderContinuous = (
    built: HTMLElement,
    effectiveSettings: PdfSettings,
  ): void => {
    // paged.js never removes the <style> blocks it injects; drop them so a
    // prior A4 render's page-only rules — notably the `position: absolute`
    // letterhead-window positioning — don't leak into the continuous sheet
    // (where, with no positioned containing block, the recipient escaped onto
    // the editor pane).
    document
      .querySelectorAll('style[data-pagedjs-inserted-styles]')
      .forEach((s) => s.remove());
    const sheet = document.createElement('div');
    sheet.className = 'mp-continuous-sheet';
    const { w } = pageSizeMm(effectiveSettings);
    const m = effectiveSettings.margins;
    sheet.style.width = `${w}mm`;
    sheet.style.padding = `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
    while (built.firstChild) sheet.appendChild(built.firstChild);
    previewEl.classList.add('continuous');
    previewEl.replaceChildren(sheet);
  };

  // Serializes paged.js renders. Two concurrent `Previewer().preview()` calls on
  // the same element interleave their DOM mutations and silently drop content
  // (paragraphs vanish under rapid live edits). Each paginated render queues
  // behind the previous one; superseded renders skip via the previewReqId guard.
  let paginateLock: Promise<unknown> = Promise.resolve();

  // Render `source` into the preview pane, paginated (paged.js A4 pages) or
  // continuous, per `previewPaginated`. Called when entering preview, on a
  // settings change, and — debounced — live while typing.
  const updatePreview = async (source: string): Promise<void> => {
    const r = await buildPreviewDom(source);
    if (!r) return;
    if (previewPaginated) {
      // Queue behind any in-flight paginate so paged.js never runs twice over
      // the same element at once. If a newer build superseded us while we
      // waited (previewReqId advanced), skip — only the latest paginates.
      const turn = paginateLock.then(async () => {
        if (r.myReq !== previewReqId) return;
        previewEl.classList.remove('continuous');
        await paginate(r.built, r.effectiveSettings, previewEl);
        if (r.myReq !== previewReqId) return;
        dirty = false;
        fitPreviewWidth();
      });
      paginateLock = turn.catch(() => {});
      await turn;
    } else {
      // Continuous mode draws per-element styles from the injected stylesheet
      // (not pagedCss), so refresh it from the per-doc effective settings —
      // otherwise frontmatter / stack style overrides wouldn't show here.
      applyPreviewStyles(r.effectiveSettings);
      renderContinuous(r.built, r.effectiveSettings);
      dirty = false;
      fitPreviewWidth();
    }
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

  // Live preview while typing — only when the split is shown. Continuous
  // re-renders fast on every keystroke (short debounce); A4 pagination is
  // heavier, so it waits for a typing pause. The previewReqId stale-guard in
  // buildPreviewDom drops any render a newer keystroke superseded.
  const scheduleContinuousPreview = debounce(() => {
    if (viewMode !== 'preview' || presenting || previewPaginated) return;
    void updatePreview(editor.getValue());
  }, 120);
  const schedulePaginatedPreview = debounce(() => {
    if (viewMode !== 'preview' || presenting || !previewPaginated) return;
    void updatePreview(editor.getValue());
  }, 500);
  const scheduleLivePreview = (): void => {
    if (viewMode !== 'preview' || presenting) return;
    if (previewPaginated) schedulePaginatedPreview();
    else scheduleContinuousPreview();
  };

  applyPreviewStyles(state.settings);

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
      debouncedSaveDraft(currentDoc.uuid, doc);
      scheduleLivePreview();
    },
    editorShortcuts,
  );

  attachStyleContextMenu(editor.view.dom, editor.view);

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
    if (previewPaginated === on) return;
    previewPaginated = on;
    localStorage.setItem(PREF_PAGINATED, on ? '1' : '0');
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
    paginateToggleBtn.classList.toggle('active', on && previewPaginated);
  };

  showToggleBtn.addEventListener('click', () => toggleView());
  paginateToggleBtn.addEventListener('click', () =>
    setPreviewPaginated(!previewPaginated),
  );
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
      applyAnchorToEditor(editor.view, anchor);
      editor.view.focus();
    }
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
    // Keep the split open across doc switches — refresh it for the new doc.
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setDocName(target.name);
    toolbarCtrl.setModified(isModified(target));
    toolbarCtrl.setOrigin(originOf(target));
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
    // Keep the split open — refresh it for the new empty doc.
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setModified(false);
    toolbarCtrl.setOrigin(null);
    toolbarCtrl.setDocName(entry.name);
  };

  // "Nouveau à partir de…" (STACK-SPEC §3.4): pick a library doc, create a new
  // one that `extends` it — inheriting its frame + styles via the stack.
  const createNewDocFrom = async (): Promise<void> => {
    const docs = (await listDocs())
      .filter((d) => d.uuid !== currentDoc.uuid)
      .map((d) => ({ uuid: d.uuid, name: d.name }));
    const parent = await openNewFromModal(docs);
    if (parent === null) return;
    await flushSave();
    const content = `---\nextends: ${parent}\n---\n\n`;
    const entry = await createDoc('Sans titre', content);
    currentDoc = entry;
    await setCurrentDocId(entry.uuid);
    editor.setValue(content);
    dirty = true;
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setModified(false);
    toolbarCtrl.setOrigin(null);
    toolbarCtrl.setDocName(entry.name);
  };

  // "Extraire un style" (STACK-SPEC §3.4, the B→C bridge): pull the document's
  // style front-matter into a new reusable layer and re-parent the document to
  // it via `extends`. The current doc stays open as the (now thinner) leaf.
  const extractCurrentStyle = async (): Promise<void> => {
    const proposed = t('extract-style.name', { name: currentDoc.name });
    const result = extractStyle(editor.getValue(), proposed);
    if (result === null) {
      globalThis.alert(t('extract-style.empty'));
      return;
    }
    const entry = await createDoc(proposed, result.styleMd); // the new style layer
    const leafMd =
      entry.name === proposed
        ? result.leafMd
        : result.leafMd.replace(`extends: ${proposed}`, `extends: ${entry.name}`);
    editor.setValue(leafMd);
    dirty = true;
    if (viewMode === 'preview') void updatePreview(leafMd);
    toolbarCtrl.setModified(true);
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
      editor.setValue('');
    } else {
      const next = remaining[0];
      currentDoc = next;
      await setCurrentDocId(next.uuid);
      editor.setValue((await loadDocContent(next)) ?? '');
    }
    dirty = true;
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setDocName(currentDoc.name);
    toolbarCtrl.setModified(isModified(currentDoc));
    toolbarCtrl.setOrigin(originOf(currentDoc));
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
    if (isOneDriveLinked(currentDoc)) await pushToOneDrive();
  };

  // Revert: discard the working copy and reload the committed content.
  const revertCurrentDoc = async (): Promise<void> => {
    if (!isModified(currentDoc)) return;
    currentDoc = await revertDoc(currentDoc.uuid);
    editor.setValue((await loadCommittedContent(currentDoc)) ?? '');
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
    refreshLinkBadge();
  };

  // ---- GitHub sync (docs/GITHUB-SYNC-SPEC.md) ---------------------------

  // Whether the doc has an origin volume (disk / GitHub / OneDrive).
  const linkedAny = (e: DocEntry): boolean =>
    isLinked(e) || isGithubLinked(e) || isOneDriveLinked(e);

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
  };

  // One *Délier* (V3): drop whatever origin link(s) the doc carries.
  const unlinkFromOrigin = async (): Promise<void> => {
    if (isGithubLinked(currentDoc)) await unlinkGithub();
    if (isOneDriveLinked(currentDoc)) await unlinkOneDrive();
    if (isLinked(currentDoc)) await unlinkDoc();
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

  // Open a OneDrive app-folder `.md` as a NEW library doc linked to it.
  const openOneDriveFile = async (path: string): Promise<void> => {
    try {
      const { text, etag } = await readOneDriveText(path);
      await flushSave();
      const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
      const entry = await createDoc(base === '' ? 'Document' : base, text);
      currentDoc = entry;
      await setCurrentDocId(entry.uuid);
      editor.setValue(text);
      const linked = await setDocOneDriveLink(entry.uuid, { path, baselineEtag: etag });
      if (linked) currentDoc = linked;
      dirty = true;
      if (viewMode === 'preview') void updatePreview(editor.getValue());
      toolbarCtrl.setModified(false);
      refreshLinkBadge();
    } catch (err) {
      handleOneDriveError(err);
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

  // Import a repo `foo.md` (R2) as a NEW library doc linked to GitHub, then
  // switch to it. Shared by the volume browser and the legacy prompt flow.
  const openGithubTarget = async (
    token: string,
    target: GithubTarget,
  ): Promise<void> => {
    const res = await importFromGithub(token, target);
    if (!res) {
      globalThis.alert(t('github.remote-gone', { path: target.path }));
      return;
    }
    await flushSave();
    const base = target.path.slice(target.path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    const entry = await createDoc(base === '' ? 'Document' : base, res.content);
    currentDoc = entry;
    await setCurrentDocId(entry.uuid);
    editor.setValue(res.content);
    const linked = await setDocGithubLink(entry.uuid, {
      ...target,
      baselineSha: res.baselineSha,
    });
    if (linked) currentDoc = linked;
    dirty = true;
    if (viewMode === 'preview') void updatePreview(editor.getValue());
    toolbarCtrl.setDocName(currentDoc.name);
    toolbarCtrl.setModified(false);
    refreshLinkBadge();
  };

  // Folder portion of a volume-relative path (`''` at the volume root).
  const dirOfPath = (p: string): string => {
    const i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
  };

  // Import a disk `.md` file handle as a NEW library doc, linked to that file.
  // `volume`/`path` (from the browser) feed the origin chip its volume + folder.
  const linkDiskFileHandle = async (
    fh: FileSystemFileHandle,
    volume?: string,
    path?: string,
  ): Promise<void> => {
    const entry = await handleImport(await fh.getFile());
    if (!entry) return;
    if (!(await ensureRwPermission(fh))) return; // imported, just not linked
    await saveHandle(entry.uuid, fh);
    const updated = await setDocLink(entry.uuid, {
      name: fh.name,
      kind: 'file',
      volume,
      dir: path === undefined ? undefined : dirOfPath(path),
    });
    if (updated) currentDoc = updated;
    refreshLinkBadge();
    await markSynced(currentDoc, fh);
  };

  // Route an open from the unified browser (V1/V3/V4): a Library entry switches
  // to the existing doc; a markdown file on Disk/Repo is imported + linked in
  // place; a foreign file is imported as a copy into the Bibliothèque (V4).
  const openFromVolume = async (vol: Volume, entry: VolumeEntry): Promise<void> => {
    try {
      if (vol.kind === 'library') {
        await switchToDoc(entry.path); // path = doc uuid
        return;
      }
      if (vol instanceof RepoVolume) {
        if (!entry.isMarkdown) {
          globalThis.alert(t('volume.foreign-repo'));
          return;
        }
        const token = await ensureGithubToken();
        if (!token) return;
        await openGithubTarget(token, { ...vol.target, path: entry.path });
        return;
      }
      if (vol instanceof DiskVolume) {
        const fh = await vol.fileHandle(entry.path);
        if (entry.isMarkdown) await linkDiskFileHandle(fh, vol.label, entry.path);
        else await handleImport(await fh.getFile());
        return;
      }
      if (vol instanceof OneDriveVolume) {
        if (!entry.isMarkdown) {
          globalThis.alert(t('volume.foreign-repo'));
          return;
        }
        await openOneDriveFile(entry.path);
      }
    } catch (err) {
      handleGithubError(err);
    }
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

  // The unified browser (V1) — replaces Open / from-disk / from-GitHub / Import.
  const triggerOpen = async (): Promise<void> => {
    browserMode = 'open';
    openVolumeBrowser({
      volumes: await listVolumes(),
      onOpen: (vol, entry) => {
        void openFromVolume(vol, entry);
      },
      // "Ouvrir un fichier…" — a loose file from the device (folds in Import, V4).
      onOpenDeviceFile: () => {
        void openDeviceFile();
      },
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
      initial: originLocation(volumes, currentDoc),
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
      if (viewMode === 'preview') void updatePreview(editor.getValue());
      toolbarCtrl.setDocName(entry.name);
      toolbarCtrl.setOrigin(null);
      return entry;
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
      if (file) void handleImport(file);
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
    if (/\.(md|markdown)$/i.test(fh.name)) {
      await linkDiskFileHandle(fh); // in-place, no mount needed (V4)
    } else {
      await handleImport(await fh.getFile()); // foreign → copy (V4)
    }
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
          onNewFrom: () => {
            void createNewDocFrom();
          },
          onExtractStyle: () => {
            void extractCurrentStyle();
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
          onEmbedProfile: () => {
            // Stamp the active style profile into the doc's frontmatter so an
            // external renderer (the VS Code preview) reproduces the typography.
            const view = editor.view;
            const next = embedProfileInFrontmatter(
              view.state.doc.toString(),
              serializeProfile(state.settings),
            );
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
            globalThis.alert(t('export-menu.embed-profile-done'));
          },
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
      onHelp: triggerHelp,
      onSettings: triggerSettings,
      onTogglePreview: toggleView,
      onPresent: () => {
        void enterPresentation();
      },
      onToggleGuides: triggerGuides,
      onResolveConflict: (anchor) => {
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
      case ',':
        e.preventDefault();
        triggerSettings();
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
  editorShortcuts.settings = triggerSettings;
  editorShortcuts.guides = triggerGuides;

  renderToolbar();
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
}

await bootstrap();
