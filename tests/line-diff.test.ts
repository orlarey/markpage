import { describe, expect, it } from 'vitest';

import { applyEdits, diffText } from '../src/line-diff';

describe('diffText — the smallest edits between two versions', () => {
  it('no edit for equal texts', () => {
    expect(diffText('a\nb\n', 'a\nb\n')).toEqual([]);
  });

  it('an insertion above leaves the rest untouched', () => {
    const before = 'titre\n\npara 1\npara 2\n';
    const after = 'titre\n\nnouveau\npara 1\npara 2\n';
    const edits = diffText(before, after);
    expect(edits).toEqual([{ from: 7, to: 7, insert: 'nouveau\n' }]);
    expect(applyEdits(before, edits)).toBe(after);
  });

  it('two distant changes stay two edits (what lies between is kept)', () => {
    const mid = Array.from({ length: 50 }, (_, i) => `ligne ${i}\n`).join('');
    const before = `A\n${mid}Z\n`;
    const after = `A modifié\n${mid}Z modifié\n`;
    const edits = diffText(before, after);
    expect(edits).toHaveLength(2);
    expect(applyEdits(before, edits)).toBe(after);
  });

  it('deletions, empty sides, a missing final newline', () => {
    for (const [a, b] of [
      ['x\ny\nz\n', 'x\nz\n'],
      ['', 'tout neuf\n'],
      ['tout\nvieux\n', ''],
      ['a\nb', 'a\nb\nc'],
      ['a\nb\n', 'a\nb'],
    ] as const) {
      expect(applyEdits(a, diffText(a, b))).toBe(b);
    }
  });

  it('two unrelated long texts: one coarse edit, still exact', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `ancien ${i}\n`).join('');
    const b = Array.from({ length: 3000 }, (_, i) => `nouveau ${i}\n`).join('');
    const edits = diffText(a, b);
    expect(edits).toHaveLength(1);
    expect(applyEdits(a, edits)).toBe(b);
  });

  it('random edits always rebuild the new text exactly', () => {
    let seed = 7;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let t = 0; t < 200; t += 1) {
      const lines = Array.from({ length: rnd(30) }, () => `l${rnd(8)}\n`);
      const next = [...lines];
      for (let e = 0; e < rnd(6); e += 1) {
        const at = rnd(next.length + 1);
        if (rnd(2) === 0) next.splice(at, 0, `n${rnd(5)}\n`);
        else next.splice(at, 1);
      }
      const a = lines.join('');
      const b = next.join('');
      expect(applyEdits(a, diffText(a, b))).toBe(b);
    }
  });
});
