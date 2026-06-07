import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  mergeWithDefaults,
  validateLayoutSettings,
} from '../src/settings';

describe('DEFAULT_SETTINGS — layout fields (§9.5 / §9.6 / §9.7)', () => {
  it('seeds duplex / chapterBreak / marginMode to the backward-compatible defaults', () => {
    // The new fields must default so a freshly-created profile renders
    // identically to a pre-§9.6 one: 'manual' mode keeps the four sliders
    // authoritative, no recto/verso, no forced chapter break.
    expect(DEFAULT_SETTINGS.duplex).toBe(false);
    expect(DEFAULT_SETTINGS.chapterBreak).toBe('none');
    expect(DEFAULT_SETTINGS.marginMode).toBe('manual');
  });

  it('seeds the two canonical measures (still stored in manual mode)', () => {
    expect(DEFAULT_SETTINGS.measureChars).toBe(66);
    expect(DEFAULT_SETTINGS.liveAreaChars).toBe(85);
    // Invariant of the live area model — liveAreaChars must contain the
    // text block strictly.
    expect(DEFAULT_SETTINGS.liveAreaChars).toBeGreaterThan(
      DEFAULT_SETTINGS.measureChars,
    );
  });

  it("seeds notes.position to 'foot' (= the §17 footnote behaviour)", () => {
    expect(DEFAULT_SETTINGS.notes.position).toBe('foot');
  });
});

describe('mergeWithDefaults — backward compat with legacy profiles', () => {
  it('fills the new layout fields with their defaults on a legacy profile', () => {
    // Simulate a profile saved by markpage 0.15.x or earlier — none of the
    // §9.5 / §9.6 / §9.7 keys present.
    const legacy = {
      pageSize: 'A4',
      margins: { top: 25, bottom: 25, left: 35, right: 35 },
    };
    const merged = mergeWithDefaults(legacy);
    expect(merged.duplex).toBe(DEFAULT_SETTINGS.duplex);
    expect(merged.chapterBreak).toBe(DEFAULT_SETTINGS.chapterBreak);
    expect(merged.marginMode).toBe(DEFAULT_SETTINGS.marginMode);
    expect(merged.measureChars).toBe(DEFAULT_SETTINGS.measureChars);
    expect(merged.liveAreaChars).toBe(DEFAULT_SETTINGS.liveAreaChars);
    expect(merged.notes).toEqual(DEFAULT_SETTINGS.notes);
  });

  it('preserves explicit layout values from a forward-compat profile', () => {
    const future = {
      duplex: true,
      chapterBreak: 'next-recto',
      marginMode: 'derived',
      measureChars: 52,
      liveAreaChars: 85,
      notes: { position: 'side' },
    };
    const merged = mergeWithDefaults(future);
    expect(merged.duplex).toBe(true);
    expect(merged.chapterBreak).toBe('next-recto');
    expect(merged.marginMode).toBe('derived');
    expect(merged.measureChars).toBe(52);
    expect(merged.liveAreaChars).toBe(85);
    expect(merged.notes.position).toBe('side');
  });

  it('survives a round-trip JSON.stringify → JSON.parse → mergeWithDefaults', () => {
    const original = {
      ...DEFAULT_SETTINGS,
      duplex: true,
      chapterBreak: 'next-recto' as const,
      marginMode: 'derived' as const,
      measureChars: 60,
      liveAreaChars: 80,
      notes: { position: 'side' as const },
    };
    const roundTripped = mergeWithDefaults(
      JSON.parse(JSON.stringify(original)),
    );
    expect(roundTripped.duplex).toBe(true);
    expect(roundTripped.chapterBreak).toBe('next-recto');
    expect(roundTripped.marginMode).toBe('derived');
    expect(roundTripped.measureChars).toBe(60);
    expect(roundTripped.liveAreaChars).toBe(80);
    expect(roundTripped.notes.position).toBe('side');
  });

  it('partial notes object merges with the default', () => {
    // The notes object is small but is still a sub-object; mergeWithDefaults
    // must honour `merge()` semantics so we never lose nested defaults when
    // we add new keys to `notes` later.
    const partial = { notes: {} };
    const merged = mergeWithDefaults(partial);
    expect(merged.notes.position).toBe(DEFAULT_SETTINGS.notes.position);
  });
});

describe('validateLayoutSettings — guards on the two measures', () => {
  it('accepts the default configuration with no issues', () => {
    expect(validateLayoutSettings(DEFAULT_SETTINGS)).toEqual([]);
  });

  it('emits an error when liveAreaChars equals measureChars (no room for the gutters)', () => {
    const issues = validateLayoutSettings({
      ...DEFAULT_SETTINGS,
      measureChars: 70,
      liveAreaChars: 70,
    });
    const err = issues.find((i) => i.field === 'liveAreaChars');
    expect(err?.severity).toBe('error');
  });

  it('emits an error when liveAreaChars < measureChars', () => {
    const issues = validateLayoutSettings({
      ...DEFAULT_SETTINGS,
      measureChars: 70,
      liveAreaChars: 60,
    });
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('emits a warning when measureChars falls outside Bringhurst 45-75', () => {
    const tooNarrow = validateLayoutSettings({
      ...DEFAULT_SETTINGS,
      measureChars: 40,
    });
    expect(tooNarrow.some((i) => i.field === 'measureChars' && i.severity === 'warning'))
      .toBe(true);

    const tooWide = validateLayoutSettings({
      ...DEFAULT_SETTINGS,
      measureChars: 80,
    });
    expect(tooWide.some((i) => i.field === 'measureChars' && i.severity === 'warning'))
      .toBe(true);
  });

  it('emits a warning when liveAreaChars exceeds the soft cap (110 chars)', () => {
    const issues = validateLayoutSettings({
      ...DEFAULT_SETTINGS,
      measureChars: 50,
      liveAreaChars: 120,
    });
    expect(issues.some((i) => i.field === 'liveAreaChars' && i.severity === 'warning'))
      .toBe(true);
  });

  it('reports both issues independently (measureChars + liveAreaChars)', () => {
    const issues = validateLayoutSettings({
      ...DEFAULT_SETTINGS,
      measureChars: 80, // out of band
      liveAreaChars: 70, // < measureChars
    });
    expect(issues.some((i) => i.field === 'measureChars')).toBe(true);
    expect(issues.some((i) => i.field === 'liveAreaChars')).toBe(true);
  });
});
