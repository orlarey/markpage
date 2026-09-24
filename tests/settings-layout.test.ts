import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../src/settings';

describe('DEFAULT_SETTINGS — layout fields', () => {
  it('seeds a single-sided page with no forced chapter break', () => {
    expect(DEFAULT_SETTINGS.duplex).toBe(false);
    expect(DEFAULT_SETTINGS.chapterBreak).toBe('none');
  });

  it('carries a resolved A4 geometry: centred, consistent, no bands or gutters', () => {
    const g = DEFAULT_SETTINGS.pageGeometry;
    expect(g.text.inner).toBe(g.text.outer);
    expect(g.text.inner + g.text.width + g.text.outer).toBe(210);
    expect(g.text.top + g.text.height + g.text.bottom).toBe(297);
    expect(g.running).toEqual({ inner: g.text.inner, outer: g.text.outer });
    expect(g.header.top).toBe(g.text.top);
    expect(g.footer.bottom).toBe(g.text.bottom);
  });

  it("seeds notes.position to 'foot' (= the §17 footnote behaviour)", () => {
    expect(DEFAULT_SETTINGS.notes.position).toBe('foot');
  });
});
