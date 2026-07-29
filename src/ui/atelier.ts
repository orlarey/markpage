/********************************* ui/atelier ********************************
 *
 * The style atelier (docs/STYLE-EDITOR-SPEC.md) — a live panel that composes a
 * style from the three axes and writes the vocabulary keys into the current
 * document's front-matter. Every change calls `onChange(keys)`; main.ts splices
 * those keys via `setFrontmatterKeys` and the render pipeline shows the result.
 *
 * Three tabs, one axis each, following the `atelier-complet` prototype:
 *   - Format: a gallery of document-type cards, each a mini page diagram
 *     (margins, header band, folio, cover badge, duplex spread) + a size choice.
 *   - Polices: a gallery of pairing cards, each a live type specimen rendered in
 *     the real families + a base size and maths scale.
 *   - Couleur: the 6×6 saturation × value map + neutral column, element chips
 *     dragged onto crans, the hue rotating the whole family (cranToHex swatches).
 *
 *****************************************************************************/

import {
  FONT_PAIRINGS,
  cranToHex,
  parseColorCrans,
  type Cran,
} from '@orlarey/markpage-render';
import { loadGoogleFont } from '../font-loader';

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

/** Layout characteristics per document-type, for the Format gallery's page
 *  diagram + one-line description. Presentation only — the real layout is the
 *  recipe's job; this visualises what picking the type means. */
