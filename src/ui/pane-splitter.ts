/********************************* pane-splitter.ts ***************************
 *
 * Purpose: Make the vertical divider between the editor and the preview
 *   draggable, so the user can give either view more room (split view only).
 * How: The `#panes` grid's editor column is a CSS variable `--mp-split`
 *   expressed in `fr` units (editor : preview ratio). Dragging the gutter
 *   rewrites that ratio; because it's `fr`, the split stays proportional when
 *   the window resizes — no resize handler needed. The ratio is clamped so
 *   neither pane collapses, persisted to localStorage, and also nudgeable by
 *   keyboard (the gutter is a focusable `separator`). Double-click resets to
 *   an even 50/50 split.
 *
 *******************************************************************************/

const STORAGE_KEY = 'markpage:split-ratio';
const GUTTER_PX = 6;
const MIN_PANE_PX = 220; // neither editor nor preview may shrink below this
const MIN_RATIO = 0.18;
const MAX_RATIO = 5.5;
const KEY_STEP = 0.12; // ratio change per arrow-key press

function clampRatio(r: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

/** Apply an editor:preview ratio to the grid (or clear it → even 50/50). */
function applyRatio(panes: HTMLElement, ratio: number | null): void {
  if (ratio === null) panes.style.removeProperty('--mp-split');
  else panes.style.setProperty('--mp-split', `${ratio}fr`);
}

/**
 * Purpose: Wire the drag / keyboard / reset behaviour on the resizer gutter.
 * How: Pointer events with pointer capture for a smooth drag; the ratio is the
 *   editor width over the preview width, both measured from the live pane rect.
 */
export function initPaneSplitter(
  panes: HTMLElement,
  resizer: HTMLElement,
): void {
  // Restore the persisted ratio (ignore a corrupt value).
  const saved = Number.parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
  let ratio: number | null = Number.isFinite(saved) ? clampRatio(saved) : null;
  applyRatio(panes, ratio);

  const persist = (): void => {
    if (ratio === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(ratio));
  };

  // Translate a pointer X (viewport px) into a clamped editor:preview ratio.
  const ratioForX = (clientX: number): number => {
    const rect = panes.getBoundingClientRect();
    const usable = rect.width - GUTTER_PX;
    const lo = MIN_PANE_PX;
    const hi = usable - MIN_PANE_PX;
    const editorPx = Math.min(Math.max(clientX - rect.left, lo), Math.max(lo, hi));
    const previewPx = Math.max(usable - editorPx, 1);
    return clampRatio(editorPx / previewPx);
  };

  resizer.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('dragging');
    panes.classList.add('resizing');
  });

  resizer.addEventListener('pointermove', (e: PointerEvent) => {
    if (!resizer.hasPointerCapture(e.pointerId)) return;
    ratio = ratioForX(e.clientX);
    applyRatio(panes, ratio);
  });

  const endDrag = (e: PointerEvent): void => {
    if (!resizer.hasPointerCapture(e.pointerId)) return;
    resizer.releasePointerCapture(e.pointerId);
    resizer.classList.remove('dragging');
    panes.classList.remove('resizing');
    persist();
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);

  // Double-click the gutter → reset to an even split.
  resizer.addEventListener('dblclick', () => {
    ratio = null;
    applyRatio(panes, ratio);
    persist();
  });

  // Keyboard accessibility: arrows nudge the split, Home recentres.
  resizer.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const base = ratio ?? 1;
      ratio = clampRatio(base + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP));
      applyRatio(panes, ratio);
      persist();
    } else if (e.key === 'Home') {
      e.preventDefault();
      ratio = null;
      applyRatio(panes, ratio);
      persist();
    }
  });
}
