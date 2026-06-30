import { describe, expect, it } from 'vitest';

import {
  ROOT_NAME,
  resolveChain,
  insertInto,
  flatten,
  resolveTokens,
  normalizeProfile,
  parseStackDoc,
  serializeStackDoc,
  StackCycleError,
  StackMissingRefError,
  TokenMissingError,
  TokenCycleError,
  type StackDoc,
  type ResolveDoc,
} from '@orlarey/markpage-render';

// ---- helpers --------------------------------------------------------------

const T = '```'; // a fence, kept out of template literals to avoid escaping

const mk = (
  name: string,
  fm: Record<string, string>,
  body = '',
): StackDoc => ({ name, frontmatter: new Map(Object.entries(fm)), body });

const resolver = (docs: StackDoc[]): ResolveDoc => {
  const byName = new Map(docs.map((d) => [d.name, d]));
  return (ref) => byName.get(ref) ?? null;
};

// The factory root: extends itself (the fixpoint), defines every default.
const DEFAULT = mk(ROOT_NAME, {
  extends: ROOT_NAME,
  'page-size': 'A4',
  'font-heading': 'Helvetica',
  'styles.h1.color': '"#000000"',
  'styles.body.fontSize': '11',
});

// ---- chain resolution -----------------------------------------------------

describe('resolveChain', () => {
  it('roots a no-extends document directly at default.md', () => {
    const leaf = mk('leaf', { title: 'Hello' }, '# Hi');
    const chain = resolveChain(leaf, resolver([DEFAULT, leaf]));
    expect(chain.map((d) => d.name)).toEqual(['leaf', ROOT_NAME]);
  });

  it('follows a multi-level chain up to the fixpoint', () => {
    const style = mk('style', { extends: ROOT_NAME });
    const leaf = mk('leaf', { extends: 'style' });
    const chain = resolveChain(leaf, resolver([DEFAULT, style, leaf]));
    expect(chain.map((d) => d.name)).toEqual(['leaf', 'style', ROOT_NAME]);
  });

  it('treats default.md self-reference as the base case, not a cycle', () => {
    const chain = resolveChain(DEFAULT, resolver([DEFAULT]));
    expect(chain.map((d) => d.name)).toEqual([ROOT_NAME]);
  });

  it('throws on a real cycle', () => {
    const a = mk('a', { extends: 'b' });
    const b = mk('b', { extends: 'a' });
    expect(() => resolveChain(a, resolver([DEFAULT, a, b]))).toThrow(StackCycleError);
  });

  it('throws on an illegal self-reference (non-root)', () => {
    const x = mk('x', { extends: 'x' });
    expect(() => resolveChain(x, resolver([DEFAULT, x]))).toThrow(StackCycleError);
  });

  it('throws on a missing reference', () => {
    const leaf = mk('leaf', { extends: 'nope' });
    expect(() => resolveChain(leaf, resolver([DEFAULT, leaf]))).toThrow(StackMissingRefError);
  });
});

// ---- front-matter merge ---------------------------------------------------

describe('mergeFrontmatter', () => {
  const style = mk('style', {
    extends: ROOT_NAME,
    'font-heading': '"Source Serif 4"',
    'styles.h1.color': '"#14223a"',
  });

  it('lets the child win and accumulates per-attribute dotted keys', () => {
    const leaf = mk('leaf', {
      extends: 'style',
      title: 'Lettre',
      'styles.h1.fontSize': '22',
    });
    const fm = flatten(leaf, resolver([DEFAULT, style, leaf])).frontmatter;
    expect(fm.get('font-heading')).toBe('"Source Serif 4"'); // style > default Helvetica
    expect(fm.get('styles.h1.color')).toBe('"#14223a"'); // style > default
    expect(fm.get('styles.h1.fontSize')).toBe('22'); // leaf adds its own attribute
    expect(fm.get('styles.body.fontSize')).toBe('11'); // inherited from default.md
    expect(fm.get('page-size')).toBe('A4'); // inherited from default.md
    expect(fm.get('title')).toBe('Lettre');
  });

  it('consumes the extends key (absent from the flattened output)', () => {
    const leaf = mk('leaf', { extends: 'style' });
    const fm = flatten(leaf, resolver([DEFAULT, style, leaf])).frontmatter;
    expect(fm.has('extends')).toBe(false);
  });

  it('reset values fall back to the default.md value, escaping ancestors', () => {
    const leaf = mk('leaf', { extends: 'style', 'font-heading': 'revert' });
    const fm = flatten(leaf, resolver([DEFAULT, style, leaf])).frontmatter;
    expect(fm.get('font-heading')).toBe('Helvetica'); // not style's Source Serif
  });

  it('reset deletes the key when default.md does not define it', () => {
    const leaf = mk('leaf', { extends: 'style', 'styles.quote.borderColor': 'unset' });
    const fm = flatten(leaf, resolver([DEFAULT, style, leaf])).frontmatter;
    expect(fm.has('styles.quote.borderColor')).toBe(false);
  });
});

