import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import '../src/marked-config';
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
