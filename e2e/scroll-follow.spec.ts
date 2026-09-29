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
  await page.getByRole('button', { name: 'Côte à côte' }).first().click();
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

test('switching Pages on and off keeps the editor where it is, and the preview follows it', async ({
  page,
}) => {
  await openSplit(page, false);
  const scroller = page.locator('.cm-scroller');
  // Take the editor to the middle of the document (a line far from the top).
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.waitForTimeout(400);
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  await page.waitForTimeout(600); // the follow settles
  const editorTop = () => scroller.evaluate((el) => el.scrollTop);
  const before = await editorTop();
  expect(before).toBeGreaterThan(1000);
  // The source line at the editor's reference height, and whether the preview shows it.
  const refLine = () =>
    page.evaluate(() => {
      const s = document.querySelector('.cm-scroller')!.getBoundingClientRect();
      const y = s.top + s.height / 3;
      // The first non-blank line at or below the reference height.
      const line = [...document.querySelectorAll('.cm-line')].find((l) => {
        const r = l.getBoundingClientRect();
        return r.bottom >= y && (l.textContent ?? '').trim() !== '';
      });
      return line?.textContent ?? '';
    });
  const previewShows = (text: string) =>
    page.evaluate((t) => {
      const pane = document.querySelector('#preview-pane')!.getBoundingClientRect();
      const range = document.createRange();
      const walker = document.createTreeWalker(document.querySelector('#preview-pane')!, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const i = n.textContent?.indexOf(t) ?? -1;
        if (i >= 0) {
          range.setStart(n, i);
          range.setEnd(n, i + t.length);
          const r = range.getBoundingClientRect();
          if (r.height > 0) return r.top >= pane.top && r.bottom <= pane.bottom;
        }
      }
      return false;
    }, text);
  const line = (await refLine()).trim();
  expect(line).not.toBe('');

  // Pages on (paginated render), then off (back to the continuous sheet).
  for (const [btn, shown] of [
    ['Pages', '.pagedjs_page'],
    ['Continu', '.mp-continuous-sheet'],
  ] as const) {
    await page.getByRole('button', { name: btn, exact: true }).click();
    await expect(page.locator(`#preview-pane ${shown}`).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.mp-pagination-progress')).toHaveCount(0);
    await page.waitForTimeout(1200);
    // The editor did not move, and the preview shows the editor's line.
    expect(Math.abs((await editorTop()) - before)).toBeLessThan(40);
    expect(await previewShows(line.slice(0, 30))).toBe(true);
  }
});

test('with the caret on screen, Pages puts the caret line at the caret height in the preview', async ({
  page,
}) => {
  await openSplit(page, false);
  const scroller = page.locator('.cm-scroller');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 3;
  });
  await page.waitForTimeout(600);
  // Put the caret on a non-blank line three quarters down the editor — far
  // from the one-third reference line the fallback would use.
  const target = await page.evaluate(() => {
    const s = document.querySelector('.cm-scroller')!.getBoundingClientRect();
    const y = s.top + s.height * 0.75;
    const line = [...document.querySelectorAll('.cm-line')].find((l) => {
      const r = l.getBoundingClientRect();
      return r.bottom >= y && /^Texte \d+\.$/.test((l.textContent ?? '').trim());
    })!;
    const r = line.getBoundingClientRect();
    return { text: (line.textContent ?? '').trim(), x: r.left + 20, y: r.top + r.height / 2 };
  });
  await page.mouse.click(target.x, target.y);
  const caretY = await page.evaluate((t) => {
    const s = document.querySelector('.cm-scroller')!.getBoundingClientRect();
    const line = [...document.querySelectorAll('.cm-line')].find((l) => (l.textContent ?? '').trim() === t)!;
    return line.getBoundingClientRect().top - s.top;
  }, target.text);

  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await expect(page.locator('#preview-pane .pagedjs_page').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.mp-pagination-progress')).toHaveCount(0);
  await page.waitForTimeout(1200);
  // The same line, in the preview, at the caret's height (the paragraph's top).
  const previewY = await page.evaluate((t) => {
    const pane = document.querySelector('#preview-pane')!.getBoundingClientRect();
    const p = [...document.querySelectorAll('#preview-pane p')].find((e) => (e.textContent ?? '').trim() === t);
    return p ? p.getBoundingClientRect().top - pane.top : null;
  }, target.text);
  expect(previewY).not.toBeNull();
  expect(Math.abs(previewY! - caretY)).toBeLessThan(30);
});
