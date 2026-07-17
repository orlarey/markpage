import { beforeEach, describe, expect, it } from 'vitest';

import { setLanguage } from '../src/i18n/locale';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';
import { buildSettingsForm } from '../src/ui/settings-form';
import type { EssentialFrontmatterKey } from '../src/stack-render';
import {
  DEFAULT_ESSENTIAL_STYLE,
  applyEssentialStyle,
  contextualEssentialStyle,
} from '../src/style-recipes';

function mount(initialVariations: EssentialFrontmatterKey[] = []) {
  let settings = structuredClone(DEFAULT_SETTINGS);
  let variations = new Set<EssentialFrontmatterKey>(initialVariations);
  const form = buildSettingsForm(document, {
    getSettings: () => settings,
    onChange: (next) => {
      settings = next;
    },
    onChangeRecipe: (documentType, appearance) => {
      settings = applyEssentialStyle(
        structuredClone(DEFAULT_SETTINGS),
        contextualEssentialStyle(documentType, appearance),
      );
      variations = new Set();
    },
    getEssentialStyle: () => DEFAULT_ESSENTIAL_STYLE,
    getVariationKeys: () => variations,
    onResetVariation: (key) => {
      variations = new Set(
        [...variations].filter((candidate) => candidate !== key),
      );
      form.refresh();
    },
    onUndo: () => undefined,
    onRedo: () => undefined,
    getParentStyle: () => null,
    onChangeParentStyle: () => undefined,
  });
  document.body.append(form.root);
  return {
    form,
    getSettings: (): PdfSettings => settings,
  };
}

describe('simplified settings form', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    setLanguage('fr');
  });

  it('opens on the essential recipe view by default', () => {
    const { form } = mount();

    expect(form.root.querySelector('.settings-essential')).not.toBeNull();
    expect(form.root.querySelector('.settings-rail')).toBeNull();
    expect(
      form.root.querySelector('.settings-view-switch button.active')
        ?.textContent,
    ).toBe('Essentiel');
  });

  it('applies a document model through the first recipe selector', () => {
    const { form, getSettings } = mount();
    const model = form.root.querySelector<HTMLSelectElement>(
      '.settings-essential section select',
    );
    expect(model).not.toBeNull();

    model!.value = 'book';
    model!.dispatchEvent(new Event('change'));

    expect(getSettings().pageSize).toBe('B5');
    expect(getSettings().duplex).toBe(true);
    expect(getSettings().chapterBreak).toBe('next-recto');
  });

  it('offers the letter recipe and explains that recipe changes reset variations', () => {
    const { form, getSettings } = mount(['body-size', 'accent']);
    const model = form.root.querySelector<HTMLSelectElement>(
      '.settings-essential section select',
    );

    expect(
      form.root.querySelector('.settings-recipe-warning')?.textContent,
    ).toContain('réinitialise les variations');

    model!.value = 'letter';
    model!.dispatchEvent(new Event('change'));

    expect(getSettings().pageSize).toBe('A4');
    expect(getSettings().duplex).toBe(false);
    expect(getSettings().footer).toBe('');
    expect(getSettings().notes.position).toBe('end');
  });

  it('offers paragraph spacing or conventional first-line indentation', () => {
    const { form, getSettings } = mount();
    const field = [...form.root.querySelectorAll('.field')].find((row) =>
      row.textContent?.includes('Séparation des paragraphes'),
    );
    const select = field?.querySelector('select');

    expect(select).not.toBeNull();
    select!.value = 'indent';
    select!.dispatchEvent(new Event('change'));

    expect(getSettings().styles.body.marginAbove).toBe(0);
    expect(getSettings().styles.body.marginBelow).toBe(0);
    expect(getSettings().styles.body.firstLineIndent).toBe(1.5);
  });

  it('shows whether an essential value is default or an authored variation', () => {
    const { form } = mount(['body-size']);
    const fields = [...form.root.querySelectorAll('.settings-origin-field')];
    const bodySize = fields.find((field) =>
      field.textContent?.includes('Taille du corps'),
    );
    const density = fields.find((field) =>
      field.textContent?.includes('Densité'),
    );

    expect(bodySize?.classList.contains('is-variation')).toBe(true);
    expect(bodySize?.querySelector('.settings-origin')?.textContent).toBe(
      'Variation',
    );
    expect(bodySize?.querySelector('.settings-origin-reset')).not.toBeNull();
    expect(density?.classList.contains('is-default')).toBe(true);
    expect(density?.querySelector('.settings-origin')?.textContent).toBe(
      'Par défaut',
    );
  });

  it('resets a variation by asking the document layer to remove its key', () => {
    const { form } = mount(['paragraphs']);
    const field = [...form.root.querySelectorAll('.settings-origin-field')].find(
      (row) => row.textContent?.includes('Séparation des paragraphes'),
    );

    field
      ?.querySelector<HTMLButtonElement>('.settings-origin-reset')
      ?.click();

    const refreshed = [
      ...form.root.querySelectorAll('.settings-origin-field'),
    ].find((row) => row.textContent?.includes('Séparation des paragraphes'));
    expect(refreshed?.classList.contains('is-default')).toBe(true);
    expect(refreshed?.querySelector('.settings-origin-reset')).toBeNull();
  });

  it('keeps the complete legacy matrix in the advanced view', () => {
    const { form } = mount();
    const advanced = [
      ...form.root.querySelectorAll<HTMLButtonElement>(
        '.settings-view-switch button',
      ),
    ].find((button) => button.textContent === 'Avancé');

    advanced!.click();

    expect(form.root.querySelector('.settings-essential')).toBeNull();
    expect(form.root.querySelector('.settings-rail')).not.toBeNull();
    expect(
      form.root.querySelectorAll('.settings-rail .rail-item').length,
    ).toBeGreaterThan(10);
    expect(localStorage.getItem('markpage:settings-view')).toBe('advanced');
  });
});
