import { describe, expect, it } from 'vitest';

import '@orlarey/markpage-render';
import { renderPreview } from '../src/preview';

/**
 * Purpose: Security — raw HTML in the markdown source must never reach
 *   `innerHTML` as live HTML; it must be HTML-escaped to inert text.
 *   marked's default behaviour is to pass `html` / inline `html` tokens
 *   through verbatim. The renderer override in marked-config.ts
 *   replaces both with an escaped text emission. SPEC: raw HTML is
 *   out of scope.
 *
 *   These tests pin the escape across every entry path: <script>,
 *   <iframe>, <img onerror>, inline event handlers, and the `<style>`
 *   block injection used by older XSS PoCs. They also confirm that
 *   our own renderer outputs (h1, p, strong, code, etc.) are NOT
 *   double-escaped — only `html` / inline-html TOKENS are filtered;
 *   the structural HTML our extensions emit goes through `text` or
 *   custom renderers, which keeps working as before.
 */

function renderToHtml(md: string): string {
  const target = document.createElement('div');
  renderPreview(target, md);
  return target.innerHTML;
}

function renderToDom(md: string): HTMLElement {
  const target = document.createElement('div');
  renderPreview(target, md);
  return target;
}

describe('raw HTML in markdown source is escaped, not executed', () => {
  // The right question for an XSS test is "is there a real <script> /
  // <iframe> / <a onclick> element in the DOM?", NOT "does the string
  // contain `<script`?" — innerHTML round-trip serialisation can
  // re-emit `"` (unescaped, inside a text node) and that's fine: the
  // browser parsed our `&quot;` into literal text, not into an HTML
  // attribute. So we check both: (a) the rendered DOM contains zero
  // dangerous elements / event handlers, and (b) the literal text of
  // the tag is still visible to the user as escaped prose.
  it('a top-level <script> tag never reaches the DOM as a real <script> element', () => {
    const dom = renderToDom('<script>alert(1)</script>');
    expect(dom.querySelector('script')).toBeNull();
    expect(dom.textContent).toContain('<script>alert(1)</script>');
  });

  it('an inline <img onerror=...> never reaches the DOM as a real <img> element', () => {
    const dom = renderToDom('Bonjour <img src=x onerror=alert(1)>');
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('an <iframe> block never reaches the DOM as a real <iframe> element', () => {
    const dom = renderToDom('<iframe src="https://evil.example"></iframe>');
    expect(dom.querySelector('iframe')).toBeNull();
    expect(dom.textContent).toContain('<iframe');
  });

  it('an inline event handler on a raw <a> never lands as a real attribute', () => {
    const dom = renderToDom('Click [me](#x) or <a href="#" onclick="alert(1)">trap</a>');
    // The markdown link IS a real <a> — but it has no onclick.
    // The raw <a> with onclick is text, not an element.
    const links = Array.from(dom.querySelectorAll('a'));
    expect(links.length).toBe(1);
    expect(links[0]!.getAttribute('href')).toBe('#x');
    expect(links[0]!.getAttribute('onclick')).toBeNull();
    expect(dom.textContent).toContain('<a href="#" onclick="alert(1)">trap</a>');
  });

  it('a <style> block never reaches the DOM as a real <style> element', () => {
    const dom = renderToDom('<style>body{display:none}</style>');
    expect(dom.querySelector('style')).toBeNull();
    expect(dom.textContent).toContain('<style>body{display:none}</style>');
  });

  it('user prose around an escaped raw tag stays intact', () => {
    const dom = renderToDom('Avant <b>BOLD</b> après.');
    // No real <b> element (the raw tag is text now).
    expect(dom.querySelector('b')).toBeNull();
    expect(dom.textContent?.trim()).toBe('Avant <b>BOLD</b> après.');
  });

  it('our own renderer outputs (markdown links, **bold**, headings) are NOT touched by the escape', () => {
    const html = renderToHtml('# Titre\n\nUn [lien](https://example.com) et **du gras**.');
    expect(html).toMatch(/<h1[^>]*>Titre<\/h1>/);
    expect(html).toMatch(/<a href="https:\/\/example\.com">lien<\/a>/);
    expect(html).toMatch(/<strong>du gras<\/strong>/);
  });
});
