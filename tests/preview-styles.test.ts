import { beforeEach, describe, expect, it } from 'vitest';

import { applyPreviewStyles } from '../src/preview';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyParagraphSeparation } from '../src/style-recipes';

describe('preview paragraph styles', () => {
  beforeEach(() => {
    document.getElementById('markpage-preview-styles')?.remove();
  });

  it('keeps CSS indentation confined to the continuous preview', () => {
    const settings = applyParagraphSeparation(
      structuredClone(DEFAULT_SETTINGS),
      'indent',
    );

    applyPreviewStyles(settings);

    const css = document.getElementById('markpage-preview-styles')?.textContent;
    expect(css).toContain(
      '#preview-pane.continuous p.mp-paragraph-continuation',
    );
    expect(css).not.toContain('\n    #preview-pane p.mp-paragraph-continuation');
    expect(css).toContain('text-indent: 1.5em');
  });
});
