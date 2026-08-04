import { describe, expect, it } from 'vitest';

import { filetCss } from '../src/style-emit';
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
