import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './fixtures';

/**
 * Purpose: The repo's three long-form reference documents are the ones a human
 *   reads to spot layout regressions by eye. This spec is the machine half of
 *   that: it renders each end to end and fails on the defects an eye can miss —
 *   a fence that rendered an error box, a page that never paginated, an
 *   uncaught exception on the way.
 *
 *   They cover complementary ground on purpose. SHOWCASE.md sweeps every
 *   construct on A4; markpage-slides.md exercises the 16:9 slide geometry,
 *   where margins are clamped and figures capped; LETTER.md drives the
 *   letterhead layout — logo, sender, absolutely positioned recipient,
 *   signature — which no other fixture touches.
 */

const DOCS = [
  { file: 'SHOWCASE.md', label: 'showcase (A4, every construct)' },
  { file: 'markpage-slides.md', label: 'slides (16:9 geometry)' },
  { file: 'LETTER.md', label: 'letter (letterhead layout)' },
] as const;

async function renderDoc(page: Page, markdown: string): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.addInitScript((t) => {
    localStorage.setItem('markpage:doc', t);
    localStorage.setItem('markpage:preview-visible', '1');
    localStorage.setItem('markpage:preview-paginated', '1');
  }, markdown);
  await page.goto('/');
  await page
    .locator('.pagedjs_page')
    .first()
    .waitFor({ state: 'attached', timeout: 90_000 });
  // Let the paginator settle: a long document keeps adding pages for a while
  // after the first one exists.
  await page.waitForTimeout(6000);
  return consoleErrors;
}

for (const { file, label } of DOCS) {
  test(`${label} paginates without errors`, async ({ page }) => {
    const markdown = readFileSync(join(process.cwd(), file), 'utf8');
    const consoleErrors = await renderDoc(page, markdown);

    const pageCount = await page.locator('.pagedjs_page').count();
    expect(pageCount, `${file} produced no pages`).toBeGreaterThan(0);

    // Every renderer signals a failed fence with a `*-error` box (ebnf-error,
    // mosaic-error, …) rather than throwing, so a silent one only shows up as
    // markup.
    const errorBoxes = await page.locator('[class*="-error"]').allTextContents();
    expect(errorBoxes, `${file} rendered error boxes`).toEqual([]);

    expect(consoleErrors, `${file} raised console errors`).toEqual([]);
  });
}

test('body text is justified and hyphenated; code is neither', async ({
  page,
}) => {
  const markdown = readFileSync(join(process.cwd(), 'SHOWCASE.md'), 'utf8');
  await renderDoc(page, markdown);

  // Justification and hyphenation are inherited from the page container, so
  // they leak into preformatted content unless something stops them. They did:
  // code blocks came out justified AND hyphenated, breaking identifiers across
  // lines ("attributes_of_dependencies" → "cur-rent"). Nothing failed — the
  // document paginated cleanly — which is exactly why this needs its own guard.
  const styles = await page.evaluate(() => {
    const read = (el: Element | null) =>
      el
        ? {
            align: getComputedStyle(el).textAlign,
            hyphens: getComputedStyle(el).hyphens,
          }
        : null;
    return {
      pre: read(document.querySelector('.pagedjs_page pre')),
      code: read(document.querySelector('.pagedjs_page pre > code')),
      paragraph: read(
        [...document.querySelectorAll('.pagedjs_page p')].find(
          (e) => (e.textContent || '').length > 200,
        ) ?? null,
      ),
    };
  });

  expect(styles.paragraph).toEqual({ align: 'justify', hyphens: 'auto' });
  expect(styles.pre).toEqual({ align: 'left', hyphens: 'none' });
  expect(styles.code).toEqual({ align: 'left', hyphens: 'none' });
});

test('letter: no generated cover page', async ({ page }) => {
  const markdown = readFileSync(join(process.cwd(), 'LETTER.md'), 'utf8');
  await renderDoc(page, markdown);

  // A letterhead document names its author in the `sender` block, so the
  // generated author/organization/date block is suppressed. Without that, a
  // letter carrying only `document-type: letter` opened on a spurious page
  // showing the PROFILE's placeholders — "Prénom Nom", "Mon organisation" —
  // and doubled its page count.
  await expect(page.locator('.preview-metadata')).toHaveCount(0);
  const firstPageText = await page
    .locator('.pagedjs_page')
    .first()
    .textContent();
  expect(firstPageText).toContain('Atelier Typographique');
  expect(firstPageText).not.toContain('Prénom Nom');
});

test('letter: logo, sender, recipient and signature all render', async ({
  page,
}) => {
  const markdown = readFileSync(join(process.cwd(), 'LETTER.md'), 'utf8');
  await renderDoc(page, markdown);

  // The letterhead pair and the sign-off are the point of the letter type;
  // each is a distinct code path (normal flow, absolute positioning, and the
  // right-column sign-off).
  await expect(page.locator('.pagedjs_page .letterhead-sender')).toHaveCount(1);
  await expect(page.locator('.pagedjs_page .letterhead-recipient')).toHaveCount(1);
  await expect(page.locator('.pagedjs_page .letterhead-signature')).toHaveCount(1);

  // The recipient sits to the RIGHT of the sender — that is what puts it in a
  // DL window envelope. Comparing the two blocks keeps this independent of the
  // preview's fit-to-width zoom.
  const geometry = await page.evaluate(() => {
    const sender = document.querySelector('.letterhead-sender');
    const recipient = document.querySelector('.letterhead-recipient');
    if (!sender || !recipient) return null;
    return {
      senderRight: sender.getBoundingClientRect().right,
      recipientLeft: recipient.getBoundingClientRect().left,
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.recipientLeft).toBeGreaterThan(geometry!.senderRight);

  // The logo is an inline data: URI — assert it actually decoded rather than
  // leaving a broken-image box.
  const logoOk = await page.evaluate(() => {
    const img = document.querySelector(
      '.pagedjs_page img',
    ) as HTMLImageElement | null;
    return img ? img.complete && img.naturalWidth > 0 : false;
  });
  expect(logoOk).toBe(true);
});
