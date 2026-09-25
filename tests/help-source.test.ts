// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The built-in help quotes Markdown that holds code fences. Inside a code
 * block nothing is interpreted, so an escaped fence (\`\`\`) shows up as is: an
 * example holding a fence must be wrapped in a LONGER fence instead.
 */
describe('built-in help sources', () => {
  for (const lang of ['fr', 'en']) {
    it(`HELP.${lang}.md never escapes backticks`, () => {
      const src = readFileSync(new URL(`../src/HELP.${lang}.md`, import.meta.url), 'utf8');
      expect(src).not.toContain('\\`\\`');
    });
  }
});
