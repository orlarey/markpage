/******************************* conservation.mjs ******************************
 *
 * The conservation check shared by `markpage check` and the e2e suite
 * (e2e/conservation.ts re-exports it): plain JavaScript, so the CLI runs it
 * without a TypeScript step.
 *
 *******************************************************************************/

/**
 * Purpose: The conservation contract of a paginated render — everything the
 *   document says is on the pages exactly once. Pagination may move text; it
 *   must never drop it, duplicate it or add to it. Checked three ways:
 *   1. Text: the word sequence of the pages equals the continuous view's
 *      (same build, no pagination), both ways.
 *   2. Blocks: Vivliostyle tags every element with its source offset
 *      (`data-adapt-eloff`); the fragments of one block must not repeat text.
 *      This is what catches a heading laid twice (once stale at a page foot).
 *   3. Geometry: no text painted a whole line or more outside its page's text
 *      area (it would collide with the footer, or be clipped in print); less
 *      than a line is reported as a warning.
 * How: Legitimate differences are removed STRUCTURALLY, never by text pattern:
 *   the continuous sheet's running band, the TOC (its page numbers), heading
 *   numbers (paginated only), the repeated <thead> of a table continued on a
 *   later page, and the notes, whose position legitimately differs (foot of
 *   page vs end of document) — they are compared as a multiset instead.
 */

/**
 * @typedef {object} ConservationReport
 * @property {number} pages
 * @property {string[]} lost       words of the continuous view missing from the pages
 * @property {string[]} added      words on the pages absent from the continuous view
 * @property {string[]} notes      notes whose text differs between the two views
 * @property {string[]} math       formulas whose count differs
 * @property {string[]} duplicated blocks whose fragments repeat text
 * @property {string[]} overflow   text a whole line or more outside the text area
 * @property {string[]} nearOverflow text half a line to a line outside it (warning)
 */

// Generated content is excluded on both sides: the continuous view's innerText
// never includes CSS-generated text, and Vivliostyle materialises it as real
// elements tagged data-adapt-pseudo (EBNF "=", the footnote call and marker).
// The continuous view's own call numbers (.footnote-ref) and back-links go with
// them: numbering is checked by unit tests (markpage-render.test.ts).
// Formulas are excluded from the text too — MathJax's accessible text differs
// between the two views — and COUNTED instead: each must appear once.
const EXCLUDED =
  '.mp-sheet-running, nav.toc-plus, .heading-num, .mp-repeated-thead, [data-adapt-pseudo], .footnote-ref, .footnote-back, .math-inline, .math-block';
const MATH = '.math-inline, .math-block';
const NOTES = '.footnotes, .sidenote, .endnotes';
/** One element per note: a list item of the end section, or a floated note. */
const NOTE_ITEMS = '.footnotes li, .endnotes li, .sidenote';

/** Tokens of a text: runs of letters and digits, and single punctuation
 *  marks — so a space added or dropped next to a mark ("moyenne[1]" vs
 *  "moyenne [1]") is not a difference, while every word and mark still is.
 *  Soft hyphens go (page-boundary cuts are resolved in conservation()). */
export function words(text) {
  return (
    text
      .replace(/\u00ad/g, '')
      .match(/[\p{L}\p{N}\p{M}]+|[^\s\p{L}\p{N}\p{M}]/gu) ?? []
  );
}

/** First differences between two word sequences, each with a little context. */
export function sequenceDiff(a, b, max = 5) {
  const lost = [];
  const added = [];
  let i = 0;
  let j = 0;
  const ctx = (s, k) => s.slice(Math.max(0, k - 4), k + 6).join(' ');
  while ((i < a.length || j < b.length) && lost.length + added.length < max) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    // Resynchronise: the smallest skip (di on one side, dj on the other, a
    // substitution when both) after which 3 words align again.
    let found = false;
    for (let sum = 1; sum < 300 && !found; sum += 1) {
      for (let di = 0; di <= sum && !found; di += 1) {
        const dj = sum - di;
        if (a.slice(i + di, i + di + 3).join(' ') !== b.slice(j + dj, j + dj + 3).join(' ')) continue;
        if (di) lost.push(`${a.slice(i, i + di).join(' ')}  ⟨${ctx(a, i)}⟩`);
        if (dj) added.push(`${b.slice(j, j + dj).join(' ')}  ⟨${ctx(b, j)}⟩`);
        i += di;
        j += dj;
        found = true;
      }
    }
    if (!found) {
      lost.push(`… ⟨${ctx(a, i)}⟩`);
      added.push(`… ⟨${ctx(b, j)}⟩`);
      break;
    }
  }
  return { lost, added };
}

/** Text of the continuous view, without its running band, TOC and notes. */
/** @param {import('playwright-core').Page} page */
export async function continuousText(page) {
  return page.evaluate(
    ([excluded, notes, items, mathSel]) => {
      const sheet = document.querySelector('#preview-pane .mp-continuous-sheet');
      if (!sheet) throw new Error('no continuous sheet');
      const hide = document.createElement('style');
      hide.textContent = `${excluded} { display: none !important; }`;
      document.head.appendChild(hide);
      const noteTexts = [...sheet.querySelectorAll(items)]
        .filter((n) => n.getClientRects().length > 0) // rendered only: one mode hides the other
        .map((n) => n.innerText.replace(/\s+/g, ' ').trim());
      const st = document.createElement('style');
      st.textContent = `${notes} { display: none !important; }`;
      document.head.appendChild(st);
      const text = sheet.innerText;
      st.remove();
      hide.remove();
      const math = [...sheet.querySelectorAll(mathSel)].filter((m) => !m.parentElement?.closest(mathSel)).length;
      return { text, notes: noteTexts, math };
    },
    [EXCLUDED, NOTES, NOTE_ITEMS, MATH],
  );
}

