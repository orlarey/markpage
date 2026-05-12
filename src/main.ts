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
// Plain Roboto for the brand mark (the `page` half of "markpage").
// Bundled rather than lazy-loaded so the logo paints correctly on
// first frame, before the Google Fonts catalog has had a chance to
// resolve anything.
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';

import './style.css';
// Side-effect import: registers our marked extensions ($$math$$, …) on the
// shared `marked` instance. Must run before any marked.parse / marked.lexer.
import './marked-config';
import {
  migrateIDBBranding,
  migrateLocalStorageBranding,
} from './branding-migration';
import { initLocale } from './i18n/locale';
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
import {
  applyAnchorToEditor,
  applyAnchorToPreview,
  editorCursorAnchor,
  previewClickAnchor,
} from './scroll-sync';
import { ACCEPT_ATTRIBUTE, importFile } from './import';
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
import { migrateToContentAddressed } from './image-store';
import { mountToolbar, type ToolbarControl } from './ui/toolbar';
import { attachStyleContextMenu, openStyleMenu } from './ui/style-menu';
import { openSettingsWindow } from './ui/settings-window';
import { openHelp } from './ui/help-window';
import { openDocMenu } from './ui/doc-menu';
import { openExportMenu } from './ui/export-menu';
import { redo, undo } from '@codemirror/commands';
import helpMd from './HELP.md?raw';
import {
  createDoc,
  deleteDoc,
  duplicateDoc,
  gcContentBlobs,
  listDocs,
  loadDocContent,
  migrateLegacyDocIfNeeded,
  renameDoc,
  resolveCurrentDoc,
  saveDocContent,
  setCurrentDocId,
  type DocEntry,
} from './docs';
import { type PdfSettings } from './settings';
import {
  createProfile,
  deleteProfile,
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
import { paginate } from './preview-paginated';
import { exportViaPrint } from './print-export';
import { exportLatex } from './export-latex';

// First-run document is the bundled HELP.md tutorial. The user can edit
// or erase it; once a doc lives in localStorage, that one wins on reopen
// and HELP stays accessible only via the Aide button.
const DEFAULT_DOC = helpMd;

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

// Walks every doc, collects every `img://<sha>` ref it carries,
// then drops IndexedDB blobs (resource pool) and `markpage:blobs:*`
// entries (content pool) outside that live set. SPEC §19.3. Run at
// boot and after every autosave so the storage stays bounded.
async function runGC(): Promise<void> {
  try {
    const referenced = new Set<string>();
    for (const e of listDocs()) {
      const c = loadDocContent(e);
      if (c == null) continue;
      for (const id of collectImageRefs(c)) referenced.add(id);
    }
    await gcUnusedImages(referenced);
    gcContentBlobs();
  } catch (err) {
    console.error('GC failed', err);
  }
}

async function bootstrap(): Promise<void> {
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
  initLocale();

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
  const activeProfile = await ensureActiveProfile();
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
  await migrateLegacyDocIfNeeded();
  try {
    const mapping = await migrateToContentAddressed();
    if (mapping.size > 0) {
      for (const e of listDocs()) {
        const c = loadDocContent(e);
        if (c == null) continue;
        const rewrote = rewriteImageRefs(c, mapping);
        if (rewrote !== c) await saveDocContent(e.uuid, rewrote);
      }
    }
  } catch (err) {
    console.error('Image store migration failed', err);
  }

  // First run: empty index → seed with the bundled help tutorial.
  // `currentDoc` is mutable: switching, creating, or deleting a doc
  // points it at the new entry, and the toolbar / autosave read its
  // current value via the closure.
  let currentDoc: DocEntry =
    resolveCurrentDoc() ?? (await createDoc(t('default.help-doc-name'), DEFAULT_DOC));
  setCurrentDocId(currentDoc.uuid);
  const initialDoc = loadDocContent(currentDoc) ?? '';

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

  // Builds the rendered DOM subtree (Markdown + post-processing) and
  // hands it to paged.js. Called only when entering preview mode (or on
  // settings change while in preview); never during typing.
  const updatePreview = async (source: string): Promise<void> => {
    const myReq = ++previewReqId;
    const resolved = await expandRefsToBlobUrls(source);
    const built = document.createElement('div');
    renderPreview(built, resolved);
    applyPreviewMetadata(built, state.settings);
    annotateSourceLines(built, source);
    await Promise.all([
      renderMermaidBlocks(built),
      renderMathBlocks(built),
      renderMathInlines(built),
    ]);
    if (myReq !== previewReqId) return;
    await paginate(built, state.settings, previewEl);
    if (myReq !== previewReqId) return;
    dirty = false;
  };

  const debouncedSave = debounce((source: string) => {
    void (async () => {
      try {
        await saveDocContent(currentDoc.uuid, source);
        await runGC();
      } catch (err) {
        console.error('Autosave failed', err);
      }
    })();
  }, 200);

  applyPreviewStyles(state.settings);

  const editor = createEditor(editorEl, initialDoc, (doc) => {
    // Edits only mark the preview dirty; we re-paginate on the next
    // toggle into preview mode. No work happens during typing.
    dirty = true;
    debouncedSave(doc);
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

  // Click inside the preview returns to the editor at that source line.
  previewEl.addEventListener('click', (e) => {
    if (viewMode !== 'preview') return;
    const anchor = previewClickAnchor(e, previewEl);
    if (anchor) enterEditor(anchor);
  });

  // Flushes the pending autosave: if the current editor content
  // differs from the saved blob (because the debounce hasn't fired
  // yet), persist it now. Called before any operation that swaps the
  // current doc, so we never lose unsaved keystrokes.
  const flushSave = async (): Promise<void> => {
    try {
      await saveDocContent(currentDoc.uuid, editor.getValue());
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
    const target = listDocs().find((e) => e.uuid === uuid);
    if (!target) return;
    currentDoc = target;
    setCurrentDocId(target.uuid);
    const content = loadDocContent(target) ?? '';
    editor.setValue(content);
    dirty = true;
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setDocName(target.name);
  };

  const createNewDoc = async (): Promise<void> => {
    await flushSave();
    const entry = await createDoc('Sans titre');
    currentDoc = entry;
    setCurrentDocId(entry.uuid);
    editor.setValue('');
    dirty = true;
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setDocName(entry.name);
  };

  const renameCurrentDoc = (newName: string): void => {
    const updated = renameDoc(currentDoc.uuid, newName);
    if (!updated) return;
    currentDoc = updated;
    toolbarCtrl.setDocName(updated.name);
  };

  const renameOtherDoc = (uuid: string, newName: string): void => {
    if (uuid === currentDoc.uuid) {
      renameCurrentDoc(newName);
      return;
    }
    renameDoc(uuid, newName);
  };

  const duplicateAndSwitch = async (uuid: string): Promise<void> => {
    if (uuid === currentDoc.uuid) await flushSave();
    const dup = await duplicateDoc(uuid);
    if (!dup) return;
    await switchToDoc(dup.uuid);
  };

  // Deletes a doc. If it was the current one, fall back to the most
  // recent remaining doc, or seed a fresh empty one if the list
  // becomes empty.
  const deleteAndAdjust = async (uuid: string): Promise<void> => {
    const wasCurrent = uuid === currentDoc.uuid;
    deleteDoc(uuid);
    if (!wasCurrent) {
        return;
    }
    const remaining = listDocs();
    if (remaining.length === 0) {
      const fresh = await createDoc('Sans titre');
      currentDoc = fresh;
      setCurrentDocId(fresh.uuid);
      editor.setValue('');
    } else {
      const next = remaining[0];
      currentDoc = next;
      setCurrentDocId(next.uuid);
      editor.setValue(loadDocContent(next) ?? '');
    }
    dirty = true;
    if (viewMode === 'preview') setViewMode('editor');
    toolbarCtrl.setDocName(currentDoc.name);
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
    // preview; if we're already in preview, refresh now.
    dirty = true;
    if (viewMode === 'preview') {
      void updatePreview(editor.getValue()).catch((err: unknown) => {
        console.error('Preview render failed', err);
      });
    }
  };

  // Imports an external file (.md / .docx / .html / .txt) as a *new*
  // doc in the index, switches to it. Unlike the mono-doc era, this
  // never overwrites the current doc, so no confirmation is needed.
  // The new doc's name is derived from the source filename — if the
  // base name collides with an existing doc, createDoc uniques it.
  const handleImport = (file: File): void => {
    importFile(file)
      .then(async ({ content, baseName }) => {
        // Persist the outgoing doc before we switch focus — debounce
        // may not have fired yet.
        await flushSave();
        // Hoist any inline data URLs into IndexedDB and replace them
        // with short `img://<sha>` refs. Keeps the new doc readable.
        const cleaned = await extractDataUrlsToStore(content);
        const desired = baseName.trim() === '' ? 'Document importé' : baseName;
        const entry = await createDoc(desired, cleaned);
        currentDoc = entry;
        setCurrentDocId(entry.uuid);
        editor.setValue(cleaned);
        // Stay in editor mode after import — the user typically wants
        // to see the markdown they just opened. The preview is dirty
        // and will repaginate on the next Cmd/Ctrl+Enter.
        dirty = true;
        if (viewMode === 'preview') setViewMode('editor');
        toolbarCtrl.setDocName(entry.name);
      })
      .catch((err: unknown) => {
        console.error('Import failed', err);
        const msg = err instanceof Error ? err.message : String(err);
        globalThis.alert(t('import.failed', { msg }));
      });
  };

  // Import dialog: transient <input type=file>, hands the chosen
  // file to handleImport. Shared by the toolbar [Importer] button
  // and the Cmd/Ctrl+O shortcut.
  const triggerImportDialog = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_ATTRIBUTE;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) handleImport(file);
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
      const slug = slugifyDocName(entry?.name ?? 'profil');
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
      onDocMenu(anchor) {
        openDocMenu(anchor, {
          docs: listDocs(),
          currentUuid: currentDoc.uuid,
          onSelect(uuid) {
            void switchToDoc(uuid);
          },
          onCreate() {
            void createNewDoc();
          },
          onRenameCurrent: renameCurrentDoc,
          onRenameOther: renameOtherDoc,
          onDuplicate(uuid) {
            void duplicateAndSwitch(uuid);
          },
          onDelete(uuid) {
            void deleteAndAdjust(uuid);
          },
        });
      },
      onImport: triggerImportDialog,
      onStyle(anchor) {
        openStyleMenu(editor.view, anchor.x, anchor.y);
      },
      onHelp: triggerHelp,
      onExport(anchor) {
        openExportMenu(anchor, {
          onMarkdown: triggerSave,
          onPdf: triggerDownload,
          onLatex: triggerLatexExport,
        });
      },
      onSettings: triggerSettings,
      onTogglePreview: toggleView,
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
    if (!mod || e.shiftKey || e.altKey) return;
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
        e.preventDefault();
        triggerSave();
        break;
      case 'o':
        e.preventDefault();
        triggerImportDialog();
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
}

await bootstrap();
