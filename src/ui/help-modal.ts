import { marked } from 'marked';

const OVERLAY_ID = 'help-overlay';

export function openHelpModal(helpMarkdown: string): void {
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
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'close';
  closeBtn.textContent = 'Fermer';
  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'help-body';
  body.innerHTML = marked.parse(helpMarkdown, { async: false });

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
