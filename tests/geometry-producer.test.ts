import { describe, expect, it } from 'vitest';

import { bakePageGeometry } from '../src/geometry-producer';
import {
  DEFAULT_SETTINGS,
  DEFAULT_GEOMETRY_AUTHORING,
  type GeometryAuthoring,
  type PdfSettings,
} from '../src/settings';

/**
 * Purpose: Lock the `bakePageGeometry` contract — the canon *producer* that
 *   turns the production inputs (marginMode / margins / measureChars /
 *   liveAreaChars) into the terminal PageGeometry of FUNDAMENTAL-SETTINGS.md.
 *   The render consumes only this shape; these tests guard the flattening and
 *   its invariants so later producer extraction can't silently drift.
 */

const A4 = { w: 210, h: 297 };

function derived(over: Partial<PdfSettings> = {}): PdfSettings {
  const authoring: GeometryAuthoring = {
    ...DEFAULT_GEOMETRY_AUTHORING,
    marginMode: 'derived',
    measureChars: 66,
    liveAreaChars: 85,
  };
  return { ...DEFAULT_SETTINGS, authoring, ...over };
}

describe('bakePageGeometry — manual mode', () => {
  it('is a pass-through of the four mm margins (no live area, no gutters)', () => {
    const m = DEFAULT_GEOMETRY_AUTHORING.margins; // manual by default
    const g = bakePageGeometry(DEFAULT_SETTINGS, A4);
    expect(g.text.top).toBe(m.top);
    expect(g.text.bottom).toBe(m.bottom);
    expect(g.text.inner).toBe(m.left);
    expect(g.text.outer).toBe(m.right);
    expect(g.text.width).toBeCloseTo(A4.w - m.left - m.right, 6);
    expect(g.text.height).toBeCloseTo(A4.h - m.top - m.bottom, 6);
    // running = text, header/footer flush ⇒ zero gutters ⇒ no banding, no notes.
    expect(g.running).toEqual({ inner: m.left, outer: m.right });
    expect(g.header.top).toBe(m.top);
    expect(g.footer.bottom).toBe(m.bottom);
    expect(g.text.outer - g.running.outer).toBe(0);
    expect(g.header.top < g.text.top).toBe(false);
  });
});

describe('bakePageGeometry — derived mode', () => {
  it('exposes the full fundamental shape', () => {
    const g = bakePageGeometry(derived(), A4);
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
    expect(g.sidenote).toEqual({
      gap: expect.any(Number),
      width: expect.any(Number),
    });
  });

  it('nests the text block strictly inside the live area', () => {
    const g = bakePageGeometry(derived(), A4);
    expect(g.running.inner).toBeLessThan(g.text.inner);
    expect(g.running.outer).toBeLessThan(g.text.outer);
    expect(g.header.top).toBeLessThan(g.text.top);
    expect(g.footer.bottom).toBeLessThan(g.text.bottom);
  });

  it('derives sidenote geometry from the gutters (§9.7.1)', () => {
    const g = bakePageGeometry(derived(), A4);
    const gutterInner = g.text.inner - g.running.inner;
    const gutterOuter = g.text.outer - g.running.outer;
    const gap = Math.max(1.5, gutterInner / 4);
    expect(g.sidenote.gap).toBeCloseTo(gap, 6);
    expect(g.sidenote.width).toBeCloseTo(Math.max(5, gutterOuter - gap), 6);
  });

  it('centers horizontally in simplex, keeps 1:2 asymmetry in duplex', () => {
    const simplex = bakePageGeometry(derived({ duplex: false }), A4);
    expect(simplex.text.inner).toBeCloseTo(simplex.text.outer, 6);
    expect(simplex.running.inner).toBeCloseTo(simplex.running.outer, 6);

    const duplex = bakePageGeometry(derived({ duplex: true }), A4);
    expect(duplex.text.outer).toBeGreaterThan(duplex.text.inner);
  });
});
