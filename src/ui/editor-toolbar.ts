import type { EditorView } from '@codemirror/view';
import {
  insertLink,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  type HeadingLevel,
} from '../editor-commands';

const HEADING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Titre…' },
  { value: '0', label: 'Normal' },
  { value: '1', label: 'Titre 1' },
  { value: '2', label: 'Titre 2' },
  { value: '3', label: 'Titre 3' },
  { value: '4', label: 'Titre 4' },
];

export function mountEditorToolbar(
  parent: HTMLElement,
  view: EditorView,
): void {
  parent.innerHTML = '';

  const headingSelect = document.createElement('select');
  headingSelect.className = 'heading-select';
  headingSelect.title = 'Niveau de titre';
  for (const opt of HEADING_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === '') o.disabled = true;
    headingSelect.appendChild(o);
  }
  headingSelect.value = '';
  headingSelect.addEventListener('change', () => {
    const v = headingSelect.value;
    if (v === '') return;
    setHeading(view, Number(v) as HeadingLevel);
    headingSelect.value = '';
  });

  parent.append(
    headingSelect,
    sep(),
    btn('B', 'Gras (Ctrl+B)', () => toggleBold(view), 'tb-bold'),
    btn('I', 'Italique (Ctrl+I)', () => toggleItalic(view), 'tb-italic'),
    btn('</>', 'Code en ligne', () => toggleInlineCode(view), 'tb-code'),
    sep(),
    btn('•  Liste', 'Liste à puces', () => toggleBulletList(view)),
    btn('1.  Liste', 'Liste numérotée', () => toggleNumberedList(view)),
    btn('« »', 'Citation', () => toggleBlockquote(view)),
    sep(),
    btn('🔗 Lien', 'Insérer un lien', () => insertLink(view)),
  );
}

function sep(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'editor-toolbar-sep';
  return s;
}

function btn(
  label: string,
  title: string,
  onClick: () => void,
  className?: string,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  if (className) b.className = className;
  b.addEventListener('mousedown', (e) => {
    // Avoid stealing focus from the editor when clicking a button — keeps
    // the current selection alive for commands like Bold/Italic.
    e.preventDefault();
  });
  b.addEventListener('click', onClick);
  return b;
}
