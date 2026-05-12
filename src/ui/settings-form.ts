// The settings form, factored out of the modal panel so the same DOM
// can live in either an in-app overlay (settings-panel.ts) or a
// detached browser window (settings-window.ts). All helpers are
// closures inside buildSettingsForm and capture `doc` so we can mint
// elements in any window's Document — required because elements
// from window A can't be appended into window B.

import {
  PAGE_NUMBER_POSITIONS,
  PAGE_SIZES,
  PAGE_SIZE_LABELS,
  WEIGHT_OPTIONS,
  type DateMode,
  type MetadataField,
  type PageNumberPosition,
  type PdfSettings,
  type TextStyle,
} from '../settings';
import {
  getFontCatalog,
  parseGoogleFontsUrl,
  registerCustomFonts,
} from '../font-loader';
import type { ProfileEntry } from '../settings-profiles';
import { getLanguage, setLanguage, type Language } from '../i18n/locale';
import { t } from '../i18n/strings';
import { makeLogo } from './logo';
import { openProfileMenu } from './profile-menu';

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

export interface SettingsFormHandlers extends SettingsProfileHandlers {
  getSettings(): PdfSettings;
  onChange(s: PdfSettings): void;
}

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

export function buildSettingsForm(
  doc: Document,
  handlers: SettingsFormHandlers,
): SettingsForm {
  const root = doc.createElement('div');
  root.className = 'settings-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('settings.h1'));

  let current: PdfSettings = clone(handlers.getSettings());

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
    trigger.textContent = `${currentProfile?.name ?? 'Profile'} ▾`;
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

    const form = doc.createElement('div');
    form.className = 'settings-form';

    form.append(
      // UI language sits at the very top because it's the one
      // setting that doesn't belong to the PdfSettings profile — it
      // lives in the user's localStorage and applies to every doc /
      // profile. Changing it reloads the page (cf. setLanguage).
      section(t('settings.section.ui-language'), [
        uiLanguageField(),
      ]),
      section(t('settings.section.author-date'), [
        metadataField(t('settings.field.author'), current.author, (v) => {
          current.author = v;
          emit();
        }),
        metadataField(t('settings.field.organization'), current.organization, (v) => {
          current.organization = v;
          emit();
        }),
        dateField(current.date.mode, current.date.custom, (mode, custom) => {
          current.date = { mode, custom };
          emit();
          refresh();
        }),
      ]),
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
        checkboxField(t('settings.field.justify'), current.justify, (v) => {
          current.justify = v;
          emit();
        }),
        numberField(
          t('settings.field.line-height'),
          current.lineHeight,
          1,
          2.5,
          (v) => {
            current.lineHeight = v;
            emit();
          },
          { step: 0.05 },
        ),
      ]),
      section(t('settings.section.fonts'), [
        fontField(t('settings.field.font-headings'), ['sans', 'serif'], current.fonts.headings, (v) => {
          current.fonts.headings = v;
          emit();
        }),
        fontField(t('settings.field.font-body'), ['sans', 'serif'], current.fonts.body, (v) => {
          current.fonts.body = v;
          emit();
        }),
        fontField(t('settings.field.font-code'), ['mono'], current.fonts.code, (v) => {
          current.fonts.code = v;
          emit();
        }),
        customFontsField(),
      ]),
      section(t('settings.section.margins'), [
        numberField(t('settings.field.margin-top'), current.margins.top, 0, 100, (v) => {
          current.margins.top = v;
          emit();
        }),
        numberField(t('settings.field.margin-bottom'), current.margins.bottom, 0, 100, (v) => {
          current.margins.bottom = v;
          emit();
        }),
        numberField(t('settings.field.margin-left'), current.margins.left, 0, 100, (v) => {
          current.margins.left = v;
          emit();
        }),
        numberField(t('settings.field.margin-right'), current.margins.right, 0, 100, (v) => {
          current.margins.right = v;
          emit();
        }),
      ]),
      section(t('settings.section.spacing'), [
        numberField(
          t('settings.field.heading-spacing-above'),
          current.headingSpacing.above,
          0,
          5,
          (v) => {
            current.headingSpacing.above = v;
            emit();
          },
          { step: 0.1 },
        ),
        numberField(
          t('settings.field.heading-spacing-below'),
          current.headingSpacing.below,
          0,
          5,
          (v) => {
            current.headingSpacing.below = v;
            emit();
          },
          { step: 0.1 },
        ),
        numberField(
          t('settings.field.paragraph-spacing'),
          current.paragraphSpacing,
          0,
          3,
          (v) => {
            current.paragraphSpacing = v;
            emit();
          },
          { step: 0.1 },
        ),
      ]),
      section(t('settings.section.headings'), [
        styleRow(t('settings.field.h1'), current.styles.h1, (s) => {
          current.styles.h1 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
        styleRow(t('settings.field.h2'), current.styles.h2, (s) => {
          current.styles.h2 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
        styleRow(t('settings.field.h3'), current.styles.h3, (s) => {
          current.styles.h3 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
        styleRow(t('settings.field.h4'), current.styles.h4, (s) => {
          current.styles.h4 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
      ]),
      section(t('settings.section.body'), [
        styleRow(t('settings.field.body-text'), current.styles.body, (s) => {
          current.styles.body = s;
          emit();
        }),
        styleRow(t('settings.field.code-text'), current.styles.code, (s) => {
          current.styles.code = s;
          emit();
        }),
        styleRow(
          t('settings.field.quote'),
          {
            fontSize: current.styles.quote.fontSize,
            color: current.styles.quote.color,
          },
          (s) => {
            current.styles.quote = {
              ...current.styles.quote,
              fontSize: s.fontSize,
              color: s.color,
            };
            emit();
          },
        ),
        colorField(
          t('settings.field.quote-bar'),
          current.styles.quote.barColor,
          (v) => {
            current.styles.quote.barColor = v;
            emit();
          },
        ),
      ]),
      section(t('settings.section.page-number'), [
        selectField<PageNumberPosition>(
          t('settings.field.position'),
          PAGE_NUMBER_POSITIONS,
          current.pageNumber.position,
          (v) => {
            current.pageNumber.position = v;
            emit();
          },
          (v) => POSITION_LABELS()[v],
        ),
        numberField(
          t('settings.field.size-pt'),
          current.pageNumber.style.fontSize,
          5,
          24,
          (v) => {
            current.pageNumber.style.fontSize = v;
            emit();
          },
          { disabled: current.pageNumber.position === 'none' },
        ),
        checkboxField(
          t('settings.field.italic'),
          current.pageNumber.style.italics,
          (v) => {
            current.pageNumber.style.italics = v;
            emit();
          },
          current.pageNumber.position === 'none',
        ),
        colorField(
          t('settings.field.color'),
          current.pageNumber.style.color,
          (v) => {
            current.pageNumber.style.color = v;
            emit();
          },
          current.pageNumber.position === 'none',
        ),
      ]),
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
    );

    // The historical Reset button used to live in a footer here.
    // It moved into the profile dropdown as the "Réinitialiser"
    // footer action (cf. SPEC §9.4.4) — it only ever meant
    // "reset the active profile to defaults", which is now
    // explicit at the call site.
    return [header, form];
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

  function fontField(
    label: string,
    kinds: readonly ('sans' | 'serif' | 'mono')[],
    value: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    // Custom fonts (user-pasted) appear in every slot regardless of
    // the requested kinds — we don't know if a Google Fonts URL points
    // to a sans / serif / mono family and we shouldn't second-guess
    // the user's intent for their own picks.
    const allowed = getFontCatalog().filter(
      (f) => kinds.includes(f.family) || f.custom,
    );
    const names = allowed.map((f) => f.name);
    if (!names.includes(value)) names.unshift(value);
    return selectField(label, names, value, onChange);
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

  function styleRow(
    label: string,
    value: TextStyle,
    onChange: (s: TextStyle) => void,
    opts: { underline?: boolean; italic?: boolean; weight?: boolean } = {},
  ): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = 'style-row';

    const lbl = doc.createElement('span');
    lbl.className = 'style-row-label';
    lbl.textContent = label;

    const sizeInput = doc.createElement('input');
    sizeInput.type = 'number';
    sizeInput.value = String(value.fontSize);
    sizeInput.min = '6';
    sizeInput.max = '72';
    sizeInput.step = '1';
    sizeInput.title = 'Taille (pt)';

    let currentColor = value.color;
    let currentUnderline = value.underline ?? false;
    let currentItalic = value.italic ?? false;
    let currentWeight = value.weight ?? 500;
    const fire = (): void => {
      const fs = Number(sizeInput.value);
      const next: TextStyle = {
        fontSize: Number.isFinite(fs) ? fs : value.fontSize,
        color: currentColor,
      };
      if (opts.underline) next.underline = currentUnderline;
      if (opts.italic) next.italic = currentItalic;
      if (opts.weight) next.weight = currentWeight;
      onChange(next);
    };
    sizeInput.addEventListener('input', fire);

    const picker = colorPicker(value.color, (c) => {
      currentColor = c;
      fire();
    });

    const sizeWrap = doc.createElement('span');
    sizeWrap.className = 'style-size';
    sizeWrap.append(sizeInput, doc.createTextNode(` ${t('settings.unit.pt')}`));

    wrap.append(lbl, sizeWrap, picker);

    if (opts.weight) {
      const select = doc.createElement('select');
      select.className = 'style-row-weight';
      select.title = t('settings.style-row.weight-title');
      for (const opt of WEIGHT_OPTIONS) {
        const o = doc.createElement('option');
        o.value = String(opt.value);
        // Translate the label via the dedicated `weight.<value>` keys
        // rather than trusting whatever was bundled in WEIGHT_OPTIONS.
        const labelKey = `weight.${opt.value}` as
          | 'weight.300'
          | 'weight.400'
          | 'weight.500'
          | 'weight.600'
          | 'weight.700';
        o.textContent = t(labelKey);
        if (opt.value === currentWeight) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => {
        currentWeight = Number(select.value);
        fire();
      });
      wrap.append(select);
    }

    if (opts.italic) {
      const italicLbl = doc.createElement('label');
      italicLbl.className = 'style-row-toggle';
      italicLbl.title = t('settings.style-row.italic-title');
      const cb = doc.createElement('input');
      cb.type = 'checkbox';
      cb.checked = currentItalic;
      cb.addEventListener('change', () => {
        currentItalic = cb.checked;
        fire();
      });
      const i = doc.createElement('i');
      i.textContent = 'i';
      italicLbl.append(cb, doc.createTextNode(' '), i);
      wrap.append(italicLbl);
    }

    if (opts.underline) {
      const underlineLbl = doc.createElement('label');
      underlineLbl.className = 'style-row-toggle';
      underlineLbl.title = t('settings.style-row.underline-title');
      const cb = doc.createElement('input');
      cb.type = 'checkbox';
      cb.checked = currentUnderline;
      cb.addEventListener('change', () => {
        currentUnderline = cb.checked;
        fire();
      });
      underlineLbl.append(
        cb,
        doc.createTextNode(` ${t('settings.style-row.underline')}`),
      );
      wrap.append(underlineLbl);
    }

    return wrap;
  }

  refresh();
  return { root, refresh };
}

function clone<T>(x: T): T {
  return structuredClone(x);
}
