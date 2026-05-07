import {
  DEFAULT_SETTINGS,
  PAGE_NUMBER_POSITIONS,
  PAGE_SIZES,
  PAGE_SIZE_LABELS,
  type DateMode,
  type MetadataField,
  type PageNumberPosition,
  type PdfSettings,
  type TextStyle,
} from '../settings';

export interface SettingsPanelHandlers {
  getSettings(): PdfSettings;
  onChange(s: PdfSettings): void;
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

export function openSettingsPanel(handlers: SettingsPanelHandlers): void {
  // Single instance: if already open, focus it.
  if (document.getElementById('settings-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.className = 'settings-overlay';

  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Réglages PDF');

  let current: PdfSettings = clone(handlers.getSettings());

  const emit = () => handlers.onChange(clone(current));
  const rerender = () => {
    panel.innerHTML = '';
    panel.append(...buildContent());
  };

  const buildContent = (): HTMLElement[] => {
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Réglages PDF';
    const closeBtn = button('Fermer', () => close());
    closeBtn.classList.add('close');
    header.append(title, closeBtn);

    const form = document.createElement('div');
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
          rerender();
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
        }),
        styleRow('Titre 2 (h2)', current.styles.h2, (s) => {
          current.styles.h2 = s;
          emit();
        }),
        styleRow('Titre 3 (h3)', current.styles.h3, (s) => {
          current.styles.h3 = s;
          emit();
        }),
        styleRow('Titre 4 (h4)', current.styles.h4, (s) => {
          current.styles.h4 = s;
          emit();
        }),
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
    );

    const footer = document.createElement('footer');
    const resetBtn = button('Réinitialiser', () => {
      current = clone(DEFAULT_SETTINGS);
      emit();
      rerender();
    });
    resetBtn.classList.add('reset');
    footer.append(resetBtn);

    return [header, form, footer];
  };

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  rerender();
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

// ---- helpers ------------------------------------------------------------

function clone<T>(x: T): T {
  return structuredClone(x);
}

function section(title: string, rows: HTMLElement[]): HTMLElement {
  const sec = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = title;
  sec.append(h, ...rows);
  return sec;
}

function row(label: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

// Text input followed by "Afficher" and "Gras" checkboxes. The text stays
// editable so the user can prepare a value without showing it yet.
function metadataField(
  label: string,
  value: MetadataField,
  onChange: (v: MetadataField) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field metadata-field';

  const span = document.createElement('span');
  span.textContent = label;

  const text = document.createElement('input');
  text.type = 'text';
  text.value = value.text;

  const showCb = checkbox(value.show);
  const boldCb = checkbox(value.bold);

  const fire = () => {
    onChange({
      text: text.value,
      show: showCb.checked,
      bold: boldCb.checked,
    });
  };
  text.addEventListener('input', fire);
  showCb.addEventListener('change', fire);
  boldCb.addEventListener('change', fire);

  const toggles = document.createElement('div');
  toggles.className = 'toggles';
  toggles.append(
    labeled(showCb, 'Afficher'),
    labeled(boldCb, 'Gras'),
  );

  wrap.append(span, text, toggles);
  return wrap;
}

function checkbox(checked: boolean): HTMLInputElement {
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  return cb;
}

function labeled(input: HTMLInputElement, text: string): HTMLLabelElement {
  const lbl = document.createElement('label');
  lbl.className = 'show-toggle';
  const span = document.createElement('span');
  span.textContent = text;
  lbl.append(input, span);
  return lbl;
}

const DATE_MODE_LABELS: Record<DateMode, string> = {
  none: 'Pas de date',
  today: 'Date du jour',
  custom: 'Date personnalisée',
};

const DATE_MODES: DateMode[] = ['none', 'today', 'custom'];

function dateField(
  mode: DateMode,
  custom: string,
  onChange: (mode: DateMode, custom: string) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field date-field';

  const span = document.createElement('span');
  span.textContent = 'Date';

  const select = document.createElement('select');
  for (const m of DATE_MODES) {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = DATE_MODE_LABELS[m];
    if (m === mode) o.selected = true;
    select.appendChild(o);
  }

  const customInput = document.createElement('input');
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
  const input = document.createElement('input');
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

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Pairs the native color picker with a text input that displays/accepts the
// hex code, so users can copy and paste colors. Both stay in sync.
function colorPicker(
  value: string,
  onChange: (v: string) => void,
  disabled = false,
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'color-picker';

  const swatch = document.createElement('input');
  swatch.type = 'color';
  swatch.value = value;
  swatch.disabled = disabled;

  const hex = document.createElement('input');
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
  const input = document.createElement('input');
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
  const select = document.createElement('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = formatLabel ? formatLabel(opt) : opt;
    if (opt === value) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => onChange(select.value as T));
  return row(label, select);
}

function styleRow(
  label: string,
  value: TextStyle,
  onChange: (s: TextStyle) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'style-row';

  const lbl = document.createElement('span');
  lbl.className = 'style-row-label';
  lbl.textContent = label;

  const sizeInput = document.createElement('input');
  sizeInput.type = 'number';
  sizeInput.value = String(value.fontSize);
  sizeInput.min = '6';
  sizeInput.max = '72';
  sizeInput.step = '1';
  sizeInput.title = 'Taille (pt)';

  let currentColor = value.color;
  const fireSize = () => {
    const fs = Number(sizeInput.value);
    onChange({
      fontSize: Number.isFinite(fs) ? fs : value.fontSize,
      color: currentColor,
    });
  };
  sizeInput.addEventListener('input', fireSize);

  const picker = colorPicker(value.color, (c) => {
    currentColor = c;
    onChange({
      fontSize: Number(sizeInput.value) || value.fontSize,
      color: c,
    });
  });

  const sizeWrap = document.createElement('span');
  sizeWrap.className = 'style-size';
  sizeWrap.append(sizeInput, document.createTextNode(' pt'));

  wrap.append(lbl, sizeWrap, picker);
  return wrap;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
