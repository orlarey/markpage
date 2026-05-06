// Embedded Roboto Condensed, in the four variants we use in the PDF:
// regular (400), medium (500, used as "bold"), and their italics. Self-hosted
// so the app keeps working offline (SPEC §7.5).
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/500.css';
import '@fontsource/roboto-condensed/400-italic.css';
import '@fontsource/roboto-condensed/500-italic.css';

import './style.css';
import { createEditor } from './editor';
import {
  renderPreview,
  debounce,
  applyPreviewStyles,
  applyPreviewMetadata,
} from './preview';
import { markdownToDocDefinition } from './pdf/convert';
import { downloadPdf } from './pdf/maker';
import { mountToolbar } from './ui/toolbar';
import { mountEditorToolbar } from './ui/editor-toolbar';
import { attachEditorContextMenu } from './ui/editor-context-menu';
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

function bootstrap(): void {
  const toolbarEl = document.getElementById('toolbar') as HTMLElement;
  const editorToolbarEl = document.getElementById(
    'editor-toolbar',
  ) as HTMLElement;
  const editorContentEl = document.getElementById(
    'editor-content',
  ) as HTMLElement;
  const previewEl = document.getElementById('preview-pane') as HTMLElement;

  const state = {
    filename: loadFilename() ?? DEFAULT_FILENAME,
    settings: loadSettings(),
  };

  const initialDoc = loadDoc() ?? DEFAULT_DOC;

  const updatePreview = (source: string) => {
    renderPreview(previewEl, source);
    applyPreviewMetadata(previewEl, state.settings);
  };
  const debouncedSave = debounce((source: string) => saveDoc(source), 200);

  applyPreviewStyles(state.settings);

  const editor = createEditor(editorContentEl, initialDoc, (doc) => {
    updatePreview(doc);
    debouncedSave(doc);
  });

  mountEditorToolbar(editorToolbarEl, editor.view);
  attachEditorContextMenu(editor.view.dom, editor.view);

  updatePreview(initialDoc);

  const handleSettingsChange = (s: PdfSettings) => {
    state.settings = s;
    saveSettings(s);
    applyPreviewStyles(s);
    applyPreviewMetadata(previewEl, s);
  };

  const renderToolbar = () => {
    mountToolbar(toolbarEl, {
      initialFilename: state.filename,
      onFilenameChange(name) {
        state.filename = name;
        saveFilename(name);
      },
      onLoad(content, baseName) {
        editor.setValue(content);
        saveDoc(content);
        updatePreview(content);
        state.filename = ensureFilename(baseName);
        saveFilename(state.filename);
        renderToolbar();
      },
      onDownload() {
        const source = editor.getValue();
        const doc = markdownToDocDefinition(source, state.settings);
        downloadPdf(doc, ensureFilename(state.filename)).catch((err) => {
          console.error('PDF export failed', err);
        });
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
