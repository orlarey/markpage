/********************************** insert.ts *********************************
 *
 * Purpose: What the Insérer menu puts in the document — a working template
 *   for every markpage construct, so nobody needs the help or the syntax — and
 *   where it lands.
 * How: A template marks the text to type over with ⟦…⟧: after insertion it is
 *   selected, so typing replaces it. With a selection, the selection fills
 *   that slot instead (it gets wrapped). Blocks never split a paragraph: they
 *   go after the caret's line, with the blank lines Markdown needs around
 *   them. The planners are pure (text + selection → edits), the view only
 *   applies them (applyPlan).
 *
 *******************************************************************************/

import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { setFrontmatterKeys } from './frontmatter-edit';

export interface Plan {
  changes: { from: number; to: number; insert: string }[];
  /** The resulting selection, in the NEW document. */
  selection: { anchor: number; head: number };
}

const OPEN = '⟦';
const CLOSE = '⟧';

/** Remove the ⟦…⟧ markers; where the slot lies (in the result), if any. */
function unmark(tpl: string, fill?: string): { text: string; slot?: [number, number] } {
  const a = tpl.indexOf(OPEN);
  const b = tpl.indexOf(CLOSE, a + 1);
  if (a < 0 || b < 0) return { text: tpl };
  const inner = fill ?? tpl.slice(a + 1, b);
  const rest = tpl.slice(b + 1).replaceAll(OPEN, '').replaceAll(CLOSE, '');
  return { text: tpl.slice(0, a) + inner + rest, slot: [a, a + inner.length] };
}

/** An inline template at the selection (the selection fills its slot). */
export function planInline(doc: string, from: number, to: number, tpl: string): Plan {
  const selected = doc.slice(from, to);
  const { text, slot } = unmark(tpl, selected !== '' ? selected : undefined);
  const s = slot ?? [text.length, text.length];
  return {
    changes: [{ from, to, insert: text }],
    selection: { anchor: from + s[0], head: from + s[1] },
  };
}

/**
 * A block template: replaces the selection (which fills its slot), or goes
 * after the caret's line — never splitting a paragraph — with a blank line
 * before and after it.
 */
export function planBlock(doc: string, from: number, to: number, tpl: string): Plan {
  const selected = doc.slice(from, to).replace(/\n+$/, '');
  if (from === to) {
    const lineStart = doc.lastIndexOf('\n', from - 1) + 1;
    const nl = doc.indexOf('\n', from);
    const lineEnd = nl < 0 ? doc.length : nl;
    if (doc.slice(lineStart, lineEnd).trim() !== '') from = to = lineEnd;
    else from = to = lineStart;
  }
  const { text, slot } = unmark(tpl, selected !== '' ? selected : undefined);
  const before = doc.slice(0, from);
  const after = doc.slice(to);
  const pre =
    before.trim() === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const post = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insert = pre + text + post;
  const s = slot ?? [text.length, text.length];
  return {
    changes: [{ from, to, insert }],
    selection: { anchor: from + pre.length + s[0], head: from + pre.length + s[1] },
  };
}

/** Where to add a definition at the end of the document (after a blank line). */
function endPrefix(doc: string): string {
  return doc === '' || doc.endsWith('\n\n') ? '' : doc.endsWith('\n') ? '\n' : '\n\n';
}

/**
 * A footnote (`[^n]`) or a citation (`[@refN]`): the call goes after the
 * selection, the definition at the end of the document, with its text
 * selected.
 */
