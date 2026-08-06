import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDocumentStyleMenu } from '../src/ui/document-style-menu';
import type { NamedStyle } from '../src/style-library';

const builtin = (key: string, name: string): NamedStyle => ({
  key,
  name,
  style: { pageSize: 'A4' },
});

function open(overrides: Partial<Parameters<typeof openDocumentStyleMenu>[1]> = {}) {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const styles = [
    builtin('note-a4', 'Note A4'),
    builtin('mine', 'Mon style'),
  ];
  openDocumentStyleMenu(anchor, {
    current: '',
    styles,
    userKeys: new Set(['mine']),
    onPick: () => {},
    onExport: () => {},
    onImport: () => {},
    ...overrides,
  });
  return document.getElementById('document-style-menu')!;
}

afterEach(() => {
  document.getElementById('document-style-menu')?.remove();
  document.body.innerHTML = '';
});

describe('document-style-menu — delete affordance', () => {
  it('shows a trash on user styles only, not built-ins', () => {
    const menu = open({ onDelete: () => true });
    const rowFor = (label: string): HTMLElement | undefined =>
      Array.from(menu.querySelectorAll<HTMLElement>('.cm-context-row, .cm-context-item')).find(
        (r) => (r.querySelector('.cm-context-label')?.textContent ?? '') === label,
      );
    expect(rowFor('Mon style')?.querySelector('.cm-context-trash')).toBeTruthy();
    expect(rowFor('Note A4')?.querySelector('.cm-context-trash')).toBeFalsy();
  });

  it('no trash at all when onDelete is not provided', () => {
    const menu = open();
    expect(menu.querySelector('.cm-context-trash')).toBeFalsy();
  });

  it('clicking the trash calls onDelete with the style and removes the row', () => {
    const onDelete = vi.fn().mockReturnValue(true);
    const onPick = vi.fn();
    const menu = open({ onDelete, onPick });
    const trash = menu.querySelector<HTMLButtonElement>('.cm-context-trash')!;
    const wrap = trash.closest('.cm-context-row')!;
    trash.click();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0][0]).toMatchObject({ key: 'mine' });
    expect(onPick).not.toHaveBeenCalled(); // trash must not trigger a pick
    expect(menu.contains(wrap)).toBe(false); // row pulled out
  });

  it('keeps the row when onDelete returns false (declined)', () => {
    const onDelete = vi.fn().mockReturnValue(false);
    const menu = open({ onDelete });
    const trash = menu.querySelector<HTMLButtonElement>('.cm-context-trash')!;
    const wrap = trash.closest('.cm-context-row')!;
    trash.click();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(menu.contains(wrap)).toBe(true);
  });
});
