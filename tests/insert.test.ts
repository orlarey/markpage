import { describe, expect, it } from 'vitest';

import {
  BLOCKS,
  labelsIn,
  planBlock,
  planDocMeta,
  planInline,
  planLabel,
  planNote,
  slugLabel,
  tocFromHeadings,
  type Plan,
} from '../src/insert';

/** Apply a plan to a string (changes are relative to the original). */
function apply(doc: string, plan: Plan): { text: string; selected: string } {
  let text = doc;
  // Right to left; at the same position, CodeMirror inserts in the given order.
  const order = plan.changes.map((c, i) => ({ c, i })).sort((a, b) => b.c.from - a.c.from || b.i - a.i);
  for (const { c } of order) {
    text = text.slice(0, c.from) + c.insert + text.slice(c.to);
  }
  const { anchor, head } = plan.selection;
  return { text, selected: text.slice(Math.min(anchor, head), Math.max(anchor, head)) };
}

describe('planBlock — blocks never split a paragraph', () => {
  const tpl = '::: note\n⟦Votre texte.⟧\n:::';

  it('goes after the caret line, with blank lines around, its slot selected', () => {
    const doc = 'Un paragraphe.\nSuite du paragraphe.\n\nAutre.';
    const r = apply(doc, planBlock(doc, 3, 3, tpl));
    expect(r.text).toBe('Un paragraphe.\n\n::: note\nVotre texte.\n:::\n\nSuite du paragraphe.\n\nAutre.');
    expect(r.selected).toBe('Votre texte.');
  });

  it('on an empty line: right there; at the end: one final newline', () => {
    const doc = 'Avant.\n\n';
    const r = apply(doc, planBlock(doc, doc.length, doc.length, tpl));
    expect(r.text).toBe('Avant.\n\n::: note\nVotre texte.\n:::\n');
    const empty = apply('', planBlock('', 0, 0, tpl));
    expect(empty.text).toBe('::: note\nVotre texte.\n:::\n');
  });

  it('wraps the selection', () => {
    const doc = 'Intro.\n\nÀ encadrer.\n\nFin.';
    const from = doc.indexOf('À');
    const r = apply(doc, planBlock(doc, from, from + 'À encadrer.'.length, tpl));
    expect(r.text).toBe('Intro.\n\n::: note\nÀ encadrer.\n:::\n\nFin.');
    expect(r.selected).toBe('À encadrer.');
  });

  it('a horizontal rule gets the blank line that keeps it from making a heading', () => {
    const doc = 'Texte';
    expect(apply(doc, planBlock(doc, 5, 5, BLOCKS.hr(true))).text).toBe('Texte\n\n---\n');
  });
});

describe('planInline', () => {
  it('selects the slot, or wraps the selection', () => {
    expect(apply('a  b', planInline('a  b', 2, 2, '$⟦x^2⟧$'))).toEqual({ text: 'a $x^2$ b', selected: 'x^2' });
    expect(apply('a + b', planInline('a + b', 0, 5, '$⟦x^2⟧$'))).toEqual({ text: '$a + b$', selected: 'a + b' });
  });
});

describe('planNote — footnotes and citations', () => {
  it('calls at the caret, defines at the end with the next free number', () => {
    const doc = 'Texte[^1].\n\n[^1]: Première.';
    const at = doc.indexOf('.');
    const r = apply(doc, planNote(doc, at, 'footnote', 'Texte de la note.'));
    expect(r.text).toBe('Texte[^1][^2].\n\n[^1]: Première.\n\n[^2]: Texte de la note.\n');
    expect(r.selected).toBe('Texte de la note.');
  });

  it('citations get ref1, ref2…', () => {
    const r = apply('Voir', planNote('Voir', 4, 'citation', 'Auteur.'));
    expect(r.text).toBe('Voir[@ref1]\n\n[@ref1]: Auteur.\n');
    expect(r.selected).toBe('Auteur.');
  });
});

describe('labels and cross-references', () => {
  it('a heading gets a label from its title; elsewhere a slot to name', () => {
    const doc = '## Méthode et données\n\nTexte.';
    expect(apply(doc, planLabel(doc, 3)).text).toBe('## Méthode et données \\label{sec:methode-et-donnees}\n\nTexte.');
    const p = apply('Texte', planLabel('Texte', 5));
    expect(p).toEqual({ text: 'Texte\\label{nom}', selected: 'nom' });
    expect(slugLabel('')).toBe('sec:section');
  });

  it('lists the document labels once, in order', () => {
    expect(labelsIn('# A \\label{sec:a}\n$$x \\label{eq:1}$$\n\\label{sec:a}')).toEqual(['sec:a', 'eq:1']);
  });
});

describe('planDocMeta — title, author, date', () => {
  const d = { title: 'Titre du document', author: 'Prénom Nom', date: '25 septembre 2026' };

  it('creates the front-matter and selects the title', () => {
    const r = apply('Texte.', planDocMeta('Texte.', d));
    expect(r.text.startsWith('---\ntitle: Titre du document\nauthor: Prénom Nom\ndate: 25 septembre 2026\n---\n')).toBe(true);
    expect(r.text.endsWith('Texte.')).toBe(true);
    expect(r.selected).toBe('Titre du document');
  });

  it('keeps existing values, adds only what is missing', () => {
    const doc = '---\ntitle: Mon rapport\ndocument-style: rapport-a4\n---\n\nTexte.';
    const r = apply(doc, planDocMeta(doc, d));
    expect(r.text).toContain('title: Mon rapport');
    expect(r.text).toContain('document-style: rapport-a4');
    expect(r.text).toContain('author: Prénom Nom');
    expect(r.selected).toBe('Mon rapport');
  });
});

describe('tocFromHeadings', () => {
  it('builds the plan from the headings (not those in code), else the sample', () => {
    const doc = '# Intro \\label{sec:i}\n\n## Détail\n\n```\n# pas un titre\n```\n\n# Fin';
    expect(tocFromHeadings(doc, 'X')).toBe('::: toc+\n- **Intro**\n  - **Détail**\n- **Fin**\n:::');
    expect(tocFromHeadings('Rien.', 'X')).toBe('X');
  });
});
