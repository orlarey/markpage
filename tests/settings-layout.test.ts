import { describe, expect, it } from 'vitest';
import { parseFrontmatter, embedProfileInFrontmatter } from '@orlarey/markpage-render';

import {
  applyFrontmatterToSettings,
  DEFAULT_SETTINGS,
  mergeWithDefaults,
  serializeProfile,
  validateLayoutSettings,
} from '../src/settings';

/** Parse a YAML frontmatter block and fold it onto DEFAULT_SETTINGS. */
function applyYaml(yaml: string) {
  const { meta } = parseFrontmatter(`---\n${yaml}\n---\n\nBody.\n`);
  return { meta, settings: applyFrontmatterToSettings(DEFAULT_SETTINGS, meta) };
}

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

describe('applyFrontmatterToSettings — per-doc layout/typography overrides', () => {
  it('leaves settings untouched when no override keys are present', () => {
    const { settings } = applyYaml('title: Hi\nauthor: Me');
    expect(settings).toBe(DEFAULT_SETTINGS); // identity — no clone
  });

  it('maps page-size (case-insensitive), excluding SLIDES_16_9', () => {
    expect(applyYaml('page-size: a5').settings.pageSize).toBe('A5');
    expect(applyYaml('page-size: LETTER').settings.pageSize).toBe('LETTER');
    // unknown / slides value ignored → keep the profile default
    expect(applyYaml('page-size: SLIDES_16_9').settings.pageSize).toBe(DEFAULT_SETTINGS.pageSize);
    expect(applyYaml('page-size: nope').settings.pageSize).toBe(DEFAULT_SETTINGS.pageSize);
  });

  it('expands margins shorthand (1 / 2 / 4 values) and forces manual mode', () => {
    expect(applyYaml('margins: 20').settings.margins).toEqual({
      top: 20, right: 20, bottom: 20, left: 20,
    });
    expect(applyYaml('margins: 25 35').settings.margins).toEqual({
      top: 25, right: 35, bottom: 25, left: 35,
    });
    const four = applyYaml('margins: 10 20 30 40').settings;
    expect(four.margins).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
    expect(four.marginMode).toBe('manual');
  });

  it('toggles the footer page number via page-numbers', () => {
    expect(applyYaml('page-numbers: false').settings.footer).toBe('');
    expect(applyYaml('page-numbers: true').settings.footer).toContain('{page}');
  });

  it('overrides the three font slots', () => {
    const s = applyYaml('font-body: Lora\nfont-heading: Inter\nfont-mono: Fira Code').settings;
    expect(s.fonts.body).toBe('Lora');
    expect(s.fonts.headings).toBe('Inter');
    expect(s.fonts.code).toBe('Fira Code');
  });

  it('still honours slides, which wins over page-size and clamps margins', () => {
    const s = applyYaml('page-size: A3\nmargins: 40\nslides: true').settings;
    expect(s.pageSize).toBe('SLIDES_16_9');
    expect(s.margins.top).toBeLessThanOrEqual(10); // slide vertical-margin cap
  });

  it('parser stores margins already expanded to a box', () => {
    const { meta } = applyYaml('margins: 25 35');
    expect(meta.margins).toEqual({ top: 25, right: 35, bottom: 25, left: 35 });
  });
});

describe('serializeProfile + embedProfileInFrontmatter — portable style profile', () => {
  it('serializes the style-relevant settings as parseable JSON', () => {
    const json = serializeProfile(DEFAULT_SETTINGS);
    const obj = JSON.parse(json);
    expect(obj.fonts).toEqual(DEFAULT_SETTINGS.fonts);
    expect(obj.styles).toEqual(DEFAULT_SETTINGS.styles);
    expect(obj.pageSize).toBe(DEFAULT_SETTINGS.pageSize);
    expect(obj.pageNumbers).toBe(true); // default footer ' | {page} | '
  });

  it('embeds the profile into a doc with no frontmatter, preserving the body', () => {
    const out = embedProfileInFrontmatter('# Hello\n\nBody.\n', '{"a":1}');
    const { meta, body } = parseFrontmatter(out);
    expect(meta['markpage-profile']).toBe('{"a":1}');
    expect(body).toBe('# Hello\n\nBody.\n');
  });

  it('keeps existing frontmatter keys when embedding', () => {
    const src = '---\ntitle: Doc\nauthor: Me\n---\n\nBody.\n';
    const { meta } = parseFrontmatter(embedProfileInFrontmatter(src, '{"a":1}'));
    expect(meta.title).toBe('Doc');
    expect(meta.author).toBe('Me');
    expect(meta['markpage-profile']).toBe('{"a":1}');
  });

  it('replaces (does not duplicate) a prior profile on re-embed', () => {
    const once = embedProfileInFrontmatter('Body.\n', '{"v":1}');
    const twice = embedProfileInFrontmatter(once, '{"v":2}');
    expect((twice.match(/markpage-profile:/g) ?? []).length).toBe(1);
    expect(parseFrontmatter(twice).meta['markpage-profile']).toBe('{"v":2}');
  });

  it('round-trips a real profile through embed → parse → JSON', () => {
    const json = serializeProfile(DEFAULT_SETTINGS);
    const out = embedProfileInFrontmatter('# T\n', json);
    const back = JSON.parse(parseFrontmatter(out).meta['markpage-profile'] as string);
    expect(back.styles.body).toEqual(DEFAULT_SETTINGS.styles.body);
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
