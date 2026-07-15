import { describe, expect, it } from 'vitest';

import {
  computeLineStates,
  findAllSplits,
  splitLongPreBlocks,
  walkLine,
} from '../packages/markpage-render/src/pre-split';

const INIT = {
  inBlockComment: false,
  ocamlCommentDepth: 0,
  inTripleDouble: false,
  inTripleSingle: false,
  inTemplate: false,
  bracketDepth: 0,
};

describe('walkLine — balance tracking', () => {
  it('tracks bracket depth across simple code', () => {
    const after = walkLine('interface Foo {', INIT);
    expect(after.bracketDepth).toBe(1);
  });

  it('decrements bracket depth on closing chars', () => {
    const after = walkLine('}', { ...INIT, bracketDepth: 1 });
    expect(after.bracketDepth).toBe(0);
  });

  it('walks single-quoted strings without leaking bracket counts', () => {
    const after = walkLine("const s = '} {';", INIT);
    expect(after.bracketDepth).toBe(0);
  });

  it('handles escaped quotes inside strings', () => {
    const after = walkLine(`const s = "a \\"} {\\"";`, INIT);
    expect(after.bracketDepth).toBe(0);
    expect(after.inTripleDouble).toBe(false);
  });

  it('enters and leaves block comments', () => {
    const s1 = walkLine('/* open', INIT);
    expect(s1.inBlockComment).toBe(true);
    const s2 = walkLine('still in comment', s1);
    expect(s2.inBlockComment).toBe(true);
    const s3 = walkLine('end */ code() {', s2);
    expect(s3.inBlockComment).toBe(false);
    expect(s3.bracketDepth).toBe(1);
  });

  it('ignores bracket-like chars inside line comments', () => {
    const after = walkLine('do() // ignored } { (', INIT);
    expect(after.bracketDepth).toBe(0);
  });

  it('ignores bracket-like chars inside block comments', () => {
    const after = walkLine('/* { } ( */', INIT);
    expect(after.bracketDepth).toBe(0);
  });

  it('tracks Python triple-quoted strings across lines', () => {
    const s1 = walkLine('s = """', INIT);
    expect(s1.inTripleDouble).toBe(true);
    const s2 = walkLine('still inside { not counted', s1);
    expect(s2.bracketDepth).toBe(0);
    const s3 = walkLine('"""', s2);
    expect(s3.inTripleDouble).toBe(false);
  });

  it('tracks JS template literals across lines', () => {
    const s1 = walkLine('const t = `hello', INIT);
    expect(s1.inTemplate).toBe(true);
    const s2 = walkLine('world`;', s1);
    expect(s2.inTemplate).toBe(false);
  });

  it('counts OCaml nested comments', () => {
    const s1 = walkLine('(* outer (* inner *) still outer', INIT);
    expect(s1.ocamlCommentDepth).toBe(1);
    const s2 = walkLine('*)', s1);
    expect(s2.ocamlCommentDepth).toBe(0);
  });

  it('treats # as line comment (Python / Bash)', () => {
    const after = walkLine('x = 1  # not a bracket {', INIT);
    expect(after.bracketDepth).toBe(0);
  });

  it('treats -- as line comment (SQL / Haskell)', () => {
    const after = walkLine('SELECT * FROM t -- ignored {', INIT);
    expect(after.bracketDepth).toBe(0);
  });
});

describe('computeLineStates', () => {
  it('produces one state per input line', () => {
    const lines = ['a', 'b', 'c'];
    const states = computeLineStates(lines);
    expect(states).toHaveLength(3);
  });

  it('end-of-block state is depth=0 for balanced code', () => {
    const lines = ['{', '  x;', '}'];
    const states = computeLineStates(lines);
    expect(states[2].bracketDepth).toBe(0);
  });
});

