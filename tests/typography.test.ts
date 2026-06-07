import { describe, expect, it } from 'vitest';

import {
  computeCanonicalMargins,
  measureAverageCharWidth,
} from '../src/typography';

/**
 * Purpose: Verify the canonical margin formulas of SPEC §9.6.4 against
 *   the worked example (A4 / 11 pt body / 66 chars). The math is
 *   self-contained so the tests pin numeric output to ~ 0.1 mm, which
 *   is far below visual perception.
 */
describe('computeCanonicalMargins — SPEC §9.6.4 worked example', () => {
  // §9.6.2: 66 chars × 0.5 em × 11 pt × 0.3528 mm/pt ≈ 128 mm text block.
  // We pass an explicit charWidth so the test is independent of the
  // canvas measurement (which happy-dom can't do anyway).
  const A4 = { w: 210, h: 297 };
  const CHAR_WIDTH = 0.5 * 11 * 0.3528; // ≈ 1.9404 mm

  it('produces the §9.6.2/§9.6.4 numbers for 66 chars on A4', () => {
    const r = computeCanonicalMargins(A4.w, A4.h, 66, CHAR_WIDTH);
    expect(r.width).toBeCloseTo(128.07, 1);
    expect(r.height).toBeCloseTo(181.16, 1);
    // §9.6.2: total horizontal margins = 82 mm, split 1:2 → inner 27, outer 55.
    expect(r.inner).toBeCloseTo(27.31, 1);
    expect(r.outer).toBeCloseTo(54.62, 1);
    // §9.6.3 (vertical, same 1:2 split via similar rectangle): top 39, bottom 77.
    expect(r.top).toBeCloseTo(38.61, 1);
    expect(r.bottom).toBeCloseTo(77.23, 1);
  });

  it('keeps the inner:outer ratio at 1:2 for any measure', () => {
    for (const measure of [40, 52, 66, 75, 90]) {
      const r = computeCanonicalMargins(A4.w, A4.h, measure, CHAR_WIDTH);
      expect(r.outer / r.inner).toBeCloseTo(2, 4);
      expect(r.bottom / r.top).toBeCloseTo(2, 4);
    }
  });

  it("keeps the text block similar to the page (same aspect ratio)", () => {
    const r = computeCanonicalMargins(A4.w, A4.h, 66, CHAR_WIDTH);
    expect(r.height / r.width).toBeCloseTo(A4.h / A4.w, 4);
  });

  it('matches the SPEC §9.7.1 scholar-margin worked example (52 chars on A4)', () => {
    const r = computeCanonicalMargins(A4.w, A4.h, 52, CHAR_WIDTH);
    expect(r.width).toBeCloseTo(100.9, 1);
    expect(r.height).toBeCloseTo(142.7, 1);
    // §9.7.1 derives inner gutter = 22 mm via x2_L − x2_T (live area
    // computation), but the TEXT BLOCK itself at 52 chars has inner =
    // (210 − 100.9)/3 ≈ 36.4 mm.
    expect(r.inner).toBeCloseTo(36.37, 1);
    expect(r.outer).toBeCloseTo(72.73, 1);
  });

  it('clamps text width to the page width when measureChars is extreme', () => {
    // 200 chars × ~2 mm = 400 mm, more than A4 width — must clamp.
    const r = computeCanonicalMargins(A4.w, A4.h, 200, CHAR_WIDTH);
    expect(r.width).toBeLessThanOrEqual(A4.w);
    expect(r.inner).toBeGreaterThanOrEqual(0);
    expect(r.outer).toBeGreaterThanOrEqual(0);
  });
});

describe('measureAverageCharWidth — graceful degradation', () => {
  it('falls back to the 0.5 em heuristic when no DOM canvas is available', () => {
    // happy-dom does not provide a canvas backend, so this exercises
    // the fallback path. 11 pt × 0.3528 × 0.5 ≈ 1.94 mm.
    const w = measureAverageCharWidth('Roboto Condensed', 11);
    expect(w).toBeCloseTo(11 * 0.3528 * 0.5, 3);
  });

  it('scales linearly with font size', () => {
    const a = measureAverageCharWidth('Source Serif', 10);
    const b = measureAverageCharWidth('Source Serif', 20);
    expect(b / a).toBeCloseTo(2, 3);
  });
});
