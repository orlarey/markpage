import { describe, expect, it } from 'vitest';

import { bundleAssetFiles } from '../src/disk-link';

const sha = (n: number): string => n.toString(16).padStart(64, '0');
const bySha = (a: { sha: string }, b: { sha: string }): number =>
  a.sha.localeCompare(b.sha);

describe('bundleAssetFiles', () => {
  it('maps both assets/<sha>.<ext> and img://<sha> refs to assets/<sha>.<ext>', () => {
    const a = sha(1);
    const b = sha(2);
    const c = sha(3);
    const content = `![](assets/${a}.png) text ![](img://${b}) ![](assets/${c}.jpg)`;
    const mimeOf = (s: string): string | undefined =>
      s === a ? 'image/png' : s === b ? 'image/jpeg' : s === c ? 'image/webp' : undefined;
    expect(bundleAssetFiles(content, mimeOf).sort(bySha)).toEqual(
      [
        { sha: a, path: `assets/${a}.png` },
        { sha: b, path: `assets/${b}.jpg` },
        { sha: c, path: `assets/${c}.webp` },
      ].sort(bySha),
    );
  });

  it('skips refs whose blob mime is unknown (missing in the store)', () => {
    const a = sha(1);
    expect(bundleAssetFiles(`![](assets/${a}.png)`, () => undefined)).toEqual([]);
  });

  it('returns nothing when there are no image refs', () => {
    expect(bundleAssetFiles('# Just text\n\nNo images.', () => 'image/png')).toEqual(
      [],
    );
  });
});
