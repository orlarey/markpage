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
  PAGE_NUMBER_POSITIONS,
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
  type PageNumberPosition,
  type PdfSettings,
  type Style,
} from '../settings';
import {
  MATH_FONT_SETS,
  type MathFontSet,
} from '../mathjax-fontsets';
import {
  FONT_PACKS,
  FONT_PACK_IDS,
  detectActivePack,
  type FontPackId,
} from '../font-packs';
import {
  getFontCatalog,
  parseGoogleFontsUrl,
  registerCustomFonts,
} from '../font-loader';
import { displayProfileName, type ProfileEntry } from '../settings-profiles';
import {
  getEditorTextColor,
  setEditorTextColor,
} from '../editor-color';
import {
  getEditorFont,
  setEditorFont,
  type EditorFont,
} from '../editor-font';
import { getLanguage, setLanguage, type Language } from '../i18n/locale';
import { t } from '../i18n/strings';
import { makeLogo } from './logo';
import { openProfileMenu } from './profile-menu';

/**
 * Purpose: Profile-library callbacks consumed by the form's header dropdown.
 * How: One callback per action; footer actions implicitly target the current uuid.
 */
export interface SettingsProfileHandlers {
  getCurrentProfileId(): string;
  listProfiles(): ProfileEntry[];
  onSwitchProfile(uuid: string): void;
  onCreateProfile(): void;
  onRenameProfile(uuid: string, name: string): void;
  // The next four all act on the *current* profile only — the menu
  // surfaces them in its footer, callers know the uuid via
  // `getCurrentProfileId`.
  onDuplicateProfile(uuid: string): void;
  onDeleteProfile(uuid: string): void;
  onResetProfile(): void;
  onImportProfile(): void;
  onExportProfile(): void;
}

/**
 * Purpose: Full settings-form callback set — adds get/set of the active `PdfSettings`.
 * How: Extends `SettingsProfileHandlers` with `getSettings` + `onChange`.
 */
export interface SettingsFormHandlers extends SettingsProfileHandlers {
  getSettings(): PdfSettings;
  onChange(s: PdfSettings): void;
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

// Both label maps are functions so each call respects the active
// locale — relevant when the user picks a fresh locale and we
// rebuild the form before the page reload kicks in.
const POSITION_LABELS = (): Record<PageNumberPosition, string> => ({
  none: t('position.none'),
  'top-left': t('position.top-left'),
  'top-center': t('position.top-center'),
  'top-right': t('position.top-right'),
  'bottom-left': t('position.bottom-left'),
  'bottom-center': t('position.bottom-center'),
  'bottom-right': t('position.bottom-right'),
});

const DATE_MODE_LABELS = (): Record<DateMode, string> => ({
  none: t('date.none'),
  today: t('date.today'),
  custom: t('date.custom'),
});

const DATE_MODES: DateMode[] = ['none', 'today', 'custom'];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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

  // Persisted across refresh() calls so changing one field doesn't
  // bounce the user back to the first rail entry.
  let activeRailId = 'app';

  const emit = (): void => handlers.onChange(clone(current));
  // Re-reads from handlers on every call so callers can refresh after
  // mutating state outside the form (profile switch, Reset, imports).
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
    header.append(title);

    // [Mon profil ▾] trigger anchored in the header, between the
    // title and the optional Close button that settings-panel adds
    // later. Clicking it opens the profile dropdown.
    const profiles = handlers.listProfiles();
    const currentId = handlers.getCurrentProfileId();
    const currentProfile = profiles.find((p) => p.uuid === currentId);
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'profile-trigger';
    trigger.textContent = `${
      currentProfile ? displayProfileName(currentProfile) : 'Profile'
    } ▾`;
    trigger.addEventListener('click', () => {
      const currentUuid = handlers.getCurrentProfileId();
      openProfileMenu(trigger, {
        profiles: handlers.listProfiles(),
        currentUuid,
        onSelect: (uuid) => handlers.onSwitchProfile(uuid),
        onCreate: () => handlers.onCreateProfile(),
        onRenameCurrent: (name) => handlers.onRenameProfile(currentUuid, name),
        onDuplicateCurrent: () => handlers.onDuplicateProfile(currentUuid),
        onDeleteCurrent: () => handlers.onDeleteProfile(currentUuid),
        onResetCurrent: () => handlers.onResetProfile(),
        onImport: () => handlers.onImportProfile(),
        onExport: () => handlers.onExportProfile(),
      });
    });
    header.append(trigger);

    // ---- Rail navigation + content -----------------------------------
    // Each rail entry knows how to (re)build its section content; the
    // active entry's content is the only thing displayed in the right
    // pane. Switching entry rebuilds only that pane.
    const railGroups: Array<{
      titleKey:
        | 'rail.group.app'
        | 'rail.group.document'
        | 'rail.group.typography'
        | 'rail.group.content';
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
            id: 'doc-page',
            label: t('settings.section.page'),
            build: () => [
              section(t('settings.section.page'), [
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
                selectField<PageNumberPosition>(
                  t('settings.field.page-number-position'),
                  PAGE_NUMBER_POSITIONS,
                  current.pageNumber.position,
                  (v) => {
                    current.pageNumber.position = v;
                    emit();
                  },
                  (v) => POSITION_LABELS()[v],
                ),
                numberField(
                  t('settings.field.margin-top'),
                  current.margins.top,
                  0,
                  100,
                  (v) => {
                    current.margins.top = v;
                    emit();
                  },
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
                ),
              ]),
            ],
          },
          {
            id: 'doc-layout',
            label: t('settings.section.layout'),
            build: () => buildLayoutSection(),
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
              'page-number',
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
          for (const b of rail.querySelectorAll<HTMLButtonElement>('.rail-item')) {
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

    // The historical Reset button used to live in a footer here.
    // It moved into the profile dropdown as the "Réinitialiser"
    // footer action (cf. SPEC §9.4.4) — it only ever meant
    // "reset the active profile to defaults", which is now
    // explicit at the call site.
    return [header, layout];
  };

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

  function labeled(
    input: HTMLInputElement,
    text: string,
  ): HTMLLabelElement {
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

  type LayoutPresetId =
    | 'tech-note'
    | 'report'
    | 'paper'
    | 'book'
    | 'critical';

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
    'report': {
      marginMode: 'derived',
      measureChars: 66,
      liveAreaChars: 85,
      duplex: false,
      chapterBreak: 'none',
      notesPosition: 'foot',
    },
    'paper': {
      marginMode: 'derived',
      measureChars: 68,
      liveAreaChars: 85,
      duplex: false,
      chapterBreak: 'none',
      notesPosition: 'end',
    },
    'book': {
      marginMode: 'derived',
      measureChars: 60,
      liveAreaChars: 80,
      duplex: true,
      chapterBreak: 'next-recto',
      notesPosition: 'foot',
    },
    'critical': {
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
        checkboxField(
          t('settings.field.duplex'),
          current.duplex,
          (v) => {
            current.duplex = v;
            emit();
            refresh(); // Preset detection depends on duplex.
          },
        ),
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
    const rows = desc.attrs.map((attr) =>
      attrField(attr, getStyle, update),
    );
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
        return numberField(
          label,
          style.fontSize ?? 11,
          6,
          72,
          (v) => set('fontSize', v),
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
