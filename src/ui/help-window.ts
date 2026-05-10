// Standalone help window. Opens via `window.open()` so the user can
// move it to another monitor / position, leaving the editor below
// fully visible. Each fenced code block in the rendered help gets an
// "Insérer dans le document" button — clicking it inserts the block's
// raw source into the editor.
//
// We do NOT use postMessage to talk back to the editor: even though
// the button DOM lives in the spawned window, the click handler is
// registered from the opener's JS realm, so it already runs there
// and can call the insert callback directly.
//
// Falls back to the in-app modal (help-modal.ts) if the popup is
// blocked.

import { marked } from 'marked';
import {
  renderMathBlocks,
  renderMathInlines,
  renderMermaidBlocks,
} from '../preview';
import { openHelpModal, type HelpModalOptions } from './help-modal';
// Vite returns the processed CSS string for the `?inline` query.
// Bundling the whole app stylesheet keeps the help window visually
// consistent with the editor / preview without us hand-curating a
// subset.
import appCss from '../style.css?inline';

export interface HelpWindowOptions extends HelpModalOptions {
  /** Called when the user clicks an "Insert" button in the help. */
  onInsert(source: string): void;
  /**
   * Forwards Cmd/Ctrl+Z when the help window has focus, so the user
   * can undo an insertion they just made without first switching back
   * to the editor window.
   */
  onUndo?(): void;
  /** Like onUndo, for Shift+Cmd/Ctrl+Z (and Cmd/Ctrl+Y on Windows). */
  onRedo?(): void;
}

// Single instance — clicking Aide again refocuses the existing window
// rather than spawning a second one.
let currentHelpWindow: Window | null = null;

export function openHelp(
  helpMarkdown: string,
  options: HelpWindowOptions,
): void {
  // Re-focus an already-open window instead of opening a second one.
  if (currentHelpWindow && !currentHelpWindow.closed) {
    currentHelpWindow.focus();
    return;
  }

  const win = window.open(
    '',
    'md2pdf-help',
    'width=760,height=900,scrollbars=yes,resizable=yes',
  );
  if (!win) {
    // Popup blocked — fall back to the modal so the user still gets
    // the help. They lose the "movable window" but not the content.
    openHelpModal(helpMarkdown, options);
    return;
  }
  currentHelpWindow = win;

  buildHelpWindow(win, helpMarkdown, options);

  // Forward undo / redo keystrokes to the editor so the user can
  // cancel an insertion without leaving the help window. The listener
  // is registered from the opener's realm, so calling
  // options.onUndo() runs the editor command directly. preventDefault
  // is important on Firefox / Safari where Cmd+Z on the help window
  // would otherwise navigate back in any focused input.
  win.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      options.onUndo?.();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      options.onRedo?.();
    }
  });

  // Clear our reference if the user closes the window so a future
  // click re-opens cleanly.
  const checkClosed = setInterval(() => {
    if (win.closed) {
      currentHelpWindow = null;
      clearInterval(checkClosed);
    }
  }, 1000);
}

