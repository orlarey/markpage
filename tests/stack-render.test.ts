import { describe, expect, it } from 'vitest';

import { parseStackDoc, type StackDoc } from '@orlarey/markpage-render';
import {
  flattenForRender,
  applyProfilePatch,
  extractStyleFromSettings,
  getExtendsFromSource,
  setExtendsInSource,
} from '../src/stack-render';
import { DEFAULT_SETTINGS } from '../src/settings';

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
