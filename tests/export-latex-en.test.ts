// Lightweight English-locale variant of the LaTeX corpus tests. We
// reuse a handful of FR corpus markdown files and pivot the
// settings' `language` field to `'en'`; the snapshots land alongside
// the French ones with a `.en.tex` suffix. This locks the
// language-aware parts of the export (babel package, theorem env
// names, header / warning banners) — see SPEC §22.

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mocks identical to export-latex.test.ts so resource loading stays
// deterministic. We don't import from there because vi.mock is
// hoisted to the top of *each* test file.
const { MERMAID_STUB_SVG, CHART_STUB_SVG, IMAGE_STUB_BLOB } = vi.hoisted(
  () => ({
    MERMAID_STUB_SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" style="max-width: 100%; background-color: white">
  <defs>
    <filter id="drop"><feDropShadow dx="2" dy="2"/></filter>
  </defs>
  <style>.actor{fill:#eee} .hide{display:none}</style>
  <g>
    <rect x="10" y="10" width="80" height="40" class="actor" filter="url(#drop)"/>
    <text class="actor hide" x="50" y="35">Actor A</text>
    <foreignObject x="10" y="10" width="80" height="40"><div xmlns="http://www.w3.org/1999/xhtml">Actor (HTML)</div></foreignObject>
    <text x="100" y="80" dy="1em">Message</text>
  </g>
</svg>`,
    CHART_STUB_SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect x="10" y="40" width="20" height="150" fill="steelblue"/><rect x="40" y="10" width="20" height="180" fill="steelblue"/></svg>`,
    IMAGE_STUB_BLOB: new Blob(['fake-png-payload'], { type: 'image/png' }),
  }),
);

vi.mock('../src/mermaid', () => ({
  renderMermaid: async () => ({ ok: true, svg: MERMAID_STUB_SVG }),
}));
vi.mock('../src/chart', () => ({
  renderChart: () => CHART_STUB_SVG,
}));
vi.mock('../src/image-store', () => ({
  getImage: async () => IMAGE_STUB_BLOB,
}));

import '../src/marked-config';
import { exportLatex } from '../src/export-latex';
import { TEST_SETTINGS_EN } from './fixtures/settings';

const CORPUS_DIR = join(process.cwd(), 'tests/corpus');

// We only run a few cases — the goal isn't full coverage (the FR
// suite handles that) but to lock the *language-aware* bits of the
// export. These three together show every language-aware difference:
//   - 01-headings  → header banner, preamble babel package.
//   - 07-admonitions → theorem env names ("Theorem" vs "Théorème").
//   - 10-mermaid   → SVG warning banner.
const CASES = ['01-headings', '07-admonitions', '10-mermaid'];

describe('exportLatex — English-locale corpus snapshots', () => {
  for (const name of CASES) {
    it(name, async () => {
      const md = readFileSync(join(CORPUS_DIR, `${name}.md`), 'utf8');
      const result = await exportLatex(md, TEST_SETTINGS_EN);
      await expect(result.tex).toMatchFileSnapshot(
        join(CORPUS_DIR, `${name}.en.tex`),
      );
    });
  }
});
