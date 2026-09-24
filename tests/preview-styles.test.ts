import { beforeEach, describe, expect, it } from 'vitest';

import { applyPreviewStyles } from '../src/preview';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('preview paragraph styles', () => {
  beforeEach(() => {
    document.getElementById('markpage-preview-styles')?.remove();
  });

  it('keeps CSS indentation confined to the continuous preview', () => {
    // Paragraphs separated by a first-line indent instead of whitespace.
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.styles.body = {
      ...settings.styles.body,
      marginAbove: 0,
      marginBelow: 0,
      firstLineIndent: 1.5,
    };

    applyPreviewStyles(settings);

    const css = document.getElementById('markpage-preview-styles')?.textContent;
    expect(css).toContain(
      '#preview-pane.continuous p.mp-paragraph-continuation',
    );
    expect(css).not.toContain('\n    #preview-pane p.mp-paragraph-continuation');
    expect(css).toContain('text-indent: 1.5em');
  });
});
