/******************************* atomic-fit.ts *******************************
 *
 * Purpose: Enforce the pagination contract for genuinely indivisible render
 *   objects. A marked atomic object is never fragmented: it either fits the
 *   normal text area, is reduced there, or gets a dedicated page where it may
 *   borrow the margins before being reduced further.
 * How: `markAtomicBlocks()` promotes renderer-level `.block-rigid` nodes (and
 *   the few other intrinsically indivisible constructs) to one outer
 *   `.mp-atomic` boundary. `fitAtomicBlocks()` consumes real browser
 *   measurements taken at the final text width and applies either CSS `zoom`
 *   or an absolutely-positioned dedicated-page wrapper.
 *
 ****************************************************************************/

export const ATOMIC_MARGIN_BORROW_THRESHOLD = 0.65;

export interface AtomicPageGeometryPx {
  textWidth: number;
  textHeight: number;
  pageWidth: number;
  pageHeight: number;
  /** Text-area origin on a recto/simplex page, relative to the physical page. */
  textLeftRecto: number;
  /** Text-area origin on a verso page (same as recto in simplex mode). */
  textLeftVerso: number;
  textTop: number;
  /** Physical trim safety retained even when the margins are borrowed. */
  safety: number;
}
export type AtomicFitMode = 'none' | 'text' | 'page';

export interface AtomicFitDecision {
  mode: AtomicFitMode;
  scale: number;
}

export interface AtomicFitResult extends AtomicFitDecision {
  element: HTMLElement;
  width: number;
  height: number;
}

export interface AtomicFitOptions {
  threshold?: number;
  onWarning?: (result: AtomicFitResult) => void;
}

const ATOMIC_SEED_SELECTOR =
  '.block-rigid, img, .demo-block, .mosaic-row';

/** Decide which containment zone an already-measured atomic block needs. */
export function atomicFitDecision(
  width: number,
  height: number,
  geometry: AtomicPageGeometryPx,
  threshold = ATOMIC_MARGIN_BORROW_THRESHOLD,
): AtomicFitDecision {
  if (!(width > 0) || !(height > 0)) return { mode: 'none', scale: 1 };
  const textScale = Math.min(
    1,
    geometry.textWidth / width,
    geometry.textHeight / height,
  );
  if (textScale >= 1) return { mode: 'none', scale: 1 };
  if (textScale >= threshold) return { mode: 'text', scale: textScale };

  const expandedWidth = Math.max(1, geometry.pageWidth - 2 * geometry.safety);
  const expandedHeight = Math.max(1, geometry.pageHeight - 2 * geometry.safety);
  return {
    mode: 'page',
    scale: Math.min(1, expandedWidth / width, expandedHeight / height),
  };
}

/** Return the semantic outer boundary for one intrinsically atomic seed. */
function atomicBoundary(seed: HTMLElement, root: HTMLElement): HTMLElement {
  const figure = seed.closest<HTMLElement>('figure.captioned');
  if (figure && root.contains(figure)) return figure;

  if (seed.tagName.toLowerCase() === 'img') {
    const row = seed.closest<HTMLElement>('.mosaic-row');
    if (row && root.contains(row)) return row;
    const parent = seed.parentElement;
    if (
      parent?.tagName.toLowerCase() === 'p' &&
      parent.children.length === 1 &&
      (parent.textContent ?? '').trim() === ''
    ) {
      return parent;
    }
  }
  return seed;
}

/**
 * Mark every genuinely indivisible object with one outer `.mp-atomic` class.
 * Idempotent; nested renderer markers collapse to their caption/mosaic parent.
 */
export function markAtomicBlocks(root: HTMLElement): HTMLElement[] {
  const boundaries = new Set<HTMLElement>();
  for (const seed of root.querySelectorAll<HTMLElement>(ATOMIC_SEED_SELECTOR)) {
    boundaries.add(atomicBoundary(seed, root));
  }
  const ordered = [...boundaries].filter(
    (candidate) =>
      ![...boundaries].some(
        (other) => other !== candidate && other.contains(candidate),
      ),
  );
  for (const el of ordered) el.classList.add('mp-atomic');
  return ordered;
}

function numericZoom(el: HTMLElement): number {
  const raw = el.ownerDocument.defaultView?.getComputedStyle(el).zoom;
  const parsed = Number.parseFloat(raw ?? '1');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function setScaleMetadata(el: HTMLElement, scale: number, mode: AtomicFitMode): void {
  el.dataset.mpAtomicScale = scale.toFixed(4);
  el.dataset.mpAtomicFit = mode;
}

/**
 * Fit marked atomic blocks using real layout measurements. `root` must be
 * mounted and styled at `geometry.textWidth` when this function is called.
 */
export function fitAtomicBlocks(
  root: HTMLElement,
  geometry: AtomicPageGeometryPx,
  options: AtomicFitOptions = {},
): AtomicFitResult[] {
  const results: AtomicFitResult[] = [];
  const atomics = markAtomicBlocks(root);
  for (const element of atomics) {
    if (element.closest('.mp-atomic-page')) continue;
    const rect = element.getBoundingClientRect();
    const width = Math.max(rect.width, element.scrollWidth);
    const height = Math.max(rect.height, element.scrollHeight);
    const decision = atomicFitDecision(
      width,
      height,
      geometry,
      options.threshold,
    );
    const result: AtomicFitResult = { element, width, height, ...decision };
    results.push(result);
    if (decision.mode === 'none') continue;

    if (decision.mode === 'text') {
      const baseZoom = numericZoom(element);
      element.style.zoom = String(baseZoom * decision.scale);
      element.classList.add('mp-atomic-fitted');
      setScaleMetadata(element, decision.scale, decision.mode);
      options.onWarning?.(result);
      continue;
    }

    const doc = element.ownerDocument;
    const baseZoom = numericZoom(element);
    const page = doc.createElement('div');
    page.className = 'mp-atomic-page';
    page.style.setProperty('--mp-atomic-text-height', `${geometry.textHeight}px`);
    page.style.setProperty(
      '--mp-atomic-center-x-recto',
      `${geometry.pageWidth / 2 - geometry.textLeftRecto}px`,
    );
    page.style.setProperty(
      '--mp-atomic-center-x-verso',
      `${geometry.pageWidth / 2 - geometry.textLeftVerso}px`,
    );
    page.style.setProperty(
      '--mp-atomic-center-y',
      `${geometry.pageHeight / 2 - geometry.textTop}px`,
    );

    const positioned = doc.createElement('div');
    positioned.className = 'mp-atomic-page-content';
    positioned.style.width = `${width / baseZoom}px`;
    positioned.style.height = `${height / baseZoom}px`;
    positioned.style.setProperty('--mp-atomic-page-scale', String(decision.scale));

    element.before(page);
    page.appendChild(positioned);
    positioned.appendChild(element);
    element.classList.add('mp-atomic-fitted');
    setScaleMetadata(element, decision.scale, decision.mode);
    options.onWarning?.(result);
  }
  return results;
}
