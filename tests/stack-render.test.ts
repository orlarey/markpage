import { describe, expect, it } from 'vitest';

import { parseStackDoc, type StackDoc } from '@orlarey/markpage-render';
import {
  flattenForRender,
  applyProfilePatch,
  deriveSettingsForDoc,
  extractStyleFromSettings,
  getExtendsFromSource,
  planProfileMigration,
  setExtendsInSource,
  setFrontmatterKeys,
  writeStyleToLeaf,
} from '../src/stack-render';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';

const clone = (s: PdfSettings): PdfSettings => JSON.parse(JSON.stringify(s)) as PdfSettings;

const T = '```'; // a fence, kept out of template literals
const noResolve = async (): Promise<StackDoc | null> => null;
const fromMap =
  (docs: Record<string, string>) =>
  async (name: string): Promise<StackDoc | null> =>
    name in docs ? parseStackDoc(docs[name], name) : null;

describe('flattenForRender', () => {
  it('returns null for a document that uses no stack feature', async () => {
    const md = ['---', 'title: Plain', 'font-body: Lora', '---', '# Hi'].join('\n');
    expect(
      await flattenForRender(md, { settings: DEFAULT_SETTINGS, resolveByName: noResolve }),
    ).toBeNull();
  });

  it('resolves var(--token) into a style patch, body unchanged', async () => {
    const md = ['---', '--brand: "#0b3d91"', 'styles.h2.color: var(--brand)', '---', '## Sub'].join(
      '\n',
    );
    const flat = await flattenForRender(md, {
      settings: DEFAULT_SETTINGS,
      resolveByName: noResolve,
    });
    expect(flat?.patch.styles?.h2?.color).toBe('#0b3d91');
    expect(flat?.md).toContain('## Sub');
  });

  it('folds an extends parent frame around the leaf body', async () => {
    const papier = ['---', 'styles.h1.color: "#14223a"', '---', 'FRAME-TOP', '', T + 'insert', T].join(
      '\n',
    );
    const leaf = ['---', 'extends: papier', '---', 'LEAF-CONTENT'].join('\n');
    const flat = await flattenForRender(leaf, {
      settings: DEFAULT_SETTINGS,
      resolveByName: fromMap({ papier }),
    });
    expect(flat).not.toBeNull();
    const md = flat!.md;
    expect(md.indexOf('FRAME-TOP')).toBeLessThan(md.indexOf('LEAF-CONTENT')); // frame wraps content
    expect(flat!.patch.styles?.h1?.color).toBe('#14223a'); // inherited from the parent
  });

  it('lets the leaf override an ancestor style', async () => {
    const papier = ['---', 'styles.h1.color: "#14223a"', '---', T + 'insert', T].join('\n');
    const leaf = ['---', 'extends: papier', 'styles.h1.color: "#000000"', '---', 'X'].join('\n');
    const flat = await flattenForRender(leaf, {
      settings: DEFAULT_SETTINGS,
      resolveByName: fromMap({ papier }),
    });
    expect(flat!.patch.styles?.h1?.color).toBe('#000000');
  });

  it('degrades (throws) on a missing parent — caller falls back', async () => {
    const leaf = ['---', 'extends: nope', '---', 'X'].join('\n');
    await expect(
      flattenForRender(leaf, { settings: DEFAULT_SETTINGS, resolveByName: noResolve }),
    ).rejects.toThrow();
  });
});