// ---- body fold ------------------------------------------------------------

describe('insertInto', () => {
  it('replaces the first insert hole with the content', () => {
    expect(insertInto(['A', '', T + 'insert', T, '', 'B'].join('\n'), 'X')).toBe('A\n\nX\n\nB');
  });

  it('concatenates parent-then-child when there is no hole', () => {
    expect(insertInto('Frame top', 'X')).toBe('Frame top\n\nX');
  });

  it('handles a frame that is only the hole', () => {
    expect(insertInto([T + 'insert', T].join('\n'), 'X')).toBe('X');
  });

  it('accepts a named hole opener', () => {
    expect(insertInto([T + 'insert body', T].join('\n'), 'X')).toBe('X');
  });
});

describe('flatten — body fold end to end', () => {
  it('nests letter content inside the courrier frame inside the papier frame', () => {
    const papier = mk(
      'papier',
      { extends: ROOT_NAME },
      [T + 'sender', 'Atelier', T, '', T + 'insert', T].join('\n'),
    );
    const courrier = mk(
      'courrier',
      { extends: 'papier' },
      [T + 'insert', T, '', T + 'signature', 'Sakina', T].join('\n'),
    );
    const lettre = mk('lettre', { extends: 'courrier' }, 'Objet : test\n\nMadame,');

    const out = flatten(lettre, resolver([DEFAULT, papier, courrier, lettre]));
    const body = out.body;
    // sender (papier, outermost) → letter content → signature (courrier)
    expect(body).toContain(T + 'sender');
    expect(body.indexOf(T + 'sender')).toBeLessThan(body.indexOf('Objet : test'));
    expect(body.indexOf('Objet : test')).toBeLessThan(body.indexOf(T + 'signature'));
    // default.md (empty body) is a no-op — no stray blank frames
    expect(body.startsWith(T + 'sender')).toBe(true);
  });
});

// ---- raw front-matter parse / serialize -----------------------------------

describe('parseStackDoc', () => {
  it('captures known, dotted, token and extends keys + block scalars', () => {
    const src = [
      '---',
      'extends: papier-en-tete',
      '--brand: "#0b3d91"',
      'styles.h1.color: var(--brand)',
      'mathjax-preamble: |',
      '  \\newcommand{\\R}{\\mathbb{R}}',
      '---',
      '',
      '# Body',
      'text',
    ].join('\n');
    const d = parseStackDoc(src, 'doc');
    expect(d.frontmatter.get('extends')).toBe('papier-en-tete');
    expect(d.frontmatter.get('--brand')).toBe('"#0b3d91"');
    expect(d.frontmatter.get('styles.h1.color')).toBe('var(--brand)');
    expect(d.frontmatter.get('mathjax-preamble')).toContain('newcommand');
    expect(d.body).toBe('# Body\ntext');
  });

  it('returns the whole source as body when there is no front-matter', () => {
    const d = parseStackDoc('# Just a title\n\ntext', 'doc');
    expect(d.frontmatter.size).toBe(0);
    expect(d.body).toBe('# Just a title\n\ntext');
  });
});

describe('serializeStackDoc', () => {
  it('round-trips through parseStackDoc', () => {
    const fm = new Map([
      ['page-size', 'A4'],
      ['styles.h1.color', '"#000"'],
      ['--brand', '"#0b3d91"'],
    ]);
    const re = parseStackDoc(serializeStackDoc(fm, '# Hi'), 'x');
    expect(re.frontmatter.get('page-size')).toBe('A4');
    expect(re.frontmatter.get('styles.h1.color')).toBe('"#000"');
    expect(re.frontmatter.get('--brand')).toBe('"#0b3d91"');
    expect(re.body).toBe('# Hi');
  });

  it('emits the body alone when the front-matter is empty', () => {
    expect(serializeStackDoc(new Map(), '# Hi')).toBe('# Hi');
  });
});

// ---- token resolution (render-time) ---------------------------------------

