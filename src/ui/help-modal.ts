import { marked } from 'marked';
import {
  renderMathBlocks,
  renderMathInlines,
  renderMermaidBlocks,
} from '../preview';

const OVERLAY_ID = 'help-overlay';

export interface HelpModalOptions {
  /**
   * If provided, an "Exporter .pdf" button is shown in the header. The
   * callback is responsible for building and downloading the PDF; the
   * modal just disables the button while the promise is in flight.
   */
  onExportPdf?: () => Promise<void>;
}

export function openHelpModal(
  helpMarkdown: string,
  options: HelpModalOptions = {},
): void {
  // Single instance — clicking Help twice doesn't stack overlays.
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'help-overlay';

  const panel = document.createElement('div');
  panel.className = 'help-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Aide');

  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = 'Aide';

  const actions = document.createElement('div');
  actions.className = 'actions';

  if (options.onExportPdf) {
    const pdfBtn = document.createElement('button');
    pdfBtn.type = 'button';
    pdfBtn.className = 'export-pdf';
    pdfBtn.textContent = 'Exporter .pdf';
    pdfBtn.addEventListener('click', () => {
      const cb = options.onExportPdf;
      if (!cb) return;
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'Génération…';
      void cb()
        .catch((err: unknown) => {
          console.error('Help PDF export failed', err);
        })
        .finally(() => {
          pdfBtn.disabled = false;
          pdfBtn.textContent = 'Exporter .pdf';
        });
    });
    actions.append(pdfBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'close';
  closeBtn.textContent = 'Fermer';
  actions.append(closeBtn);

  header.append(title, actions);

  const body = document.createElement('div');
  body.className = 'help-body';
  body.innerHTML = marked.parse(helpMarkdown, { async: false });
  // Fill the math-block / mermaid-block placeholders left by marked.
  // Errors are non-fatal: the placeholders remain visible (and stylable
  // via .math-error / .mermaid-error) so the user still sees the source.
  void Promise.all([
    renderMathBlocks(body),
    renderMathInlines(body),
    renderMermaidBlocks(body),
  ]).catch((err: unknown) => {
    console.error('Help post-processing failed', err);
  });

  panel.append(header, body);
  overlay.appendChild(panel);

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
}
