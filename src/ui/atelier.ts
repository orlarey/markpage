/********************************* ui/atelier ********************************
 *
 * The style atelier (docs/STYLE-EDITOR-SPEC.md) — a live panel that composes a
 * style from the three axes and writes the vocabulary keys into the current
 * document's front-matter. Every change calls `onChange(keys)`; main.ts splices
 * those keys via `setFrontmatterKeys` and the existing render pipeline (which
 * already reads them, slices 1–3) shows the result.
 *
 * Colour is the full map now: a 6×6 saturation × value grid plus a neutral
 * column, element chips dragged onto crans, the hue rotating the whole family —
 * the swatches are cranToHex(hue, cran), the exact colour the render derives.
 *
 *****************************************************************************/

import {
  FONT_PAIRINGS,
  cranToHex,
  parseColorCrans,
  type Cran,
} from '@orlarey/markpage-render';

/** The non-colour style the atelier composes. Colour lives in a `Cran` map. */
export interface AtelierState {
  docType: string; // document-type
  pageSize: string; // page-size
  pair: string; // font-pair
  base: number; // font-base (pt)
  mathScale: number; // math-scale
  hue: number; // color-hue
}

export const DEFAULT_ATELIER_STATE: AtelierState = {
  docType: 'report',
  pageSize: 'A4',
  pair: 'classique',
  base: 10.5,
  mathScale: 1,
  hue: 213,
};

// The default cran family (SPEC §4): page white, near-black body, tinted
// headings/cover, grey apparatus. The map seeds from this; drags edit it.
const DEFAULT_CRANS =
  'page:n0 cover:4,4 titre:4,4 h1:4,3 h2:3,2 corps:n5 notes:n3 code:n4 en-tete:n2 legende:n3';

const GRID = 6; // 6×6 sat×value + a 6-step neutral column (SPEC §4, I3)

const DOC_TYPES: ReadonlyArray<readonly [string, string]> = [
  ['note', 'Note technique'],
  ['report', 'Rapport'],
  ['paper', 'Article'],
  ['book', 'Livre'],
  ['letter', 'Lettre'],
  ['slides', 'Diapos'],
];
const SIZES = ['A4', 'Letter', 'A5', 'B5'];

/** Strip a matching pair of surrounding quotes — front-matter values arrive
 *  from parseStackDoc as raw scalars, and `color-crans` is stored quoted. */
