/********************************* ui/atelier ********************************
 *
 * The style atelier (docs/STYLE-EDITOR-SPEC.md) — a live panel that composes a
 * style from the three axes and writes the vocabulary keys into the current
 * document's front-matter. Every change calls `onChange(keys)`; main.ts splices
 * those keys via `setFrontmatterKeys` and the existing render pipeline (which
 * already reads them, slices 1–3) shows the result.
 *
 * This first cut ships the format + fonts galleries and the colour HUE with a
 * sensible fixed cran family; per-element cran editing (the drag map) is the
 * next enrichment. Kept host-simple: plain DOM + a scoped <style>, no framework.
 *
 *****************************************************************************/

import { FONT_PAIRINGS } from '@orlarey/markpage-render';

/** The style the atelier composes, 1:1 with the front-matter vocabulary. */
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

// A clean, hue-rotatable colour family (SPEC §4 crans): page white, near-black
// body, tinted headings/cover, grey apparatus. The atelier writes this verbatim
// and only rotates `color-hue` for now.
const DEFAULT_CRANS =
  'page:n0 cover:4,4 titre:4,4 h1:4,3 h2:3,2 corps:n5 notes:n3 code:n4 en-tete:n2 legende:n3';

const DOC_TYPES: ReadonlyArray<readonly [string, string]> = [
  ['note', 'Note technique'],
  ['report', 'Rapport'],
  ['paper', 'Article'],
  ['book', 'Livre'],
  ['letter', 'Lettre'],
  ['slides', 'Diapos'],
];
const SIZES = ['A4', 'Letter', 'A5', 'B5'];

/** Turn a state into the front-matter keys it serializes to (SPEC §8). */
export function stateToKeys(s: AtelierState): Map<string, string> {
  return new Map<string, string>([
    ['document-type', s.docType],
    ['page-size', s.pageSize],
    ['font-pair', s.pair],
    ['font-base', String(s.base)],
    ['math-scale', String(s.mathScale)],
    ['color-hue', String(Math.round(s.hue))],
    ['color-crans', `"${DEFAULT_CRANS}"`],
  ]);
}

const CSS = `
.mp-atelier-scrim { position: fixed; inset: 0; background: rgba(20,25,40,.28); z-index: 200; display: flex; justify-content: flex-end; }
.mp-atelier { width: min(420px, 100vw); height: 100%; overflow-y: auto; background: var(--bg,#fff); box-shadow: -8px 0 30px rgba(0,0,0,.2); padding: 1.2rem 1.3rem 2rem; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1f2b; }
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
.mp-atelier .note { font-size: .76rem; color: #868d9b; margin-top: .4rem; }
`;

/**
 * Mount the atelier as an overlay. Returns a teardown. `onChange` fires on every
 * edit with the current front-matter keys; `initial` seeds the controls.
 */
export function openAtelier(
  initial: AtelierState,
  onChange: (keys: Map<string, string>) => void,
): () => void {
  const state: AtelierState = { ...initial };

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

  const emit = (): void => onChange(stateToKeys(state));

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

  // ── Colour ──
  const col = document.createElement('section');
  const ch = document.createElement('h3');
  ch.textContent = 'Couleur';
  const hue = slider('Teinte', 0, 359, 1, () => state.hue, (v) => (state.hue = v), (v) => `${Math.round(v)}°`, 'hue');
  const cnote = document.createElement('p');
  cnote.className = 'note';
  cnote.textContent = 'La teinte fait pivoter toute la famille. Édition par élément (la carte) à venir.';
  col.append(ch, hue, cnote);

  panel.append(fmt, fonts, col);
  document.body.appendChild(scrim);

  return close;
}
