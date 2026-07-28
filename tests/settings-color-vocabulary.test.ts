import { describe, expect, it } from 'vitest';
import { parseFrontmatter, cranToHex } from '@orlarey/markpage-render';
import { DEFAULT_SETTINGS, applyFrontmatterToSettings } from '../src/settings';

/** End of the vocabulary → settings pipeline: a document's `color-hue` /
 *  `color-crans` front-matter must land as derived per-element colours
 *  (STYLE-EDITOR-SPEC §8). */
describe('color-crans → element colours', () => {
  const render = (fm: string) => {
    const { meta } = parseFrontmatter(`---\n${fm}\n---\n\n# Doc\n`);
    return applyFrontmatterToSettings(DEFAULT_SETTINGS, meta);
  };

  it('derives heading, body and code colours from the table', () => {
    const s = render(
      'color-hue: 120\ncolor-crans: "titre:4,4 h1:4,3 corps:n5 code:n3"',
    );
    expect(s.styles.title.color).toBe(cranToHex(120, { kind: 'tint', s: 4, v: 4 }));
    expect(s.styles.h1.color).toBe(cranToHex(120, { kind: 'tint', s: 4, v: 3 }));
    expect(s.styles.body.color).toBe('#000000'); // neutral n5
    // code fans out to inline + block
    const codeHex = cranToHex(120, { kind: 'neutral', g: 3 });
    expect(s.styles['code-inline'].color).toBe(codeHex);
    expect(s.styles['code-block'].color).toBe(codeHex);
  });

  it('leaves elements not in the table at their default', () => {
    const s = render('color-hue: 120\ncolor-crans: "h1:4,3"');
    expect(s.styles.h2.color).toBe(DEFAULT_SETTINGS.styles.h2.color);
    expect(s.styles.body.color).toBe(DEFAULT_SETTINGS.styles.body.color);
  });

  it('is a no-op when color-crans is absent', () => {
    const s = render('color-hue: 120');
    expect(s.styles.title.color).toBe(DEFAULT_SETTINGS.styles.title.color);
  });

  it('rotating the hue rotates the derived colours (coordination)', () => {
    const blue = render('color-hue: 213\ncolor-crans: "h1:5,3"');
    const green = render('color-hue: 120\ncolor-crans: "h1:5,3"');
    expect(blue.styles.h1.color).not.toBe(green.styles.h1.color);
    // a neutral stays put across the hue
    const b2 = render('color-hue: 213\ncolor-crans: "corps:n4"');
    const g2 = render('color-hue: 120\ncolor-crans: "corps:n4"');
    expect(b2.styles.body.color).toBe(g2.styles.body.color);
  });
});
