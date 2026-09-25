import { expect, test, type Page } from './fixtures';

/**
 * The Insérer menu (ui/insert-menu.ts): every element inserted through the
 * real menu — hovering its category, clicking it — lands as a template that
 * renders without a single error, with nothing of the ⟦…⟧ markers left.
 * And the Format / right-click menus keep to their own jobs.
 */

// Every insertable element, as the user reaches it (category, then item).
const PATHS: string[][] = [
  ['Titre, auteur et date'],
  ['Tableau', 'Tableau simple'],
  ['Tableau', 'Tableau de données (CSV)'],
  ...[
    'Note',
    'Astuce',
    'Attention',
    'Danger',
    'Important',
    'Théorème',
    'Définition',
    'Démonstration',
    'Exemple',
    'Remarque',
  ].map((l) => ['Encadré', l]),
  ['Mathématiques', 'Formule dans le texte'],
  ['Mathématiques', 'Formule centrée'],
  ['Mathématiques', 'Règle d’inférence'],
  ...[
    'Schéma (étapes et flèches)',
    'Graphique en courbes',
    'Graphique en barres',
    'Arborescence (texte)',
    'Arborescence (dessin)',
    'Diagramme commutatif',
    'Circuit Faust (BDA)',
    'Grammaire (EBNF)',
    'Type algébrique (ADT)',
  ].map((l) => ['Diagramme', l]),
  ...['Bloc de code', 'Algorithme', 'Différences (diff)', 'Démo : source et rendu'].map((l) => [
    'Code',
    l,
  ]),
  ['Références', 'Note de bas de page'],
  ['Références', 'Référence bibliographique'],
  ...[
    'Table des matières',
    'Colonnes',
    'Ligne de séparation',
    'Liste de définitions',
    'Texte mis en forme',
    'Fond de page',
    'En-tête de page',
    'Pied de page',
  ].map((l) => ['Mise en page', l]),
  ...['Expéditeur', 'Destinataire', 'Signature'].map((l) => ['Courrier', l]),
];

const ERRORS =
  '.math-error, .xref-broken, .chart-error, .bda-error, .category-error, .adt-error, .mermaid-error, .ebnf-error, .mosaic-error';

async function newDoc(page: Page): Promise<void> {
  const url = 'https://example.test/vide.md';
  await page.route(url, (r) =>
    r.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '# Mon document\n\nUn paragraphe.\n',
    })
  );
  await page.goto(`/?src=${encodeURIComponent(url)}`);
  await page.locator('.cm-content').waitFor();
}

/** Insérer ▸ path…, through the menu as a user does. */
async function insert(page: Page, path: string[]): Promise<void> {
  await page.getByRole('button', { name: /^Insérer/ }).click();
  await expect(page.locator('.mp-menu')).toHaveCount(1);
  for (const [i, label] of path.entries()) {
    const level = page.locator('.mp-menu').nth(i);
    // The row whose label is exactly `label` (its accessible name also carries
    // the shortcut, or the ▸ of a submenu).
    const row = level.locator('.cm-context-item').filter({
      has: page.locator('.cm-context-label').getByText(label, { exact: true }),
    });
    if (i < path.length - 1) {
      await row.hover();
      await expect(page.locator('.mp-menu')).toHaveCount(i + 2);
    } else {
      await row.click();
    }
  }
  await expect(page.locator('.mp-menu')).toHaveCount(0);
}

test('every element of the Insérer menu renders without an error', async ({ page }) => {
  test.setTimeout(120_000);
  await newDoc(page);
  for (const path of PATHS) {
    // Collapse the selected placeholder at the end, so each lands on its own.
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await insert(page, path);
  }
  // A cross-reference to a label the menu itself added.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home'); // the heading is near the top
  await page.locator('.cm-line', { hasText: '# Mon document' }).click();
  await insert(page, ['Références', 'Étiquette (pour un renvoi)']);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await insert(page, ['Références', 'Renvoi vers', 'sec:mon-document']);

  const source = await page.evaluate(() =>
    [...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n')
  );
  expect(source).not.toMatch(/[⟦⟧]/);

  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  const pane = page.locator('#preview-pane');
  await expect(pane.locator('.pagedjs_page').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(pane.getByText('Texte de la note.').first()).toBeAttached();
  const errors = await pane
    .locator(ERRORS)
    .evaluateAll((els) => els.map((e) => `${e.className}: ${(e.textContent ?? '').slice(0, 160)}`));
  expect(errors).toEqual([]);
  // A sampling of what each category produced.
  for (const sel of [
    'table',
    '.admonition-note',
    '.admonition-theorem',
    '.math-block svg',
    '.chart-svg',
    '.bda-svg',
    'svg',
  ]) {
    expect(await pane.locator(sel).count(), sel).toBeGreaterThan(0);
  }
});

test('a selection is wrapped: select text, Encadré ▸ Note puts it in the callout', async ({
  page,
}) => {
  await newDoc(page);
  await page.locator('.cm-line', { hasText: 'Un paragraphe.' }).click({ clickCount: 3 });
  await insert(page, ['Encadré', 'Note']);
  const text = await page.locator('.cm-content').innerText();
  expect(text).toContain('::: note\nUn paragraphe.\n:::');
});

test('the keyboard walks the menu: ↓ → ↵', async ({ page }) => {
  await newDoc(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.getByRole('button', { name: /^Insérer/ }).click();
  await expect(page.locator('.mp-menu')).toHaveCount(1);
  // Down to "Encadré" (after title, image, image wall, link, table).
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.mp-menu').first().locator(':focus')).toHaveText(/Encadré/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.mp-menu')).toHaveCount(2);
  await page.keyboard.press('Enter'); // Note
  await expect(page.locator('.cm-content')).toContainText('::: note');
});

test('Format is about the look of the text, with its shortcuts; right-click has the clipboard', async ({
  page,
}) => {
  await newDoc(page);
  await page.getByRole('button', { name: /^Format/ }).click();
  const menu = page.locator('.mp-menu').first();
  await expect(menu.getByRole('menuitem', { name: /Gras/ })).toContainText(/(⌘|Ctrl\+)B/);
  await expect(menu.getByRole('menuitem', { name: /Lien/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /image/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.mp-menu')).toHaveCount(0);

  await page.locator('.cm-line', { hasText: 'Un paragraphe.' }).click({ button: 'right' });
  const ctx = page.locator('.mp-menu').first();
  for (const label of ['Couper', 'Copier', 'Coller', 'Format', 'Insérer']) {
    await expect(ctx.getByRole('menuitem', { name: new RegExp(`^${label}`) })).toHaveCount(1);
  }
});
