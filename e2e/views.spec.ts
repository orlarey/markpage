import { expect, test, type Page } from './fixtures';

/**
 * The three views (Écrire / Côte à côte / Lire) and Pages: Lire shows the
 * preview alone, every switch keeps the place, a tap in Lire only reads, and
 * a phone opens a document to read it.
 */

const DOC = 'https://example.test/vues.md';
const BODY = Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\nTexte ${i}.\n`).join('\n');

async function open(page: Page, paginated = false): Promise<void> {
  await page.addInitScript((p) => localStorage.setItem('markpage:preview-paginated', p ? '1' : '0'), paginated);
  await page.route(DOC, (r) => r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, body: BODY }));
  await page.goto(`/?src=${encodeURIComponent(DOC)}`);
  // Attached, not visible: in Lire the editor is hidden.
  await page.locator('.cm-content').waitFor({ state: 'attached' });
}

const view = (page: Page, name: 'Écrire' | 'Côte à côte' | 'Lire') =>
  page.getByRole('button', { name, exact: true });

/** The paragraph text one third down the preview. */
const readingText = (page: Page) =>
  page.evaluate(() => {
    const pane = document.querySelector('#preview-pane')!.getBoundingClientRect();
    const y = pane.top + pane.height / 3;
    const p = [...document.querySelectorAll('#preview-pane p')].find((e) => e.getBoundingClientRect().bottom >= y);
    return (p?.textContent ?? '').trim();
  });
/** Whether `text` is on screen in the given pane. */
const shows = (page: Page, sel: string, text: string) =>
  page.evaluate(
    ([s, t]) => {
      const pane = document.querySelector(s)!.getBoundingClientRect();
      return [...document.querySelectorAll(`${s} p, ${s} .cm-line`)].some((e) => {
        const r = e.getBoundingClientRect();
        return (e.textContent ?? '').trim() === t && r.top >= pane.top && r.bottom <= pane.bottom;
      });
    },
    [sel, text] as const,
  );

test('Lire shows the preview alone and keeps the place, there and back', async ({ page }) => {
  await open(page);
  // Caret mid-document, then Lire.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.locator('.cm-line', { hasText: 'Texte 58.' }).click();
  await view(page, 'Lire').click();
  await expect(page.locator('#editor-pane')).toBeHidden();
  await expect(page.locator('#preview-pane .mp-continuous-sheet')).toBeVisible();
  await page.waitForTimeout(600);
  expect(await shows(page, '#preview-pane', 'Texte 58.')).toBe(true);
  expect(await view(page, 'Lire').getAttribute('aria-pressed')).toBe('true');

  // Read further down, then back to Écrire: the editor shows what was read.
  await page.locator('#preview-pane').evaluate((el) => {
    el.scrollTop = el.scrollHeight * 0.3;
  });
  await page.waitForTimeout(400);
  const read = await readingText(page);
  await view(page, 'Écrire').click();
  await expect(page.locator('#preview-pane')).toBeHidden();
  await page.waitForTimeout(400);
  expect(await shows(page, '#editor-pane', read)).toBe(true);
});

test('in Lire, Pages keeps the passage being read, and a tap only reads', async ({ page }) => {
  await open(page);
  await view(page, 'Lire').click();
  await expect(page.locator('#preview-pane .mp-continuous-sheet')).toBeVisible();
  await page.locator('#preview-pane').evaluate((el) => {
    el.scrollTop = el.scrollHeight * 0.5;
  });
  await page.waitForTimeout(400);
  const read = await readingText(page);
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await expect(page.locator('#preview-pane .pagedjs_page').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.mp-pagination-progress')).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(await shows(page, '#preview-pane', read)).toBe(true);
  // A tap on the text: still reading.
  await page.locator('#preview-pane p', { hasText: read }).first().click();
  await page.waitForTimeout(300);
  await expect(page.locator('#editor-pane')).toBeHidden();
});

test('a phone opens the document to read, with no side-by-side view', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'fr-FR',
    baseURL: 'http://localhost:5173',
  });
  const page = await ctx.newPage();
  await open(page);
  await expect(page.locator('#preview-pane .mp-continuous-sheet')).toBeVisible();
  await expect(page.locator('#editor-pane')).toBeHidden();
  await expect(view(page, 'Côte à côte')).toBeHidden();
  await view(page, 'Écrire').click();
  await expect(page.locator('#editor-pane')).toBeVisible();
  await expect(page.locator('#preview-pane')).toBeHidden();
  await ctx.close();
});

test('a wide screen remembers the chosen view', async ({ page }) => {
  await open(page);
  await view(page, 'Lire').click();
  await expect(page.locator('#editor-pane')).toBeHidden();
  await page.reload();
  await expect(page.locator('#preview-pane .mp-continuous-sheet')).toBeVisible();
  await expect(page.locator('#editor-pane')).toBeHidden();
});