describe('findAllSplits', () => {
  it('returns no splits when content fits in one chunk', () => {
    const lines = Array(20).fill('x');
    expect(findAllSplits(lines, 35, 8)).toEqual([]);
  });

  it('prefers blank lines as split points (TS interface case)', () => {
    // Mimics the §9.1 layout: three small interfaces separated by blank lines.
    const lines = [
      'interface A {',
      '  x: number;',
      '  y: number;',
      '}',
      '', // line 4 — natural cut
      'interface B {',
      '  z: number;',
      '}',
      '', // line 8 — natural cut
      'interface C {',
      '  a: 1; b: 2; c: 3; d: 4; e: 5;',
      '  // padding to push past target',
      '  f: 6; g: 7; h: 8; i: 9; j: 10;',
      '  k: 11; l: 12; m: 13; n: 14;',
      '  o: 15; p: 16; q: 17; r: 18;',
      '  s: 19; t: 20; u: 21; v: 22;',
      '}',
    ];
    // With target=8 / slack=4, pivot lands at line 8 — a blank line, which
    // wins on distance over line 4 (same score, further from pivot). The
    // remaining tail then fits in one final chunk.
    const splits = findAllSplits(lines, 8, 4);
    expect(splits).toEqual([8]);
    // And each cut must be a safe blank-or-block-end, not mid-statement.
    for (const cut of splits) {
      const line = lines[cut];
      expect(line.trim() === '' || line.trim().endsWith('}')).toBe(true);
    }
  });

  it('avoids cutting inside a multi-line string', () => {
    // The middle of the block is a Python triple-quoted string with blank
    // lines inside it (which would otherwise score 100). The tracker must
    // refuse those.
    const lines = [
      'def f():',
      '    pass',
      '',
      'doc = """',
      '',                       // blank line BUT inside string
      'line a',
      '',                       // blank line BUT inside string
      'line b',
      '"""',
      '',                       // blank, now actually outside the string
      'def g():',
      '    pass',
    ];
    const splits = findAllSplits(lines, 5, 4);
    // Cuts must not land on lines 4 or 6 (blank-but-unsafe). Allowed: line 9
    // (blank-and-safe) or any other safe line.
    for (const cut of splits) {
      expect([4, 6]).not.toContain(cut);
    }
  });

  it('falls back to a hard cut when no safe candidate exists', () => {
    // 50 lines all inside an open template literal — nothing safe to cut on.
    const lines = ['const t = `'];
    for (let i = 0; i < 50; i += 1) lines.push(`line ${i}`);
    // No closing backtick — entire body is "unsafe". The algorithm must
    // still return cuts (hard cuts at the pivot) so content doesn't stay
    // in one giant <pre>.
    const splits = findAllSplits(lines, 20, 4);
    expect(splits.length).toBeGreaterThan(0);
  });
});

describe('splitLongPreBlocks — DOM rewrite', () => {
  it('leaves short <pre> blocks alone', () => {
    const doc = makeDoc(
      '<div><pre><code class="language-ts">interface A { x: 1; }</code></pre></div>',
    );
    const root = doc.body.firstElementChild as HTMLElement;
    splitLongPreBlocks(root, 35, 8);
    expect(root.querySelectorAll('pre')).toHaveLength(1);
  });

  it('splits an oversized <pre> into multiple chunks', () => {
    const body = Array(60).fill('  x;').join('\n');
    const doc = makeDoc(
      `<div><pre><code class="language-ts">interface A {\n${body}\n}</code></pre></div>`,
    );
    const root = doc.body.firstElementChild as HTMLElement;
    splitLongPreBlocks(root, 20, 5);
    const pres = root.querySelectorAll('pre');
    expect(pres.length).toBeGreaterThanOrEqual(2);
    // First chunk carries the role marker.
    expect(pres[0].classList.contains('pre-chunk-first')).toBe(true);
    // Last chunk carries the role marker.
    expect(pres[pres.length - 1].classList.contains('pre-chunk-last')).toBe(true);
  });

  it('preserves data-line on the first chunk', () => {
    const body = Array(60).fill('  x;').join('\n');
    const doc = makeDoc(
      `<div><pre data-line="42"><code class="language-ts">interface A {\n${body}\n}</code></pre></div>`,
    );
    const root = doc.body.firstElementChild as HTMLElement;
    splitLongPreBlocks(root, 20, 5);
    const pres = root.querySelectorAll<HTMLElement>('pre');
    expect(pres[0].dataset.line).toBe('42');
    // Other chunks must NOT carry data-line, else scroll-sync jumps to the
    // wrong line when clicked.
    for (let i = 1; i < pres.length; i += 1) {
      expect(pres[i].dataset.line).toBeUndefined();
    }
  });

  it('preserves the language class across chunks', () => {
    const body = Array(60).fill('  x;').join('\n');
    const doc = makeDoc(
      `<div><pre><code class="language-ts">interface A {\n${body}\n}</code></pre></div>`,
    );
    const root = doc.body.firstElementChild as HTMLElement;
    splitLongPreBlocks(root, 20, 5);
    for (const code of root.querySelectorAll('pre code')) {
      expect(code.className).toMatch(/language-ts/);
    }
  });
});

/** Build a happy-dom document with `html` as body content. */
function makeDoc(html: string): Document {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
  return doc;
}
