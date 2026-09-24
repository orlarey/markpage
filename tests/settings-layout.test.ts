import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../src/settings';

describe('DEFAULT_SETTINGS — layout fields (§9.5 / §9.6 / §9.7)', () => {
  it('seeds duplex / chapterBreak / marginMode to the backward-compatible defaults', () => {
    // The new fields must default so a freshly-created profile renders
    // identically to a pre-§9.6 one: 'manual' mode keeps the four sliders
    // authoritative, no recto/verso, no forced chapter break.
    expect(DEFAULT_SETTINGS.duplex).toBe(false);
    expect(DEFAULT_SETTINGS.chapterBreak).toBe('none');
    expect(DEFAULT_SETTINGS.authoring?.marginMode).toBe('manual');
  });

  it('seeds the two canonical measures (still stored in manual mode)', () => {
    expect(DEFAULT_SETTINGS.authoring?.measureChars).toBe(66);
    expect(DEFAULT_SETTINGS.authoring?.liveAreaChars).toBe(85);
    // Invariant of the live area model — liveAreaChars must contain the
    // text block strictly.
    expect(DEFAULT_SETTINGS.authoring!.liveAreaChars).toBeGreaterThan(
      DEFAULT_SETTINGS.authoring!.measureChars,
    );
  });

  it("seeds notes.position to 'foot' (= the §17 footnote behaviour)", () => {
    expect(DEFAULT_SETTINGS.notes.position).toBe('foot');
  });
});
