import { describe, expect, it } from 'vitest';

import { settingsFontFamilies } from '../src/font-loader';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('settingsFontFamilies', () => {
  it('includes per-element font overrides as well as the global trio', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.styles.body.family = 'EB Garamond';
    settings.styles.h1.family = 'Inter';

    expect(settingsFontFamilies(settings)).toEqual([
      'Roboto Condensed',
      'Roboto Mono',
      'EB Garamond',
      'Inter',
    ]);
  });

  it('trims overrides and ignores empty or duplicate families', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.styles.body.family = '  Lora  ';
    settings.styles.h1.family = 'Roboto Condensed';
    settings.styles.h2.family = '   ';

    expect(settingsFontFamilies(settings)).toEqual([
      'Roboto Condensed',
      'Roboto Mono',
      'Lora',
    ]);
  });
});
