/********************************* settings-form.ts ****************************
 *
 * Purpose: Shared Réglages form builder used by both the modal panel and the
 *   detached popup window — every field reads from / writes to a `PdfSettings`.
 * How: `buildSettingsForm(doc, handlers)` returns a root element + `refresh()`;
 *   helpers (closures capturing `doc`) mint each control type for the section grid.
 * Restructure: buildSettingsForm doesn't compress cleanly, candidate for refactor.
 *
 *******************************************************************************/

// The settings form, factored out of the modal panel so the same DOM
// can live in either an in-app overlay (settings-panel.ts) or a
// detached browser window (settings-window.ts). All helpers are
// closures inside buildSettingsForm and capture `doc` so we can mint
// elements in any window's Document — required because elements
// from window A can't be appended into window B.

import {
  ALIGNS,
  ELEMENT_DESCRIPTORS,
  PAGE_SIZES,
  PAGE_SIZE_LABELS,
  WEIGHT_OPTIONS,
  validateLayoutSettings,
  type Align,
  type AttrName,
  type DateMode,
  type ElementKey,
  type LayoutValidationIssue,
  type MetadataField,
  type PdfSettings,
  type Style,
} from '../settings';
import { MATH_FONT_SETS, type MathFontSet } from '@orlarey/markpage-render';
import {
  FONT_PACKS,
  FONT_PACK_IDS,
  detectActivePack,
  type FontPackId,
} from '../font-packs';
import {
  APPEARANCES,
  DENSITIES,
  DOCUMENT_MODELS,
  PARAGRAPH_SEPARATIONS,
  PAGINATION_STYLES,
  applyAccentColor,
  applyBaseFontSize,
  applyDensity,
  applyParagraphSeparation,
  applyPaginationStyle,
  detectAccentColor,
  detectDensity,
  detectParagraphSeparation,
  detectPaginationStyle,
  type Appearance,
  type Density,
  type DocumentModel,
  type ParagraphSeparation,
  type PaginationStyle,
  type EssentialStyle,
} from '../style-recipes';
import {
  getFontCatalog,
  parseGoogleFontsUrl,
  registerCustomFonts,
} from '../font-loader';
import { getEditorTextColor, setEditorTextColor } from '../editor-color';
import { getEditorFont, setEditorFont, type EditorFont } from '../editor-font';
import { getLanguage, setLanguage, type Language } from '../i18n/locale';
import { clearToken, getUser, loadToken, saveToken } from '../github';
import { t } from '../i18n/strings';
import { makeLogo } from './logo';
import type { EssentialFrontmatterKey } from '../stack-render';

/**
 * Purpose: Full settings-form callback set.
 * How: get/set of the active `PdfSettings`, plus the document's parent style
 *   (its `extends`) and a request to change it — opens the layer picker and
 *   writes the leaf's front-matter (STACK-SPEC §12.1).
 */
export interface SettingsFormHandlers {
  getSettings(): PdfSettings;
  onChange(s: PdfSettings, variationKey?: EssentialFrontmatterKey): void;
  onChangeRecipe(documentType: DocumentModel, appearance: Appearance): void;
  getEssentialStyle(): EssentialStyle;
  getVariationKeys(): ReadonlySet<EssentialFrontmatterKey>;
  onResetVariation(key: EssentialFrontmatterKey): void;
  onUndo(): void;
  onRedo(): void;
  getParentStyle(): string | null;
  onChangeParentStyle(): void;
}

/**
 * Purpose: Return type of `buildSettingsForm` — root element + repaint hook.
 * How: `refresh()` re-reads `getSettings` and rebuilds the form contents in place.
 */
export interface SettingsForm {
  /** The form root element, ready to be appended into the host. */
  root: HTMLElement;
  /** Repaints from the latest settings — used after Reset. */
  refresh(): void;
}

// Locale-aware label maps. Functions so each call respects the
// active locale — relevant when the user picks a fresh locale and we
// rebuild the form before the page reload kicks in.
const DATE_MODE_LABELS = (): Record<DateMode, string> => ({
  none: t('date.none'),
  today: t('date.today'),
  custom: t('date.custom'),
});

const DATE_MODES: DateMode[] = ['none', 'today', 'custom'];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SETTINGS_VIEW_KEY = 'markpage:settings-view';

/**
 * Purpose: Build the full Réglages form in `doc`, bound to `handlers`.
 * How: Maintains a local `current` clone, exposes `refresh()` to rebuild
 *   contents; section helpers below mint each control flavour.
 */
