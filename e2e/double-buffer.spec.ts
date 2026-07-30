import { test, expect } from '@playwright/test';

const mk = (marker: string) =>
  ['---', 'title: T', 'document-style: rapport', '---', '', `# ${marker}`, '', 'Body paragraph.'].join('\n');

async function setDoc(page: import('@playwright/test').Page, md: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(async (t) => navigator.clipboard.writeText(t), md);
  await page.keyboard.press('ControlOrMeta+v');
}

test('double-buffer: pane never blanks; latest edit wins', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('markpage:preview-paginated', '1');
    localStorage.setItem('markpage:preview-visible', '1');
    localStorage.setItem('markpage:engine', 'vivliostyle');
  });
  await page.goto('/');
  await setDoc(page, mk('ALPHA'));
  await expect(page.locator('#preview-pane [data-vivliostyle-page-container]').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#preview-pane')).toContainText('ALPHA');

  // Edit → BETA. While it re-paginates, the pane must keep showing pages (ALPHA),
  // never go blank.
  await setDoc(page, mk('BETA'));
  let sawBlank = false;
  for (let i = 0; i < 12; i++) {
    const n = await page.locator('#preview-pane [data-vivliostyle-page-container]').count();
    if (n === 0) sawBlank = true;
    await page.waitForTimeout(120);
  }
  expect(sawBlank).toBe(false);
  await expect(page.locator('#preview-pane')).toContainText('BETA', { timeout: 60000 });
  await expect(page.locator('#preview-pane')).not.toContainText('ALPHA');

  // Rapid supersession: three quick edits — only the last survives.
  await setDoc(page, mk('ONE'));
  await setDoc(page, mk('TWO'));
  await setDoc(page, mk('THREE'));
  await expect(page.locator('#preview-pane')).toContainText('THREE', { timeout: 60000 });
  await expect(page.locator('#preview-pane')).not.toContainText('ONE');
  await expect(page.locator('#preview-pane')).not.toContainText('BETA');
});