function unquote(v: string): string {
  const t = v.trim();
  return (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

/**
 * Read the atelier's own vocabulary keys back out of a document's front-matter
 * so the panel opens on the style already in the document instead of the
 * defaults — otherwise touching any control would overwrite the existing style
 * from scratch. Missing keys fall back to DEFAULT_ATELIER_STATE; the returned
 * `crans` string is empty when the document declares none (openAtelier then
 * keeps its default family).
 *
 * `fm` is the raw `Map<string,string>` from parseStackDoc(...).frontmatter —
 * the typed Frontmatter interface omits `document-type`, which lives in the
 * stack layer.
 */
export function atelierStateFromFrontmatter(fm: Map<string, string>): {
  state: AtelierState;
  crans: string;
} {
  const raw = (k: string): string | undefined => {
    const v = fm.get(k);
    return v === undefined ? undefined : unquote(v);
  };
  const str = (k: string, d: string): string => {
    const v = raw(k);
    return v && v.trim() ? v.trim() : d;
  };
  const num = (k: string, d: number): number => {
    const v = raw(k);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const D = DEFAULT_ATELIER_STATE;
  return {
    state: {
      docType: str('document-type', D.docType),
      pageSize: str('page-size', D.pageSize),
      pair: str('font-pair', D.pair),
      base: num('font-base', D.base),
      mathScale: num('math-scale', D.mathScale),
      hue: num('color-hue', D.hue),
    },
    crans: raw('color-crans') ?? '',
  };
}

/** Serialize the cran map back to the compact `color-crans` string (SPEC §8). */
export function serializeCrans(crans: Map<string, Cran>): string {
  const jetons: string[] = [];
  for (const [el, c] of crans) {
    jetons.push(`${el}:${c.kind === 'neutral' ? `n${c.g}` : `${c.s},${c.v}`}`);
  }
  return jetons.join(' ');
}

/** State + cran map → the front-matter keys they serialize to (SPEC §8). */
export function buildKeys(
  s: AtelierState,
  crans: Map<string, Cran>,
): Map<string, string> {
  return new Map<string, string>([
    ['document-type', s.docType],
    ['page-size', s.pageSize],
    ['font-pair', s.pair],
    ['font-base', String(s.base)],
    ['math-scale', String(s.mathScale)],
    ['color-hue', String(Math.round(s.hue))],
    ['color-crans', `"${serializeCrans(crans)}"`],
  ]);
}

const CSS = `
.mp-atelier-scrim { position: fixed; inset: 0; background: rgba(20,25,40,.28); z-index: 200; display: flex; justify-content: flex-end; }
.mp-atelier { width: min(440px, 100vw); height: 100%; overflow-y: auto; background: var(--bg,#fff); box-shadow: -8px 0 30px rgba(0,0,0,.2); padding: 1.2rem 1.3rem 2rem; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1f2b; }
.mp-atelier h2 { margin: 0 0 .2rem; font-size: 1.05rem; }
.mp-atelier .sub { margin: 0 0 1.2rem; color: #5c6473; font-size: .85rem; }
.mp-atelier section { border-top: 1px solid #e4e7ee; padding-top: 1rem; margin-top: 1rem; }
.mp-atelier h3 { font-size: .72rem; letter-spacing: .09em; text-transform: uppercase; color: #868d9b; margin: 0 0 .7rem; }
.mp-atelier .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; }
.mp-atelier button.opt { font: inherit; font-size: .82rem; border: 1.5px solid #e4e7ee; background: #fff; border-radius: 8px; padding: .5rem .4rem; cursor: pointer; }
.mp-atelier button.opt.on { border-color: #3b6fb0; box-shadow: 0 0 0 3px rgba(59,111,176,.1); font-weight: 600; }
.mp-atelier .row { display: flex; align-items: center; gap: .7rem; margin: .5rem 0; }
.mp-atelier .row label { font-size: .84rem; color: #5c6473; min-width: 6rem; }
.mp-atelier .row input[type=range] { flex: 1; accent-color: #3b6fb0; }
.mp-atelier .row output { font-variant-numeric: tabular-nums; font-size: .82rem; min-width: 3.2rem; text-align: right; }
.mp-atelier .hue { -webkit-appearance: none; appearance: none; height: 12px; border-radius: 6px; background: linear-gradient(to right, hsl(0,70%,50%), hsl(60,70%,50%), hsl(120,70%,50%), hsl(180,70%,50%), hsl(240,70%,50%), hsl(300,70%,50%), hsl(360,70%,50%)); }
.mp-atelier .hue::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #1a1f2b; cursor: grab; }
.mp-atelier .close { position: absolute; top: .8rem; right: .9rem; border: 0; background: transparent; font-size: 1.3rem; cursor: pointer; color: #5c6473; }
.mp-atelier .note { font-size: .76rem; color: #868d9b; margin-top: .5rem; }
.mp-cmap { display: grid; grid-template-columns: repeat(${GRID + 1}, 1fr); gap: 3px; margin-top: .3rem; }
.mp-cc { position: relative; min-height: 40px; min-width: 0; border-radius: 5px; display: flex; flex-wrap: wrap; gap: 2px; align-content: center; justify-content: center; padding: 2px; cursor: pointer; }
.mp-cc.gray { box-shadow: inset -1px 0 0 #cdd2dc; }
.mp-cc.target { box-shadow: 0 0 0 3px #3b6fb0; }
.mp-cc.bg::after { content: ""; position: absolute; inset: 0; border-radius: 5px; box-shadow: inset 0 0 0 2px #3b6fb0; pointer-events: none; }
.mp-chip { font-size: .6rem; font-weight: 600; line-height: 1; padding: 2px 4px; border-radius: 10px; cursor: grab; user-select: none; white-space: nowrap; border: 1.5px solid rgba(0,0,0,.18); touch-action: none; }
.mp-chip.ghost { position: fixed; z-index: 300; pointer-events: none; transform: translate(-50%,-50%) scale(1.1); }
.mp-caxis { display: flex; justify-content: space-between; font-size: .6rem; letter-spacing: .06em; text-transform: uppercase; color: #868d9b; margin-top: .25rem; }
`;

/**
 * Mount the atelier as an overlay. Returns a teardown. `onChange` fires on every
 * edit with the current front-matter keys; `initial` seeds the non-colour
 * controls and `initialCrans` (a compact `color-crans` string, empty for none)
 * seeds the colour map — pass both from atelierStateFromFrontmatter to edit the
 * document's existing style rather than the defaults.
 */
export function openAtelier(
  initial: AtelierState,
  onChange: (keys: Map<string, string>) => void,
  initialCrans = '',
): () => void {
  const state: AtelierState = { ...initial };
  // Seed the default family, then overlay whatever the document declared, so
  // an element the document omits still gets a chip (and a full round-trip of
  // an atelier-written doc replaces every default).
  const crans = parseColorCrans(DEFAULT_CRANS);
  if (initialCrans)
    for (const [el, c] of parseColorCrans(initialCrans)) crans.set(el, c);

  if (!document.getElementById('mp-atelier-css')) {
    const style = document.createElement('style');
    style.id = 'mp-atelier-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const scrim = document.createElement('div');
  scrim.className = 'mp-atelier-scrim';
  const panel = document.createElement('div');
  panel.className = 'mp-atelier';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Atelier de style');
  scrim.appendChild(panel);

  const emit = (): void => onChange(buildKeys(state, crans));

  const close = (): void => {
    scrim.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) close();
  });
  document.addEventListener('keydown', onKey);

  // ── header ──
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Fermer');
  closeBtn.addEventListener('click', close);
  const h2 = document.createElement('h2');
  h2.textContent = 'Atelier de style';
  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = 'Un style = format × polices × couleur. Écrit dans le document, rendu en direct.';
  panel.append(closeBtn, h2, sub);

  // ── helper: a gallery of option buttons ──
  const gallery = (
    options: ReadonlyArray<readonly [string, string]>,
    current: () => string,
    set: (v: string) => void,
  ): HTMLElement => {
    const grid = document.createElement('div');
    grid.className = 'grid';
    const paint = (): void => {
      for (const b of grid.children) {
        (b as HTMLElement).classList.toggle(
          'on',
          (b as HTMLElement).dataset.v === current(),
        );
      }
    };
    for (const [value, label] of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.dataset.v = value;
      b.textContent = label;
      b.addEventListener('click', () => {
        set(value);
        paint();
        emit();
      });
      grid.appendChild(b);
    }
    paint();
    return grid;
  };

  const slider = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    fmt: (v: number) => string,
    onInput: (() => void) | null = null,
    cls = '',
  ): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    if (cls) input.className = cls;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    const out = document.createElement('output');
    out.textContent = fmt(get());
    input.addEventListener('input', () => {
      set(Number(input.value));
      out.textContent = fmt(get());
      if (onInput) onInput();
      emit();
    });
    row.append(lab, input, out);
    return row;
  };

  // ── Format ──
  const fmt = document.createElement('section');
  const fh = document.createElement('h3');
  fh.textContent = 'Format';
  fmt.append(
    fh,
    gallery(DOC_TYPES, () => state.docType, (v) => (state.docType = v)),
    gallery(
      SIZES.map((s) => [s, s] as const),
      () => state.pageSize,
      (v) => (state.pageSize = v),
    ),
  );

  // ── Fonts ──
  const fonts = document.createElement('section');
  const foh = document.createElement('h3');
  foh.textContent = 'Polices';
  fonts.append(
    foh,
    gallery(
      FONT_PAIRINGS.map((p) => [p.id, p.name] as const),
      () => state.pair,
      (v) => (state.pair = v),
    ),
    slider('Taille de base', 9, 13, 0.5, () => state.base, (v) => (state.base = v), (v) => `${v} pt`),
    slider('Maths', 0.8, 1.2, 0.05, () => state.mathScale, (v) => (state.mathScale = v), (v) => `×${v.toFixed(2)}`),
  );

  // ── Colour map ──
  const col = document.createElement('section');
  const ch = document.createElement('h3');
  ch.textContent = 'Couleur';
  const cmap = document.createElement('div');
  cmap.className = 'mp-cmap';

  // Build the grid: column 0 = neutral (g=row), columns 1..GRID = tint(s,v=row).
  const cells: HTMLElement[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c <= GRID; c++) {
      const cell = document.createElement('div');
      cell.className = 'mp-cc' + (c === 0 ? ' gray' : '');
      if (c === 0) cell.dataset.g = String(r);
      else {
        cell.dataset.s = String(c - 1);
        cell.dataset.v = String(r);
      }
      cmap.appendChild(cell);
      cells.push(cell);
    }
  }
  const cellCran = (el: HTMLElement): Cran =>
    el.dataset.g !== undefined
      ? { kind: 'neutral', g: Number(el.dataset.g) }
      : { kind: 'tint', s: Number(el.dataset.s), v: Number(el.dataset.v) };
  const cellFor = (cran: Cran): HTMLElement =>
    cran.kind === 'neutral'
      ? cells[cran.g * (GRID + 1)]
      : cells[cran.v * (GRID + 1) + cran.s + 1];

  const light = (hex: string): boolean => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
  };

  const renderMap = (): void => {
    for (const cell of cells) {
      cell.style.background = cranToHex(state.hue, cellCran(cell));
      cell.classList.remove('bg');
      for (const chip of [...cell.querySelectorAll('.mp-chip')]) chip.remove();
    }
    for (const [el, cran] of crans) {
      const cell = cellFor(cran);
      const chip = document.createElement('div');
      chip.className = 'mp-chip';
      chip.textContent = el;
      const hex = cranToHex(state.hue, cran);
      chip.style.background = hex;
      chip.style.color = light(hex) ? '#1a1f2b' : '#fff';
      chip.style.borderColor = light(hex) ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.3)';
      attachDrag(chip, el);
      cell.appendChild(chip);
      if (el === 'page' || el === 'cover') cell.classList.add('bg');
    }
  };

  function attachDrag(chip: HTMLElement, el: string): void {
    chip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const ghost = chip.cloneNode(true) as HTMLElement;
      ghost.classList.add('ghost');
      document.body.appendChild(ghost);
      const move = (ev: PointerEvent): void => {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
        for (const c of cells) c.classList.remove('target');
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const cell = under?.closest('.mp-cc');
        if (cell) cell.classList.add('target');
      };
      const up = (ev: PointerEvent): void => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        ghost.remove();
        for (const c of cells) c.classList.remove('target');
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const cell = under?.closest<HTMLElement>('.mp-cc');
        if (cell) {
          crans.set(el, cellCran(cell));
          renderMap();
          emit();
        }
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  const axis = document.createElement('div');
  axis.className = 'mp-caxis';
  axis.innerHTML = '<span>gris · discret → vif</span><span>clair ↑ · sombre ↓</span>';
  const cnote = document.createElement('p');
  cnote.className = 'note';
  cnote.textContent =
    'Glisse une icône sur un cran. page/cover (cerclés) sont les fonds ; la colonne de gauche donne les neutres. La teinte fait pivoter toute la famille.';

  col.append(
    ch,
    slider('Teinte', 0, 359, 1, () => state.hue, (v) => (state.hue = v), (v) => `${Math.round(v)}°`, renderMap, 'hue'),
    cmap,
    axis,
    cnote,
  );

  panel.append(fmt, fonts, col);
  document.body.appendChild(scrim);
  renderMap();

  return close;
}