describe('extractStyleFromSettings', () => {
  const defaults = JSON.stringify({
    fonts: { body: 'Roboto' },
    styles: { h1: { color: '#000000' } },
    pageSize: 'A4',
  });

  it('extracts only the active profile’s delta from the defaults', () => {
    const active = JSON.stringify({
      fonts: { body: 'Roboto' },
      styles: { h1: { color: '#ff0000' } }, // changed
      pageSize: 'A4',
    });
    const r = extractStyleFromSettings('---\ntitle: X\n---\nBody', 'mon-style', active, defaults);
    expect(r).not.toBeNull();
    const style = parseStackDoc(r!.styleMd, 's');
    const leaf = parseStackDoc(r!.leafMd, 'l');
    expect(style.frontmatter.get('styles.h1.color')).toBe('"#ff0000"');
    expect(style.frontmatter.has('page-size')).toBe(false); // unchanged → not in the delta
    expect(leaf.frontmatter.get('title')).toBe('X');
    expect(leaf.frontmatter.get('extends')).toBe('mon-style');
  });

  it('returns null when the active profile equals the defaults', () => {
    expect(extractStyleFromSettings('Body', 'mon-style', defaults, defaults)).toBeNull();
  });
});

describe('getExtendsFromSource / setExtendsInSource', () => {
  it('reads the extends value, or null', () => {
    expect(getExtendsFromSource('---\nextends: papier\n---\nBody')).toBe('papier');
    expect(getExtendsFromSource('---\ntitle: X\n---\nBody')).toBeNull();
    expect(getExtendsFromSource('# No front-matter')).toBeNull();
  });

  it('sets extends — replacing, inserting, or creating the front-matter', () => {
    // replace
    expect(setExtendsInSource('---\nextends: old\ntitle: X\n---\nB', 'new')).toBe(
      '---\nextends: new\ntitle: X\n---\nB',
    );
    // insert into existing front-matter (after the opening fence)
    expect(setExtendsInSource('---\ntitle: X\n---\nB', 'papier')).toBe(
      '---\nextends: papier\ntitle: X\n---\nB',
    );
    // create front-matter when absent
    expect(setExtendsInSource('# Hi', 'papier')).toBe('---\nextends: papier\n---\n\n# Hi');
  });

  it('clears extends with null, leaving the rest intact', () => {
    expect(setExtendsInSource('---\nextends: papier\ntitle: X\n---\nB', null)).toBe(
      '---\ntitle: X\n---\nB',
    );
    expect(setExtendsInSource('---\ntitle: X\n---\nB', null)).toBe('---\ntitle: X\n---\nB');
  });
});

describe('setFrontmatterKeys', () => {
  it('replaces a present key, appends a new one, deletes a listed one', () => {
    const src = '---\ntitle: X\nstyles.h1.color: "#000000"\n---\nBody';
    const out = setFrontmatterKeys(
      src,
      new Map([
        ['styles.h1.color', '"#ff0000"'], // replace in place
        ['page-size', 'A5'], // append
      ]),
      ['title'], // delete
    );
    expect(out).toBe('---\nstyles.h1.color: "#ff0000"\npage-size: A5\n---\nBody');
  });

  it('creates the front-matter block when absent', () => {
    expect(setFrontmatterKeys('# Hi', new Map([['page-size', 'A5']]))).toBe(
      '---\npage-size: A5\n---\n\n# Hi',
    );
    // nothing to write → source untouched
    expect(setFrontmatterKeys('# Hi', new Map())).toBe('# Hi');
  });

  it('leaves unrelated keys and the body verbatim', () => {
    const src = '---\nextends: papier\ntitle: X\n---\n\nThe body\n\nmore';
    const out = setFrontmatterKeys(src, new Map([['styles.h2.color', '"#123456"']]));
    expect(out).toContain('extends: papier');
    expect(out).toContain('title: X');
    expect(out).toContain('styles.h2.color: "#123456"');
    expect(out).toContain('The body\n\nmore');
  });
});

