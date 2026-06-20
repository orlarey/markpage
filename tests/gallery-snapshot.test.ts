import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';

import { markpageBlocks } from '@markpage/marked';

// Visual-regression base for the block library: the help "block gallery" set,
// rendered through the marked plugin and snapshotted. These renderers emit
// deterministic SVG/HTML (no randomness, no async), so the markup snapshot IS
// the visual contract — any change to a renderer, its options handling, or the
// caption wrapper flips the snapshot and surfaces in review / CI.
//
// MathJax / Mermaid / ebnf blocks are intentionally excluded: their output is
// not byte-deterministic (font metrics, generated ids), so they belong to the
// Playwright render-assertion checks, not a markup snapshot.
const GALLERY: Record<string, string> = {
  'chart-line': '```chart line "Latency" y-min=0\nbuffer, ms\n64, 1.3\n128, 2.7\n256, 5.3\n```',
  'chart-bar': '```chart bar "Codecs"\ncodec, ms\nopus, 21\naac, 35\n```',
  bda: '```bda "Accumulator"\n1 : +~_\n```',
  category: '```category "Triangle"\nf : A -> B\ng : B -> C\nh : A -> C = g . f\n```',
  adt: '```adt\nExpr ::= Const(c) | Vec(v) | Op(o, Expr, Expr)\n```',
  diff: '```diff "Patch"\n ctx\n-old\n+new\n```',
  'tree-unicode': '```tree "Layout"\nproject\n  src\n    main.ts\n```',
  'tree-svg': '```tree svg "AST"\nExpr\n  Op\n    Add\n    Sub\n```',
};

const render = (md: string): string => {
  const m = new Marked();
  m.use(markpageBlocks());
  return m.parse(md) as string;
};

describe('block gallery (visual-regression snapshots)', () => {
  for (const [name, md] of Object.entries(GALLERY)) {
    it(`renders ${name} identically`, () => {
      expect(render(md)).toMatchSnapshot();
    });
  }

  it('is deterministic (same input → same output)', () => {
    for (const md of Object.values(GALLERY)) {
      expect(render(md)).toBe(render(md));
    }
  });
});
