import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';

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
});
