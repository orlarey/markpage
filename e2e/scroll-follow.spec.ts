import { expect, test } from './fixtures';

/**
 * Scroll-follow (main.ts): the pane you scroll drives the other. Scrolling the
 * preview, then moving to the editor and scrolling there (no click) must
 * scroll the editor — the follow animation must never hold a pane hostage.
 */

test('after scrolling the preview, the editor scrolls again without a click', async ({
  page,
}) => {
  await page.goto('/'); // the help document: long
  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  const preview = page.locator('#preview-pane');
  await expect(preview.locator('[data-line]').first()).toBeAttached();
  const scroller = page.locator('.cm-scroller');
  const pBox = (await preview.boundingBox())!;
  const eBox = (await scroller.boundingBox())!;

  await page.mouse.move(pBox.x + pBox.width / 2, pBox.y + pBox.height / 2);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(500); // let the follow settle
  const editorTop = () => scroller.evaluate((el) => el.scrollTop);
  const before = await editorTop();
  expect(before).toBeGreaterThan(0); // the editor followed

  await page.mouse.move(eBox.x + eBox.width / 2, eBox.y + eBox.height / 2);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(300);
  expect(await editorTop()).toBeGreaterThan(before + 500);
});
