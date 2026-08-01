import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_TABLE_SCALE, tableFitScale } from '@orlarey/markpage-render';

describe('tableFitScale', () => {
  const TEXT = 600; // text-column width in px

  it('leaves a table that already fits untouched (scale 1)', () => {
    expect(tableFitScale(500, TEXT)).toBe(1);
    expect(tableFitScale(TEXT, TEXT)).toBe(1);
  });

  it('shrinks a mildly-wide table proportionally, above the floor', () => {
    // natural 800 → 600/800 = 0.75, above the 0.6 floor.
    expect(tableFitScale(800, TEXT)).toBeCloseTo(0.75, 5);
  });

  it('caps a very dense table at the readability floor', () => {
    // natural 2000 → 0.3 raw, clamped up to the floor.
    expect(tableFitScale(2000, TEXT)).toBe(DEFAULT_MIN_TABLE_SCALE);
  });

  it('honours a custom floor', () => {
    expect(tableFitScale(2000, TEXT, 0.45)).toBe(0.45);
  });

  it('is defensive about non-positive inputs', () => {
    expect(tableFitScale(0, TEXT)).toBe(1);
    expect(tableFitScale(800, 0)).toBe(1);
    expect(tableFitScale(-5, TEXT)).toBe(1);
  });
});
