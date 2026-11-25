import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './fixtures';
import { conservation, continuousText, paginatedFacts } from './conservation';

/**
 * Purpose: Pagination must move text, never lose, duplicate or add any. Each
 *   document is rendered twice — continuous (no pagination) and paginated —
 *   and the two are compared (see conservation.ts): word sequence both ways,
 *   no source block laid twice, no text outside the text area.
 *
 *   Besides the reference documents, a generated stress document puts every
 *   kind of block at every height of a page: headings followed by short
 *   paragraphs, short and long callouts, prose and numeric tables, lists,
 *   formulas — shifted by a filler of varying length, so each boundary falls
 *   somewhere else in each variant. This is how the duplicated heading
 *   (laid at a page foot AND at the top of the next page) was found.
 */

async function render(page: Page, markdown: string, paginated: boolean): Promise<void> {
  await page.addInitScript(
    ([t, p]) => {
      localStorage.setItem('markpage:doc', t);
      localStorage.setItem('markpage:preview-visible', '1');
      localStorage.setItem('markpage:preview-paginated', p);
    },
    [markdown, paginated ? '1' : '0'] as const,
  );
  await page.goto('/');
  if (paginated) {
    await page.locator('.pagedjs_page').first().waitFor({ state: 'attached', timeout: 120_000 });
    let n = -1;
    for (let i = 0; i < 60; i += 1) {
      await page.waitForTimeout(1500);
      const m = await page.locator('.pagedjs_page').count();
      if (m === n) break;
      n = m;
    }
    await page.waitForTimeout(1000);
  } else {
    await page.locator('#preview-pane .mp-continuous-sheet').waitFor({ timeout: 90_000 });
    let prev = -1;
    for (let i = 0; i < 30; i += 1) {
      await page.waitForTimeout(1000);
      const n = await page.evaluate(() => document.querySelector('#preview-pane')?.textContent?.length ?? 0);
      if (n === prev) break;
      prev = n;
    }
  }
}

/** Deterministic pseudo-random words (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEXICON = (
  'signal circuit lisseur commande bloc cône retard frontière valeur boucle ' +
  'échantillon sortie entrée régime figé constant limite point fixe calcul'
).split(' ');

/** The stress document, shifted by `shift` filler lines. */
function stressDocument(shift: number, style = ''): string {
  const r = rng(17);
  const said = (n: number) => {
    const w = Array.from({ length: n }, () => LEXICON[Math.floor(r() * LEXICON.length)]!);
    return `${w.join(' ')}.`.replace(/^./, (c) => c.toUpperCase());
  };
  const out = ['---', 'title: Essai de conservation', 'language: fr'];
  if (style) out.push(`document-style: ${style}`);
  out.push('---', '');
  if (shift > 0) out.push(`Décalage ${'mot '.repeat(14 * shift).trim()}.`, '');
  for (let k = 0; k < 14; k += 1) {
    out.push(`# Partie ${k + 1}`, '', said(20 + Math.floor(r() * 60)), '');
    out.push(`## Section ${k + 1}.1`, '', said(30 + Math.floor(r() * 40)), '');
    switch (k % 5) {
      case 0:
        out.push(`::: definition [Notion ${k}]`, said(40), '', '$$y(t+1) = y(t) \\implies \\forall t\' \\geq t,\\ y(t\') = y(t)$$', ':::', '');
        break;
      case 1:
        out.push('```tsv', 'programme\tnœuds\tdans le cône\tremarque');
        for (let i = 0; i < 6; i += 1) out.push(`p${k}_${i}\t${100 + i * 37}\t${i * 11} (${i * 7} %)\t${said(8)}`);
        out.push('```', '');
        break;
      case 2:
        out.push('::: note', ...Array.from({ length: 6 }, () => `${said(70)}\n`), ':::', '');
        break;
      case 3:
        out.push(...Array.from({ length: 5 }, (_, i) => `${i + 1}. ${said(25)}`), '');
        break;
      default:
        out.push(`### Sous-section ${k + 1}.1.1`, '', `::: theorem [Résultat ${k}]`, said(35), ':::', '', '::: proof', said(60), '', said(50), ':::', '');
    }
    out.push(said(40 + Math.floor(r() * 80)), '');
  }
  return out.join('\n');
}

const REFERENCE = ['SHOWCASE.md', 'markpage-slides.md', 'LETTER.md'];
const SHIFTS = [0, 3, 7, 11, 16, 22];

const cases: { name: string; markdown: () => string }[] = [
  ...REFERENCE.map((f) => ({ name: f, markdown: () => readFileSync(join(process.cwd(), f), 'utf8') })),
  ...SHIFTS.map((s) => ({ name: `stress, shift ${s}`, markdown: () => stressDocument(s) })),
  ...SHIFTS.slice(0, 3).map((s) => ({
    name: `stress, article-a4, shift ${s}`,
    markdown: () => stressDocument(s, 'article-a4'),
  })),
];

// A local corpus, for campaigns outside CI: MP_CORPUS=/path/to/dir runs every
// .md file in it through the same check.
const corpus = process.env.MP_CORPUS;
if (corpus) {
  cases.length = 0;
  for (const f of readdirSync(corpus).filter((n) => n.endsWith('.md')).sort()) {
    cases.push({ name: `corpus ${f}`, markdown: () => readFileSync(join(corpus, f), 'utf8') });
  }
}

// Chrome measures glyphs differently at a device pixel ratio of 1 and on a
// HiDPI screen, and the page breaks move (LE-REGIME-FIGE: 23 pages at 1, 25 at
// 2): every case runs at both.
const SCALES = [1, 2];

for (const c of cases) for (const scale of SCALES) {
  test(`conservation: ${c.name} @${scale}x`, async ({ browser }) => {
    test.setTimeout(240_000);
    const markdown = c.markdown();
    const ctx1 = await browser.newContext({ locale: 'fr-FR', deviceScaleFactor: scale });
    const p1 = await ctx1.newPage();
    await render(p1, markdown, false);
    const cont = await continuousText(p1);
    await ctx1.close();

    const ctx2 = await browser.newContext({ locale: 'fr-FR', deviceScaleFactor: scale });
    const p2 = await ctx2.newPage();
    await render(p2, markdown, true);
    const pag = await paginatedFacts(p2);
    await ctx2.close();

    const report = conservation(cont, pag);
    expect(report.pages, 'no page').toBeGreaterThan(0);
    // One assertion on the whole report, so a failure shows every finding.
    const { pages: _pages, nearOverflow, ...findings } = report;
    for (const w of nearOverflow) test.info().annotations.push({ type: 'warning', description: `hors zone : ${w}` });
    expect(findings, 'pagination lost, added or duplicated text').toEqual({
      lost: [],
      added: [],
      notes: [],
      math: [],
      sparse: [],
      duplicated: [],
      overflow: [],
    });
  });
}