describe('writeStyleToLeaf', () => {
  it('writes a changed setting as a dotted key, leaving extends/title intact', () => {
    const settings = clone(DEFAULT_SETTINGS);
    settings.styles.h1.color = '#abcdef';
    const src = '---\nextends: papier\ntitle: Lettre\n---\nBody';
    const out = writeStyleToLeaf(src, settings, DEFAULT_SETTINGS);
    expect(out).toContain('extends: papier');
    expect(out).toContain('title: Lettre');
    expect(out).toContain('styles.h1.color: "#abcdef"');
  });

  it('removes a key once its control is back at the default', () => {
    const src = '---\nstyles.h1.color: "#abcdef"\ntitle: X\n---\nBody';
    const out = writeStyleToLeaf(src, DEFAULT_SETTINGS, DEFAULT_SETTINGS); // all at default
    expect(out).not.toContain('styles.h1.color');
    expect(out).toContain('title: X'); // non-style key kept
  });

  it('round-trips through the render path: the written key drives the patch', async () => {
    const settings = clone(DEFAULT_SETTINGS);
    settings.styles.h2.color = '#0b3d91';
    const leaf = writeStyleToLeaf('---\ntitle: X\n---\nBody', settings, DEFAULT_SETTINGS);
    const flat = await flattenForRender(leaf, {
      settings: DEFAULT_SETTINGS,
      resolveByName: noResolve,
    });
    expect(flat?.patch.styles?.h2?.color).toBe('#0b3d91');
  });
});

describe('applyProfilePatch', () => {
  it('folds a patch into the per-element styles without touching the rest', () => {
    const out = applyProfilePatch(DEFAULT_SETTINGS, { styles: { h1: { color: '#0b3d91' } } });
    expect(out.styles.h1.color).toBe('#0b3d91');
    expect(out.styles.h1.fontSize).toBe(DEFAULT_SETTINGS.styles.h1.fontSize);
    expect(out.styles.body).toEqual(DEFAULT_SETTINGS.styles.body);
    expect(DEFAULT_SETTINGS.styles.h1.color).not.toBe('#0b3d91'); // input untouched
  });

  it('maps fonts and layout keys', () => {
    const out = applyProfilePatch(DEFAULT_SETTINGS, {
      fonts: { body: 'Lora' },
      pageSize: 'A5',
      margins: { top: 20, right: 30, bottom: 20, left: 30 },
      pageNumbers: false,
    });
    expect(out.fonts.body).toBe('Lora');
    expect(out.pageSize).toBe('A5');
    expect(out.margins).toEqual({ top: 20, right: 30, bottom: 20, left: 30 });
    expect(out.footer).toBe('');
  });
});

describe('deriveSettingsForDoc', () => {
  it('leaves settings untouched for a doc with no stack feature (pre-migration fallback)', async () => {
    const active = { ...clone(DEFAULT_SETTINGS), language: 'en' as const };
    active.styles.h1.color = '#ff0000'; // active profile's own customization
    const md = ['---', 'title: Plain', '---', '# Hi'].join('\n');
    const out = await deriveSettingsForDoc(md, active, noResolve);
    expect(out).toBe(active); // untouched, not even a clone
  });

  it('roots the style at true factory defaults, not the active profile', async () => {
    const active = clone(DEFAULT_SETTINGS);
    active.styles.h2.color = '#ff0000'; // active profile's own h2 — must NOT leak in
    const md = ['---', 'styles.h1.color: "#0b3d91"', '---', 'X'].join('\n');
    const out = await deriveSettingsForDoc(md, active, noResolve);
    expect(out.styles.h1.color).toBe('#0b3d91'); // from the doc's own chain
    expect(out.styles.h2.color).toBe(DEFAULT_SETTINGS.styles.h2.color); // default.md, not the active profile
  });

  it('preserves non-style fields from the current settings unchanged', async () => {
    const active = { ...clone(DEFAULT_SETTINGS), language: 'en' as const, mathScale: 1.5 };
    const md = ['---', 'styles.h1.color: "#0b3d91"', '---', 'X'].join('\n');
    const out = await deriveSettingsForDoc(md, active, noResolve);
    expect(out.language).toBe('en');
    expect(out.mathScale).toBe(1.5);
  });

  it('inherits style through an extends chain', async () => {
    const papier = ['---', 'styles.h1.color: "#14223a"', '---', T + 'insert', T].join('\n');
    const leaf = ['---', 'extends: papier', '---', 'X'].join('\n');
    const out = await deriveSettingsForDoc(leaf, clone(DEFAULT_SETTINGS), fromMap({ papier }));
    expect(out.styles.h1.color).toBe('#14223a');
  });

  it('falls back to current settings on a broken chain (missing parent)', async () => {
    const active = clone(DEFAULT_SETTINGS);
    const md = ['---', 'extends: nope', '---', 'X'].join('\n');
    const out = await deriveSettingsForDoc(md, active, noResolve);
    expect(out).toBe(active);
  });
});

