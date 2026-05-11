// Tiny dropdown that lists the available export formats. Built like
// style-menu / doc-menu: one transient div, dismissed on outside
// click, Escape, or window resize.

const MENU_ID = 'export-menu';

export interface ExportMenuOptions {
  onMarkdown(): void;
  onPdf(): void;
  onLatex(): void;
}

export function openExportMenu(
  anchor: HTMLElement,
  opts: ExportMenuOptions,
): void {
  document.getElementById(MENU_ID)?.remove();

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'export-menu';
  // Right-aligned to the trigger because the button sits on the
  // right side of the toolbar; a left-anchored menu would clip off
  // the viewport.
  menu.style.right = `${globalThis.innerWidth - rect.right}px`;
  menu.style.top = `${rect.bottom + 4}px`;

  const close = (): void => {
    menu.remove();
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey);
    globalThis.removeEventListener('resize', close);
  };
  const onDocDown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const item = (
    label: string,
    hint: string,
    action: () => void,
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'export-menu-item';
    const main = document.createElement('span');
    main.className = 'export-menu-label';
    main.textContent = label;
    const sub = document.createElement('span');
    sub.className = 'export-menu-hint';
    sub.textContent = hint;
    btn.append(main, sub);
    btn.addEventListener('click', () => {
      close();
      action();
    });
    return btn;
  };

  menu.append(
    item('Markdown (.md)', 'Cmd/Ctrl + S', opts.onMarkdown),
    item('PDF (.pdf)', 'Cmd/Ctrl + P', opts.onPdf),
    item('LaTeX (.tex)', '', opts.onLatex),
  );

  document.body.appendChild(menu);

  // Defer dismissal listeners by one tick so the click that opened
  // us doesn't immediately close.
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    globalThis.addEventListener('resize', close);
  }, 0);
}
