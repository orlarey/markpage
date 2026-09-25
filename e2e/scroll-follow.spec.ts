import { expect, test, type Page } from './fixtures';

/**
 * Scroll-follow (main.ts): the pane you scroll drives the other. Scrolling the
 * preview, then moving to the editor and scrolling there (no click) must
 * scroll the editor — the follow animation must never hold a pane hostage —
 * and the last line of the source maps to the end of the rendered document.
 */

// Short blocks, then a long last paragraph: one source line per sentence.
const HEAD = Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\nTexte ${i}.\n`).join('\n');
const TAIL = Array.from(
  { length: 60 },
  (_, i) => `Phrase ${i} du dernier paragraphe, assez longue pour occuper la ligne.`
).join('\n');
const DOC = 'https://example.test/fin.md';

async function openSplit(page: Page, paginated: boolean): Promise<void> {
  // The fixtures default to pages; the continuous flow is the app's default.
  if (!paginated) {
    await page.addInitScript(() => localStorage.setItem('markpage:preview-paginated', '0'));
  }
  await page.route(DOC, (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `${HEAD}\n${TAIL}\nFIN-DU-DOCUMENT\n`,
    })
  );
  await page.goto(`/?src=${encodeURIComponent(DOC)}`);
  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  // Visible = revealed (a pagination in progress lays out in a hidden buffer).
  await expect(page.locator('#preview-pane').getByText('FIN-DU-DOCUMENT')).toBeVisible();
  await page.waitForTimeout(300);
}

for (const paginated of [false, true]) {
  const mode = paginated ? 'pages' : 'continuous';

  test(`${mode}: after scrolling the preview, the editor scrolls again without a click`, async ({
    page,
  }) => {
    await openSplit(page, paginated);
    const preview = page.locator('#preview-pane');
    const scroller = page.locator('.cm-scroller');
    const pBox = (await preview.boundingBox())!;
    const eBox = (await scroller.boundingBox())!;

    await page.mouse.move(pBox.x + pBox.width / 2, pBox.y + pBox.height / 2);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(500); // let the follow settle
    const editorTop = () => scroller.evaluate((el) => el.scrollTop);
    const before = await editorTop();
    expect(before).toBeGreaterThan(0); // the editor followed

    await page.mouse.move(eBox.x + eBox.width / 2, eBox.y + eBox.height / 2);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);
    expect(await editorTop()).toBeGreaterThan(before + 500);
  });

  test(`${mode}: clicking the last line of the editor shows the end of the document`, async ({
    page,
  }) => {
    await openSplit(page, paginated);
    const preview = page.locator('#preview-pane');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.waitForTimeout(400); // let the follow settle
    await page.locator('.cm-line', { hasText: 'FIN-DU-DOCUMENT' }).click();
    await page.waitForTimeout(600);

    // The end of the last paragraph is inside the preview's viewport.
    const visible = await preview.evaluate((el) => {
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const i = node.textContent?.indexOf('FIN-DU-DOCUMENT') ?? -1;
        if (i >= 0) {
          range.setStart(node, i);
          range.setEnd(node, i + 15);
          const r = range.getBoundingClientRect();
          const p = el.getBoundingClientRect();
          return r.top >= p.top && r.bottom <= p.bottom;
        }
      }
      return false;
    });
    expect(visible).toBe(true);
  });
}