export function buildSettingsForm(
  doc: Document,
  handlers: SettingsFormHandlers,
): SettingsForm {
  const root = doc.createElement('div');
  root.className = 'settings-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('settings.h1'));

  let current: PdfSettings = clone(handlers.getSettings());
  let settingsView: 'essential' | 'advanced' =
    localStorage.getItem(SETTINGS_VIEW_KEY) === 'advanced'
      ? 'advanced'
      : 'essential';

  // Persisted across refresh() calls so changing one field doesn't
  // bounce the user back to the first rail entry.
  let activeRailId = 'app';

  const emit = (variationKey?: EssentialFrontmatterKey): void =>
    handlers.onChange(clone(current), variationKey);
  // Re-reads from handlers on every call so callers can refresh after
  // mutating state outside the form (parent-style change, doc switch).
  const refresh = (): void => {
    current = clone(handlers.getSettings());
    root.innerHTML = '';
    root.append(...buildContent());
  };

  const buildContent = (): HTMLElement[] => {
    const header = doc.createElement('header');
    const title = doc.createElement('h2');
    // The h2 hosts the brand mark followed by the section name, so
    // the popup window reads "[markpage] — Réglages" at a glance.
    title.append(
      makeLogo(doc, 'full'),
      doc.createTextNode(` — ${t('settings.h1')}`),
    );
    const viewSwitch = doc.createElement('div');
    viewSwitch.className = 'settings-view-switch';
    for (const view of ['essential', 'advanced'] as const) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = t(`settings.view.${view}`);
      button.classList.toggle('active', settingsView === view);
      button.setAttribute('aria-pressed', String(settingsView === view));
      button.addEventListener('click', () => {
        settingsView = view;
        localStorage.setItem(SETTINGS_VIEW_KEY, view);
        refresh();
      });
      viewSwitch.append(button);
    }
    header.append(title, viewSwitch);

    if (settingsView === 'essential') {
      return [header, buildEssentialLayout()];
    }

    // ---- Rail navigation + content -----------------------------------
    // Each rail entry knows how to (re)build its section content; the
    // active entry's content is the only thing displayed in the right
    // pane. Switching entry rebuilds only that pane.
    const railGroups: Array<{
      titleKey:
        | 'rail.group.app'
        | 'rail.group.document'
        | 'rail.group.typography'
        | 'rail.group.content'
        | 'rail.group.sync';
      items: Array<{
        id: string;
        label: string;
        build: () => HTMLElement[];
      }>;
    }> = [
      {
        titleKey: 'rail.group.app',
        items: [
          {
            id: 'app',
            label: t('settings.section.ui-language'),
            build: () => [
              section(t('settings.section.ui-language'), [
                uiLanguageField(),
                editorFontField(),
                editorTextColorField(),
              ]),
            ],
          },
        ],
      },
      {
        titleKey: 'rail.group.document',
        items: [
          {
            // "Style parent" (extends) — the document's place in the stack.
            id: 'doc-style',
            label: t('settings.section.parent-style'),
            build: () => [buildParentStyleSection()],
          },
          {
            // Single merged "Page" rail item: format + canon-driven
            // layout + the four mm margins live together because the
            // user thinks of them as one workflow ("set up the page").
            id: 'doc-page',
            label: t('settings.section.page'),
            build: () => [
              // Format: pageSize, doc language, page-number position.
              section(t('settings.section.page-format'), [
                selectField(
                  t('settings.field.page-size'),
                  PAGE_SIZES,
                  current.pageSize,
                  (v) => {
                    current.pageSize = v;
                    emit();
                  },
                  (v) => PAGE_SIZE_LABELS[v],
                ),
                selectField<Language>(
                  t('settings.field.doc-language'),
                  ['fr', 'en'],
                  current.language,
                  (v) => {
                    current.language = v;
                    emit();
                  },
                  (v) => (v === 'fr' ? 'Français' : 'English'),
                ),
                // Default en-tête / pied de page. Same syntax as
                // a ```header / ```footer fence body — `left | center
                // | right` slots, with `{page}` / `{pages}` / `{title}`
                // / `{date}` substitutions and `**bold**` / `*italic*`
                // inline emphasis. A fence later in the document
                // overrides the matching band per cascade.
                textField(
                  t('settings.field.header-default'),
                  current.header,
                  t('settings.field.header-default-placeholder'),
                  (v) => {
                    current.header = v;
                    emit();
                  },
                ),
                textField(
                  t('settings.field.footer-default'),
                  current.footer,
                  t('settings.field.footer-default-placeholder'),
                  (v) => {
                    current.footer = v;
                    emit();
                  },
                ),
              ]),
              // Layout: preset + canon + duplex / chapter / notes.
              ...buildLayoutSection(),
              // The four manual mm margins. Disabled when marginMode
              // is 'derived' — the canon is authoritative then and
              // the values displayed are advisory.
              section(t('settings.section.margins'), [
                numberField(
                  t('settings.field.margin-top'),
                  current.margins.top,
                  0,
                  100,
                  (v) => {
                    current.margins.top = v;
                    emit();
                  },
                  { disabled: current.marginMode === 'derived' },
                ),
                numberField(
                  t('settings.field.margin-bottom'),
                  current.margins.bottom,
                  0,
                  100,
                  (v) => {
                    current.margins.bottom = v;
                    emit();
                  },
                  { disabled: current.marginMode === 'derived' },
                ),
                numberField(
                  t('settings.field.margin-left'),
                  current.margins.left,
                  0,
                  100,
                  (v) => {
                    current.margins.left = v;
                    emit();
                  },
                  { disabled: current.marginMode === 'derived' },
                ),
                numberField(
                  t('settings.field.margin-right'),
                  current.margins.right,
                  0,
                  100,
                  (v) => {
                    current.margins.right = v;
                    emit();
                  },
                  { disabled: current.marginMode === 'derived' },
                ),
              ]),
            ],
          },
          {
            id: 'doc-metadata',
            label: t('settings.section.author-date'),
            build: () => [
              section(t('settings.section.author-date'), [
                metadataField(
                  t('settings.field.author'),
                  current.author,
                  (v) => {
                    current.author = v;
                    emit();
                  },
                ),
                metadataField(
                  t('settings.field.organization'),
                  current.organization,
                  (v) => {
                    current.organization = v;
                    emit();
                  },
                ),
                dateField(
                  current.date.mode,
                  current.date.custom,
                  (mode, custom) => {
                    current.date = { mode, custom };
                    emit();
                    refresh();
                  },
                ),
              ]),
            ],
          },
        ],
      },
      {
        titleKey: 'rail.group.typography',
        items: [
          {
            id: 'typo-fonts',
            label: t('settings.section.fonts'),
            build: () => {
              const active = detectActivePack(current);
              return [
                section(t('settings.section.fonts'), [
                  selectField<FontPackId | ''>(
                    t('settings.field.font-pack'),
                    ['', ...FONT_PACK_IDS],
                    active ?? '',
                    (v) => {
                      if (v === '') return; // Nothing selected — leave as is
                      const pack = FONT_PACKS[v];
                      current.fonts = { ...pack.fonts };
                      current.mathFontSet = pack.mathFontSet;
                      emit();
                      refresh();
                    },
                    (v) =>
                      v === ''
                        ? t('font-pack.custom')
                        : t(`font-pack.${v}` as 'font-pack.fira'),
                  ),
                  fontField(
                    t('settings.field.font-headings'),
                    ['sans', 'serif'],
                    current.fonts.headings,
                    (v) => {
                      current.fonts.headings = v;
                      emit();
                      refresh();
                    },
                  ),
                  fontField(
                    t('settings.field.font-body'),
                    ['sans', 'serif'],
                    current.fonts.body,
                    (v) => {
                      current.fonts.body = v;
                      emit();
                      refresh();
                    },
                  ),
                  fontField(
                    t('settings.field.font-code'),
                    ['mono'],
                    current.fonts.code,
                    (v) => {
                      current.fonts.code = v;
                      emit();
                      refresh();
                    },
                  ),
                  customFontsField(),
                ]),
              ];
            },
          },
          ...(
            [
              'body',
              'title',
              'h1',
              'h2',
              'h3',
              'h4',
              'code-inline',
              'inline-link',
              'metadata',
              'code-block',
              'quote',
              'table',
              'caption',
              'running-content',
            ] as const
          ).map((key) => ({
            id: `typo-${key}`,
            label: t(`element.${key}`),
            build: () => [elementStyleSection(key, current, emit)],
          })),
        ],
      },
      {
        titleKey: 'rail.group.content',
        items: [
          {
            id: 'content-math',
            label: t('settings.section.math'),
            build: () => [
              section(t('settings.section.math'), [
                selectField<MathFontSet>(
                  t('settings.field.math-font-set'),
                  MATH_FONT_SETS,
                  current.mathFontSet,
                  (v) => {
                    current.mathFontSet = v;
                    emit();
                  },
                  (fs) => t(`math-font-set.${fs}`),
                ),
                numberField(
                  t('settings.field.math-scale'),
                  Math.round(current.mathScale * 100),
                  50,
                  200,
                  (v) => {
                    current.mathScale = v / 100;
                    emit();
                  },
                  { step: 5 },
                ),
              ]),
              elementStyleSection('math-block', current, emit),
            ],
          },
          {
            id: 'content-mermaid',
            label: t('settings.section.mermaid'),
            build: () => [
              section(t('settings.section.mermaid'), [
                numberField(
                  t('settings.field.mermaid-scale'),
                  current.mermaidMaxScale,
                  1,
                  4,
                  (v) => {
                    current.mermaidMaxScale = v;
                    emit();
                  },
                  { step: 0.1 },
                ),
                numberField(
                  t('settings.field.mermaid-width'),
                  Math.round(current.mermaidMaxWidthPct * 100),
                  10,
                  100,
                  (v) => {
                    current.mermaidMaxWidthPct = v / 100;
                    emit();
                  },
                  { step: 5 },
                ),
                numberField(
                  t('settings.field.mermaid-height'),
                  Math.round(current.mermaidMaxHeightPct * 100),
                  10,
                  100,
                  (v) => {
                    current.mermaidMaxHeightPct = v / 100;
                    emit();
                  },
                  { step: 5 },
                ),
              ]),
              elementStyleSection('mermaid', current, emit),
            ],
          },
          {
            id: 'content-callout',
            label: t('element.callout'),
            build: () => [elementStyleSection('callout', current, emit)],
          },
        ],
      },
      {
        titleKey: 'rail.group.sync',
        items: [
          {
            id: 'sync-github',
            label: t('settings.section.github'),
            build: () => [buildGithubSection()],
          },
        ],
      },
    ];

    const layout = doc.createElement('div');
    layout.className = 'settings-form settings-layout';

    const rail = doc.createElement('nav');
    rail.className = 'settings-rail';
    rail.setAttribute('aria-label', t('settings.h1'));

    const content = doc.createElement('div');
    content.className = 'settings-content';

    const allItems = railGroups.flatMap((g) => g.items);
    if (!allItems.some((i) => i.id === activeRailId)) {
      activeRailId = allItems[0]?.id ?? '';
    }

    const renderContent = (): void => {
      content.innerHTML = '';
      const item = allItems.find((i) => i.id === activeRailId);
      if (item) content.append(...item.build());
    };

    for (const group of railGroups) {
      const groupEl = doc.createElement('div');
      groupEl.className = 'rail-group';
      const h = doc.createElement('h4');
      h.className = 'rail-group-title';
      h.textContent = t(group.titleKey);
      groupEl.append(h);
      for (const item of group.items) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'rail-item';
        if (item.id === activeRailId) btn.classList.add('active');
        btn.textContent = item.label;
        btn.dataset['railId'] = item.id;
        btn.addEventListener('click', () => {
          activeRailId = item.id;
          for (const b of rail.querySelectorAll<HTMLButtonElement>(
            '.rail-item',
          )) {
            b.classList.toggle('active', b.dataset['railId'] === activeRailId);
          }
          renderContent();
        });
        groupEl.append(btn);
      }
      rail.append(groupEl);
    }

    renderContent();
    layout.append(rail, content);

    return [header, layout];
  };

  /**
   * Purpose: Default settings surface built from a few coherent recipes.
   * How: Each control compiles one orthogonal decision back to PdfSettings;
   *   unmatched legacy/custom values remain valid and appear as "Custom".
   */
  function buildEssentialLayout(): HTMLElement {
    const layout = doc.createElement('div');
    layout.className = 'settings-form settings-essential';

    const intro = doc.createElement('p');
    intro.className = 'settings-essential-intro';
    intro.textContent = t('settings.essential.intro');

    const intent = handlers.getEssentialStyle();
    // Recipe identity comes from the document's semantic frontmatter. Detailed
    // variations can make the compiled settings impossible to recognise as a
    // stock recipe, but must never silently change the selected recipe.
    const model = intent.documentType;
    const appearance = intent.appearance;
    const density = detectDensity(current) ?? intent.density;
    const paragraphSeparation =
      detectParagraphSeparation(current) ?? intent.paragraphs;
    const pagination = detectPaginationStyle(current) ?? intent.pagination;
    const variations = handlers.getVariationKeys();

    const essentialField = (
      key: EssentialFrontmatterKey,
      field: HTMLElement,
    ): HTMLElement => {
      const varied = variations.has(key);
      field.classList.add(
        'settings-origin-field',
        varied ? 'is-variation' : 'is-default',
      );
      const status = doc.createElement('span');
      status.className = 'settings-origin';
      status.textContent = varied
        ? t('settings.origin.variation')
        : t('settings.origin.default');
      const label = field.firstElementChild;
      label?.append(status);
      if (varied) {
        const reset = doc.createElement('button');
        reset.type = 'button';
        reset.className = 'settings-origin-reset';
        reset.textContent = '↶';
        reset.title = t('settings.origin.reset');
        reset.setAttribute('aria-label', t('settings.origin.reset'));
        reset.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          handlers.onResetVariation(key);
        });
        field.append(reset);
      }
      return field;
    };

    const recipeSection = section(t('settings.essential.section.recipe'), [
      essentialField(
        'document-type',
        selectField<DocumentModel | ''>(
          t('settings.essential.model'),
          ['', ...DOCUMENT_MODELS],
          model ?? '',
          (value) => {
            if (!value) return;
            handlers.onChangeRecipe(value, appearance);
          },
          (value) =>
            value === ''
              ? t('settings.essential.custom')
              : t(`settings.essential.model.${value}`),
        ),
      ),
      essentialField(
        'appearance',
        selectField<Appearance | ''>(
          t('settings.essential.appearance'),
          ['', ...APPEARANCES],
          appearance ?? '',
          (value) => {
            if (!value) return;
            handlers.onChangeRecipe(model, value);
          },
          (value) =>
            value === ''
              ? t('settings.essential.custom')
              : t(`settings.essential.appearance.${value}`),
        ),
      ),
    ]);

    const recipeWarning = doc.createElement('p');
    recipeWarning.className = 'settings-recipe-warning';
    recipeWarning.textContent = t('settings.essential.recipe-reset-warning');
    recipeSection.append(recipeWarning);

    const readingSection = section(t('settings.essential.section.reading'), [
      essentialField(
        'body-size',
        numberField(
          t('settings.essential.base-size'),
          current.styles.body.fontSize ?? 11,
          9,
          14,
          (value) => {
            current = applyBaseFontSize(current, value);
            emit('body-size');
            refresh();
          },
          { step: 0.5 },
        ),
      ),
      essentialField(
        'density',
        selectField<Density | ''>(
          t('settings.essential.density'),
          ['', ...DENSITIES],
          density ?? '',
          (value) => {
            if (!value) return;
            current = applyDensity(current, value);
            emit('density');
            refresh();
          },
          (value) =>
            value === ''
              ? t('settings.essential.custom')
              : t(`settings.essential.density.${value}`),
        ),
      ),
      essentialField(
        'paragraphs',
        selectField<ParagraphSeparation | ''>(
          t('settings.essential.paragraph-separation'),
          ['', ...PARAGRAPH_SEPARATIONS],
          paragraphSeparation ?? '',
          (value) => {
            if (!value) return;
            current = applyParagraphSeparation(current, value);
            emit('paragraphs');
            refresh();
          },
          (value) =>
            value === ''
              ? t('settings.essential.custom')
              : t(`settings.essential.paragraph-separation.${value}`),
        ),
      ),
      essentialField(
        'alignment',
        selectField<Align>(
          t('settings.essential.alignment'),
          ['left', 'justify'],
          current.styles.body.align === 'justify' ? 'justify' : 'left',
          (value) => {
            current.styles.body = { ...current.styles.body, align: value };
            emit('alignment');
            refresh();
          },
          (value) => t(`align.${value}` as 'align.left'),
        ),
      ),
      essentialField(
        'accent',
        colorField(
          t('settings.essential.accent'),
          detectAccentColor(current),
          (value) => {
            current = applyAccentColor(current, value);
            emit('accent');
            refresh();
          },
        ),
      ),
    ]);

    const pageSection = section(t('settings.section.page'), [
      essentialField(
        'page-size',
        selectField(
          t('settings.field.page-size'),
          PAGE_SIZES,
          current.pageSize,
          (value) => {
            current.pageSize = value;
            emit('page-size');
            refresh();
          },
          (value) => PAGE_SIZE_LABELS[value],
        ),
      ),
      essentialField(
        'pagination',
        selectField<PaginationStyle | ''>(
          t('settings.essential.pagination'),
          ['', ...PAGINATION_STYLES],
          pagination ?? '',
          (value) => {
            if (!value) return;
            current = applyPaginationStyle(current, value);
            emit('pagination');
            refresh();
          },
          (value) =>
            value === ''
              ? t('settings.essential.custom')
              : t(`settings.essential.pagination.${value}`),
        ),
      ),
      essentialField(
        'notes',
        selectField<PdfSettings['notes']['position']>(
          t('settings.field.notes-position'),
          ['foot', 'end', 'side'],
          current.notes.position,
          (value) => {
            current.notes = { position: value };
            emit('notes');
            refresh();
          },
          (value) => t(`settings.field.notes-position.${value}`),
        ),
      ),
    ]);

    const metadataSection = section(t('settings.section.author-date'), [
      metadataField(t('settings.field.author'), current.author, (value) => {
        current.author = value;
        emit();
      }),
      metadataField(
        t('settings.field.organization'),
        current.organization,
        (value) => {
          current.organization = value;
          emit();
        },
      ),
      dateField(current.date.mode, current.date.custom, (mode, custom) => {
        current.date = { mode, custom };
        emit();
        refresh();
      }),
    ]);

    const advancedHint = doc.createElement('p');
    advancedHint.className = 'settings-essential-hint';
    advancedHint.textContent = t('settings.essential.advanced-hint');

    layout.append(
      intro,
      recipeSection,
      readingSection,
      pageSection,
      metadataSection,
      advancedHint,
    );
    return layout;
  }

  // ---- helpers (closures capturing `doc`) ------------------------------

  function section(title: string, rows: HTMLElement[]): HTMLElement {
    const sec = doc.createElement('section');
    const h = doc.createElement('h3');
    h.textContent = title;
    sec.append(h, ...rows);
    return sec;
  }

  function row(label: string, control: HTMLElement): HTMLElement {
    const wrap = doc.createElement('label');
    wrap.className = 'field';
    const span = doc.createElement('span');
    span.textContent = label;
    wrap.append(span, control);
    return wrap;
  }

  // "Style parent" — the document's `extends` (STACK-SPEC §12.1). Surfaces the
  // parent layer the document inherits from, with a button to change it (opens
  // the layer picker, which writes the leaf's front-matter). Doesn't touch
  // `current` (PdfSettings): the parent lives in the document's `.md`.
  function buildParentStyleSection(): HTMLElement {
    const parent = handlers.getParentStyle();
    const value = doc.createElement('span');
    value.className = 'parent-style-value';
    value.textContent = parent ?? t('settings.parent-style.none');
    const change = doc.createElement('button');
    change.type = 'button';
    change.textContent = t('settings.parent-style.change');
    change.addEventListener('click', () => handlers.onChangeParentStyle());
    const control = doc.createElement('div');
    control.className = 'parent-style-control';
    control.append(value, change);

    const intro = doc.createElement('p');
    intro.className = 'parent-style-intro';
    intro.textContent = t('settings.parent-style.intro');

    const sec = section(t('settings.section.parent-style'), [
      row(t('settings.field.parent-style'), control),
    ]);
    sec.insertBefore(intro, sec.children[1] ?? null);
    return sec;
  }

  // GitHub-sync section (docs/GITHUB-SYNC-SPEC.md, Phase 2). Unlike every
  // other section it doesn't touch `current` (PdfSettings): it persists a
  // fine-grained PAT in IndexedDB (github.ts) and shows the connected user.
  function buildGithubSection(): HTMLElement {
    const intro = doc.createElement('p');
    intro.className = 'github-intro';
    intro.textContent = t('settings.github.intro');

    const tokenInput = doc.createElement('input');
    tokenInput.type = 'password';
    tokenInput.autocomplete = 'off';
    tokenInput.placeholder = t('settings.github.token-placeholder');

    const status = doc.createElement('div');
    status.className = 'github-status';
    status.textContent = t('settings.github.checking');

    const refreshStatus = (): void => {
      status.textContent = t('settings.github.checking');
      void (async () => {
        const tok = await loadToken();
        if (!tok) {
          status.textContent = t('settings.github.disconnected');
          return;
        }
        try {
          const u = await getUser(tok);
          status.textContent = t('settings.github.connected', {
            login: u.login,
          });
        } catch {
          status.textContent = t('settings.github.invalid');
        }
      })();
    };

    const saveBtn = doc.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = t('settings.github.save');
    saveBtn.addEventListener('click', () => {
      const v = tokenInput.value.trim();
      if (v === '') return;
      void saveToken(v).then(refreshStatus);
    });

    const clearBtn = doc.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = t('settings.github.clear');
    clearBtn.addEventListener('click', () => {
      tokenInput.value = '';
      void clearToken().then(refreshStatus);
    });

    const buttons = doc.createElement('div');
    buttons.className = 'toggles';
    buttons.append(saveBtn, clearBtn);

    const createLink = doc.createElement('a');
    createLink.href = 'https://github.com/settings/personal-access-tokens/new';
    createLink.target = '_blank';
    createLink.rel = 'noopener';
    createLink.className = 'github-create-link';
    createLink.textContent = t('settings.github.create');

    const hint = doc.createElement('p');
    hint.className = 'github-hint';
    hint.textContent = t('settings.github.create-hint');

    // Prefill the field if a token is already stored, then show the status.
    void (async () => {
      const tok = await loadToken();
      if (tok) tokenInput.value = tok;
      refreshStatus();
    })();

    return section(t('settings.section.github'), [
      intro,
      row(t('settings.github.token-label'), tokenInput),
      buttons,
      status,
      createLink,
      hint,
    ]);
  }

  function metadataField(
    label: string,
    value: MetadataField,
    onChange: (v: MetadataField) => void,
  ): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = 'field metadata-field';

    const span = doc.createElement('span');
    span.textContent = label;

    const text = doc.createElement('input');
    text.type = 'text';
    text.value = value.text;

    const showCb = checkbox(value.show);
    const boldCb = checkbox(value.bold);

    const fire = (): void => {
      onChange({
        text: text.value,
        show: showCb.checked,
        bold: boldCb.checked,
      });
    };
    text.addEventListener('input', fire);
    showCb.addEventListener('change', fire);
    boldCb.addEventListener('change', fire);

    const toggles = doc.createElement('div');
    toggles.className = 'toggles';
    toggles.append(
      labeled(showCb, t('settings.metadata.show')),
      labeled(boldCb, t('settings.metadata.bold')),
    );

    wrap.append(span, text, toggles);
    return wrap;
  }

  function checkbox(checked: boolean): HTMLInputElement {
    const cb = doc.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    return cb;
  }

  function labeled(input: HTMLInputElement, text: string): HTMLLabelElement {
    const lbl = doc.createElement('label');
    lbl.className = 'show-toggle';
    const span = doc.createElement('span');
    span.textContent = text;
    lbl.append(input, span);
    return lbl;
  }

  function dateField(
    mode: DateMode,
    custom: string,
    onChange: (mode: DateMode, custom: string) => void,
  ): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = 'field date-field';

    const span = doc.createElement('span');
    span.textContent = t('date.field-label');

    const select = doc.createElement('select');
    for (const m of DATE_MODES) {
      const o = doc.createElement('option');
      o.value = m;
      o.textContent = DATE_MODE_LABELS()[m];
      if (m === mode) o.selected = true;
      select.appendChild(o);
    }

    const customInput = doc.createElement('input');
    customInput.type = 'text';
    customInput.value = custom;
    customInput.placeholder = 'ex. Mai 2026';
    customInput.style.display = mode === 'custom' ? '' : 'none';

    select.addEventListener('change', () => {
      const m = select.value as DateMode;
      onChange(m, customInput.value);
    });
    customInput.addEventListener('input', () => {
      onChange(select.value as DateMode, customInput.value);
    });

    wrap.append(span, select, customInput);
    return wrap;
  }

  interface NumberFieldOptions {
    disabled?: boolean;
    step?: number;
  }

  // ---- §9.5 / §9.6 / §9.7 layout settings ---------------------------
  //
  // Five orthogonal levers exposed plus a preset dropdown. The preset
  // detector reverse-maps the current PdfSettings to a preset id when
  // every relevant field matches one of the curated bundles (§9.6.8) —
  // the dropdown shows that id; otherwise it shows "Custom".

  type LayoutPresetId = 'tech-note' | 'report' | 'paper' | 'book' | 'critical';

  const LAYOUT_PRESETS: readonly LayoutPresetId[] = [
    'tech-note',
    'report',
    'paper',
    'book',
    'critical',
  ] as const;

  interface LayoutPresetBundle {
    marginMode: PdfSettings['marginMode'];
    measureChars: number;
    liveAreaChars: number;
    duplex: boolean;
    chapterBreak: PdfSettings['chapterBreak'];
    notesPosition: PdfSettings['notes']['position'];
  }

  const LAYOUT_PRESET_BUNDLES: Record<LayoutPresetId, LayoutPresetBundle> = {
    'tech-note': {
      marginMode: 'derived',
      measureChars: 70,
      liveAreaChars: 90,
      duplex: false,
      chapterBreak: 'none',
      notesPosition: 'foot',
    },
    report: {
      marginMode: 'derived',
      measureChars: 66,
      liveAreaChars: 85,
      duplex: false,
      chapterBreak: 'none',
      notesPosition: 'foot',
    },
    paper: {
      marginMode: 'derived',
      measureChars: 68,
      liveAreaChars: 85,
      duplex: false,
      chapterBreak: 'none',
      notesPosition: 'end',
    },
    book: {
      marginMode: 'derived',
      measureChars: 60,
      liveAreaChars: 80,
      duplex: true,
      chapterBreak: 'next-recto',
      notesPosition: 'foot',
    },
    critical: {
      marginMode: 'derived',
      measureChars: 52,
      liveAreaChars: 85,
      duplex: true,
      chapterBreak: 'next-recto',
      notesPosition: 'side',
    },
  };

  function detectActiveLayoutPreset(s: PdfSettings): LayoutPresetId | null {
    for (const id of LAYOUT_PRESETS) {
      const p = LAYOUT_PRESET_BUNDLES[id];
      if (
        s.marginMode === p.marginMode &&
        s.measureChars === p.measureChars &&
        s.liveAreaChars === p.liveAreaChars &&
        s.duplex === p.duplex &&
        s.chapterBreak === p.chapterBreak &&
        s.notes.position === p.notesPosition
      ) {
        return id;
      }
    }
    return null;
  }

  function applyLayoutPreset(s: PdfSettings, id: LayoutPresetId): void {
    const p = LAYOUT_PRESET_BUNDLES[id];
    s.marginMode = p.marginMode;
    s.measureChars = p.measureChars;
    s.liveAreaChars = p.liveAreaChars;
    s.duplex = p.duplex;
    s.chapterBreak = p.chapterBreak;
    s.notes = { position: p.notesPosition };
  }

  /**
   * Purpose: Render the "Mise en page" rail section — five lever inputs
   *   plus a preset dropdown plus inline validation feedback.
   * How: The `marginMode` selector gates whether `measureChars` /
   *   `liveAreaChars` are editable (only meaningful in 'derived' mode).
   *   Validation issues from `validateLayoutSettings` are rendered as
   *   inline `<p>` warnings/errors below the section so the user sees
   *   the conflict in context.
   */
  function buildLayoutSection(): HTMLElement[] {
    const issues = validateLayoutSettings(current);
    const derived = current.marginMode === 'derived';
    return [
      section(t('settings.section.layout'), [
        // Preset dropdown — '' = Custom (current config does not match any).
        selectField<LayoutPresetId | ''>(
          t('settings.field.preset'),
          ['', ...LAYOUT_PRESETS],
          detectActiveLayoutPreset(current) ?? '',
          (v) => {
            if (v === '') return; // 'Custom' is read-only; selecting it does nothing.
            applyLayoutPreset(current, v);
            emit();
            refresh();
          },
          (v) =>
            v === ''
              ? t('settings.preset.none')
              : t(`settings.preset.${v}` as 'settings.preset.report'),
        ),
        selectField<PdfSettings['marginMode']>(
          t('settings.field.margin-mode'),
          ['manual', 'derived'],
          current.marginMode,
          (v) => {
            current.marginMode = v;
            emit();
            refresh();
          },
          (v) =>
            t(
              `settings.field.margin-mode.${v}` as 'settings.field.margin-mode.manual',
            ),
        ),
        numberField(
          t('settings.field.measure-chars'),
          current.measureChars,
          30,
          100,
          (v) => {
            current.measureChars = v;
            emit();
            refresh();
          },
          { disabled: !derived },
        ),
        numberField(
          t('settings.field.live-area-chars'),
          current.liveAreaChars,
          35,
          120,
          (v) => {
            current.liveAreaChars = v;
            emit();
            refresh();
          },
          { disabled: !derived },
        ),
        checkboxField(t('settings.field.duplex'), current.duplex, (v) => {
          current.duplex = v;
          emit();
          refresh(); // Preset detection depends on duplex.
        }),
        selectField<PdfSettings['chapterBreak']>(
          t('settings.field.chapter-break'),
          ['none', 'next-page', 'next-recto'],
          current.chapterBreak,
          (v) => {
            current.chapterBreak = v;
            emit();
            refresh();
          },
          (v) =>
            t(
              `settings.field.chapter-break.${v}` as 'settings.field.chapter-break.none',
            ),
        ),
        selectField<PdfSettings['notes']['position']>(
          t('settings.field.notes-position'),
          ['foot', 'side', 'end'],
          current.notes.position,
          (v) => {
            current.notes = { position: v };
            emit();
            refresh();
          },
          (v) =>
            t(
              `settings.field.notes-position.${v}` as 'settings.field.notes-position.foot',
            ),
        ),
        ...buildLayoutValidationMessages(issues),
      ]),
    ];
  }

  /**
   * Purpose: Render the validation issues from `validateLayoutSettings`
   *   as inline messages beneath the section's fields.
   * How: One `<p>` per issue, classed `field-warning` or `field-error`
   *   so the existing settings stylesheet can colour-code them. Empty
   *   issues list → empty fragment (no chrome on a healthy config).
   */
  function buildLayoutValidationMessages(
    issues: LayoutValidationIssue[],
  ): HTMLElement[] {
    return issues.map((issue) => {
      const p = doc.createElement('p');
      p.className =
        issue.severity === 'error' ? 'field-error' : 'field-warning';
      p.textContent = issue.message;
      return p;
    });
  }

  function textField(
    label: string,
    value: string,
    placeholder: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const input = doc.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('input', () => onChange(input.value));
    return row(label, input);
  }

  function numberField(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
    options: NumberFieldOptions = {},
  ): HTMLElement {
    const input = doc.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = String(options.step ?? 1);
    input.disabled = options.disabled ?? false;
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    return row(label, input);
  }

  function colorField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    disabled = false,
  ): HTMLElement {
    return row(label, colorPicker(value, onChange, disabled));
  }

  function colorPicker(
    value: string,
    onChange: (v: string) => void,
    disabled = false,
  ): HTMLElement {
    const wrap = doc.createElement('span');
    wrap.className = 'color-picker';

    const swatch = doc.createElement('input');
    swatch.type = 'color';
    swatch.value = value;
    swatch.disabled = disabled;

    const hex = doc.createElement('input');
    hex.type = 'text';
    hex.value = value;
    hex.disabled = disabled;
    hex.size = 7;
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.className = 'hex';

    swatch.addEventListener('input', () => {
      hex.value = swatch.value;
      hex.classList.remove('invalid');
      onChange(swatch.value);
    });

    hex.addEventListener('input', () => {
      const v = hex.value.trim();
      if (HEX_RE.test(v)) {
        hex.classList.remove('invalid');
        swatch.value = v.toLowerCase();
        onChange(v.toLowerCase());
      } else {
        hex.classList.add('invalid');
      }
    });

    wrap.append(swatch, hex);
    return wrap;
  }

  function checkboxField(
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
    disabled = false,
  ): HTMLElement {
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.disabled = disabled;
    input.addEventListener('change', () => onChange(input.checked));
    return row(label, input);
  }

  function selectField<T extends string>(
    label: string,
    options: readonly T[],
    value: T,
    onChange: (v: T) => void,
    formatLabel?: (v: T) => string,
  ): HTMLElement {
    const select = doc.createElement('select');
    for (const opt of options) {
      const o = doc.createElement('option');
      o.value = opt;
      o.textContent = formatLabel ? formatLabel(opt) : opt;
      if (opt === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => onChange(select.value as T));
    return row(label, select);
  }

  // UI-language selector. Switching mutates the locale module's
  // cache + notifies subscribers (cf. setLanguage in i18n/locale.ts).
  // We then refresh() **this** form so the popup (or modal) the
  // user is currently looking at picks up the new strings in place;
  // subscribers handle the rest of the app (toolbar, …).
  function uiLanguageField(): HTMLElement {
    return selectField<Language>(
      t('settings.field.ui-language'),
      ['fr', 'en'],
      getLanguage(),
      (lang) => {
        setLanguage(lang);
        refresh();
      },
      (lang) => (lang === 'fr' ? 'Français' : 'English'),
    );
  }

  // Editor-font selector. Same shape as the UI-language picker: the
  // value lives in localStorage (not in PdfSettings) and a CSS
  // custom property is rewritten on :root, so the change is live —
  // no editor reload needed.
  function editorFontField(): HTMLElement {
    return selectField<EditorFont>(
      t('settings.field.editor-font'),
      ['sans', 'mono', 'serif'],
      getEditorFont(),
      (font) => {
        setEditorFont(font);
      },
      (font) => t(`editor-font.${font}`),
    );
  }

  // Editor text-colour picker. Companion to the editor-font field —
  // both are UI prefs persisted in localStorage and applied via CSS
  // custom property, no editor reload needed.
  function editorTextColorField(): HTMLElement {
    return colorField(
      t('settings.field.editor-text-color'),
      getEditorTextColor(),
      (v) => setEditorTextColor(v),
    );
  }

  function fontField(
    label: string,
    kinds: readonly ('sans' | 'serif' | 'mono')[],
    value: string,
    onChange: (v: string) => void,
    inheritedLabel?: string,
  ): HTMLElement {
    // Custom fonts (user-pasted) appear in every slot regardless of
    // the requested kinds — we don't know if a Google Fonts URL points
    // to a sans / serif / mono family and we shouldn't second-guess
    // the user's intent for their own picks.
    const allowed = getFontCatalog().filter(
      (f) => kinds.includes(f.family) || f.custom,
    );
    const names = allowed.map((f) => f.name);
    if (inheritedLabel !== undefined) {
      if (!names.includes('')) names.unshift('');
    } else if (!names.includes(value)) {
      names.unshift(value);
    }
    return selectField(
      label,
      names,
      value,
      onChange,
      inheritedLabel !== undefined
        ? (v) => (v === '' ? inheritedLabel : v)
        : undefined,
    );
  }

  /**
   * Purpose: Visual side picker for the four `border<Side>` bools.
   * How: One inline `<svg>` with four clickable edges (top / right / bottom
   *   / left). Each click toggles that side's bool on the parent Style via
   *   the same `getStyle()` / `onChange` flow the other attr controls use.
   */
  function borderPicker(
    getStyle: () => Style,
    onChange: (next: Style) => void,
  ): HTMLElement {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 60 40');
    svg.setAttribute('width', '64');
    svg.setAttribute('height', '44');
    svg.classList.add('border-picker');

    // Decorative centre + click rects per side. Layered so the click rects
    // sit on top and capture pointer events.
    const center = doc.createElementNS(NS, 'rect');
    center.setAttribute('x', '14');
    center.setAttribute('y', '11');
    center.setAttribute('width', '32');
    center.setAttribute('height', '18');
    center.setAttribute('fill', 'none');
    center.setAttribute('stroke', '#dfe3e8');
    center.setAttribute('stroke-dasharray', '3 2');
    svg.append(center);

    const sides: Array<{
      key: 'borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft';
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [
      { key: 'borderTop', x: 0, y: 0, w: 60, h: 8 },
      { key: 'borderRight', x: 52, y: 0, w: 8, h: 40 },
      { key: 'borderBottom', x: 0, y: 32, w: 60, h: 8 },
      { key: 'borderLeft', x: 0, y: 0, w: 8, h: 40 },
    ];

    const refresh = (): void => {
      const s = getStyle();
      for (const child of Array.from(svg.querySelectorAll('rect.side'))) {
        const key = child.getAttribute('data-side');
        child.classList.toggle('active', Boolean(s[key as keyof Style]));
      }
    };

    for (const side of sides) {
      const rect = doc.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'side');
      rect.setAttribute('data-side', side.key);
      rect.setAttribute('x', String(side.x));
      rect.setAttribute('y', String(side.y));
      rect.setAttribute('width', String(side.w));
      rect.setAttribute('height', String(side.h));
      rect.addEventListener('click', () => {
        const s = getStyle();
        onChange({ ...s, [side.key]: !s[side.key] });
        refresh();
      });
      svg.append(rect);
    }

    refresh();
    return svg as unknown as HTMLElement;
  }

  // Renders the "Polices personnalisées" sub-row: lists what the user
  // has already added (with a remove button per entry) plus an inline
  // form to paste a fonts.googleapis.com URL. Mutations call
  // registerCustomFonts so the loader and other open pickers see the
  // change immediately, and emit() to persist + repaint.
  function customFontsField(): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = 'custom-fonts-field';

    const lbl = doc.createElement('div');
    lbl.className = 'custom-fonts-label';
    lbl.textContent = t('fonts.custom-fonts-label');
    wrap.append(lbl);

    const list = doc.createElement('ul');
    list.className = 'custom-fonts-list';
    for (const f of current.customFonts) {
      const li = doc.createElement('li');
      const name = doc.createElement('span');
      name.className = 'custom-fonts-name';
      name.textContent = f.name;
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.className = 'custom-fonts-remove';
      remove.textContent = '×';
      remove.title = `Retirer ${f.name}`;
      remove.addEventListener('click', () => {
        current.customFonts = current.customFonts.filter(
          (g) => g.name !== f.name,
        );
        registerCustomFonts(current.customFonts);
        emit();
        // Repaint the whole form so the pickers drop the removed font
        // from their dropdowns.
        refresh();
      });
      li.append(name, remove);
      list.append(li);
    }
    if (current.customFonts.length === 0) {
      const empty = doc.createElement('li');
      empty.className = 'custom-fonts-empty';
      empty.textContent = t('fonts.custom-fonts-empty');
      list.append(empty);
    }
    wrap.append(list);

    const form = doc.createElement('div');
    form.className = 'custom-fonts-form';
    const input = doc.createElement('input');
    input.type = 'url';
    input.placeholder = t('settings.custom-fonts-placeholder');
    input.className = 'custom-fonts-url';
    const add = doc.createElement('button');
    add.type = 'button';
    add.textContent = t('fonts.custom-fonts-add');
    const status = doc.createElement('div');
    status.className = 'custom-fonts-status';

    const tryAdd = (): void => {
      status.textContent = '';
      const result = parseGoogleFontsUrl(input.value);
      if (!result.ok) {
        status.textContent = result.error;
        status.classList.add('error');
        return;
      }
      const existingNames = new Set(current.customFonts.map((f) => f.name));
      const added = result.fonts.filter((f) => !existingNames.has(f.name));
      if (added.length === 0) {
        status.textContent = t('fonts.custom-fonts-already-added');
        status.classList.add('error');
        return;
      }
      current.customFonts = [...current.customFonts, ...added];
      registerCustomFonts(current.customFonts);
      input.value = '';
      status.classList.remove('error');
      emit();
      refresh();
    };
    add.addEventListener('click', tryAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryAdd();
      }
    });

    form.append(input, add);
    wrap.append(form, status);
    return wrap;
  }

  /**
   * Purpose: Build a `<section>` for one ElementKey, listing every attr the
   *   element's descriptor exposes as a labelled row.
   * How: Iterate `ELEMENT_DESCRIPTORS[key].attrs`, dispatch each name through
   *   `attrField`, append; the section title comes from `t('element.<key>')`.
   */
  function elementStyleSection(
    key: ElementKey,
    current: PdfSettings,
    emit: () => void,
  ): HTMLElement {
    const desc = ELEMENT_DESCRIPTORS[key];
    // The getter is called on every attr write so each control merges
    // against the *latest* style — otherwise edits in sibling controls
    // would silently revert because each control would `{...stale, ...}`.
    const getStyle = (): Style => current.styles[key];
    const update = (next: Style): void => {
      current.styles[key] = next;
      emit();
    };
    const rows = desc.attrs.map((attr) => attrField(attr, getStyle, update));
    return section(t(`element.${key}` as 'element.body'), rows);
  }

  /**
   * Purpose: Build a single labelled row for one (attr, value) pair.
   * How: Static switch on `attr` to pick the control kind + sensible
   *   default fallback when the value is unset. The `getStyle` thunk is
   *   re-evaluated on every write so concurrent attr edits compose.
   */
  function attrField(
    attr: AttrName,
    getStyle: () => Style,
    onChange: (next: Style) => void,
  ): HTMLElement {
    const style = getStyle();
    const set = <K extends keyof Style>(k: K, v: Style[K]): void =>
      onChange({ ...getStyle(), [k]: v });
    const label = t(`attr.${attr}` as 'attr.fontSize');
    switch (attr) {
      case 'family':
        return fontField(
          label,
          ['sans', 'serif', 'mono'],
          style.family ?? '',
          (v) => set('family', v || undefined),
          t('attr.inherited'),
        );
      case 'fontSize':
        return numberField(label, style.fontSize ?? 11, 6, 72, (v) =>
          set('fontSize', v),
        );
      case 'color':
        return colorField(label, style.color ?? '#000000', (v) =>
          set('color', v),
        );
      case 'weight':
        return selectField<string>(
          label,
          WEIGHT_OPTIONS.map((w) => String(w.value)),
          String(style.weight ?? 500),
          (v) => set('weight', Number(v)),
          (v) =>
            t(
              `weight.${v}` as
                | 'weight.300'
                | 'weight.400'
                | 'weight.500'
                | 'weight.600'
                | 'weight.700',
            ),
        );
      case 'italic':
        return checkboxField(label, style.italic ?? false, (v) =>
          set('italic', v),
        );
      case 'underline':
        return checkboxField(label, style.underline ?? false, (v) =>
          set('underline', v),
        );
      case 'align':
        return selectField<Align>(
          label,
          ALIGNS,
          style.align ?? 'left',
          (v) => set('align', v),
          (v) => t(`align.${v}` as 'align.left'),
        );
      case 'marginAbove':
        return numberField(
          label,
          style.marginAbove ?? 0,
          0,
          5,
          (v) => set('marginAbove', v),
          { step: 0.1 },
        );
      case 'marginBelow':
        return numberField(
          label,
          style.marginBelow ?? 0,
          0,
          5,
          (v) => set('marginBelow', v),
          { step: 0.1 },
        );
      case 'lineHeight':
        return numberField(
          label,
          style.lineHeight ?? 1.25,
          1,
          3,
          (v) => set('lineHeight', v),
          { step: 0.05 },
        );
      case 'padding':
        return numberField(
          label,
          style.padding ?? 0,
          0,
          3,
          (v) => set('padding', v),
          { step: 0.1 },
        );
      case 'background':
        return colorField(label, style.background ?? '#ffffff', (v) =>
          set('background', v),
        );
      case 'borders':
        return row(label, borderPicker(getStyle, onChange));
      case 'borderColor':
        return colorField(label, style.borderColor ?? '#d0d7de', (v) =>
          set('borderColor', v),
        );
      case 'borderWidth':
        return numberField(label, style.borderWidth ?? 1, 0, 10, (v) =>
          set('borderWidth', v),
        );
      case 'borderRadius':
        return numberField(label, style.borderRadius ?? 0, 0, 20, (v) =>
          set('borderRadius', v),
        );
    }
  }

  refresh();
  return { root, refresh };
}

/**
 * Purpose: Deep copy of a settings value so edits don't mutate the caller's state.
 * How: `structuredClone` — preserves nested objects / arrays without manual walks.
 */
function clone<T>(x: T): T {
  return structuredClone(x);
}
