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

// The paginated preview clears the pane and shows a spinner while it renders,
// then reveals the pages when ready. Renders don't serialize: a new edit
// supersedes the in-flight one, so the LATEST content wins without waiting.
test('paginated preview: latest edit wins, no queue wait', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('markpage:preview-paginated', '1');
    localStorage.setItem('markpage:preview-visible', '1');
    localStorage.setItem('markpage:engine', 'vivliostyle');
  });
  await page.goto('/');
  await setDoc(page, mk('ALPHA'));
  await expect(page.locator('#preview-pane')).toContainText('ALPHA', { timeout: 60000 });

  // Rapid supersession: three quick edits — only the last survives.
  await setDoc(page, mk('ONE'));
  await setDoc(page, mk('TWO'));
  await setDoc(page, mk('THREE'));
  await expect(page.locator('#preview-pane')).toContainText('THREE', { timeout: 60000 });
  await expect(page.locator('#preview-pane')).not.toContainText('ALPHA');
  await expect(page.locator('#preview-pane')).not.toContainText('ONE');
});