export function planNote(
  doc: string,
  at: number,
  kind: 'footnote' | 'citation',
  placeholder: string,
): Plan {
  const used = new Set(
    [...doc.matchAll(kind === 'footnote' ? /\[\^([^\]]+)\]/g : /\[@([^\]]+)\]/g)].map((m) => m[1]),
  );
  let n = 1;
  const id = (k: number): string => (kind === 'footnote' ? String(k) : `ref${k}`);
  while (used.has(id(n))) n++;
  const call = kind === 'footnote' ? `[^${id(n)}]` : `[@${id(n)}]`;
  const def = `${endPrefix(doc)}${call}: `;
  // The definition's text in the new document: shifted by the call.
  const defStart = doc.length + call.length + def.length;
  return {
    changes: [
      { from: at, to: at, insert: call },
      { from: doc.length, to: doc.length, insert: `${def}${placeholder}\n` },
    ],
    selection: { anchor: defStart, head: defStart + placeholder.length },
  };
}

/** The `\label{…}` keys defined in the document, in order. */
export function labelsIn(doc: string): string[] {
  return [...new Set([...doc.matchAll(/\\label\{([^}]+)\}/g)].map((m) => m[1] ?? ''))].filter(
    (k) => k !== '',
  );
}

/** A label key from a heading's text: `## Méthode et données` → `sec:methode-et-donnees`. */
export function slugLabel(text: string, prefix = 'sec:'): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return prefix + (slug || 'section');
}

/**
 * A label: on a heading line, `\label{sec:<its title>}` at the end of the
 * heading (nothing to type); elsewhere a `\label{⟦nom⟧}` at the caret.
 */
export function planLabel(doc: string, at: number): Plan {
  const lineStart = doc.lastIndexOf('\n', at - 1) + 1;
  const nl = doc.indexOf('\n', at);
  const lineEnd = nl < 0 ? doc.length : nl;
  const line = doc.slice(lineStart, lineEnd);
  const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
  if (heading && !/\\label\{/.test(line)) {
    const insert = ` \\label{${slugLabel(heading[1] ?? '')}}`;
    const end = lineStart + line.replace(/\s+$/, '').length;
    return { changes: [{ from: end, to: end, insert }], selection: { anchor: end + insert.length, head: end + insert.length } };
  }
  return planInline(doc, at, at, '\\label{⟦nom⟧}');
}

/**
 * The document's title / author / date in its front-matter: adds the keys it
 * lacks (existing values stay) and selects the title's value.
 */
export function planDocMeta(
  doc: string,
  defaults: { title: string; author: string; date: string },
): Plan {
  const has = (k: string): boolean => new RegExp(`^${k}\\s*:`, 'm').test(frontmatterOf(doc));
  const upserts = new Map<string, string>();
  if (!has('title')) upserts.set('title', defaults.title);
  if (!has('author')) upserts.set('author', defaults.author);
  if (!has('date')) upserts.set('date', defaults.date);
  const next = upserts.size > 0 ? setFrontmatterKeys(doc, upserts) : doc;
  const m = /^title\s*:\s*(.*)$/m.exec(frontmatterOf(next));
  const fmStart = next.indexOf('---');
  let anchor = 0;
  let head = 0;
  if (m && fmStart >= 0) {
    const lineAt = next.indexOf(m[0], fmStart);
    anchor = lineAt + m[0].length - (m[1] ?? '').length;
    head = lineAt + m[0].length;
  }
  return { changes: [{ from: 0, to: doc.length, insert: next }], selection: { anchor, head } };
}

function frontmatterOf(doc: string): string {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(doc);
  return m ? (m[1] ?? '') : '';
}

/** A `::: toc+` built from the document's headings (levels 1–3), or a sample. */
export function tocFromHeadings(doc: string, sample: string): string {
  const lines: string[] = [];
  let inFence = false;
  for (const line of doc.split('\n')) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.*?)(?:\s*\\label\{[^}]*\})?\s*$/.exec(line);
    if (m) lines.push(`${'  '.repeat((m[1]?.length ?? 1) - 1)}- **${m[2]}**`);
  }
  if (lines.length === 0) return sample;
  // The entries' nesting must start at the top level.
  const minIndent = Math.min(...lines.map((l) => l.search(/\S/)));
  return `::: toc+\n${lines.map((l) => l.slice(minIndent)).join('\n')}\n:::`;
}

