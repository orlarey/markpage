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

import './style.css';
// Side-effect import: registers our marked extensions ($$math$$, …) on the
// shared `marked` instance. Must run before any marked.parse / marked.lexer.
import './marked-config';
import { registerFallbackFonts } from './fonts';
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
import { setupScrollSync } from './scroll-sync';
import { ACCEPT_ATTRIBUTE, importFile } from './import';
import {
  expandRefsToBlobUrls,
  expandRefsToDataUrls,
  expandRefsToInlineDataUrls,
  extractDataUrlsToStore,
  gcUnusedImages,
  refifyImageUrls,
} from './image';
import { markdownToDocDefinition } from './pdf/convert';
import { downloadPdf } from './pdf/maker';
import { mountToolbar } from './ui/toolbar';
import { attachStyleContextMenu, openStyleMenu } from './ui/style-menu';
import { openSettingsPanel } from './ui/settings-panel';
import { openHelpModal } from './ui/help-modal';
import helpMd from './HELP.md?raw';
import {
  loadDoc,
  loadFilename,
  saveDoc,
  saveFilename,
} from './storage';
import { loadSettings, saveSettings, type PdfSettings } from './settings';

// First-run document is the bundled HELP.md tutorial. The user can edit
// or erase it; once a doc lives in localStorage, that one wins on reopen
// and HELP stays accessible only via the Aide button.
const DEFAULT_DOC = helpMd;

const DEFAULT_FILENAME = 'document.pdf';

function ensureFilename(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return DEFAULT_FILENAME;
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}

// Derives the .md filename for "Enregistrer" from the current PDF filename
// (the user manages a single base name in the toolbar's filename input).
function mdFilenameFrom(pdfName: string): string {
  return pdfName.replace(/\.pdf$/i, '') + '.md';
}

function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function bootstrap(): void {
  // Register the Noto fallback fonts (full TTFs, not subsetted) so the HTML
  // preview's font cascade has the same coverage as the PDF. Fire and
  // forget — the browser starts using the fonts as soon as they're loaded.
  void registerFallbackFonts().catch((err: unknown) => {
    console.error('Fallback font registration failed', err);
  });

  const toolbarEl = document.getElementById('toolbar') as HTMLElement;
  const editorEl = document.getElementById('editor-pane') as HTMLElement;
  const previewEl = document.getElementById('preview-pane') as HTMLElement;

  const state = {
    filename: loadFilename() ?? DEFAULT_FILENAME,
    settings: loadSettings(),
  };

  const initialDoc = loadDoc() ?? DEFAULT_DOC;

  // Resolving `img://id` refs touches IndexedDB, so updatePreview is async.
  // We only render the latest call's output (previewReqId) to avoid an in-
  // flight resolve overwriting a more recent one when typing fast.
  let previewReqId = 0;
  const updatePreview = (source: string): void => {
    const myReq = ++previewReqId;
    expandRefsToBlobUrls(source)
      .then(async (resolved) => {
        if (myReq !== previewReqId) return;
        renderPreview(previewEl, resolved);
        applyPreviewMetadata(previewEl, state.settings);
        // annotateSourceLines walks the *original* source so scroll-sync
        // line numbers match what the user typed in the editor.
        annotateSourceLines(previewEl, source);
        // Mermaid + math run last so the data-line annotations are already
        // on the <pre> / placeholder blocks they replace. Run them in
        // parallel — independent libraries, both lazy-loaded. Bail out
        // afterwards if the user typed something newer in the meantime.
        await Promise.all([
          renderMermaidBlocks(previewEl),
          renderMathBlocks(previewEl),
          renderMathInlines(previewEl),
        ]);
        if (myReq !== previewReqId) return;
      })
      .catch((err: unknown) => {
        console.error('Preview render failed', err);
      });
  };
  const debouncedSave = debounce((source: string) => saveDoc(source), 200);

  applyPreviewStyles(state.settings);

  const editor = createEditor(editorEl, initialDoc, (doc) => {
    updatePreview(doc);
    debouncedSave(doc);
  });

  attachStyleContextMenu(editor.view.dom, editor.view);
  setupScrollSync(editor.view, previewEl);

  updatePreview(initialDoc);

  const handleSettingsChange = (s: PdfSettings) => {
    state.settings = s;
    saveSettings(s);
    applyPreviewStyles(s);
    applyPreviewMetadata(previewEl, s);
  };

  const handleOpen = (file: File): void => {
    const current = editor.getValue();
    const dirty = current.trim() !== '' && current !== DEFAULT_DOC;
    if (dirty) {
      const ok = globalThis.confirm(
        'Le contenu actuel sera remplacé. Continuer ?',
      );
      if (!ok) return;
    }
    importFile(file)
      .then(async ({ content, baseName }) => {
        // Hoist any inline data URLs into IndexedDB and replace them with
        // short `img://id` refs. Keeps the editor doc readable.
        const cleaned = await extractDataUrlsToStore(content);
        editor.setValue(cleaned);
        saveDoc(cleaned);
        updatePreview(cleaned);
        state.filename = ensureFilename(baseName);
        saveFilename(state.filename);
        renderToolbar();
      })
      .catch((err: unknown) => {
        console.error('Import failed', err);
        const msg = err instanceof Error ? err.message : String(err);
        globalThis.alert(`Échec de l'import : ${msg}`);
      });
  };

  // Open dialog: creates a transient <input type=file>, lets the user pick a
  // file, hands it off to handleOpen. Used both by the toolbar's "Ouvrir"
  // button and by the Cmd/Ctrl+O shortcut so they share one entry point.
  const triggerOpenDialog = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_ATTRIBUTE;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) handleOpen(file);
    });
    input.click();
  };

  const triggerSave = (): void => {
    const source = editor.getValue();
    void (async () => {
      try {
        const refified = refifyImageUrls(source);
        const expanded = await expandRefsToDataUrls(refified);
        await gcUnusedImages(source);
        downloadMarkdown(expanded, mdFilenameFrom(state.filename));
      } catch (err) {
        console.error('Save failed', err);
      }
    })();
  };

  const triggerDownload = (): void => {
    const source = editor.getValue();
    void (async () => {
      try {
        const expanded = await expandRefsToInlineDataUrls(source);
        const doc = await markdownToDocDefinition(expanded, state.settings);
        await downloadPdf(doc, ensureFilename(state.filename));
      } catch (err) {
        console.error('PDF export failed', err);
      }
    })();
  };

  const triggerSettings = (): void => {
    openSettingsPanel({
      getSettings: () => state.settings,
      onChange: handleSettingsChange,
    });
  };

  const triggerHelp = (): void => {
    openHelpModal(helpMd, {
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
        const doc = await markdownToDocDefinition(helpMd, helpSettings);
        await downloadPdf(doc, 'md2pdf-aide.pdf');
      },
    });
  };

  const renderToolbar = (): void => {
    mountToolbar(toolbarEl, {
      initialFilename: state.filename,
      onFilenameChange(name) {
        state.filename = name;
        saveFilename(name);
      },
      onOpen: triggerOpenDialog,
      onSave: triggerSave,
      onStyle(anchor) {
        openStyleMenu(editor.view, anchor.x, anchor.y);
      },
      onHelp: triggerHelp,
      onDownload: triggerDownload,
      onSettings: triggerSettings,
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
    switch (e.key.toLowerCase()) {
      case 's':
        e.preventDefault();
        triggerSave();
        break;
      case 'o':
        e.preventDefault();
        triggerOpenDialog();
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

bootstrap();