/** The paginated render's text, blocks and geometry. */
/** @param {import('playwright-core').Page} page */
export async function paginatedFacts(page) {
  return page.evaluate(
    ([excluded, notes, items, mathSel]) => {
      const pages = [...document.querySelectorAll('.pagedjs_page')];
      const area = (pg) => pg.querySelector('.pagedjs_page_content') ?? pg;
      // A table continued on a later page repeats its <thead>: keep the first.
      const seen = new Set();
      for (const pg of pages) {
        for (const t of pg.querySelectorAll('table')) {
          const k = t.getAttribute('data-adapt-eloff');
          if (k && seen.has(k)) t.querySelectorAll('thead').forEach((h) => h.classList.add('mp-repeated-thead'));
          if (k) seen.add(k);
        }
      }
      const hide = document.createElement('style');
      hide.textContent = `${excluded} { display: none !important; }`;
      document.head.appendChild(hide);
      const noteTexts = pages.flatMap((pg) =>
        [...area(pg).querySelectorAll(items)]
          .filter((n) => n.getClientRects().length > 0)
          .map((n) => n.innerText.replace(/\s+/g, ' ').trim()),
      );
      const st = document.createElement('style');
      st.textContent = `${notes} { display: none !important; }`;
      document.head.appendChild(st);
      const text = pages.map((pg) => area(pg).innerText).join('\n\u2063\n');

      const LEAF = 'p, h1, h2, h3, h4, h5, h6, li, td, th, dt, dd, pre, figcaption, .admonition-title';
      const groups = new Map();
      pages.forEach((pg, i) => {
        for (const el of area(pg).querySelectorAll(LEAF)) {
          const k = el.getAttribute('data-adapt-eloff');
          if (!k || el.closest(`${excluded}, ${notes}`)) continue;
          const list = groups.get(k) ?? [];
          list.push({ page: i + 1, text: el.innerText.replace(/\s+/g, ' ').trim() });
          groups.set(k, list);
        }
      });
      const duplicated = [];
      for (const frags of groups.values()) {
        for (let a = 0; a < frags.length; a += 1) {
          for (let b = a + 1; b < frags.length; b += 1) {
            const x = frags[a].text;
            const y = frags[b].text;
            if (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))) {
              duplicated.push(`pages ${frags[a].page} et ${frags[b].page} : ${x.slice(0, 60)}`);
            }
          }
        }
      }

      const overflow = [];
      const nearOverflow = [];
      pages.forEach((pg, i) => {
        const a = area(pg);
        const r = a.getBoundingClientRect();
        const fontSize = parseFloat(getComputedStyle(a).fontSize) || 13;
        const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent?.trim() || n.parentElement?.closest(`${excluded}, ${notes}`)) continue;
          // A dedicated page for an oversized atomic object borrows the
          // margins by design (atomic-fit.ts).
          if (n.parentElement?.closest('.mp-atomic-page')) continue;
          const lineHeight = parseFloat(getComputedStyle(n.parentElement).lineHeight) || fontSize * 1.25;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const b of range.getClientRects()) {
            const by = Math.max(b.bottom - r.bottom, r.top - b.top);
            if (b.height > 0 && by >= fontSize / 2) {
              const line = `page ${i + 1}, ${Math.round(by)} px : ${n.textContent.trim().slice(0, 40)}`;
              (by >= lineHeight ? overflow : nearOverflow).push(line);
              break;
            }
          }
        }
      });
      st.remove();
      hide.remove();
      // Formulas are atomic (never fragmented): count the page copies, one per
      // source formula — a formula on two pages would be a duplicate.
      const math = pages.reduce(
        (n, pg) => n + [...area(pg).querySelectorAll(mathSel)].filter((m) => !m.parentElement?.closest(mathSel)).length,
        0,
      );
      // Pages are joined with a mark so a word cut across a page boundary can
      // be told apart from one cut at a real hyphen (see conservation()).
      return { pages: pages.length, text, notes: noteTexts, math, duplicated, overflow, nearOverflow };
    },
    [EXCLUDED, NOTES, NOTE_ITEMS, MATH],
  );
}

/** Compare the two views of one document. */
/** @returns {ConservationReport} */
export function conservation(cont, pag) {
  // A word cut by a page break: "lis-" | "seurs" (hyphen added by the break)
  // or "-ffast-" | "math" (a real hyphen the break fell on). The continuous
  // view, which has no page break, says which one it is.
  const flat = cont.text.replace(/\s+/g, ' ');
  const pagText = pag.text.replace(
    /([\p{L}\p{N}]+)[-‐]\s*\n\u2063\n\s*([\p{L}\p{N}]+)/gu,
    (_m, x, y) => (flat.includes(`${x}-${y}`) ? `${x}-${y}` : `${x}${y}`),
  ).replace(/\n\u2063\n/g, '\n');
  const { lost, added } = sequenceDiff(words(cont.text), words(pagText));
  const norm = (s) => words(s).join(' ');
  const a = [...cont.notes].map(norm).sort();
  const b = [...pag.notes].map(norm).sort();
  const notes = a.join('\n') === b.join('\n') ? [] : [`continu: ${a.length} notes, pages: ${b.length} notes`];
  const math = cont.math === pag.math ? [] : [`continu: ${cont.math} formules, pages: ${pag.math}`];
  return {
    pages: pag.pages,
    lost,
    added,
    notes,
    math,
    duplicated: pag.duplicated,
    overflow: pag.overflow,
    nearOverflow: pag.nearOverflow,
  };
}
