import { expect, test, type Page } from './fixtures';

/**
 * A letter's head looks the same in the continuous preview as on the printed
 * page: the sender at the top left, the recipient at the envelope window
 * (110 mm from the left edge, 40 mm from the top), the text below both.
 */

const LETTER = [
  '---',
  'document-style: lettre-a4',
  '---',
  '',
  '```sender',
  '**Prénom Nom**',
  '12 rue de la Paix',
  '75002 Paris',
  '```',
  '',
  '```recipient',
  '**Destinataire**',
  'Société',
  '8 boulevard Voltaire',
  '75011 Paris',
  '```',
  '',
  'Madame, Monsieur,',
  '',
].join('\n');

async function openLetter(page: Page, paginated: boolean, body = LETTER): Promise<void> {
  if (!paginated) {
    await page.addInitScript(() => localStorage.setItem('markpage:preview-paginated', '0'));
  }
  const url = 'https://example.test/lettre.md';
  await page.route(url, (r) =>
    r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, body }),
  );
  await page.goto(`/?src=${encodeURIComponent(url)}`);
  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  await expect(page.locator('#preview-pane .letterhead-recipient')).toBeVisible();
}

/**
 * Where `sel` sits on the sheet / page, in page millimetres from its top-left:
 * across, as a share of the A4 width (the continuous sheet shrinks to its
 * pane, the text reflowing); down, in millimetres of the sheet's own scale.
 */
async function mmOnSheet(page: Page, sel: string, sheetSel: string) {
  return page.evaluate(
    ([s, sh]) => {
      const el = document.querySelector(`#preview-pane ${s}`)!.getBoundingClientRect();
      const sheetEl = document.querySelector<HTMLElement>(`#preview-pane ${sh}`)!;
      const sheet = sheetEl.getBoundingClientRect();
      const across = sheet.width / 210; // A4
      // Down: the page's own zoom (paginated), none on the continuous sheet.
      const down = sheet.width / sheetEl.offsetWidth * (96 / 25.4);
      return {
        left: (el.left - sheet.left) / across,
        top: (el.top - sheet.top) / down,
        bottom: (el.bottom - sheet.top) / down,
      };
    },
    [sel, sheetSel] as const,
  );
}

for (const paginated of [false, true]) {
  test(`${paginated ? 'pages' : 'continuous'}: the recipient sits at the envelope window`, async ({
    page,
  }) => {
    await openLetter(page, paginated);
    const sheet = paginated ? '.pagedjs_page' : '.mp-continuous-sheet';
    const sender = await mmOnSheet(page, '.letterhead-sender', sheet);
    const recipient = await mmOnSheet(page, '.letterhead-recipient', sheet);
    const body = await mmOnSheet(page, '.letterhead-group + p', sheet);
    expect(recipient.left).toBeCloseTo(110, 0);
    expect(recipient.top).toBeCloseTo(40, 0);
    expect(sender.left).toBeLessThan(60);
    expect(body.top).toBeGreaterThan(recipient.bottom);
  });
}

