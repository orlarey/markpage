import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import '@orlarey/markpage-render';
import { parseFrontmatter } from '@orlarey/markpage-render';
import { renderPreview, applyPreviewMetadata } from '../src/preview';
import { TEST_SETTINGS } from './fixtures/settings';

const CORPUS_DIR = join(process.cwd(), 'tests/corpus');

const cases = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

describe('renderPreview — corpus HTML snapshots', () => {
  for (const name of cases) {
    it(name, () => {
      const md = readFileSync(join(CORPUS_DIR, `${name}.md`), 'utf8');
      const container = document.createElement('div');
      renderPreview(container, md);
      applyPreviewMetadata(container, TEST_SETTINGS);
      // Mermaid / math post-processing is deliberately not run: it
      // mutates the DOM asynchronously and depends on browser layout.
      // We snapshot the marked-config output instead, which catches
      // the regressions we care about at the parser level.
      expect(container.innerHTML).toMatchFileSnapshot(
        join(CORPUS_DIR, `${name}.html`),
      );
    });
  }
});

describe('cover identity block order', () => {
  // Regression: the metadata block must sit AFTER the subtitle, not between the
  // title and the subtitle. If it lands in between, the paginated cover-break
  // rule (`.preview-metadata + *`) targets the subtitle and strands it on its
  // own page — a blank verso plus a lost subtitle. (bug: subtitle off-cover.)
  const src = [
    '---',
    'title: A guided tour',
    'subtitle: signatures and algebras',
    'author: Yann Orlarey',
    '---',
    '',
    '# Introduction',
    '',
    'Body.',
  ].join('\n');

  it('orders title → subtitle → metadata → content', () => {
    const { meta } = parseFrontmatter(src);
    const container = document.createElement('div');
    renderPreview(container, src, { on: true, depth: 3 });
    applyPreviewMetadata(container, TEST_SETTINGS, meta);
    const classes = Array.from(container.children).map(
      (el) => el.className || el.tagName.toLowerCase(),
    );
    const iTitle = classes.indexOf('doc-title');
    const iSub = classes.indexOf('doc-subtitle');
    const iMeta = classes.indexOf('preview-metadata');
    expect(iTitle).toBeGreaterThanOrEqual(0);
    expect(iSub).toBe(iTitle + 1);
    expect(iMeta).toBe(iSub + 1);
  });

  it('without a subtitle, metadata still follows the title directly', () => {
    const noSub = src.replace('subtitle: signatures and algebras\n', '');
    const { meta } = parseFrontmatter(noSub);
    const container = document.createElement('div');
    renderPreview(container, noSub, { on: true, depth: 3 });
    applyPreviewMetadata(container, TEST_SETTINGS, meta);
    const classes = Array.from(container.children).map(
      (el) => el.className || el.tagName.toLowerCase(),
    );
    expect(classes.indexOf('doc-subtitle')).toBe(-1);
    expect(classes.indexOf('preview-metadata')).toBe(
      classes.indexOf('doc-title') + 1,
    );
  });
});
