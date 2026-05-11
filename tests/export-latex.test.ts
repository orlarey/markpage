import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// vi.hoisted runs ABOVE the vi.mock factories below, so the SVG /
// Blob constants are defined before the mock factories close over
// them. The mermaid stub is intentionally crafted to exercise every
// branch of sanitizeSvgForInkscape (foreignObject replacement, em-
// unit dy on <text>, display:none stripping, filter removal,
// max-width strip, fill forcing).
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
import { TEST_SETTINGS } from './fixtures/settings';

const CORPUS_DIR = join(process.cwd(), 'tests/corpus');

const cases = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

describe('exportLatex — corpus snapshots', () => {
  for (const name of cases) {
    it(name, async () => {
      const md = readFileSync(join(CORPUS_DIR, `${name}.md`), 'utf8');
      const result = await exportLatex(md, TEST_SETTINGS);
      await expect(result.tex).toMatchFileSnapshot(
        join(CORPUS_DIR, `${name}.tex`),
      );
      // When the doc carries a mermaid diagram, also snapshot the
      // sanitised SVG that ends up in the zip — that's where the
      // inkscape fixes live (em-unit dy resolution, foreignObject
      // replacement, …) and we want a regression alarm if any of
      // them silently change.
      const mermaidSvg = result.resources.get('images/mermaid-1.svg');
      if (mermaidSvg) {
        const text = await mermaidSvg.text();
        await expect(text).toMatchFileSnapshot(
          join(CORPUS_DIR, `${name}-mermaid-1.svg`),
        );
      }
    });
  }
});
