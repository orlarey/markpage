import { describe, expect, it } from 'vitest';

import { stylePatchFromSource, applyProfilePatch } from '../src/stack-render';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('stylePatchFromSource', () => {
  it('returns null for a document that uses no stack features', () => {
    const src = ['---', 'title: Plain', 'font-body: Lora', '---', '# Hi'].join('\n');
    expect(stylePatchFromSource(src)).toBeNull();
  });

  it('resolves var(--token) into dotted style values', () => {
    const src = [
      '---',
      '--brand: "#0b3d91"',
      'styles.h1.color: var(--brand)',
      'styles.h1.fontSize: 22',
      '---',
      '# Hi',
    ].join('\n');
    const patch = stylePatchFromSource(src);
    expect(patch?.styles?.h1).toEqual({ color: '#0b3d91', fontSize: 22 });
  });

  it('explodes a markpage-profile embed, explicit dotted key winning', () => {
    const src = [
      '---',
      'markpage-profile: |',
      '  {"styles":{"h1":{"color":"#14223a","fontSize":22}}}',
      'styles.h1.color: "#000000"',
      '---',
      '# Hi',
    ].join('\n');
    const patch = stylePatchFromSource(src);
    expect(patch?.styles?.h1).toEqual({ color: '#000000', fontSize: 22 });
  });
});

describe('applyProfilePatch', () => {
  it('folds a patch into the per-element styles without touching the rest', () => {
    const out = applyProfilePatch(DEFAULT_SETTINGS, {
      styles: { h1: { color: '#0b3d91' } },
    });
    expect(out.styles.h1.color).toBe('#0b3d91');
    // other h1 attributes are preserved from the defaults
    expect(out.styles.h1.fontSize).toBe(DEFAULT_SETTINGS.styles.h1.fontSize);
    // unrelated elements untouched; input not mutated
    expect(out.styles.body).toEqual(DEFAULT_SETTINGS.styles.body);
    expect(DEFAULT_SETTINGS.styles.h1.color).not.toBe('#0b3d91');
  });

  it('maps fonts and layout keys', () => {
    const out = applyProfilePatch(DEFAULT_SETTINGS, {
      fonts: { body: 'Lora' },
      pageSize: 'A5',
      margins: { top: 20, right: 30, bottom: 20, left: 30 },
      pageNumbers: false,
    });
    expect(out.fonts.body).toBe('Lora');
    expect(out.pageSize).toBe('A5');
    expect(out.margins).toEqual({ top: 20, right: 30, bottom: 20, left: 30 });
    expect(out.footer).toBe('');
  });

  it('end to end: a token document patches the effective settings', () => {
    const patch = stylePatchFromSource(
      ['---', '--brand: "#1a5f3a"', 'styles.h1.color: var(--brand)', '---', '# Hi'].join('\n'),
    );
    const out = applyProfilePatch(DEFAULT_SETTINGS, patch!);
    expect(out.styles.h1.color).toBe('#1a5f3a');
  });
});