describe('resolveTokens', () => {
  it('substitutes var(--x) in any value, using fallbacks for undefined tokens', () => {
    const fm = new Map([
      ['--brand', '"#0b3d91"'],
      ['styles.h1.color', 'var(--brand)'],
      ['measureChars', 'var(--measure, 66)'],
    ]);
    const out = resolveTokens(fm);
    expect(out.get('styles.h1.color')).toBe('"#0b3d91"');
    expect(out.get('measureChars')).toBe('66'); // --measure undefined → fallback
  });

  it('resolves token → token references', () => {
    const fm = new Map([
      ['--brand', '"#0b3d91"'],
      ['--accent', 'var(--brand)'],
      ['styles.quote.borderColor', 'var(--accent)'],
    ]);
    const out = resolveTokens(fm);
    expect(out.get('--accent')).toBe('"#0b3d91"');
    expect(out.get('styles.quote.borderColor')).toBe('"#0b3d91"');
  });

  it('throws on an undefined token without fallback', () => {
    expect(() => resolveTokens(new Map([['x', 'var(--nope)']]))).toThrow(TokenMissingError);
  });

  it('throws on a token cycle', () => {
    const fm = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ]);
    expect(() => resolveTokens(fm)).toThrow(TokenCycleError);
  });

  it('leaves a literal value untouched', () => {
    const out = resolveTokens(new Map([['styles.h1.color', '"#14223a"']]));
    expect(out.get('styles.h1.color')).toBe('"#14223a"');
  });
});

// ---- markpage-profile embed normalization ---------------------------------

describe('normalizeProfile', () => {
  it('explodes fonts / styles / layout / customFonts to flat & dotted keys', () => {
    const json = JSON.stringify({
      fonts: { headings: 'Inter', body: 'Lora', code: 'Fira Code' },
      styles: {
        body: { fontSize: 11, align: 'justify' },
        h1: { fontSize: 22, color: '#14223a' },
        quote: { borderTop: true, borderWidth: 3 },
      },
      pageSize: 'A4',
      margins: { top: 25, right: 35, bottom: 25, left: 35 },
      pageNumbers: true,
      customFonts: [{ family: 'Lora', sha: 'abc' }],
    });
    const m = normalizeProfile(json);
    expect(m.get('font-heading')).toBe('"Inter"');
    expect(m.get('font-body')).toBe('"Lora"');
    expect(m.get('font-mono')).toBe('"Fira Code"');
    expect(m.get('styles.body.fontSize')).toBe('11');
    expect(m.get('styles.body.align')).toBe('"justify"');
    expect(m.get('styles.h1.color')).toBe('"#14223a"');
    expect(m.get('styles.quote.borderTop')).toBe('true');
    expect(m.get('page-size')).toBe('A4');
    expect(m.get('margins')).toBe('25 35 25 35');
    expect(m.get('page-numbers')).toBe('true');
    expect(JSON.parse(m.get('customFonts') ?? '[]')).toEqual([{ family: 'Lora', sha: 'abc' }]);
  });

  it('returns no keys for a malformed embed', () => {
    expect(normalizeProfile('not json').size).toBe(0);
  });
});

describe('parseStackDoc — markpage-profile embed', () => {
  it('explodes the embed, an explicit dotted key winning over it', () => {
    const src = [
      '---',
      'markpage-profile: |',
      '  {"fonts":{"headings":"Inter"},"styles":{"h1":{"color":"#14223a","fontSize":22}}}',
      'styles.h1.color: "#000000"',
      '---',
      'Body',
    ].join('\n');
    const d = parseStackDoc(src, 'doc');
    expect(d.frontmatter.has('markpage-profile')).toBe(false); // consumed
    expect(d.frontmatter.get('font-heading')).toBe('"Inter"'); // from embed
    expect(d.frontmatter.get('styles.h1.fontSize')).toBe('22'); // from embed
    expect(d.frontmatter.get('styles.h1.color')).toBe('"#000000"'); // explicit > embed
  });
});

// ---- customFonts union ----------------------------------------------------

describe('mergeFrontmatter — customFonts union', () => {
  it('unions custom fonts down the chain, deduped by sha', () => {
    const def = mk(ROOT_NAME, {
      extends: ROOT_NAME,
      customFonts: JSON.stringify([{ family: 'Base', sha: 'base' }]),
    });
    const parent = mk('p', {
      extends: ROOT_NAME,
      customFonts: JSON.stringify([{ family: 'Lora', sha: 'lora' }]),
    });
    const leaf = mk('leaf', {
      extends: 'p',
      customFonts: JSON.stringify([
        { family: 'Inter', sha: 'inter' },
        { family: 'Lora', sha: 'lora' }, // duplicate of the parent's
      ]),
    });
    const fm = flatten(leaf, resolver([def, parent, leaf])).frontmatter;
    const shas = (JSON.parse(fm.get('customFonts') ?? '[]') as { sha: string }[])
      .map((f) => f.sha)
      .sort();
    expect(shas).toEqual(['base', 'inter', 'lora']); // union of all, lora once
  });
});
