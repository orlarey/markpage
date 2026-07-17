import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../src/settings';
import {
  applyAccentColor,
  applyAppearance,
  applyBaseFontSize,
  applyDensity,
  applyDocumentModel,
  applyParagraphSeparation,
  applyPaginationStyle,
  detectAccentColor,
  detectAppearance,
  detectDensity,
  detectDocumentModel,
  detectParagraphSeparation,
  detectPaginationStyle,
} from '../src/style-recipes';

function defaults() {
  return structuredClone(DEFAULT_SETTINGS);
}

describe('document-model recipes', () => {
  it('configures a coherent book layout without changing typography', () => {
    const before = defaults();
    const result = applyDocumentModel(before, 'book');

    expect(result.pageSize).toBe('B5');
    expect(result.marginMode).toBe('derived');
    expect(result.measureChars).toBe(60);
    expect(result.liveAreaChars).toBe(80);
    expect(result.duplex).toBe(true);
    expect(result.chapterBreak).toBe('next-recto');
    expect(result.notes.position).toBe('foot');
    expect(result.fonts).toEqual(before.fonts);
    expect(detectDocumentModel(result)).toBe('book');
  });

  it('uses a widescreen manual layout for presentations', () => {
    const result = applyDocumentModel(defaults(), 'slides');

    expect(result.pageSize).toBe('SLIDES_16_9');
    expect(result.marginMode).toBe('manual');
    expect(result.margins).toEqual({
      top: 10,
      right: 14,
      bottom: 10,
      left: 14,
    });
    expect(result.notes.position).toBe('end');
    expect(detectDocumentModel(result)).toBe('slides');
  });

  it('uses a single-sided A4 layout for letters', () => {
    const result = applyDocumentModel(defaults(), 'letter');

    expect(result.pageSize).toBe('A4');
    expect(result.marginMode).toBe('manual');
    expect(result.margins).toEqual({
      top: 20,
      right: 25,
      bottom: 25,
      left: 25,
    });
    expect(result.duplex).toBe(false);
    expect(result.chapterBreak).toBe('none');
    expect(result.notes.position).toBe('end');
    expect(detectDocumentModel(result)).toBe('letter');
  });

  it('reports a model as custom after one controlled dimension changes', () => {
    const result = applyDocumentModel(defaults(), 'report');
    result.measureChars = 72;
    expect(detectDocumentModel(result)).toBeNull();
  });
});

describe('appearance recipes', () => {
  it('coordinates body, headings, code and math fonts', () => {
    const result = applyAppearance(defaults(), 'academic');

    expect(result.fonts).toEqual({
      headings: 'STIX Two Text',
      body: 'STIX Two Text',
      code: 'Roboto Mono',
    });
    expect(result.mathFontSet).toBe('stix2');
    expect(result.styles.h1.weight).toBe(600);
    expect(result.styles.h1.underline).toBe(false);
    expect(detectAppearance(result)).toBe('academic');
  });

  it('clears per-element family overrides to make inheritance predictable', () => {
    const settings = defaults();
    settings.styles.body.family = 'Lora';
    settings.styles.h1.family = 'Poppins';

    const result = applyAppearance(settings, 'modern');
    expect(result.styles.body.family).toBeUndefined();
    expect(result.styles.h1.family).toBeUndefined();
    expect(detectAppearance(result)).toBe('modern');
  });
});

describe('derived type scale and rhythm', () => {
  it('derives a monotonic type hierarchy from the body size', () => {
    const result = applyBaseFontSize(defaults(), 12);

    expect(result.styles.body.fontSize).toBe(12);
    expect(result.styles.title.fontSize).toBeGreaterThan(
      result.styles.h1.fontSize!,
    );
    expect(result.styles.h1.fontSize).toBeGreaterThan(
      result.styles.h2.fontSize!,
    );
    expect(result.styles.h2.fontSize).toBeGreaterThan(
      result.styles.h3.fontSize!,
    );
    expect(result.styles.h3.fontSize).toBeGreaterThan(
      result.styles.h4.fontSize!,
    );
    expect(result.styles['code-inline'].fontSize).toBeLessThan(12);
  });

  it('applies and detects one shared vertical rhythm', () => {
    const result = applyDensity(defaults(), 'airy');

    expect(result.styles.body.lineHeight).toBe(1.55);
    expect(result.styles.h1.marginAbove).toBe(1.85);
    expect(result.styles.h1.marginBelow).toBe(0.7);
    expect(result.styles.callout.padding).toBe(0.85);
    expect(detectDensity(result)).toBe('airy');
  });

  it('switches between paragraph spacing and first-line indentation', () => {
    const airy = applyDensity(defaults(), 'airy');
    const indented = applyParagraphSeparation(airy, 'indent');

    expect(indented.styles.body.marginAbove).toBe(0);
    expect(indented.styles.body.marginBelow).toBe(0);
    expect(indented.styles.body.firstLineIndent).toBe(1.5);
    expect(detectParagraphSeparation(indented)).toBe('indent');

    const spaced = applyParagraphSeparation(indented, 'spacing');
    expect(spaced.styles.body.marginAbove).toBe(1.1);
    expect(spaced.styles.body.marginBelow).toBe(1.1);
    expect(spaced.styles.body.firstLineIndent).toBe(0);
    expect(detectParagraphSeparation(spaced)).toBe('spacing');
  });

  it('preserves paragraph indentation when density changes', () => {
    const indented = applyParagraphSeparation(defaults(), 'indent');
    const airy = applyDensity(indented, 'airy');

    expect(airy.styles.body.lineHeight).toBe(1.55);
    expect(airy.styles.body.marginAbove).toBe(0);
    expect(airy.styles.body.marginBelow).toBe(0);
    expect(airy.styles.body.firstLineIndent).toBe(1.5);
    expect(detectDensity(airy)).toBe('airy');
  });
});

describe('semantic colour and pagination roles', () => {
  it('applies one accent to all emphasis roles', () => {
    const result = applyAccentColor(defaults(), '#7a1f5c');

    expect(result.styles.title.color).toBe('#7a1f5c');
    expect(result.styles.h4.color).toBe('#7a1f5c');
    expect(result.styles['inline-link'].color).toBe('#7a1f5c');
    expect(result.styles.callout.borderColor).toBe('#7a1f5c');
    expect(detectAccentColor(result)).toBe('#7a1f5c');
  });

  it('maps friendly pagination choices to existing footer syntax', () => {
    const centered = applyPaginationStyle(defaults(), 'center');
    expect(centered.footer).toBe(' | {page} | ');
    expect(detectPaginationStyle(centered)).toBe('center');

    const none = applyPaginationStyle(centered, 'none');
    expect(none.footer).toBe('');
    expect(detectPaginationStyle(none)).toBe('none');
  });
});
