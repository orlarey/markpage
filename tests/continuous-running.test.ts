import { describe, expect, it } from 'vitest';

import {
  firstPageBands,
  renderPageRunning,
  slotToHtml,
  zoneToText,
} from '@orlarey/markpage-render';

/** The continuous preview draws page 1's header / footer itself. */
describe('first-page bands for the continuous preview', () => {
  const root = (html: string): HTMLElement => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d;
  };

  it('takes the fences before the first content (the title block does not count)', () => {
    const r = root(
      '<h1 class="doc-title">T</h1>' +
        renderPageRunning('header', 'A | B | C') +
        renderPageRunning('header', 'Premier |  | ', ['first']) +
        '<p>texte</p>' +
        renderPageRunning('footer', 'plus tard')
    );
    const bands = firstPageBands(r);
    expect(bands.header).toEqual({ left: 'Premier', center: '', right: '' });
    expect(bands.footer).toBeUndefined();
  });

  it('renders a slot: emphasis, variables, unknown ones kept, HTML escaped', () => {
    expect(
      slotToHtml('**{title}** · p. {page}/{pages} {oups} <b>', {
        title: 'A&B',
        page: '1',
        pages: '1',
      })
    ).toBe('<strong>A&amp;B</strong> · p. 1/1 {oups} &lt;b&gt;');
  });

  it('writes a style zone as text, with the page-1 values', () => {
    const ctx = {
      folio: 1,
      chapter: 'Intro',
      section: 'Contexte',
      doctitle: 'Rapport',
      author: 'Y. O.',
    };
    expect(zoneToText(['doctitle', { text: 'draft' }, 'folio'], ctx)).toBe('Rapport · draft · 1');
    expect(zoneToText(['folioRoman', 'section'], ctx)).toBe('i · Contexte');
    expect(zoneToText([], ctx)).toBe('');
  });
});

import { runningApparatusCss, runningDateText, setDocumentDate } from '@orlarey/markpage-render';

describe('running date and single-sided composition', () => {
  it('prints the document date when it has one, else today', () => {
    setDocumentDate('1er mars 2026');
    expect(runningDateText()).toBe('1er mars 2026');
    setDocumentDate('  ');
    expect(runningDateText()).toMatch(/\d{4}/);
    setDocumentDate(undefined);
  });

  it('single-sided: the verso pages repeat the recto composition', () => {
    const zones = (m: 'folio' | 'date') => ({ inner: [m], center: [], outer: [] });
    const empty = { inner: [], center: [], outer: [] };
    const app = {
      header: { verso: empty, recto: empty },
      footer: { verso: empty, recto: zones('folio') },
    } as const;
    const simplex = runningApparatusCss(app as never, { duplex: false });
    const left = /@page :left \{ @bottom-left \{ content: ([^;]*);/.exec(simplex)?.[1];
    expect(left).toBe('counter(page)');
    const duplex = runningApparatusCss(app as never, { duplex: true });
    expect(/@page :left \{ @bottom-left \{ content: ([^;]*);/.exec(duplex)?.[1]).toBe('""');
  });
});
