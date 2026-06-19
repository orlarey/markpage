import { describe, expect, it } from 'vitest';

import {
  packRows,
  parseMosaicBody,
  parseMosaicInfo,
} from '../src/mosaic';

describe('parseMosaicInfo', () => {
  it('parses a bare fence (no title, default options)', () => {
    const i = parseMosaicInfo('mosaic');
    expect(i.caption).toBeNull();
    expect(i.options).toEqual({ gap: 0, lastNatural: false });
  });

  it('extracts the quoted title and options', () => {
    const i = parseMosaicInfo('mosaic "Manif du 1er mai" height=160 gap=2');
    expect(i.caption).toBe('Manif du 1er mai');
    expect(i.options.height).toBe(160);
    expect(i.options.gap).toBe(2);
    expect(i.options.lastNatural).toBe(false);
  });

  it('parses last=natural and a \\label', () => {
    const i = parseMosaicInfo('mosaic "Chantier" \\label{fig:c} last=natural');
    expect(i.caption).toBe('Chantier');
    expect(i.label).toBe('fig:c');
    expect(i.options.lastNatural).toBe(true);
  });

  it('ignores a non-positive height / negative gap', () => {
    const i = parseMosaicInfo('mosaic height=0 gap=-3');
    expect(i.options.height).toBeUndefined();
    expect(i.options.gap).toBe(0);
  });
});

describe('parseMosaicBody', () => {
  it('keeps one image per line, in order, skipping blanks', () => {
    const body = `![a](assets/aa.jpg)\n\n![](img://bb)\n![c](assets/cc.png)`;
    expect(parseMosaicBody(body)).toEqual([
      { alt: 'a', src: 'assets/aa.jpg' },
      { alt: '', src: 'img://bb' },
      { alt: 'c', src: 'assets/cc.png' },
    ]);
  });

  it('skips lines that are not Markdown images', () => {
    expect(parseMosaicBody('not an image\n![x](u.png)\n# heading')).toEqual([
      { alt: 'x', src: 'u.png' },
    ]);
  });
});

describe('packRows', () => {
  it('packs equal 3:2 images into full-width rows', () => {
    const ratios = [1.5, 1.5, 1.5, 1.5, 1.5, 1.5];
    const rows = packRows(ratios, 600, 150, 0, false);
    // 3 images per row: h = 600/(3*1.5) = 133.3 ≤ 150
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.items).toHaveLength(3);
      expect(r.justified).toBe(true);
      const total = r.items.reduce((s, it) => s + it.width, 0);
      expect(total).toBeCloseTo(600, 4); // fills the width exactly
      expect(r.height).toBeCloseTo(133.333, 2);
    }
  });

  it('accounts for the gap so rows still fill the width', () => {
    const rows = packRows([1.5, 1.5, 1.5], 600, 150, 10, false);
    const r = rows[0]!;
    const total = r.items.reduce((s, it) => s + it.width, 0);
    expect(total + 10 * (r.items.length - 1)).toBeCloseTo(600, 4);
  });

  it('justifies the last partial row by default', () => {
    const rows = packRows([1.5, 1.5, 1.5, 1.5], 600, 150, 0, false);
    expect(rows).toHaveLength(2);
    // leftover single image becomes one full-width row
    expect(rows[1]!.items).toHaveLength(1);
    expect(rows[1]!.justified).toBe(true);
    expect(rows[1]!.items[0]!.width).toBeCloseTo(600, 4);
  });

  it('keeps the last row natural with last=natural', () => {
    const rows = packRows([1.5, 1.5, 1.5, 1.5], 600, 150, 0, true);
    const last = rows[1]!;
    expect(last.justified).toBe(false);
    expect(last.height).toBe(150); // target height, not stretched
    expect(last.items[0]!.width).toBeCloseTo(225, 4); // 1.5 * 150
  });

  it('emits a single-image row when one image already fits the target', () => {
    // a very wide panorama: even alone its row height ≤ target
    const rows = packRows([8], 600, 150, 0, false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.items).toHaveLength(1);
    expect(rows[0]!.height).toBeCloseTo(75, 4); // 600/8
  });
});
