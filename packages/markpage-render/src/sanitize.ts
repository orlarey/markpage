/********************************* sanitize.ts *********************************
 *
 * Purpose: A document is data, never code. A link someone sends opens their
 *   Markdown in the reader's markpage (`?src=`, `?import=`): whatever it holds,
 *   the rendered page must not run anything — no event handler, no
 *   `javascript:` link, no script or frame.
 * How: The renderers escape what they write; this is the net under them. The
 *   HTML is parsed in a <template> (inert: no script runs, no image loads),
 *   cleaned there, then moved in. The same pass runs over the finished render,
 *   after MathJax / Mermaid have added theirs.
 *
 *******************************************************************************/

/** Elements that run or embed active content: never part of a document. */
const ACTIVE_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'meta',
  'link',
  'form',
  'portal',
]);

/** Attributes holding a URL the browser may navigate to or load. */
const URL_ATTRS = new Set([
  'href',
  'xlink:href',
  'src',
  'action',
  'formaction',
  'data',
  'poster',
  'background',
  'srcset',
  'to',
  'from',
  'values',
  'by',
]);

/** The scheme of a URL as a browser reads it: controls and blanks dropped. */
function schemeOf(value: string): string {
  // eslint-disable-next-line no-control-regex
  const v = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  const m = /^([a-z][a-z0-9+.-]*):/.exec(v);
  return m?.[1] ?? '';
}

/** Whether `value` may stay in URL attribute `name` of element `tag`. */
function urlAllowed(tag: string, name: string, value: string): boolean {
  const scheme = schemeOf(value);
  if (scheme === 'javascript' || scheme === 'vbscript') return false;
  if (scheme !== 'data') return true;
  // A picture's source never runs, whatever its type: exports inline images
  // as data: URLs, typed or not (a blob with no MIME type — one read from
  // GitHub, say — reads as data:application/octet-stream). Anywhere else (a
  // link, a form), a data: URL could open a page: dropped.
  return (tag === 'img' || tag === 'image' || tag === 'source') && name !== 'srcset';
}

/** Strip every active part out of `root`, in place. */
export function sanitizeRendered(root: ParentNode): void {
  for (const el of [...root.querySelectorAll('*')]) {
    const tag = el.localName.toLowerCase();
    if (ACTIVE_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (URL_ATTRS.has(name) && !urlAllowed(tag, name, attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/** Set `el`'s content to `html`, cleaned before anything in it can run. */
export function setSafeHtml(el: Element, html: string): void {
  const tpl = el.ownerDocument.createElement('template');
  tpl.innerHTML = html;
  sanitizeRendered(tpl.content);
  el.replaceChildren(tpl.content);
}
