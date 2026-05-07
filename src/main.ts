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
import { createEditor } from './editor';
import {
  renderPreview,
  debounce,
  applyPreviewStyles,
  applyPreviewMetadata,
  annotateSourceLines,
} from './preview';
import { setupScrollSync } from './scroll-sync';
import { importFile } from './import';
import {
  expandRefsToBlobUrls,
  expandRefsToDataUrls,
  expandRefsToInlineDataUrls,
  extractDataUrlsToStore,
  gcUnusedImages,
} from './image';
import { markdownToDocDefinition } from './pdf/convert';
import { downloadPdf } from './pdf/maker';
import { mountToolbar } from './ui/toolbar';
import { attachStyleContextMenu, openStyleMenu } from './ui/style-menu';
import { openSettingsPanel } from './ui/settings-panel';
import {
  loadDoc,
  loadFilename,
  saveDoc,
  saveFilename,
} from './storage';
import { loadSettings, saveSettings, type PdfSettings } from './settings';

const DEFAULT_DOC = `# md2pdf

Un convertisseur **Markdown → PDF** entièrement côté client.

## Fonctionnalités du MVP

- Titres, paragraphes
- *italique*, **gras**, \`code inline\`
- Listes à puces et numérotées
- Citations, blocs de code, liens

> Édite ce texte à gauche, puis clique sur **Exporter .pdf**.

\`\`\`
console.log('Hello, world!');
\`\`\`

[Documentation pdfmake](https://pdfmake.github.io/docs/)
`;

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
      .then((resolved) => {
        if (myReq !== previewReqId) return;
        renderPreview(previewEl, resolved);
        applyPreviewMetadata(previewEl, state.settings);
        // annotateSourceLines walks the *original* source so scroll-sync
        // line numbers match what the user typed in the editor.
        annotateSourceLines(previewEl, source);
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

  const renderToolbar = (): void => {
    mountToolbar(toolbarEl, {
      initialFilename: state.filename,
      onFilenameChange(name) {
        state.filename = name;
        saveFilename(name);
      },
      onOpen: handleOpen,
      onSave() {
        const source = editor.getValue();
        // Inline every image as a data URL so the .md is portable, then
        // GC any IDB entries the doc no longer references.
        void (async () => {
          try {
            const expanded = await expandRefsToDataUrls(source);
            await gcUnusedImages(source);
            downloadMarkdown(expanded, mdFilenameFrom(state.filename));
          } catch (err) {
            console.error('Save failed', err);
          }
        })();
      },
      onStyle(anchor) {
        openStyleMenu(editor.view, anchor.x, anchor.y);
      },
      onDownload() {
        const source = editor.getValue();
        void (async () => {
          try {
            const expanded = await expandRefsToInlineDataUrls(source);
            const doc = markdownToDocDefinition(expanded, state.settings);
            await downloadPdf(doc, ensureFilename(state.filename));
          } catch (err) {
            console.error('PDF export failed', err);
          }
        })();
      },
      onSettings() {
        openSettingsPanel({
          getSettings: () => state.settings,
          onChange: handleSettingsChange,
        });
      },
    });
  };

  renderToolbar();
}

bootstrap();
