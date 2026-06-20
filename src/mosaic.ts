/********************************* mosaic.ts ***********************************
 *
 * Purpose: Render the ` ```mosaic ` fence — an image wall (justified gallery).
 *   Whole images (never cropped) are packed into rows that each fill the
 *   content width exactly; row heights vary; no gaps by default. See
 *   MOSAIC-SPEC.md.
 * How: Two phases. (1) Sync, in marked-config: parse the info string + body
 *   and emit a placeholder holding the <img> list + options. (2) Async, in
 *   main.ts's preview pass: measure each image's aspect ratio, run the greedy
 *   row packing (`packRows`), and lay out the rows. The parsing + packing are
 *   pure and unit-tested here; the DOM phases live in `renderMosaic` /
 *   `layoutMosaicBlocks`.
 *
 *******************************************************************************/

import { parseFenceInfo } from './captions';

// --- options + info-string --------------------------------------------

export interface MosaicOptions {
  // Target row height in pt (undefined ⇒ auto, ≈ 1/5 of the content height).
  height?: number;
  // Gutter between images and between rows, in pt (0 ⇒ jointless wall).
  gap: number;
  // Leave the last (partial) row at natural height instead of justifying it.
  lastNatural: boolean;
}

export interface MosaicInfo {
  caption: string | null;
  label: string | null;
  options: MosaicOptions;
}

/** All-default options. */
export function defaultMosaicOptions(): MosaicOptions {
  return { gap: 0, lastNatural: false };
}

/** Parse the `key=value` options trailing a mosaic info string. */
function parseMosaicOptions(args: string[]): MosaicOptions {
  const o = defaultMosaicOptions();
  for (const a of args) {
    const eq = a.indexOf('=');
    if (eq <= 0) continue;
    const key = a.slice(0, eq).toLowerCase();
    const value = a.slice(eq + 1).trim();
    if (key === 'height') {
      const n = Number.parseFloat(value);
      if (!Number.isNaN(n) && n > 0) o.height = n;
    } else if (key === 'gap') {
      const n = Number.parseFloat(value);
      if (!Number.isNaN(n) && n >= 0) o.gap = n;
    } else if (key === 'last') {
      if (value.toLowerCase() === 'natural') o.lastNatural = true;
    }
  }
  return o;
}

/**
 * Purpose: Parse a mosaic fence info string into caption / label / options.
 * How: Reuse the shared caption parser (quoted title + `\label{}`); the
 *   remaining bare words are the `key=value` options. Mosaic has no `type`
 *   positional, and its options carry no quotes, so the generic parser is safe.
 */
export function parseMosaicInfo(lang: string): MosaicInfo {
  const { args, caption, label } = parseFenceInfo(lang);
  return { caption, label, options: parseMosaicOptions(args) };
}

// --- body (image list) ------------------------------------------------

export interface MosaicImage {
  src: string;
  alt: string;
}

const IMG_LINE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/;

/**
 * Purpose: Extract the ordered image list from a mosaic body — one Markdown
 *   image per line; blank / non-image lines are skipped.
 */
export function parseMosaicBody(text: string): MosaicImage[] {
  const out: MosaicImage[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const m = IMG_LINE_RE.exec(line);
    if (m) out.push({ alt: m[1] ?? '', src: m[2] ?? '' });
  }
  return out;
}

// --- packing (pure) ---------------------------------------------------

export interface MosaicRow {
  // Row height in the same unit as `contentW` (px in practice).
  height: number;
  // Whether the row was justified to the full width (false ⇒ natural last row).
  justified: boolean;
  items: { index: number; width: number }[];
}

/**
 * Purpose: Greedy justified-rows packing (MOSAIC-SPEC §4).
 * How: Accumulate images into a row; the height that makes the row fill
 *   `contentW` is `h = (contentW - gap·(n-1)) / Σr`. Close the row once that
 *   height drops to / below the target `targetH`. The leftover partial row is
 *   justified too, unless `lastNatural` keeps it at `targetH`.
 *
 * @param ratios   aspect ratio (w/h) of each image, in source order
 * @param contentW available content width (px)
 * @param targetH  target row height (px)
 * @param gap      gutter between images (px)
 */
