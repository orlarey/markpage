/******************************** insert-menu.ts ******************************
 *
 * Purpose: The `Insérer ▾` menu — every element markpage can add to a
 *   document, by category, each as a working template (insert.ts). Nobody
 *   needs the help or the Markdown syntax to add a callout, a formula, a
 *   diagram or a footnote.
 * How: Menu data (menu.ts) built on each open, so what depends on the
 *   document (the labels a cross-reference can point to, the table of
 *   contents) is current.
 *
 *******************************************************************************/

import type { EditorView } from '@codemirror/view';
import { getLanguage } from '../i18n/locale';
import { t, type StringKey } from '../i18n/strings';
import { pickAndInsertImage, pickAndInsertMosaic } from '../image';
import { insertLink } from '../editor-commands';
import {
  BLOCKS,
  INLINE,
  applyPlan,
  labelsIn,
  planBlock,
  planDocMeta,
  planInline,
  planLabel,
  planNote,
  tocFromHeadings,
  type BlockId,
} from '../insert';
import { keyHint, openMenu, SEP, type MenuEntry } from './menu';

const MENU_ID = 'insert-menu';

/** The Insérer menu's entries for `view`. */
export function insertMenuEntries(view: EditorView): MenuEntry[] {
  const fr = getLanguage() === 'fr';
  const doc = (): string => view.state.doc.toString();
  const sel = (): { from: number; to: number; head: number } => view.state.selection.main;

  const block = (label: StringKey, id: BlockId): MenuEntry => ({
    label: t(label),
    action: () => {
      const { from, to } = sel();
      applyPlan(view, planBlock(doc(), from, to, BLOCKS[id](fr)));
    },
  });
  const group = (label: StringKey, items: MenuEntry[]): MenuEntry => ({
    kind: 'submenu',
    label: t(label),
    items,
  });

  const today = new Date().toLocaleDateString(fr ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const labels = labelsIn(doc());
  const refs: MenuEntry[] =
    labels.length > 0
      ? labels.map((key) => ({
          label: key,
          action: () => {
            const { from, to } = sel();
            applyPlan(view, planInline(doc(), from, to, `\\ref{${key}}`));
          },
        }))
      : [{ label: t('insert.ref-none'), disabled: true, action: () => {} }];

  return [
    {
      label: t('insert.doc-meta'),
      action: () =>
        applyPlan(
          view,
          planDocMeta(doc(), {
            title: t('insert.ph.title'),
            author: t('insert.ph.author'),
            date: today,
          }),
        ),
    },
    SEP,
    { label: t('insert.image'), hint: keyHint('Mod-Alt-i'), action: () => pickAndInsertImage(view) },
    { label: t('insert.mosaic'), action: () => pickAndInsertMosaic(view) },
    { label: t('insert.link'), hint: keyHint('Mod-k'), action: () => insertLink(view) },
    group('insert.group.table', [block('insert.table', 'table'), block('insert.csv', 'csv')]),
    SEP,
    group('insert.group.callout', [
      block('insert.note', 'note'),
      block('insert.tip', 'tip'),
      block('insert.warning', 'warning'),
      block('insert.caution', 'caution'),
      block('insert.important', 'important'),
      { kind: 'heading', label: t('insert.academic') },
      block('insert.theorem', 'theorem'),
      block('insert.definition', 'definition'),
      block('insert.proof', 'proof'),
      block('insert.example', 'example'),
      block('insert.remark', 'remark'),
    ]),
    group('insert.group.math', [
      {
        label: t('insert.inline-math'),
        action: () => {
          const { from, to } = sel();
          applyPlan(view, planInline(doc(), from, to, INLINE.inlineMath()));
        },
      },
      block('insert.display-math', 'displayMath'),
      block('insert.inference', 'inference'),
    ]),
    group('insert.group.diagram', [
      block('insert.flowchart', 'flowchart'),
      block('insert.chart-line', 'chartLine'),
      block('insert.chart-bar', 'chartBar'),
      block('insert.tree', 'tree'),
      block('insert.tree-svg', 'treeSvg'),
      SEP,
      block('insert.category', 'category'),
      block('insert.bda', 'bda'),
      block('insert.ebnf', 'ebnf'),
      block('insert.adt', 'adt'),
    ]),
    group('insert.group.code', [
      block('insert.code', 'code'),
      block('insert.algorithm', 'algorithm'),
      block('insert.diff', 'diff'),
      block('insert.demo', 'demo'),
    ]),
    SEP,
    group('insert.group.refs', [
      {
        label: t('insert.footnote'),
        action: () => applyPlan(view, planNote(doc(), sel().to, 'footnote', t('insert.ph.footnote'))),
      },
      {
        label: t('insert.citation'),
        action: () => applyPlan(view, planNote(doc(), sel().to, 'citation', t('insert.ph.citation'))),
      },
      SEP,
      { label: t('insert.label'), action: () => applyPlan(view, planLabel(doc(), sel().head)) },
      { kind: 'submenu', label: t('insert.ref'), items: refs },
    ]),
    group('insert.group.layout', [
      {
        label: t('insert.toc'),
        action: () => {
          const { from, to } = sel();
          applyPlan(view, planBlock(doc(), from, to, tocFromHeadings(doc(), BLOCKS.toc(fr))));
        },
      },
      block('insert.columns', 'columns'),
      block('insert.hr', 'hr'),
      block('insert.deflist', 'deflist'),
      SEP,
      block('insert.local-style', 'localStyle'),
      block('insert.background', 'background'),
      block('insert.header', 'header'),
      block('insert.footer', 'footer'),
    ]),
    group('insert.group.letter', [
      block('insert.sender', 'sender'),
      block('insert.recipient', 'recipient'),
      {
        // "Paris, le 25 septembre 2026", on the right — a letter's date.
        label: t('insert.place-date'),
        action: () => {
          const { from, to } = sel();
          const line = fr ? `⟦Paris⟧, le ${today}` : `⟦City⟧, ${today}`;
          applyPlan(view, planBlock(doc(), from, to, `::: style align=right
${line}
:::`));
        },
      },
      block('insert.signature', 'signature'),
    ]),
  ];
}

/** Open the Insérer menu under its toolbar trigger (or at a point). */
export function openInsertMenu(view: EditorView, at: HTMLElement | { x: number; y: number }): void {
  openMenu(MENU_ID, at, insertMenuEntries(view));
}