describe('planProfileMigration', () => {
  it('plans nothing when the profile equals the factory defaults', () => {
    const profiles = [{ uuid: 'p1', displayName: 'Par défaut', settings: clone(DEFAULT_SETTINGS), active: true }];
    const docs = [{ uuid: 'd1', content: '# Plain\n' }];
    const plan = planProfileMigration(profiles, new Set(), docs);
    expect(plan.styleDocsToCreate).toEqual([]);
    expect(plan.leavesToUpdate).toEqual([]);
  });

  it('creates a style doc for a customized profile and extends every unstyled doc onto it', () => {
    const custom = clone(DEFAULT_SETTINGS);
    custom.pageSize = 'A5';
    custom.styles.h1.color = '#cc0044';
    const profiles = [{ uuid: 'p1', displayName: 'Par défaut', settings: custom, active: true }];
    const docs = [
      { uuid: 'd1', content: '# Doc A\n\nAlpha.\n' },
      { uuid: 'd2', content: '# Doc B\n\nBeta.\n' },
    ];
    const plan = planProfileMigration(profiles, new Set(), docs);
    expect(plan.styleDocsToCreate).toHaveLength(1);
    expect(plan.styleDocsToCreate[0].name).toBe('Par défaut');
    expect(plan.styleDocsToCreate[0].markdown).toContain('page-size: A5');
    expect(plan.styleDocsToCreate[0].markdown).toContain('styles.h1.color: "#cc0044"');
    expect(plan.leavesToUpdate).toHaveLength(2);
    expect(getExtendsFromSource(plan.leavesToUpdate[0].markdown)).toBe('Par défaut');
    expect(plan.leavesToUpdate[0].markdown).toContain('Alpha.');
  });

  it('is idempotent: a doc that already has extends/dotted keys is left alone', () => {
    const custom = clone(DEFAULT_SETTINGS);
    custom.pageSize = 'A5';
    const profiles = [{ uuid: 'p1', displayName: 'Par défaut', settings: custom, active: true }];
    const docs = [
      { uuid: 'd1', content: '---\nextends: Par défaut\n---\n\n# Doc A\n' }, // already migrated
      { uuid: 'd2', content: '---\nstyles.h1.color: "#000"\n---\nX' }, // has its own style
    ];
    const plan = planProfileMigration(profiles, new Set(['Par défaut']), docs);
    expect(plan.styleDocsToCreate).toEqual([]); // name already taken — not recreated
    expect(plan.leavesToUpdate).toEqual([]); // both already use a stack feature
  });

  it('reuses (never recreates) a style doc already present under the profile name', () => {
    const custom = clone(DEFAULT_SETTINGS);
    custom.pageSize = 'A5';
    const profiles = [{ uuid: 'p1', displayName: 'Par défaut', settings: custom, active: true }];
    const docs = [{ uuid: 'd1', content: '# Doc A\n' }]; // still needs migrating
    const plan = planProfileMigration(profiles, new Set(['Par défaut']), docs);
    expect(plan.styleDocsToCreate).toEqual([]); // name already taken — not recreated
    expect(plan.leavesToUpdate).toHaveLength(1);
    expect(getExtendsFromSource(plan.leavesToUpdate[0].markdown)).toBe('Par défaut');
    expect(plan.leavesToUpdate[0].markdown).toContain('# Doc A');
  });
});
