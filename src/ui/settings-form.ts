// The settings form, factored out of the modal panel so the same DOM
// can live in either an in-app overlay (settings-panel.ts) or a
// detached browser window (settings-window.ts). All helpers are
// closures inside buildSettingsForm and capture `doc` so we can mint
// elements in any window's Document — required because elements
// from window A can't be appended into window B.

import {
  DEFAULT_SETTINGS,
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

export interface SettingsFormHandlers {
  getSettings(): PdfSettings;
  onChange(s: PdfSettings): void;
}

export interface SettingsForm {
  /** The form root element, ready to be appended into the host. */
  root: HTMLElement;
  /** Repaints from the latest settings — used after Reset. */
  refresh(): void;
}

const POSITION_LABELS: Record<PageNumberPosition, string> = {
  none: 'aucun',
  'top-left': 'haut gauche',
  'top-center': 'haut centre',
  'top-right': 'haut droite',
  'bottom-left': 'bas gauche',
  'bottom-center': 'bas centre',
  'bottom-right': 'bas droite',
};

const DATE_MODE_LABELS: Record<DateMode, string> = {
  none: 'Pas de date',
  today: 'Date du jour',
  custom: 'Date personnalisée',
};

const DATE_MODES: DateMode[] = ['none', 'today', 'custom'];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function buildSettingsForm(
  doc: Document,
  handlers: SettingsFormHandlers,
): SettingsForm {
  const root = doc.createElement('div');
  root.className = 'settings-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Réglages PDF');

  let current: PdfSettings = clone(handlers.getSettings());

  const emit = (): void => handlers.onChange(clone(current));
  const refresh = (): void => {
    root.innerHTML = '';
    root.append(...buildContent());
  };

  const buildContent = (): HTMLElement[] => {
    const header = doc.createElement('header');
    const title = doc.createElement('h2');
    title.textContent = 'Réglages PDF';
    header.append(title);

    const form = doc.createElement('div');
    form.className = 'settings-form';

    form.append(
      section('Auteur et date', [
        metadataField('Auteur', current.author, (v) => {
          current.author = v;
          emit();
        }),
        metadataField('Organisation', current.organization, (v) => {
          current.organization = v;
          emit();
        }),
        dateField(current.date.mode, current.date.custom, (mode, custom) => {
          current.date = { mode, custom };
          emit();
          refresh();
        }),
      ]),
      section('Page', [
        selectField(
          'Format',
          PAGE_SIZES,
          current.pageSize,
          (v) => {
            current.pageSize = v;
            emit();
          },
          (v) => PAGE_SIZE_LABELS[v],
        ),
        checkboxField('Justifier le texte', current.justify, (v) => {
          current.justify = v;
          emit();
        }),
        numberField(
          'Interligne',
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
      section('Polices', [
        fontField('Titres', ['sans', 'serif'], current.fonts.headings, (v) => {
          current.fonts.headings = v;
          emit();
        }),
        fontField('Corps', ['sans', 'serif'], current.fonts.body, (v) => {
          current.fonts.body = v;
          emit();
        }),
        fontField('Code', ['mono'], current.fonts.code, (v) => {
          current.fonts.code = v;
          emit();
        }),
        customFontsField(),
      ]),
      section('Marges (mm)', [
        numberField('Haut', current.margins.top, 0, 100, (v) => {
          current.margins.top = v;
          emit();
        }),
        numberField('Bas', current.margins.bottom, 0, 100, (v) => {
          current.margins.bottom = v;
          emit();
        }),
        numberField('Gauche', current.margins.left, 0, 100, (v) => {
          current.margins.left = v;
          emit();
        }),
        numberField('Droite', current.margins.right, 0, 100, (v) => {
          current.margins.right = v;
          emit();
        }),
      ]),
      section('Styles', [
        styleRow('Titre 1 (h1)', current.styles.h1, (s) => {
          current.styles.h1 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
        styleRow('Titre 2 (h2)', current.styles.h2, (s) => {
          current.styles.h2 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
        styleRow('Titre 3 (h3)', current.styles.h3, (s) => {
          current.styles.h3 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
        styleRow('Titre 4 (h4)', current.styles.h4, (s) => {
          current.styles.h4 = s;
          emit();
        }, { underline: true, italic: true, weight: true }),
        styleRow('Texte normal', current.styles.body, (s) => {
          current.styles.body = s;
          emit();
        }),
        styleRow('Code', current.styles.code, (s) => {
          current.styles.code = s;
          emit();
        }),
        styleRow(
          'Citation',
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
          'Barre de citation',
          current.styles.quote.barColor,
          (v) => {
            current.styles.quote.barColor = v;
            emit();
          },
        ),
      ]),
      section('Numéro de page', [
        selectField<PageNumberPosition>(
          'Position',
          PAGE_NUMBER_POSITIONS,
          current.pageNumber.position,
          (v) => {
            current.pageNumber.position = v;
            emit();
          },
          (v) => POSITION_LABELS[v],
        ),
        numberField(
          'Taille (pt)',
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
          'Italique',
          current.pageNumber.style.italics,
          (v) => {
            current.pageNumber.style.italics = v;
            emit();
          },
          current.pageNumber.position === 'none',
        ),
        colorField(
          'Couleur',
          current.pageNumber.style.color,
          (v) => {
            current.pageNumber.style.color = v;
            emit();
          },
          current.pageNumber.position === 'none',
        ),
      ]),
      section('Diagrammes Mermaid', [
        numberField(
          'Agrandissement max.',
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
          'Largeur max. (% du texte)',
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
          'Hauteur max. (% du texte)',
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

    const footer = doc.createElement('footer');
    const resetBtn = button('Réinitialiser', () => {
      current = clone(DEFAULT_SETTINGS);
      emit();
      refresh();
    });
    resetBtn.classList.add('reset');
    footer.append(resetBtn);

    return [header, form, footer];
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
    toggles.append(labeled(showCb, 'Afficher'), labeled(boldCb, 'Gras'));

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
    span.textContent = 'Date';

    const select = doc.createElement('select');
    for (const m of DATE_MODES) {
      const o = doc.createElement('option');
      o.value = m;
      o.textContent = DATE_MODE_LABELS[m];
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
    lbl.textContent = 'Polices Google personnalisées';
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
      empty.textContent = 'Aucune pour le moment.';
      list.append(empty);
    }
    wrap.append(list);

    const form = doc.createElement('div');
    form.className = 'custom-fonts-form';
    const input = doc.createElement('input');
    input.type = 'url';
    input.placeholder = 'https://fonts.googleapis.com/css2?family=…';
    input.className = 'custom-fonts-url';
    const add = doc.createElement('button');
    add.type = 'button';
    add.textContent = 'Ajouter';
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
        status.textContent = 'Déjà ajoutée.';
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
    sizeWrap.append(sizeInput, doc.createTextNode(' pt'));

    wrap.append(lbl, sizeWrap, picker);

    if (opts.weight) {
      const select = doc.createElement('select');
      select.className = 'style-row-weight';
      select.title = 'Graisse';
      for (const opt of WEIGHT_OPTIONS) {
        const o = doc.createElement('option');
        o.value = String(opt.value);
        o.textContent = opt.label;
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
      italicLbl.title = 'Italique';
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
      underlineLbl.title = 'Trait sous le titre';
      const cb = doc.createElement('input');
      cb.type = 'checkbox';
      cb.checked = currentUnderline;
      cb.addEventListener('change', () => {
        currentUnderline = cb.checked;
        fire();
      });
      underlineLbl.append(cb, doc.createTextNode(' trait'));
      wrap.append(underlineLbl);
    }

    return wrap;
  }

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  refresh();
  return { root, refresh };
}

function clone<T>(x: T): T {
  return structuredClone(x);
}
