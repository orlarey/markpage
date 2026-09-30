import { describe, expect, it } from 'vitest';

import { sanitizeRendered, setSafeHtml } from '../packages/markpage-render/src/sanitize';
import { isLocalBridgeUrl } from '../src/mcp/index';
import { decodeShareContent, encodeShareContent, MAX_DECODED_BYTES } from '../src/share-url';

const clean = (html: string): string => {
  const el = document.createElement('div');
  setSafeHtml(el, html);
  return el.innerHTML;
};

describe('a document never runs code (sanitize.ts)', () => {
  it('drops event handlers and active elements', () => {
    const out = clean(
      '<h2 id="a" onmouseover="x()">T</h2><img src="p.png" onerror="x()"><script>x()</script>' +
        '<iframe src="https://e.test"></iframe><object data="x"></object><form action="/"></form>',
    );
    expect(out).toBe('<h2 id="a">T</h2><img src="p.png">');
  });

  it('drops script URLs, whatever their spelling', () => {
    for (const href of ['javascript:x()', 'JAVASCRIPT:x()', ' javascript:x()', 'java\tscript:x()', 'vbscript:x', 'data:text/html,<b>']) {
      expect(clean(`<a href="${href}">l</a>`)).toBe('<a>l</a>');
    }
    expect(clean('<svg><a xlink:href="javascript:x()"><text>t</text></a></svg>')).not.toContain('javascript');
    expect(clean('<svg><set attributeName="href" to="javascript:x()"></set></svg>')).not.toContain('javascript');
  });

  it('keeps what documents need', () => {
    const keep =
      '<a href="https://e.test/p">w</a><a href="#sec-a">r</a><a href="mailto:a@b.c">m</a>' +
      '<img src="blob:https://markpage.org/1"><img src="data:image/png;base64,AAAA">' +
      '<style>p{color:red}</style><span class="math-inline" data-math="x"></span>';
    expect(clean(keep)).toBe(keep);
    // …but a data: URL only as a picture.
    expect(clean('<a href="data:image/png;base64,AAAA">x</a>')).toBe('<a>x</a>');
  });

  it('cleans in place a render already built', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p><a href="javascript:x()" onclick="x()">l</a></p>';
    sanitizeRendered(el);
    expect(el.innerHTML).toBe('<p><a>l</a></p>');
  });
});

describe('the MCP bridge is on this machine', () => {
  it('loopback only', () => {
    expect(isLocalBridgeUrl('ws://127.0.0.1:7878/ws')).toBe(true);
    expect(isLocalBridgeUrl('ws://localhost:7878/ws')).toBe(true);
    expect(isLocalBridgeUrl('ws://[::1]:7878/ws')).toBe(true);
    expect(isLocalBridgeUrl('wss://evil.example/ws')).toBe(false);
    expect(isLocalBridgeUrl('ws://127.0.0.1.evil.example/ws')).toBe(false);
    expect(isLocalBridgeUrl('https://127.0.0.1/ws')).toBe(false);
    expect(isLocalBridgeUrl('not a url')).toBe(false);
  });
});

describe('a shared link cannot inflate without bound', () => {
  it('round-trips a document, refuses a bomb', async () => {
    expect(await decodeShareContent(await encodeShareContent('# Titre\n\nTexte.\n'))).toBe('# Titre\n\nTexte.\n');
    const bomb = await encodeShareContent('a'.repeat(MAX_DECODED_BYTES + 1));
    expect(bomb.length).toBeLessThan(20_000);
    await expect(decodeShareContent(bomb)).rejects.toThrow(/too large/);
  });
});
