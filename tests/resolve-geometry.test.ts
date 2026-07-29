import { describe, expect, it } from 'vitest';

import { resolveGeometry } from '../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';

/**
 * Purpose: Lock the `resolveGeometry` contract — the single boundary that
 *   turns the production inputs (marginMode / measureChars / liveAreaChars)
 *   into the *fundamental* geometry vocabulary of FUNDAMENTAL-SETTINGS.md §1.
 *   The render consumes only this shape; these tests guard the flattening and
 *   its invariants so later producer extraction can't silently drift.
 */

const A4 = { w: 210, h: 297 };

function derived(over: Partial<PdfSettings> = {}): PdfSettings {
  return {
    ...DEFAULT_SETTINGS,
    marginMode: 'derived',
    measureChars: 66,
    liveAreaChars: 85,
    ...over,
  };
}

describe('resolveGeometry', () => {
  it('returns null in manual mode (the four mm sliders are authoritative)', () => {
    expect(resolveGeometry(DEFAULT_SETTINGS, A4)).toBeNull();
    expect(resolveGeometry(derived({ marginMode: 'manual' }), A4)).toBeNull();
  });

  it('exposes the full fundamental shape', () => {
    const g = resolveGeometry(derived(), A4)!;
    expect(g).not.toBeNull();
    expect(g.page).toEqual(A4);
    // text is a full rectangle (spine-aware margins + own size)
    expect(g.text).toEqual(
      expect.objectContaining({
        top: expect.any(Number),
        bottom: expect.any(Number),
        inner: expect.any(Number),
        outer: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );
    expect(g.running).toEqual({
      inner: expect.any(Number),
      outer: expect.any(Number),
    });
    expect(g.header).toEqual({ top: expect.any(Number) });
    expect(g.footer).toEqual({ bottom: expect.any(Number) });
    expect(g.gutter).toEqual({
      inner: expect.any(Number),
      outer: expect.any(Number),
    });
    expect(g.sidenote).toEqual({
      gap: expect.any(Number),
      width: expect.any(Number),
    });
  });

  it('nests the text block inside the live area (gutters are the strip between)', () => {
    const g = resolveGeometry(derived(), A4)!;
    // The live area encloses the text block: its margins are smaller.
    expect(g.running.inner).toBeLessThan(g.text.inner);
    expect(g.running.outer).toBeLessThan(g.text.outer);
    expect(g.header.top).toBeLessThan(g.text.top);
    expect(g.footer.bottom).toBeLessThan(g.text.bottom);
    // gutter = text − live, exactly (and non-negative).
    expect(g.gutter.inner).toBeCloseTo(g.text.inner - g.running.inner, 6);
    expect(g.gutter.outer).toBeCloseTo(g.text.outer - g.running.outer, 6);
    expect(g.gutter.inner).toBeGreaterThanOrEqual(0);
  });

  it('derives sidenote geometry from the gutters (§9.7.1)', () => {
    const g = resolveGeometry(derived(), A4)!;
    expect(g.sidenote.gap).toBeCloseTo(Math.max(1.5, g.gutter.inner / 4), 6);
    expect(g.sidenote.width).toBeCloseTo(
      Math.max(5, g.gutter.outer - g.sidenote.gap),
      6,
    );
  });

  it('centers horizontally in simplex, keeps 1:2 asymmetry in duplex', () => {
    const simplex = resolveGeometry(derived({ duplex: false }), A4)!;
    expect(simplex.text.inner).toBeCloseTo(simplex.text.outer, 6);
    expect(simplex.running.inner).toBeCloseTo(simplex.running.outer, 6);

    const duplex = resolveGeometry(derived({ duplex: true }), A4)!;
    // Classical canon: outer margin is wider than the (binding) inner one.
    expect(duplex.text.outer).toBeGreaterThan(duplex.text.inner);
  });
});
