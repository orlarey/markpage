import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIN_TABLE_SCALE,
  comfortableTableWidth,
  isNumericCell,
  tableFitScale,
} from '@orlarey/markpage-render';

describe('tableFitScale', () => {
  const TEXT = 600; // text-column width in px

  it('leaves a table that already fits untouched (scale 1)', () => {
    expect(tableFitScale(500, TEXT)).toBe(1);
    expect(tableFitScale(TEXT, TEXT)).toBe(1);
  });

  it('shrinks a mildly-wide table proportionally, above the floor', () => {
    // comfortable 700 → 600/700 ≈ 0.857, above the 0.8 floor.
    expect(tableFitScale(700, TEXT)).toBeCloseTo(600 / 700, 5);
  });

  it('caps a very dense table at the readability floor', () => {
    // comfortable 2000 → 0.3 raw, clamped up to the floor.
    expect(tableFitScale(2000, TEXT)).toBe(DEFAULT_MIN_TABLE_SCALE);
  });

  it('keeps the floor at a readable size', () => {
    // 0.8 × a 10 pt body ≈ 8 pt: never the ~6 pt the old 0.6 floor gave.
    expect(DEFAULT_MIN_TABLE_SCALE).toBeGreaterThanOrEqual(0.8);
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

describe('comfortableTableWidth', () => {
  const CAP = 150;

  it('caps a prose column at the comfortable width', () => {
    // Two prose columns, each 900 px on one line: they will wrap.
    expect(comfortableTableWidth([900, 900], [80, 120], CAP)).toBe(300);
  });

  it('keeps a short column at its natural width', () => {
    expect(comfortableTableWidth([60, 900], [40, 100], CAP)).toBe(60 + 150);
  });

  it('never goes below the longest word of a column', () => {
    // A 400 px unbreakable path cannot be wrapped narrower.
    expect(comfortableTableWidth([400], [400], CAP)).toBe(400);
  });

  it('adds the table chrome once', () => {
    expect(comfortableTableWidth([100, 100], [50, 50], CAP, 12)).toBe(212);
  });

  it('lets a two-column prose table fit without any zoom', () => {
    // The "partie / fichier" case: wide on one line, fine once wrapped.
    const comfortable = comfortableTableWidth([420, 980], [110, 330], 156);
    expect(tableFitScale(comfortable, 610)).toBe(1);
  });
});

describe('isNumericCell', () => {
  it('recognises numbers, percentages and short quantities', () => {
    for (const t of ['127', '1 341', '123 (97 %)', '-12,5', '0,6 s', '3 sur 7', '×2,3']) {
      expect(isNumericCell(t), t).toBe(true);
    }
  });

  it('leaves prose and labels alone', () => {
    for (const t of ['vocal', '—', 'cible nulle, double précision', 'compiler/global.cpp, -st et -nost']) {
      expect(isNumericCell(t), t).toBe(false);
    }
  });
});
