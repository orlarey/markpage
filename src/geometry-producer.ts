/****************************** geometry-producer.ts **************************
 *
 * Purpose: The canon *producer* — the single boundary that turns the geometry
 *   production inputs (marginMode / margins / measureChars / liveAreaChars) into
 *   the terminal `PageGeometry` fundamental setting. Phase 2d of the
 *   fundamental-settings migration (docs/FUNDAMENTAL-SETTINGS.md, "Résolution
 *   2d"): the render no longer computes geometry — it reads the baked result.
 *
 *   Lives OUTSIDE the render (`preview-paginated.ts`) on purpose: this is the
 *   "authoring/producer" layer that phase 4 will extract wholesale. The render
 *   imports only the baked `PageGeometry`, never this module's inputs.
 *
 *****************************************************************************/

import type { PdfSettings } from './settings';
import {
  computeCanonicalMargins,
  measureAverageCharWidth,
  centerCanonicalHorizontally,
  type CanonicalMargins,
  type PageGeometry,
} from './typography';

/**
 * Purpose: Bake the resolved `PageGeometry` for a page, from the production
 *   inputs. ALWAYS returns a geometry (no null): manual mode is a pass-through
 *   of the four mm margins; derived mode runs the Van de Graaf canon.
 * How:
 *   - derived: two nested canonical rectangles (measureChars → text block,
 *     liveAreaChars → the enclosing live area), centred in simplex / mirrored in
 *     duplex. running/header/footer come from the live area; the sidenote column
 *     is derived from the gutters (§9.7.1).
 *   - manual: text = running = the four sliders, header/footer flush with the
 *     text block, zero gutters → the render emits no canonical banding and hides
 *     sidenotes (both gated on the geometry, not on a mode flag).
 */
export function bakePageGeometry(
  s: PdfSettings,
  sizeMm: { w: number; h: number },
): PageGeometry {
  if (s.marginMode === 'derived') {
    const bodyName = (s.styles.body.family ?? '').trim() || s.fonts.body;
    const charW = measureAverageCharWidth(
      bodyName,
      s.styles.body.fontSize ?? 11,
    );
    const rect = (chars: number): CanonicalMargins =>
      centerCanonicalHorizontally(
        computeCanonicalMargins(sizeMm.w, sizeMm.h, chars, charW),
        s.duplex,
      );
    const text = rect(s.measureChars);
    const live = rect(s.liveAreaChars);
    const gutterInner = Math.max(0, text.inner - live.inner);
    const gutterOuter = Math.max(0, text.outer - live.outer);
    // §9.7.1 — sidenote gap = innerGutter / 4 (clamped so tight live areas
    // don't glue the note to the text); width fills the rest of the outer gutter.
    const gap = Math.max(1.5, gutterInner / 4);
    return {
      text,
      running: { inner: live.inner, outer: live.outer },
      header: { top: live.top },
      footer: { bottom: live.bottom },
      sidenote: { gap, width: Math.max(5, gutterOuter - gap) },
    };
  }
  // Manual mode: the four sliders are the terminal geometry (inner = left,
  // outer = right), with no distinct live area (running = text, zero gutters).
  const m = s.margins;
  const text: CanonicalMargins = {
    top: m.top,
    bottom: m.bottom,
    inner: m.left,
    outer: m.right,
    width: Math.max(1, sizeMm.w - m.left - m.right),
    height: Math.max(1, sizeMm.h - m.top - m.bottom),
  };
  return {
    text,
    running: { inner: text.inner, outer: text.outer },
    header: { top: text.top },
    footer: { bottom: text.bottom },
    // No outer gutter ⇒ the render hides sidenotes; gap/width follow the same
    // formula as derived mode for consistency but are never displayed.
    sidenote: { gap: 1.5, width: 5 },
  };
}

/** Return a copy of `s` with its `pageGeometry` freshly baked. Call at the end
 *  of the settings-resolution pipeline (after fonts / pageSize / duplex are
 *  final) so the geometry matches what the render will actually use. */
export function withBakedGeometry(
  s: PdfSettings,
  sizeMm: { w: number; h: number },
): PdfSettings {
  return { ...s, pageGeometry: bakePageGeometry(s, sizeMm) };
}
