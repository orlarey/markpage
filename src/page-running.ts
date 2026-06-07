/********************************* page-running.ts *****************************
 *
 * Purpose: Render the ` ```header ` / ` ```footer ` fences — running
 *   content for the page margin boxes (top / bottom band, 3 slots each:
 *   left | center | right). Variables `{page}`, `{pages}`, `{date}` are
 *   substituted at render time (counters or static date).
 * How: Each fence emits a `<style>` element containing a `@page` block
 *   with the relevant `@top-*` (header) or `@bottom-*` (footer) margin
 *   boxes filled via the CSS `content` property. paged.js scans the
 *   document's CSS at layout time and applies the @page rules globally.
 *   When multiple fences appear, the cascade picks the LAST declaration
 *   per box — which gives "last fence wins" semantics for free in
 *   Phase 1 (per-band run partitioning is Phase 2, see SPEC §26.7).
 *
 *   A fence ALWAYS emits all 3 slots of its band, even if some are
 *   empty (content: ""). Reason: SPEC §26.6 says a fence replaces the
 *   ENTIRE band, so missing slots must clear any prior fence's slots
 *   for the same boxes — without this, the cascade would keep the old
 *   content.
 *
 *******************************************************************************/

export type PageRunningKind = 'header' | 'footer';

/**
 * Purpose: Collect the CSS text of every `.page-running-fence` `<style>`
 *   element emitted by `renderPageRunning` and return them concatenated
 *   in document order. Caller passes the result as an additional
 *   stylesheet to paged.js so the `@page` rules are guaranteed to enter
 *   the CSSOM that paged.js polishes (relying on inline body `<style>`
 *   tags being read at the right phase is fragile across paged.js
 *   versions).
 * How: querySelectorAll on `style.page-running-fence`, read each one's
 *   textContent, join with newlines. Empty string when there are no
 *   fences. Does NOT remove the elements — they're harmless in flow
 *   (@page rules only apply in paginated contexts, and the inline
 *   <style> with no other rules contributes nothing to regular layout).
 */
export function collectPageRunningCss(root: HTMLElement): string {
  const styles = root.querySelectorAll<HTMLStyleElement>(
    'style.page-running-fence',
  );
  const parts: string[] = [];
  for (const s of styles) {
    const txt = s.textContent ?? '';
    if (txt !== '') parts.push(txt);
  }
  return parts.join('\n');
}

interface Slots {
  left: string;
  center: string;
  right: string;
}

/**
 * Purpose: Render a `<style>` element emitting the @page rules for one
 *   band (top for header, bottom for footer). The style tag lives in
 *   the document body — browsers tolerate <style> outside of <head> and
 *   paged.js reads @page rules from the full CSSOM.
 * How: Parse the body into 3 slots, convert each slot's mini-syntax
 *   into a CSS `content` value (string + counter()), emit one
 *   declaration per margin box. Always emit all 3 boxes of the band.
 */
export function renderPageRunning(
  kind: PageRunningKind,
  body: string,
  _args: string[] = [],
): string {
  const slots = parseSlots(body);
  const bandPrefix = kind === 'header' ? 'top' : 'bottom';
  const decls = [
    cssMarginBox(`${bandPrefix}-left`, slots.left),
    cssMarginBox(`${bandPrefix}-center`, slots.center),
    cssMarginBox(`${bandPrefix}-right`, slots.right),
  ].join('\n  ');
  return `<style class="page-running-fence" data-kind="${kind}">@page {
  ${decls}
}</style>\n`;
}

/**
 * Purpose: Emit one `@<box-name> { content: ... }` declaration for a
 *   margin box (e.g. `@top-left { content: "Mon doc"; }`).
 * How: Convert the slot's mini-syntax to a CSS content value via
 *   slotContentToCss. Always emit the box — see header doc on why
 *   missing slots must explicitly clear (content: "").
 */
function cssMarginBox(boxName: string, slotContent: string): string {
  return `@${boxName} { content: ${slotContentToCss(slotContent)}; }`;
}

/**
 * Purpose: Split the fence body into the 3 slots (left | center | right).
 * How: Take the first non-blank line of the body — multi-line per slot
 *   is reserved for later (CSS @page boxes have a fixed height anyway).
 *   Split on unescaped `|`; `\|` is a literal pipe. Trim each slot.
 *   Missing trailing pipes yield empty slots (e.g. `Title |` →
 *   {left: 'Title', center: '', right: ''}).
 */
function parseSlots(body: string): Slots {
  const line = body.split('\n').find((l) => l.trim() !== '') ?? '';
  const parts: string[] = [];
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && line[i + 1] === '|') {
      buf += '|';
      i += 1;
      continue;
    }
    if (c === '|') {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
  parts.push(buf);
  return {
    left: (parts[0] ?? '').trim(),
    center: (parts[1] ?? '').trim(),
    right: (parts[2] ?? '').trim(),
  };
}

/**
 * Purpose: Translate a slot's mini-syntax (plain text + `{var}`
 *   substitutions) into a CSS `content` value — a space-separated list
 *   of CSS strings and `counter(...)` calls.
 * How: Walk the slot, accumulating literal characters into a string
 *   buffer. On `{name}` emit the buffer as a JSON-escaped string token,
 *   then emit the corresponding counter / static substitution. Empty
 *   slot → `""` (a single empty string, valid CSS).
 */
function slotContentToCss(slot: string): string {
  if (slot === '') return '""';
  const tokens: string[] = [];
  let text = '';
  let i = 0;
  while (i < slot.length) {
    if (slot[i] === '{') {
      const end = slot.indexOf('}', i + 1);
      if (end !== -1) {
        const name = slot.slice(i + 1, end);
        if (text !== '') {
          tokens.push(cssString(text));
          text = '';
        }
        tokens.push(varToCss(name));
        i = end + 1;
        continue;
      }
    }
    text += slot[i];
    i += 1;
  }
  if (text !== '') tokens.push(cssString(text));
  return tokens.join(' ');
}

/**
 * Purpose: Map a `{name}` variable to its CSS content equivalent.
 * How: `page` / `pages` become `counter(...)` calls (resolved per-page
 *   by paged.js). `date` is substituted statically at render time
 *   (paged.js has no native date counter). `title` is Phase 4 — emits
 *   an empty string for now. Unknown names emit the literal `{name}`
 *   text so the user notices the typo.
 */
function varToCss(name: string): string {
  switch (name) {
    case 'page':
      return 'counter(page)';
    case 'pages':
      return 'counter(pages)';
    case 'date':
      return cssString(formatDate());
    case 'title':
      return '""';
    default:
      return cssString(`{${name}}`);
  }
}

/** Format the current date as the long French form (matches §9.2). */
function formatDate(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
    new Date(),
  );
}

/**
 * Purpose: Quote a string as a CSS `<string>` literal.
 * How: Backslash-escape backslashes and double quotes, wrap in `"..."`.
 *   CSS strings allow most characters literally; the two we MUST escape
 *   are `"` (delimiter) and `\` (escape char).
 */
function cssString(s: string): string {
  return `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
