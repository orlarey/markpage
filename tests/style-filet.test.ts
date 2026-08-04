import { describe, expect, it } from 'vitest';

import { capsCss, filetCss, inlineCss } from '../src/style-emit';
import type { Style } from '../src/settings';

describe('filetCss — heading filet (rule) emission', () => {
  it('emits nothing when neither rule nor underline is set', () => {
    expect(filetCss({})).toBe('');
  });

  it('falls back to the legacy 1px grey rule below for underline:true', () => {
    expect(filetCss({ underline: true })).toBe(
      'border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em;',
    );
  });

  it('uses the resolved rule below with its own colour/width/style', () => {
    const s: Style = {
      rule: { position: 'below', color: '#c0507a', width: 2, style: 'dashed' },
    };
    expect(filetCss(s)).toBe(
      'border-bottom: 2px dashed #c0507a; padding-bottom: 0.2em;',
    );
  });

  it('supports a rule above (border-top + padding-top)', () => {
    const s: Style = { rule: { position: 'above', color: '#2b3a55' } };
    expect(filetCss(s)).toBe(
      'border-top: 1px solid #2b3a55; padding-top: 0.2em;',
    );
  });

  it('rule wins over the legacy underline boolean', () => {
    const s: Style = { underline: true, rule: { position: 'below', color: '#000000' } };
    expect(filetCss(s)).toBe(
      'border-bottom: 1px solid #000000; padding-bottom: 0.2em;',
    );
  });
});

describe('capsCss — capitals + tracking emission', () => {
  it('emits nothing when unset or none', () => {
    expect(capsCss({})).toBe('');
    expect(capsCss({ smallCaps: 'none' })).toBe('');
  });

  it('maps small → small-caps and all → uppercase', () => {
    expect(capsCss({ smallCaps: 'small' })).toBe('font-variant: small-caps;');
    expect(capsCss({ smallCaps: 'all' })).toBe('text-transform: uppercase;');
  });

  it('emits letter-spacing in em', () => {
    expect(capsCss({ letterSpacing: 0.08 })).toBe('letter-spacing: 0.08em;');
  });

  it('combines caps and tracking', () => {
    expect(capsCss({ smallCaps: 'small', letterSpacing: 0.06 })).toBe(
      'font-variant: small-caps; letter-spacing: 0.06em;',
    );
  });

  it('is folded into inlineCss so body/blocks pick it up', () => {
    expect(inlineCss({ smallCaps: 'small' })).toContain(
      'font-variant: small-caps;',
    );
  });
});
