/*********************************** menu.ts **********************************
 *
 * Purpose: One dropdown / context menu with nested submenus — the Format and
 *   Insérer menus and the editor's right-click menu are all built from it, as
 *   plain data (MenuEntry[]).
 * How: Each level is an `.editor-context-menu` panel; a submenu row opens its
 *   panel beside it on hover or →, flipped left when it would overflow. The
 *   keyboard walks it like a desktop menu: ↑/↓ move, → / Entrée open, ← goes
 *   back, Échap closes. Rows never take focus from the editor on mouse press,
 *   so a command acts on the editor's selection.
 *
 *******************************************************************************/

export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      /** Keyboard shortcut shown on the right (see keyHint). */
      hint?: string;
      /** Shown checked: a toggle that is on, or the current choice. */
      checked?: boolean;
      disabled?: boolean;
      action: () => void;
    }
  | { kind: 'submenu'; label: string; items: MenuEntry[] }
  | { kind: 'sep' }
  /** A small caption over the rows that follow. */
  | { kind: 'heading'; label: string };

export const SEP: MenuEntry = { kind: 'sep' };

const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

/**
 * A shortcut as the platform writes it: `Mod-Shift-l` → `⇧⌘L` on a Mac,
 * `Ctrl+Maj+L`-style (`Ctrl+Shift+L`) elsewhere.
 */
