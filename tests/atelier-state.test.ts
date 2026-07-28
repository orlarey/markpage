import { describe, expect, it } from 'vitest';
import {
  atelierStateFromFrontmatter,
  DEFAULT_ATELIER_STATE,
  buildKeys,
  serializeCrans,
} from '../src/ui/atelier';
import { parseColorCrans } from '@orlarey/markpage-render';

const fm = (entries: Record<string, string>): Map<string, string> =>
  new Map(Object.entries(entries));

describe('atelierStateFromFrontmatter', () => {
  it('falls back to the defaults for an empty document', () => {
    const { state, crans } = atelierStateFromFrontmatter(fm({}));
    expect(state).toEqual(DEFAULT_ATELIER_STATE);
    expect(crans).toBe('');
  });

  it('reads every axis, unquoting color-crans', () => {
    const { state, crans } = atelierStateFromFrontmatter(
      fm({
        'document-type': 'book',
        'page-size': 'A5',
        'font-pair': 'moderne',
        'font-base': '12',
        'math-scale': '0.9',
        'color-hue': '210',
        'color-crans': '"corps:n5 titre:4,4"',
      }),
    );
    expect(state).toEqual({
      docType: 'book',
      pageSize: 'A5',
      pair: 'moderne',
      base: 12,
      mathScale: 0.9,
      hue: 210,
    });
    expect(crans).toBe('corps:n5 titre:4,4');
  });

  it('keeps defaults for absent or malformed numeric keys', () => {
    const { state } = atelierStateFromFrontmatter(
      fm({ 'font-pair': 'classique', 'font-base': 'oops' }),
    );
    expect(state.pair).toBe('classique');
    expect(state.base).toBe(DEFAULT_ATELIER_STATE.base);
    expect(state.hue).toBe(DEFAULT_ATELIER_STATE.hue);
  });

  it('round-trips what buildKeys writes', () => {
    const crans = parseColorCrans(
      'page:n0 corps:n5 titre:4,4 h1:4,3 notes:n3',
    );
    const written = buildKeys(
      { docType: 'paper', pageSize: 'B5', pair: 'technique', base: 11, mathScale: 1.05, hue: 42 },
      crans,
    );
    // buildKeys quotes color-crans; simulate what the parser hands back.
    const back = atelierStateFromFrontmatter(
      new Map([...written].map(([k, v]) => [k, v])),
    );
    expect(back.state).toEqual({
      docType: 'paper',
      pageSize: 'B5',
      pair: 'technique',
      base: 11,
      mathScale: 1.05,
      hue: 42,
    });
    expect(back.crans).toBe(serializeCrans(crans));
  });
});