function buildHelpWindow(
  win: Window,
  helpMarkdown: string,
  options: HelpWindowOptions,
): void {
  win.document.title = 'Aide md2pdf';
  win.document.documentElement.lang = 'fr';
  win.document.head.innerHTML = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${appCss}</style>
    <style>${windowSpecificCss()}</style>
  `;
  win.document.body.innerHTML = `
    <header class="help-window-header">
      <h1>Aide md2pdf</h1>
      <div class="help-window-actions">
        ${options.onExportPdf ? '<button type="button" class="export-pdf">Exporter .pdf</button>' : ''}
        <button type="button" class="close">Fermer</button>
      </div>
    </header>
    <main class="help-body" id="help-body"></main>
  `;

  const body = win.document.getElementById('help-body');
  if (!body) return;
  body.innerHTML = marked.parse(helpMarkdown, { async: false });

  // Post-processing then insert buttons. We await the render* pass
  // before scanning for buttons because mermaid (in particular)
  // replaces its <pre><code> with a <div class="mermaid-block">
  // carrying the data-source attribute we just stashed — adding
  // buttons too early would attach them to the about-to-be-replaced
  // <pre>.
  void (async () => {
    try {
      await Promise.all([
        renderMathBlocks(body),
        renderMathInlines(body),
        renderMermaidBlocks(body),
      ]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Help post-processing failed', err);
    }
    addInsertButtons(win, body, options.onInsert);
  })();

  // Wire header buttons.
  const closeBtn = win.document.querySelector('.help-window-actions .close');
  closeBtn?.addEventListener('click', () => win.close());

  const pdfBtn = win.document.querySelector(
    '.help-window-actions .export-pdf',
  ) as HTMLButtonElement | null;
  if (pdfBtn && options.onExportPdf) {
    pdfBtn.addEventListener('click', () => {
      const cb = options.onExportPdf;
      if (!cb) return;
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'Génération…';
      void cb()
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error('Help PDF export failed', err);
        })
        .finally(() => {
          pdfBtn.disabled = false;
          pdfBtn.textContent = 'Exporter .pdf';
        });
    });
  }
}

// Walks every insertable block in the help body and prepends a small
// "Insérer" button. Two kinds of blocks qualify:
//   - <pre> code blocks (the literal markdown shown to the user) —
//     source = textContent of the inner <code>.
//   - elements with a `data-source` attribute — set by the marked
//     extensions and the mermaid post-processor on rendered blocks
//     (math placeholders, csv/tsv tables, charts, mermaid wrappers,
//     admonitions, inference rules). Source = data-source.
//
// The click handler runs in the parent's JS realm even though the
// DOM lives in the popup window, so we call onInsert(source)
// directly without any cross-window plumbing.
function addInsertButtons(
  win: Window,
  root: HTMLElement,
  onInsert: (source: string) => void,
): void {
  const candidates = root.querySelectorAll<HTMLElement>(
    'pre, [data-source]',
  );
  for (const el of candidates) {
    let source: string;
    if (el.dataset['source']) {
      source = el.dataset['source'];
    } else {
      const code = el.querySelector('code');
      source = (code?.textContent ?? el.textContent ?? '').replace(/\n$/, '');
    }
    if (source.trim() === '') continue;
    const btn = win.document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-insert-btn';
    // Permanent compact shape: just the arrow. The full label is
    // hidden until the user hovers / focuses the button (CSS in
    // windowSpecificCss). Hover-only used to make the button itself
    // disappear, which meant the user couldn't tell which blocks
    // were insertable without scanning every <pre>.
    const iconHtml = '<span class="icon">↘</span>';
    const labelHtml = '<span class="label">Insérer dans le document</span>';
    const defaultHtml = `${iconHtml}${labelHtml}`;
    btn.innerHTML = defaultHtml;
    btn.title = 'Copier cet exemple dans votre document à la position du curseur';
    btn.addEventListener('click', () => {
      onInsert(source);
      // Visual feedback. We force-show the label via an "inserted"
      // class so the message stays visible even after the cursor
      // leaves the button.
      btn.classList.add('inserted');
      btn.textContent = 'Inséré ✓';
      setTimeout(() => {
        btn.classList.remove('inserted');
        btn.innerHTML = defaultHtml;
      }, 1200);
    });
    el.classList.add('help-insertable');
    el.append(btn);
  }
}

// Styles only meaningful inside the help window itself — header bar,
// insert button positioning. The bulk of the typography comes from
// the bundled appCss above.
function windowSpecificCss(): string {
  return `
    body {
      margin: 0;
      font-family: var(--font-sans, system-ui);
      color: #1f2328;
      background: #fff;
    }
    .help-window-header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 1rem;
      background: #fff8d6;
      border-bottom: 1px solid #d0d7de;
    }
    .help-window-header h1 {
      flex: 1;
      margin: 0;
      font-size: 1.05rem;
      font-weight: 500;
    }
    .help-window-actions {
      display: flex;
      gap: 0.5rem;
    }
    .help-window-actions button {
      padding: 0.3rem 0.7rem;
      border: 1px solid #d0d7de;
      background: #fff;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
    }
    .help-window-actions button:disabled {
      opacity: 0.6;
      cursor: progress;
    }
    /* Help body lives at the window root, mimic the modal padding. */
    #help-body {
      padding: 1rem 1.5rem;
      max-width: 740px;
      margin: 0 auto;
    }
    /* Insert button: floats top-right of each <pre>. Always visible
       at low opacity so the user can tell at a glance which blocks
       are insertable; ramps to full opacity on hover/focus and
       reveals the full label. */
    .help-insertable {
      position: relative;
    }
    .help-insertable .help-insert-btn {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      font-size: 0.78rem;
      padding: 0.15rem 0.45rem;
      border: 1px solid #d0d7de;
      background: #ffffffcc;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0.45;
      transition: opacity 0.12s;
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
      font: inherit;
    }
    .help-insertable .help-insert-btn .icon {
      font-size: 1em;
      line-height: 1;
    }
    .help-insertable .help-insert-btn .label {
      display: none;
    }
    .help-insertable:hover .help-insert-btn,
    .help-insertable .help-insert-btn:focus,
    .help-insertable .help-insert-btn.inserted {
      opacity: 1;
    }
    .help-insertable:hover .help-insert-btn .label,
    .help-insertable .help-insert-btn:focus .label {
      display: inline;
    }
  `;
}