interface DocLayout {
  label: string;
  desc: string;
  duplex?: boolean;
  header?: boolean;
  folio: 'center' | 'outer' | 'none';
  cover?: boolean;
  landscape?: boolean;
  wide?: boolean;
}
const DOC_TYPES: ReadonlyArray<readonly [string, DocLayout]> = [
  ['note', { label: 'Note technique', desc: 'en-tête + folio', header: true, folio: 'center' }],
  ['report', { label: 'Rapport', desc: 'couverture · folio', folio: 'center', cover: true }],
  ['paper', { label: 'Article', desc: 'marges canon · folio', folio: 'center' }],
  ['book', { label: 'Livre', desc: 'recto-verso · en-têtes', duplex: true, header: true, folio: 'outer', cover: true }],
  ['letter', { label: 'Lettre', desc: 'marges larges', folio: 'none', wide: true }],
  ['slides', { label: 'Diapos', desc: '16:9 · pleine page', folio: 'none', landscape: true }],
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

/** A CSS font-family value for a specimen: the real family + a same-category
 *  system fallback so the specimen still reads before the web font loads. */
function specimenFamily(name: string, kind: 'head' | 'body' | 'mono'): string {
  const generic = kind === 'mono' ? 'monospace' : 'serif, sans-serif';
  return `"${name}", ${generic}`;
}

/** Point size of a specimen line: base · displayScale · ratio^step. */
function stepSize(base: number, ratio: number, step: number, scale: number): string {
  return `${(base * scale * Math.pow(ratio, step)).toFixed(1)}pt`;
}

/** Perceptual-ish lightness test for choosing ink over a swatch/fill. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 140;
}

/** The fixed specimen lines the in-panel preview paints — element name (a cran
 *  key), which family kind, its type-scale step, and the sample text. */
const PV_LINES: ReadonlyArray<{
  cran: string;
  kind: 'head' | 'body' | 'mono';
  step: number;
  text: string;
}> = [
  { cran: 'en-tete', kind: 'head', step: -1, text: 'Note technique' },
  { cran: 'titre', kind: 'head', step: 3, text: 'Un aperçu de TLIB' },
  { cran: 'h1', kind: 'head', step: 2, text: 'Signatures et algèbres' },
  { cran: 'corps', kind: 'body', step: 0, text: "Une seule traversée de l'arbre, plusieurs interprétations : le pli est l'unité de travail." },
  { cran: 'h2', kind: 'head', step: 1, text: 'Le pli comme unité' },
  { cran: 'code', kind: 'mono', step: -0.5, text: 'fold(tree, algebra)' },
  { cran: 'notes', kind: 'body', step: -1, text: "Chaque terme clos se convertit à l'identique." },
];

/** Build one mini page diagram for the Format gallery (or the card thumb).
 *  Margins are expressed as fractions of the box so no measuring is needed. */
function drawPage(
  layout: DocLayout,
  height: number,
  side: 'single' | 'verso' | 'recto',
  isCover: boolean,
): HTMLElement {
  const ratio = layout.landscape ? 9 / 16 : 1.414;
  const w = layout.landscape ? height * (16 / 9) : height / ratio;
  const p = document.createElement('div');
  p.className = 'mp-pg';
  p.style.width = `${w}px`;
  p.style.height = `${height}px`;
  if (isCover) {
    const t = document.createElement('div');
    t.className = 'mp-pg-cover';
    t.innerHTML =
      '<i style="height:3px;opacity:.6"></i><i style="height:2px;width:60%;opacity:.4;margin:2px auto 0"></i>';
    p.appendChild(t);
    return p;
  }
  const mt = height * 0.12;
  const mb = height * 0.15;
  let ml: number;
  let mr: number;
  if (layout.duplex) {
    const inner = w * 0.1;
    const outer = w * 0.19;
    [ml, mr] = side === 'verso' ? [outer, inner] : [inner, outer];
  } else if (layout.wide) {
    ml = mr = w * 0.17;
  } else if (layout.landscape) {
    ml = mr = w * 0.05;
  } else {
    ml = mr = w * 0.13;
  }
  const tb = document.createElement('div');
  tb.className = 'mp-pg-tb';
  tb.style.cssText = `left:${ml}px;top:${mt}px;width:${w - ml - mr}px;height:${height - mt - mb}px`;
  p.appendChild(tb);
  if (layout.header) {
    const b = document.createElement('div');
    b.className = 'mp-pg-band';
    const bw = (w - ml - mr) * 0.5;
    b.style.cssText = `top:${mt * 0.5}px;width:${bw}px;left:${side === 'verso' ? w - mr - bw : ml}px`;
    p.appendChild(b);
  }
  if (layout.folio !== 'none') {
    const f = document.createElement('div');
    f.className = 'mp-pg-folio';
    const left =
      layout.folio === 'center' ? w / 2 - 1.5 : side === 'verso' ? ml * 0.5 : w - mr * 0.5 - 3;
    f.style.left = `${left}px`;
    p.appendChild(f);
  }
  return p;
}

const CSS = `
.mp-atelier-scrim { position: fixed; inset: 0; background: rgba(20,25,40,.28); z-index: 200; display: flex; justify-content: flex-end; }
.mp-atelier { width: min(520px, 100vw); height: 100%; overflow-y: auto; background: #fff; box-shadow: -8px 0 30px rgba(0,0,0,.2); padding: 1.2rem 1.4rem 2.4rem; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1f2b; }
.mp-atelier h2 { margin: 0 0 .2rem; font-size: 1.05rem; }
.mp-atelier .sub { margin: 0 0 1.1rem; color: #5c6473; font-size: .85rem; line-height: 1.4; }
.mp-atelier .close { position: absolute; top: .8rem; right: .9rem; border: 0; background: transparent; font-size: 1.3rem; cursor: pointer; color: #5c6473; }
.mp-atelier .note { font-size: .76rem; color: #868d9b; margin-top: .6rem; line-height: 1.4; }

/* tabs */
.mp-tabs { display: inline-flex; border: 1px solid #cdd2dc; border-radius: 9px; overflow: hidden; margin-bottom: 1.1rem; }
.mp-tabs button { font: inherit; font-size: .85rem; font-weight: 600; border: 0; background: #fff; color: #5c6473; padding: .45rem 1rem; cursor: pointer; border-right: 1px solid #e4e7ee; }
.mp-tabs button:last-child { border-right: 0; }
.mp-tabs button.on { background: #3b6fb0; color: #fff; }
.mp-panel { display: none; }
.mp-panel.on { display: block; }

/* galleries */
.mp-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .7rem; }
.mp-card { border: 1.5px solid #e4e7ee; border-radius: 10px; background: #fff; cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .1s; }
.mp-card:hover { border-color: #cdd2dc; transform: translateY(-1px); }
.mp-card.on { border-color: #3b6fb0; box-shadow: 0 0 0 3px rgba(59,111,176,.1); }
.mp-tpl { padding: .7rem .55rem .6rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: .45rem; }
.mp-tpl .thumb { height: 72px; display: flex; align-items: center; justify-content: center; position: relative; }
.mp-tpl .name { font-weight: 650; font-size: .86rem; }
.mp-tpl .desc { font-size: .68rem; color: #5c6473; line-height: 1.3; }
.mp-pg { background: #fff; border: 1px solid #c7cdd7; border-radius: 2px; position: relative; box-shadow: 0 1px 3px rgba(0,0,0,.14); }
.mp-pg-tb { position: absolute; border: 1px dashed #3b6fb0; opacity: .5; border-radius: 1px; }
.mp-pg-band { position: absolute; height: 2px; background: #3b6fb0; opacity: .5; border-radius: 2px; }
.mp-pg-folio { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #5c6473; bottom: 3px; }
.mp-pg-cover { position: absolute; left: 22%; right: 22%; top: 36%; display: flex; flex-direction: column; gap: 2px; }
.mp-pg-cover i { background: #1a1f2b; border-radius: 1px; display: block; }
.mp-spread { display: flex; gap: 2px; }
.mp-cover-badge { position: absolute; top: -6px; right: -6px; background: #3b6fb0; color: #fff; font-size: .55rem; font-weight: 700; padding: 1px 5px; border-radius: 9px; }
.mp-pair { padding: .8rem .85rem .85rem; display: flex; flex-direction: column; gap: .55rem; text-align: left; }
.mp-pair .s-head { line-height: 1.06; }
.mp-pair .s-body { line-height: 1.35; color: #5c6473; }
.mp-pair .s-code { background: rgba(128,128,128,.1); border-radius: 5px; padding: .2rem .4rem; align-self: flex-start; }
.mp-pair .p-meta { border-top: 1px solid #e4e7ee; padding-top: .45rem; }
.mp-pair .p-name { font-weight: 650; font-size: .86rem; }
.mp-pair .p-char { font-size: .68rem; color: #5c6473; }

/* overrides (size seg, sliders) */
.mp-over { border-top: 1px solid #e4e7ee; margin-top: 1.1rem; padding-top: 1rem; display: grid; gap: .85rem; }
.mp-orow { display: flex; align-items: center; justify-content: space-between; gap: .8rem; flex-wrap: wrap; }
.mp-orow > span { font-size: .84rem; color: #5c6473; }
.mp-seg { display: inline-flex; border: 1px solid #cdd2dc; border-radius: 7px; overflow: hidden; }
.mp-seg button { font: inherit; font-size: .78rem; border: 0; background: #fff; color: #5c6473; padding: .3rem .6rem; cursor: pointer; border-right: 1px solid #e4e7ee; }
.mp-seg button:last-child { border-right: 0; }
.mp-seg button.on { background: #3b6fb0; color: #fff; }
.mp-row { display: flex; align-items: center; gap: .7rem; margin: .1rem 0; }
.mp-row label { font-size: .84rem; color: #5c6473; min-width: 6.5rem; }
.mp-row input[type=range] { flex: 1; accent-color: #3b6fb0; }
.mp-row output { font-variant-numeric: tabular-nums; font-size: .82rem; min-width: 3.4rem; text-align: right; }

/* colour map */
.mp-hue { -webkit-appearance: none; appearance: none; height: 12px; border-radius: 6px; background: linear-gradient(to right, hsl(0,70%,50%), hsl(60,70%,50%), hsl(120,70%,50%), hsl(180,70%,50%), hsl(240,70%,50%), hsl(300,70%,50%), hsl(360,70%,50%)); }
.mp-hue::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #1a1f2b; cursor: grab; }
.mp-cmap { display: grid; grid-template-columns: repeat(${GRID + 1}, 1fr); gap: 3px; margin-top: .3rem; }
.mp-cc { position: relative; min-height: 40px; min-width: 0; border-radius: 5px; display: flex; flex-wrap: wrap; gap: 2px; align-content: center; justify-content: center; padding: 2px; cursor: pointer; }
.mp-cc.gray { box-shadow: inset -1px 0 0 #cdd2dc; }
.mp-cc.target { box-shadow: 0 0 0 3px #3b6fb0; }
.mp-cc.bg::after { content: ""; position: absolute; inset: 0; border-radius: 5px; box-shadow: inset 0 0 0 2px #3b6fb0; pointer-events: none; }
.mp-chip { font-size: .6rem; font-weight: 600; line-height: 1; padding: 2px 4px; border-radius: 10px; cursor: grab; user-select: none; white-space: nowrap; border: 1.5px solid rgba(0,0,0,.18); touch-action: none; }
.mp-chip.ghost { position: fixed; z-index: 300; pointer-events: none; transform: translate(-50%,-50%) scale(1.1); }
.mp-caxis { display: flex; justify-content: space-between; font-size: .6rem; letter-spacing: .06em; text-transform: uppercase; color: #868d9b; margin-top: .25rem; }
@media (prefers-reduced-motion: reduce) { .mp-card { transition: none; } }

/* unified preview */
.mp-pv { display: flex; gap: 8px; align-items: stretch; margin-bottom: 1.2rem; }
.mp-pv-cover { flex: 0 0 92px; border-radius: 6px; border: 1px solid #e4e7ee; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .4rem; padding: .7rem; text-align: center; }
.mp-pv-cover .c-eb { font-size: .5rem; letter-spacing: .13em; text-transform: uppercase; opacity: .75; }
.mp-pv-page { flex: 1; min-width: 0; border-radius: 6px; border: 1px solid #e4e7ee; padding: .8rem .95rem; display: flex; flex-direction: column; gap: .28rem; overflow: hidden; }
.mp-pv-line { margin: 0; overflow-wrap: break-word; }
.mp-pv-line.is-code { border-radius: 5px; padding: .22rem .45rem; align-self: flex-start; background: rgba(128,128,128,.12); }
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

  // Assigned once the in-panel preview is built; emit repaints it on every edit.
  let refreshPreview: () => void = () => {};
  const emit = (): void => {
    onChange(buildKeys(state, crans));
    refreshPreview();
  };

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
  sub.textContent =
    'Un style = format × polices × couleur. Chaque onglet règle un axe ; le document se met à jour en direct.';
  panel.append(closeBtn, h2, sub);

  // ── unified preview (fixed content, all three axes at once) ──
  // The atelier writes the document, so the app's own preview is the source of
  // truth; this in-panel specimen stays visible while you tweak any axis and
  // shows the style on CONSISTENT content, the way the prototype did.
  const pv = document.createElement('div');
  pv.className = 'mp-pv';
  const pvCover = document.createElement('div');
  pvCover.className = 'mp-pv-cover';
  const pvCoverEb = document.createElement('span');
  pvCoverEb.className = 'c-eb';
  pvCoverEb.textContent = 'couverture';
  const pvCoverTitle = document.createElement('span');
  pvCoverTitle.textContent = 'Un aperçu de TLIB';
  pvCover.append(pvCoverEb, pvCoverTitle);
  const pvPage = document.createElement('div');
  pvPage.className = 'mp-pv-page';
  const lineEls = PV_LINES.map((line) => {
    const el = document.createElement('div');
    el.className = 'mp-pv-line' + (line.kind === 'mono' ? ' is-code' : '');
    el.textContent = line.text;
    pvPage.appendChild(el);
    return { ...line, el };
  });
  pv.append(pvCover, pvPage);
  panel.appendChild(pv);

  const renderPreview = (): void => {
    const layout = DOC_TYPES.find(([id]) => id === state.docType)?.[1];
    const pair = FONT_PAIRINGS.find((p) => p.id === state.pair) ?? FONT_PAIRINGS[0];
    const famFor = (kind: 'head' | 'body' | 'mono'): string =>
      specimenFamily(kind === 'mono' ? pair.code : kind === 'head' ? pair.headings : pair.body, kind);
    const colorFor = (name: string): string => {
      const c = crans.get(name);
      return c ? cranToHex(state.hue, c) : '#1a1f2b';
    };
    const hasCover = layout?.cover === true;
    pvCover.style.display = hasCover ? '' : 'none';
    if (hasCover) {
      const bg = colorFor('cover');
      pvCover.style.background = bg;
      const ink = isLight(bg) ? '#1a1f2b' : '#fff';
      pvCover.style.color = ink;
      pvCoverTitle.style.cssText = `font-family:${famFor('head')};font-weight:700;font-size:${stepSize(state.base, pair.ratio, 1, 1.3)};line-height:1.15`;
    }
    pvPage.style.background = colorFor('page');
    for (const line of lineEls) {
      line.el.style.color = colorFor(line.cran);
      line.el.style.fontFamily = famFor(line.kind);
      line.el.style.fontSize = stepSize(state.base, pair.ratio, line.step, 1.3);
      line.el.style.fontWeight = line.kind === 'head' ? '700' : '400';
      line.el.style.lineHeight = line.step >= 2 ? '1.12' : '1.4';
    }
  };
  refreshPreview = renderPreview;

  // ── tabs ──
  const TABS: ReadonlyArray<readonly [string, string]> = [
    ['format', 'Format'],
    ['fonts', 'Polices'],
    ['color', 'Couleur'],
  ];
  const tabsBar = document.createElement('div');
  tabsBar.className = 'mp-tabs';
  const panelFormat = document.createElement('div');
  const panelFonts = document.createElement('div');
  const panelColor = document.createElement('div');
  const panelOf: Record<string, HTMLElement> = {
    format: panelFormat,
    fonts: panelFonts,
    color: panelColor,
  };
  for (const el of Object.values(panelOf)) el.className = 'mp-panel';
  let activeTab = 'format';
  const selectTab = (id: string): void => {
    activeTab = id;
    for (const b of tabsBar.children)
      (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.t === id);
    for (const [k, el] of Object.entries(panelOf)) el.classList.toggle('on', k === id);
  };
  for (const [id, label] of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.t = id;
    b.textContent = label;
    b.addEventListener('click', () => selectTab(id));
    tabsBar.appendChild(b);
  }
  panel.append(tabsBar, panelFormat, panelFonts, panelColor);

  // ── slider helper (fonts + colour) ──
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
    row.className = 'mp-row';
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

  // ══ FORMAT panel ══
  const tplGallery = document.createElement('div');
  tplGallery.className = 'mp-gallery';
  const renderTplGallery = (): void => {
    tplGallery.replaceChildren();
    for (const [id, layout] of DOC_TYPES) {
      const card = document.createElement('div');
      card.className = 'mp-card mp-tpl' + (id === state.docType ? ' on' : '');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (layout.duplex) {
        const spread = document.createElement('div');
        spread.className = 'mp-spread';
        spread.append(drawPage(layout, 64, 'verso', false), drawPage(layout, 64, 'recto', false));
        thumb.appendChild(spread);
      } else {
        thumb.appendChild(drawPage(layout, 64, 'single', false));
      }
      if (layout.cover) {
        const badge = document.createElement('div');
        badge.className = 'mp-cover-badge';
        badge.textContent = 'couv.';
        thumb.appendChild(badge);
      }
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = layout.label;
      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = layout.desc;
      card.append(thumb, name, desc);
      const pick = (): void => {
        state.docType = id;
        renderTplGallery();
        emit();
      };
      card.addEventListener('click', pick);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      });
      tplGallery.appendChild(card);
    }
  };
  const sizeOver = document.createElement('div');
  sizeOver.className = 'mp-over';
  const sizeRow = document.createElement('div');
  sizeRow.className = 'mp-orow';
  const sizeLabel = document.createElement('span');
  sizeLabel.textContent = 'Taille physique';
  const sizeSeg = document.createElement('div');
  sizeSeg.className = 'mp-seg';
  const renderSizeSeg = (): void => {
    sizeSeg.replaceChildren();
    for (const s of SIZES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.classList.toggle('on', s === state.pageSize);
      b.addEventListener('click', () => {
        state.pageSize = s;
        renderSizeSeg();
        emit();
      });
      sizeSeg.appendChild(b);
    }
  };
  sizeRow.append(sizeLabel, sizeSeg);
  sizeOver.appendChild(sizeRow);
  panelFormat.append(tplGallery, sizeOver);

  // ══ FONTS panel ══
  const pairGallery = document.createElement('div');
  pairGallery.className = 'mp-gallery';
  const renderPairGallery = (): void => {
    pairGallery.replaceChildren();
    for (const p of FONT_PAIRINGS) {
      const card = document.createElement('div');
      card.className = 'mp-card mp-pair' + (p.id === state.pair ? ' on' : '');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      const head = document.createElement('div');
      head.className = 's-head';
      head.textContent = 'Signatures';
      head.style.cssText = `font-family:${specimenFamily(p.headings, 'head')};font-weight:700;font-size:${stepSize(state.base, p.ratio, 2, 1.15)}`;
      const body = document.createElement('div');
      body.className = 's-body';
      body.textContent = "Une seule traversée de l'arbre, plusieurs interprétations.";
      body.style.cssText = `font-family:${specimenFamily(p.body, 'body')};font-size:${stepSize(state.base, p.ratio, 0, 1.15)}`;
      const code = document.createElement('div');
      code.className = 's-code';
      code.textContent = 'fold(tree)';
      code.style.cssText = `font-family:${specimenFamily(p.code, 'mono')};font-size:${stepSize(state.base, p.ratio, -0.5, 1.15)}`;
      const meta = document.createElement('div');
      meta.className = 'p-meta';
      const nm = document.createElement('div');
      nm.className = 'p-name';
      nm.textContent = p.name;
      const ch = document.createElement('div');
      ch.className = 'p-char';
      ch.textContent = p.char;
      meta.append(nm, ch);
      card.append(head, body, code, meta);
      const pick = (): void => {
        state.pair = p.id;
        renderPairGallery();
        emit();
      };
      card.addEventListener('click', pick);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      });
      pairGallery.appendChild(card);
    }
  };
  const fontOver = document.createElement('div');
  fontOver.className = 'mp-over';
  fontOver.append(
    slider('Taille de base', 9, 13, 0.5, () => state.base, (v) => (state.base = v), (v) => `${v.toFixed(1).replace('.', ',')} pt`, renderPairGallery),
    slider('Maths', 0.8, 1.2, 0.05, () => state.mathScale, (v) => (state.mathScale = v), (v) => `×${v.toFixed(2)}`),
  );
  panelFonts.append(pairGallery, fontOver);

  // Load the pairing families so the specimens render in the real fonts, then
  // repaint the gallery. Best-effort — a failed load just shows the fallback.
  const families = new Set<string>();
  for (const p of FONT_PAIRINGS) {
    families.add(p.headings);
    families.add(p.body);
    families.add(p.code);
  }
  void Promise.allSettled([...families].map((f) => loadGoogleFont(f))).then(() =>
    renderPairGallery(),
  );

  // ══ COLOUR panel ══
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
      chip.style.color = isLight(hex) ? '#1a1f2b' : '#fff';
      chip.style.borderColor = isLight(hex) ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.3)';
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
  panelColor.append(
    slider('Teinte', 0, 359, 1, () => state.hue, (v) => (state.hue = v), (v) => `${Math.round(v)}°`, renderMap, 'mp-hue'),
    cmap,
    axis,
    cnote,
  );

  // paint everything, show the first tab
  renderTplGallery();
  renderSizeSeg();
  renderPairGallery();
  renderMap();
  renderPreview();
  selectTab(activeTab);

  document.body.appendChild(scrim);
  return close;
}
