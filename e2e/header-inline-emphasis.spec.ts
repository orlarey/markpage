import { expect, test, type Page } from './fixtures';

/**
 * Purpose: Mid-slot markdown emphasis in `header` / `footer` fences
 *   (e.g. `Bienvenue dans **markpage**`) must render bold / italic in
 *   the page margin box — not show the asterisks literally. The fix
 *   uses paged.js's `position: running()` + `content: element()` to
 *   pipe a real HTML fragment with `<strong>` / `<em>` through to the
 *   margin box.
 *
 *   The plain-text path and the whole-slot wrap path (`**X**`) still
 *   use the simpler CSS `content: "..."` rendering — only slots with
 *   mid-string emphasis AND no `{var}` substitutions get the
 *   element() treatment.
 */

async function pasteDoc(page: Page, doc: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(async (t) => navigator.clipboard.writeText(t), doc);
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(400);
}

async function waitForRender(page: Page): Promise<void> {
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached', timeout: 30_000 });
  // Wait for the paginator to fill the slot. (The former wait looked for a
  // `.mp-running` clone inside `.pagedjs_margin-content` — a paged.js
  // implementation detail; what matters is that the slot shows its content.)
  await page.waitForFunction(
    () =>
      (
        document.querySelector('.pagedjs_margin-top-right')?.textContent || ''
      ).trim() !== '',
    null,
    { timeout: 90_000 },
  );
}

test('mid-slot **bold** in a header fence renders as a real <strong> in the margin', async ({
  page,
}) => {
  await page.goto('/');
  await pasteDoc(
    page,
    '```header\n | | Bienvenue dans **markpage**\n```\n\n# Test\n\nBody text.\n',
  );
  await waitForRender(page);

  const r = await page.evaluate(() => {
    const tr = document.querySelector('.pagedjs_margin-top-right');
    if (tr === null) return null;
    const strong = tr.querySelector('strong');
    const text = (tr.textContent || '').trim();
    return {
      hasStrong: strong !== null,
      strongText: strong?.textContent ?? null,
      // The visible text must NOT contain literal asterisks.
      hasAsterisks: text.includes('*'),
      // The whole header text must be there in order.
      fullText: text,
    };
  });
  expect(r).not.toBeNull();
  expect(r!.hasStrong).toBe(true);
  expect(r!.strongText).toBe('markpage');
  expect(r!.hasAsterisks).toBe(false);
  expect(r!.fullText).toContain('Bienvenue dans');
  expect(r!.fullText).toContain('markpage');
});

test('mid-slot *italic* renders as a real <em>', async ({ page }) => {
  await page.goto('/');
  await pasteDoc(
    page,
    '```header\n | | Section *introduction*\n```\n\n# Test\n\nBody.\n',
  );
  await waitForRender(page);

  const r = await page.evaluate(() => {
    const tr = document.querySelector('.pagedjs_margin-top-right');
    const em = tr?.querySelector('em');
    return {
      hasEm: em !== null,
      emText: em?.textContent ?? null,
      fullText: (tr?.textContent || '').trim(),
    };
  });
  expect(r.hasEm).toBe(true);
  expect(r.emText).toBe('introduction');
  expect(r.fullText.includes('*')).toBe(false);
});