export function keyHint(spec: string): string {
  const parts = spec.split('-');
  const key = parts.pop() ?? '';
  const name = key.length === 1 ? key.toUpperCase() : key === 'Enter' ? '↵' : key;
  if (IS_MAC) {
    const glyph: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' };
    const order = ['Ctrl', 'Alt', 'Shift', 'Mod'];
    return order.filter((m) => parts.includes(m)).map((m) => glyph[m]).join('') + name;
  }
  const word: Record<string, string> = { Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Maj' };
  return [...parts.map((m) => word[m] ?? m), name].join('+');
}

interface Level {
  panel: HTMLElement;
  rows: HTMLButtonElement[];
}

/**
 * Open `items` as a menu at `at` (a point, or under an element). `id` names
 * the root panel, so opening the same menu again replaces it.
 */
export function openMenu(
  id: string,
  at: { x: number; y: number } | HTMLElement,
  items: MenuEntry[],
): void {
  closeMenu(id);
  const levels: Level[] = [];
  // parents[d]: the submenu row of level d that opened level d + 1.
  const parents: HTMLButtonElement[] = [];
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  const closeAll = (): void => {
    clearTimeout(hoverTimer);
    for (const l of levels) l.panel.remove();
    levels.length = 0;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    globalThis.removeEventListener('resize', closeAll);
    globalThis.removeEventListener('blur', closeAll);
    openMenus.delete(id);
  };
  // Close the levels deeper than `depth` (0 = keep the root only).
  const closeFrom = (depth: number): void => {
    while (levels.length > depth + 1) levels.pop()?.panel.remove();
    for (const r of levels[depth]?.rows ?? []) r.removeAttribute('aria-expanded');
  };

  const place = (panel: HTMLElement, x: number, y: number, flipX?: number): void => {
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    const r = panel.getBoundingClientRect();
    if (r.right > globalThis.innerWidth - 4) {
      const left = flipX !== undefined ? flipX - r.width : globalThis.innerWidth - r.width - 4;
      panel.style.left = `${Math.max(4, left)}px`;
    }
    if (r.bottom > globalThis.innerHeight - 4) {
      panel.style.top = `${Math.max(4, globalThis.innerHeight - r.height - 4)}px`;
    }
  };

  const openLevel = (entries: MenuEntry[], depth: number, x: number, y: number, flipX?: number): Level => {
    const panel = document.createElement('div');
    panel.className = 'editor-context-menu mp-menu';
    panel.setAttribute('role', 'menu');
    if (depth === 0) panel.id = id;
    const rows: HTMLButtonElement[] = [];
    for (const entry of entries) {
      if (entry.kind === 'sep') {
        const s = document.createElement('div');
        s.className = 'cm-context-sep';
        panel.append(s);
        continue;
      }
      if (entry.kind === 'heading') {
        const h = document.createElement('div');
        h.className = 'mp-menu-heading';
        h.textContent = entry.label;
        panel.append(h);
        continue;
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cm-context-item';
      row.setAttribute('role', 'menuitem');
      row.tabIndex = -1;
      const check = document.createElement('span');
      check.className = 'cm-context-check';
      check.textContent = '✓';
      const label = document.createElement('span');
      label.className = 'cm-context-label';
      label.textContent = entry.label;
      const hint = document.createElement('span');
      hint.className = 'cm-context-hint';
      row.append(check, label, hint);
      // Never take focus from the editor: commands act on its selection.
      row.addEventListener('mousedown', (e) => e.preventDefault());
      if (entry.kind === 'submenu') {
        row.classList.add('mp-menu-parent');
        row.setAttribute('aria-haspopup', 'menu');
        hint.textContent = '▸';
        const open = (focusFirst: boolean): void => {
          closeFrom(depth);
          parents[depth] = row;
          row.setAttribute('aria-expanded', 'true');
          const r = row.getBoundingClientRect();
          const child = openLevel(entry.items, depth + 1, r.right + 2, r.top - 4, r.left - 2);
          if (focusFirst) child.rows[0]?.focus();
        };
        row.addEventListener('mouseenter', () => {
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => open(false), 120);
        });
        row.addEventListener('click', () => open(true));
        (row as HTMLButtonElement & { openSub?: () => void }).openSub = () => open(true);
      } else {
        if (entry.checked) row.classList.add('active');
        if (entry.hint) hint.textContent = entry.hint;
        if (entry.disabled) {
          row.disabled = true;
          row.classList.add('disabled');
        }
        row.addEventListener('mouseenter', () => {
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => closeFrom(depth), 120);
        });
        row.addEventListener('click', () => {
          closeAll();
          entry.action();
        });
      }
      rows.push(row);
      panel.append(row);
    }
    document.body.append(panel);
    place(panel, x, y, flipX);
    const level = { panel, rows };
    levels[depth] = level;
    return level;
  };

  const onDocDown = (e: MouseEvent): void => {
    if (!levels.some((l) => l.panel.contains(e.target as Node))) closeAll();
  };
  const onKey = (e: KeyboardEvent): void => {
    const depth = levels.findIndex((l) => l.panel.contains(document.activeElement));
    const level = levels[depth];
    const idx = level ? level.rows.indexOf(document.activeElement as HTMLButtonElement) : -1;
    const focusIn = (l: Level | undefined, i: number): void => {
      if (!l || l.rows.length === 0) return;
      l.rows[(i + l.rows.length) % l.rows.length]?.focus();
    };
    switch (e.key) {
      case 'Escape':
        closeAll();
        break;
      case 'ArrowDown':
        focusIn(level ?? levels[0], idx + 1);
        break;
      case 'ArrowUp':
        focusIn(level ?? levels[0], idx < 0 ? -1 : idx - 1);
        break;
      case 'ArrowRight': {
        const row = level?.rows[idx] as (HTMLButtonElement & { openSub?: () => void }) | undefined;
        if (row?.openSub) row.openSub();
        else return;
        break;
      }
      case 'ArrowLeft':
        if (depth <= 0) return;
        closeFrom(depth - 1);
        parents[depth - 1]?.focus();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  const origin =
    at instanceof HTMLElement
      ? (() => {
          const r = at.getBoundingClientRect();
          return { x: r.left, y: r.bottom + 4 };
        })()
      : at;
  openLevel(items, 0, origin.x, origin.y);
  openMenus.set(id, closeAll);
  // Listening at once is safe: the press that opened the menu (click, or the
  // mousedown before a contextmenu) is already over — and a key typed right
  // after opening must reach the menu.
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  globalThis.addEventListener('resize', closeAll);
  globalThis.addEventListener('blur', closeAll);
}

const openMenus = new Map<string, () => void>();

/** Close the menu `id` if it is open. */
export function closeMenu(id: string): void {
  openMenus.get(id)?.();
}