/** Apply a plan to the editor as one undoable step, and focus it. */
export function applyPlan(view: EditorView, plan: Plan): void {
  view.dispatch({
    changes: plan.changes,
    selection: EditorSelection.range(plan.selection.anchor, plan.selection.head),
    scrollIntoView: true,
  });
  view.focus();
}

// ---- the templates -----------------------------------------------------

/** A block's template, in the UI language (`fr`). ⟦…⟧ = the text to type. */
export type Template = (fr: boolean) => string;

const fence = (info: string, body: string): string => `\`\`\`${info}\n${body}\n\`\`\``;

export const BLOCKS = {
  table: (fr) =>
    fr
      ? '| ⟦Colonne 1⟧ | Colonne 2 | Colonne 3 |\n|---|---|---|\n| Texte | Texte | Texte |\n| Texte | Texte | Texte |'
      : '| ⟦Column 1⟧ | Column 2 | Column 3 |\n|---|---|---|\n| Text | Text | Text |\n| Text | Text | Text |',
  csv: (fr) =>
    fr
      ? fence('csv "⟦Titre du tableau⟧"', 'Nom, Valeur\nAlpha, 12\nBêta, 7')
      : fence('csv "⟦Table title⟧"', 'Name, Value\nAlpha, 12\nBeta, 7'),
  note: (fr) => `::: note\n⟦${fr ? 'Votre texte.' : 'Your text.'}⟧\n:::`,
  tip: (fr) => `::: tip\n⟦${fr ? 'Votre astuce.' : 'Your tip.'}⟧\n:::`,
  warning: (fr) => `::: warning\n⟦${fr ? 'Ce à quoi il faut faire attention.' : 'What to watch out for.'}⟧\n:::`,
  caution: (fr) => `::: caution\n⟦${fr ? 'Ce qu’il ne faut surtout pas faire.' : 'What must not be done.'}⟧\n:::`,
  important: (fr) => `::: important\n⟦${fr ? 'Ce qu’il faut retenir.' : 'What to remember.'}⟧\n:::`,
  theorem: (fr) =>
    fr ? '::: theorem [⟦Nom⟧]\nÉnoncé du théorème.\n:::' : '::: theorem [⟦Name⟧]\nStatement of the theorem.\n:::',
  definition: (fr) =>
    fr ? '::: definition [⟦Terme⟧]\nCe que le terme désigne.\n:::' : '::: definition [⟦Term⟧]\nWhat the term means.\n:::',
  proof: (fr) => `::: proof\n⟦${fr ? 'La démonstration.' : 'The proof.'}⟧\n:::`,
  example: (fr) => `::: example\n⟦${fr ? 'Un exemple.' : 'An example.'}⟧\n:::`,
  remark: (fr) => `::: remark\n⟦${fr ? 'Une remarque.' : 'A remark.'}⟧\n:::`,
  displayMath: () => fence('math', '⟦E = mc^2⟧'),
  inference: () => fence('inference', '⟦A⟧\nA \\to B\n---\nB'),
  flowchart: (fr) =>
    fence(
      'mermaid',
      fr
        ? 'graph LR\n  A[⟦Idée⟧] --> B[Brouillon]\n  B --> C[Document final]'
        : 'graph LR\n  A[⟦Idea⟧] --> B[Draft]\n  B --> C[Final document]',
    ),
  chartLine: (fr) =>
    fence(`chart line "⟦${fr ? 'Titre du graphique' : 'Chart title'}⟧"`, 'x, y\n0, 0\n1, 1\n2, 4\n3, 9\n4, 16'),
  chartBar: (fr) =>
    fr
      ? fence('chart bar "⟦Titre du graphique⟧"', 'Mois, Ventes\nJanvier, 12\nFévrier, 18\nMars, 9')
      : fence('chart bar "⟦Chart title⟧"', 'Month, Sales\nJanuary, 12\nFebruary, 18\nMarch, 9'),
  tree: (fr) => fence('tree', fr ? '⟦projet/⟧\n  docs/\n  src/\n    main.ts' : '⟦project/⟧\n  docs/\n  src/\n    main.ts'),
  treeSvg: (fr) => fence('tree svg', fr ? '⟦Racine⟧\n  Branche A\n    Feuille\n  Branche B' : '⟦Root⟧\n  Branch A\n    Leaf\n  Branch B'),
  category: () => fence('category', '⟦f : A -> B⟧\ng : B -> C\nh : A -> C\n\nh = g . f'),
  bda: () => fence('bda', '⟦1 : +~_⟧'),
  ebnf: (fr) =>
    fence(
      'ebnf',
      fr
        ? '⟦nombre⟧ = chiffre, { chiffre };\nchiffre = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";'
        : '⟦number⟧ = digit, { digit };\ndigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";',
    ),
  adt: () => fence('adt', '⟦Expr ::= Num(value) | Add(left, right) | Mul(left, right)⟧'),
  code: (fr) => fence('', `⟦${fr ? 'votre code' : 'your code'}⟧`),
  algorithm: (fr) =>
    fr
      ? fence('algorithm "⟦Recherche du maximum⟧"', 'm ← A[1]\nfor i = 2 to n do\n  if A[i] > m then\n    m ← A[i]\nreturn m')
      : fence('algorithm "⟦Find the maximum⟧"', 'm ← A[1]\nfor i = 2 to n do\n  if A[i] > m then\n    m ← A[i]\nreturn m'),
  diff: (fr) =>
    fence(
      'diff',
      fr
        ? '@@ ⟦exemple⟧ @@\n Une ligne inchangée\n-Une ligne supprimée\n+Une ligne ajoutée'
        : '@@ ⟦example⟧ @@\n An unchanged line\n-A removed line\n+An added line',
    ),
  demo: (fr) => fence('demo', fr ? '⟦**Gras**, *italique* et `code`.⟧' : '⟦**Bold**, *italic* and `code`.⟧'),
  toc: (fr) =>
    fr
      ? '::: toc+\n- **⟦Introduction⟧**\n- **Conclusion**\n:::'
      : '::: toc+\n- **⟦Introduction⟧**\n- **Conclusion**\n:::',
  columns: (fr) =>
    fr
      ? '::: columns\n⟦Première colonne.⟧\n\n---\n\nDeuxième colonne.\n:::'
      : '::: columns\n⟦First column.⟧\n\n---\n\nSecond column.\n:::',
  hr: () => '---',
  deflist: (fr) =>
    fr ? '⟦Terme⟧\n:   Définition du terme.' : '⟦Term⟧\n:   Definition of the term.',
  localStyle: (fr) =>
    `::: style color=#0b3d91 size=16pt align=center\n⟦${fr ? 'Texte mis en valeur' : 'Highlighted text'}⟧\n:::`,
  background: () => '::: background fill=⟦#f4f1ea⟧ first\n:::',
  header: () => fence('header', '⟦{title}⟧ |  | {page}'),
  footer: () => fence('footer', '{date} |  | ⟦{page} / {pages}⟧'),
  sender: (fr) =>
    fence('sender', fr ? '**⟦Prénom Nom⟧**\n12 rue de la Paix\n75002 Paris' : '**⟦First Last⟧**\n12 Main Street\nSpringfield'),
  recipient: (fr) =>
    fence('recipient', fr ? '⟦Destinataire⟧\nSociété\n8 boulevard Voltaire\n75011 Paris' : '⟦Recipient⟧\nCompany\n8 Oak Avenue\nSpringfield'),
  signature: (fr) => fence('signature', fr ? '**⟦Prénom Nom⟧**\n*Fonction*' : '**⟦First Last⟧**\n*Title*'),
} satisfies Record<string, Template>;

export type BlockId = keyof typeof BLOCKS;

export const INLINE = {
  inlineMath: () => '$⟦x^2⟧$',
} satisfies Record<string, () => string>;
