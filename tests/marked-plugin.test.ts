import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';

import { blockNames } from '@markpage/blocks';
import { markpageBlocks } from '@markpage/marked';

const render = (md: string): string => {
  const m = new Marked();
  m.use(markpageBlocks());
  return m.parse(md) as string;
};

describe('markpageBlocks (marked plugin)', () => {
  it('renders a registered fence (chart) to inline SVG', () => {
    const html = render('```chart line "Sales"\nx, y\n1, 2\n2, 4\n```');
    expect(html).toContain('chart-svg');
    expect(html).toContain('<svg');
  });

  it('honours chart options from the info string', () => {
    const html = render('```chart line y-ref=0.5:"mid"\nx, y\n1, 0.2\n2, 0.9\n```');
    expect(html).toContain('chart-ref');
    expect(html).toContain('mid');
  });

  it('falls through to the default renderer for unknown fences', () => {
    const html = render('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).not.toContain('chart-svg');
  });

  it('leaves plain prose untouched', () => {
    expect(render('Just **bold** text.')).toContain('<strong>bold</strong>');
  });

  it('registers every migrated renderer', () => {
    for (const name of ['chart', 'bda', 'category', 'adt', 'diff', 'tree']) {
      expect(blockNames()).toContain(name);
    }
  });

  it('renders a bda circuit to SVG', () => {
    expect(render('```bda\n1 : +~_\n```')).toContain('<svg');
  });

  it('renders a category diagram to SVG', () => {
    const html = render('```category\nf : A -> B\ng : B -> C\nh : A -> C = g . f\n```');
    expect(html).toContain('<svg');
  });

  it('colours a unified diff', () => {
    const html = render('```diff\n+added\n-removed\n```');
    expect(html.toLowerCase()).toContain('diff');
  });

  it('wraps a quoted-title fence in a numbered figure', () => {
    const html = render('```chart line "Sales"\nx, y\n1, 2\n```');
    expect(html).toContain('<figure');
    expect(html).toContain('Figure 1: Sales');
  });

  it('numbers figures and listings independently, resetting per parse', () => {
    const md =
      '```bda "First"\n1 : +~_\n```\n\n```bda "Second"\n1 : +~_\n```\n\n```diff "A patch"\n+x\n```';
    const html = render(md);
    expect(html).toContain('Figure 1: First');
    expect(html).toContain('Figure 2: Second');
    expect(html).toContain('Listing 1: A patch');
    // a second parse restarts numbering
    expect(render('```chart "Again"\nx,y\n1,2\n```')).toContain('Figure 1: Again');
  });

  it('can be configured with custom labels / disabled captions', () => {
    const fr = new Marked();
    fr.use(markpageBlocks({ labels: { figure: 'Figure' } }));
    expect(fr.parse('```chart "Ventes"\nx,y\n1,2\n```') as string).toContain(
      'Figure 1: Ventes',
    );
    const off = new Marked();
    off.use(markpageBlocks({ captions: false }));
    expect(off.parse('```chart "X"\nx,y\n1,2\n```') as string).not.toContain(
      '<figure',
    );
  });
});