export function packRows(
  ratios: number[],
  contentW: number,
  targetH: number,
  gap: number,
  lastNatural: boolean,
): MosaicRow[] {
  const rows: MosaicRow[] = [];
  const emit = (idx: number[], h: number, justified: boolean): void => {
    rows.push({
      height: h,
      justified,
      items: idx.map((i) => ({ index: i, width: ratios[i] * h })),
    });
  };

  let row: number[] = [];
  let sumR = 0;
  for (let i = 0; i < ratios.length; i += 1) {
    row.push(i);
    sumR += ratios[i] ?? 0;
    const n = row.length;
    const h = (contentW - gap * (n - 1)) / (sumR || 1);
    if (h <= targetH) {
      emit(row, h, true);
      row = [];
      sumR = 0;
    }
  }
  if (row.length > 0) {
    const n = row.length;
    const h = (contentW - gap * (n - 1)) / (sumR || 1);
    if (lastNatural && h > targetH) emit(row, targetH, false);
    else emit(row, h, true);
  }
  return rows;
}

// --- DOM phase 1: sync placeholder (marked-config) --------------------

function escAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Purpose: Emit the sync placeholder for a mosaic fence — the ordered <img>
 *   list (refs already expanded to blob URLs upstream) plus the options as
 *   data-attributes. `layoutMosaicBlocks` turns it into rows in the async pass.
 */
export function renderMosaic(body: string, options: MosaicOptions): string {
  const imgs = parseMosaicBody(body);
  if (imgs.length === 0) {
    return `<div class="mosaic-error">Aucune image dans le mur</div>`;
  }
  const items = imgs
    .map(
      (im) =>
        `<img class="mosaic-item" src="${escAttr(im.src)}" alt="${escAttr(im.alt)}" />`,
    )
    .join('');
  const heightAttr =
    options.height !== undefined ? ` data-height="${options.height}"` : '';
  return (
    `<div class="mosaic-block" data-mosaic data-gap="${options.gap}"` +
    ` data-last="${options.lastNatural ? 'natural' : 'justify'}"${heightAttr}>` +
    `${items}</div>\n`
  );
}

// --- DOM phase 2: async measure + layout (main.ts preview pass) -------

const PT_TO_PX = 96 / 72;
const FALLBACK_RATIO = 3 / 2; // 3:2 when an image can't be measured

interface PageGeom {
  width: number;
  height: number;
}

/** Aspect ratio of a (possibly still-loading) image; 3:2 fallback on failure. */
async function measureRatio(img: HTMLImageElement): Promise<number> {
  try {
    if (!img.complete || img.naturalWidth === 0) await img.decode();
  } catch {
    /* decode failed — fall through to the natural-size check */
  }
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    return img.naturalWidth / img.naturalHeight;
  }
  img.classList.add('mosaic-missing');
  return FALLBACK_RATIO;
}

function buildRowEl(
  row: MosaicRow,
  imgs: HTMLImageElement[],
  gap: number,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mosaic-row';
  el.style.height = `${row.height.toFixed(2)}px`;
  if (gap > 0) el.style.gap = `${gap}px`;
  if (!row.justified) el.classList.add('mosaic-row-natural');
  for (const item of row.items) {
    const img = imgs[item.index];
    if (!img) continue;
    if (row.justified) {
      // flex-grow ∝ ratio → the row fills its real width regardless of the
      // measured estimate; height is the packed value.
      img.style.flex = `${item.width / row.height} 1 0`;
      img.style.width = '';
    } else {
      // natural last row: keep intrinsic sizes, left-aligned.
      img.style.flex = '0 0 auto';
      img.style.width = `${item.width.toFixed(2)}px`;
    }
    el.appendChild(img);
  }
  return el;
}

/**
 * Purpose: Turn every mosaic placeholder under `root` into packed rows.
 * How: Measure each image's ratio, run `packRows`, then rebuild the block's
 *   children as `.mosaic-row` elements. Idempotent (clears `data-mosaic`).
 */
export async function layoutMosaicBlocks(
  root: HTMLElement,
  geom: PageGeom,
): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>('.mosaic-block[data-mosaic]');
  for (const block of blocks) {
    const imgs = [
      ...block.querySelectorAll<HTMLImageElement>('img.mosaic-item'),
    ];
    if (imgs.length === 0) continue;
    const ratios = await Promise.all(imgs.map(measureRatio));
    const gap = (Number.parseFloat(block.dataset['gap'] ?? '0') || 0) * PT_TO_PX;
    const heightPt = Number.parseFloat(block.dataset['height'] ?? '');
    const targetH =
      Number.isNaN(heightPt) || heightPt <= 0
        ? geom.height / 5
        : heightPt * PT_TO_PX;
    const lastNatural = block.dataset['last'] === 'natural';
    const rows = packRows(ratios, geom.width, targetH, gap, lastNatural);
    block.replaceChildren(...rows.map((r) => buildRowEl(r, imgs, gap)));
    if (gap > 0) block.style.gap = `${gap}px`; // vertical gutter between rows
    block.removeAttribute('data-mosaic');
  }
}
