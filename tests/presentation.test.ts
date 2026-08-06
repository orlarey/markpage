import { describe, expect, it } from 'vitest';

import {
  presentColumn,
  presentLayout,
  presentRows,
  presentStep,
  shouldSpread,
} from '../src/presentation';

// A4 portrait ≈ 794×1123 px; a 16:9 slide ≈ 1280×720; widescreen 1920×1080.
const A4 = { pw: 794, ph: 1123 };
const SLIDE = { pw: 1280, ph: 720 };
const SCREEN = { winW: 1920, winH: 1080 };

describe('shouldSpread — single vs double decision', () => {
  it('spreads a portrait page on a widescreen', () => {
    expect(shouldSpread(A4.pw, A4.ph, SCREEN.winW, SCREEN.winH)).toBe(true);
  });
  it('keeps a 16:9 slide single', () => {
    expect(shouldSpread(SLIDE.pw, SLIDE.ph, SCREEN.winW, SCREEN.winH)).toBe(false);
  });
  it('drops to single when the window is too narrow for two portrait pages', () => {
    expect(shouldSpread(A4.pw, A4.ph, 900, 1080)).toBe(false);
  });
  it('is false for degenerate sizes', () => {
    expect(shouldSpread(0, 1123, 1920, 1080)).toBe(false);
  });
});

describe('presentRows — book pairing', () => {
  it('single mode: one page per row', () => {
    expect(presentRows(4, false, false)).toEqual([[0], [1], [2], [3]]);
  });
  it('duplex double: cover alone, then facing pairs', () => {
    expect(presentRows(6, true, true)).toEqual([[0], [1, 2], [3, 4], [5]]);
  });
  it('one-sided double: simple pairs from the first page', () => {
    expect(presentRows(5, true, false)).toEqual([[0, 1], [2, 3], [4]]);
  });
  it('empty for no pages', () => {
    expect(presentRows(0, true, true)).toEqual([]);
  });
});

describe('presentColumn — which half of the spread', () => {
  it('duplex: cover + rectos right, versos left', () => {
    expect(presentColumn(0, true)).toBe(1); // cover → right
    expect(presentColumn(1, true)).toBe(0); // verso → left
    expect(presentColumn(2, true)).toBe(1); // recto → right
  });
  it('one-sided: even left, odd right', () => {
    expect(presentColumn(0, false)).toBe(0);
    expect(presentColumn(1, false)).toBe(1);
  });
});

describe('presentLayout — placed boxes', () => {
  it('places two portrait pages side by side, same scale, centred', () => {
    const { boxes, rowCount } = presentLayout({
      pageCount: 4,
      ...A4,
      ...SCREEN,
      anchor: 2, // → row [2,3] (one-sided pairing)
      duplex: false,
    });
    expect(boxes.map((b) => b.pageIndex)).toEqual([2, 3]);
    expect(boxes[0].scale).toBeCloseTo(boxes[1].scale, 5);
    // side by side: the right page sits one page-width to the right
    expect(boxes[1].x - boxes[0].x).toBeCloseTo(A4.pw * boxes[0].scale, 3);
    // the pair is centred horizontally
    const spreadW = 2 * A4.pw * boxes[0].scale;
    expect(boxes[0].x).toBeCloseTo((SCREEN.winW - spreadW) / 2, 3);
    expect(rowCount).toBe(2);
  });

  it('duplex cover: a single page placed in the RIGHT half', () => {
    const { boxes } = presentLayout({
      pageCount: 6,
      ...A4,
      ...SCREEN,
      anchor: 0,
      duplex: true,
    });
    expect(boxes).toHaveLength(1);
    expect(boxes[0].pageIndex).toBe(0);
    // right half of the two-wide slot, not centred
    const scale = boxes[0].scale;
    const startX = (SCREEN.winW - 2 * A4.pw * scale) / 2;
    expect(boxes[0].x).toBeCloseTo(startX + A4.pw * scale, 3);
  });

  it('a 16:9 slide is shown single and centred', () => {
    const { boxes, rowCount } = presentLayout({
      pageCount: 10,
      ...SLIDE,
      ...SCREEN,
      anchor: 3,
      duplex: false,
    });
    expect(boxes).toHaveLength(1);
    expect(boxes[0].pageIndex).toBe(3);
    expect(rowCount).toBe(10);
    // centred single
    expect(boxes[0].x).toBeCloseTo(
      (SCREEN.winW - SLIDE.pw * boxes[0].scale) / 2,
      3,
    );
  });

  it('normalises the anchor to the row it lands in', () => {
    // anchor 3 falls in the one-sided pair [2,3] → normalised to 2
    const { anchor } = presentLayout({
      pageCount: 4,
      ...A4,
      ...SCREEN,
      anchor: 3,
      duplex: false,
    });
    expect(anchor).toBe(2);
  });
});

describe('presentStep — row navigation', () => {
  const base = { pageCount: 6, ...A4, ...SCREEN, duplex: true } as const;
  it('advances one spread and clamps at the end', () => {
    // duplex rows: [0],[1,2],[3,4],[5]
    expect(presentStep({ ...base, anchor: 0, delta: 1 })).toBe(1);
    expect(presentStep({ ...base, anchor: 1, delta: 1 })).toBe(3);
    expect(presentStep({ ...base, anchor: 5, delta: 1 })).toBe(5); // clamp
  });
  it('goes back and clamps at the start', () => {
    expect(presentStep({ ...base, anchor: 3, delta: -1 })).toBe(1);
    expect(presentStep({ ...base, anchor: 0, delta: -1 })).toBe(0); // clamp
  });
  it('Home / End jump to the ends', () => {
    expect(presentStep({ ...base, anchor: 3, delta: -Number.MAX_SAFE_INTEGER })).toBe(0);
    expect(presentStep({ ...base, anchor: 0, delta: Number.MAX_SAFE_INTEGER })).toBe(5);
  });
});
