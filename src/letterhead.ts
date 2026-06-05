/********************************* letterhead.ts *******************************
 *
 * Purpose: Render the ` ```sender ` and ` ```recipient ` fences — paired
 *   address blocks for invoices, devis, courriers, propositions
 *   commerciales. No automatic labels — the user types whatever heading
 *   they want as content (markdown bold, italic, …). `sender` stays in
 *   flex flow (left column); `recipient` defaults to *window-positioned*
 *   absolute layout at standard French DL envelope coordinates. An
 *   explicit `flow` flag on `recipient` opts back into flex (right
 *   column).
 * How: Each block emits a `<div class="letterhead letterhead-<kind>">`
 *   wrapping the rendered body. Inline markdown is rendered via a tiny
 *   local formatter — bypassing `marked.parseInline` which would re-fire
 *   the preprocess / postprocess hooks and clobber the footnote registry
 *   (cf. SPEC §17.3).
 *
 *******************************************************************************/

export type LetterheadKind = 'sender' | 'recipient' | 'signature';

/**
 * Purpose: Render a `<div class="letterhead letterhead-<kind>">` containing
 *   only the body lines joined by `<br>`. No label is generated.
 * How: Trim blank head / tail lines, escape HTML, then apply a tiny inline
 *   formatter for `**bold**`, `*italic*`, `[text](url)`. Lines are joined
 *   with `<br>` — addresses are dense, not paragraphs.
 *
 *   For `recipient`, the default positioning class is `letterhead-window`
 *   (absolute, calibrated for the FR DL envelope window, see
 *   `pagedCss` in `preview-paginated.ts`). Passing `flow` in `args` swaps
 *   it for `letterhead-flow` (in-flow, flex right column — for the
 *   Anglo-Saxon-style letter or any layout where the recipient should
 *   sit beside the sender). `args` is ignored on `sender` and
 *   `signature` — the latter is always rendered as a right-aligned
 *   flex column (via the CSS `.letterhead-signature` rule), typically
 *   at the end of a letter for an image + name + title sign-off.
 */
export function renderLetterhead(
  kind: LetterheadKind,
  body: string,
  args: string[] = [],
): string {
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  // Signature with at least one image line: emit image(s) + caption as
  // siblings so CSS can overlay the caption inside the image's rectangle
  // (bottom-left). Without an image, fall through to the standard br-joined
  // rendering — there's nothing to overlay onto.
  if (kind === 'signature') {
    const imageLines = lines.filter((l) => IMAGE_LINE_RE.test(l));
    if (imageLines.length > 0) {
      const textLines = lines.filter((l) => !IMAGE_LINE_RE.test(l));
      const imgHtml = imageLines.map(formatInline).join('');
      const captionHtml =
        textLines.length > 0
          ? `<div class="letterhead-signature-caption">${textLines.map(formatInline).join('<br>')}</div>`
          : '';
      return `<div class="letterhead letterhead-signature">${imgHtml}${captionHtml}</div>\n`;
    }
  }

  const bodyHtml = lines.map(formatInline).join('<br>');
  const positionClass =
    kind === 'recipient'
      ? args.includes('flow')
        ? ' letterhead-flow'
        : ' letterhead-window'
      : '';
  return (
    `<div class="letterhead letterhead-${kind}${positionClass}">` +
    bodyHtml +
    `</div>\n`
  );
}

/** A line that is exactly an image markdown atom, after trim. */
const IMAGE_LINE_RE = /^!\[[^\]\n]*\]\([^)\n]+\)$/;

/**
 * Purpose: Wrap runs of consecutive `.letterhead` siblings under `root` in
 *   a `<div class="letterhead-group">` flex container so the sender and an
 *   in-flow recipient lay out side-by-side. If a window-positioned
 *   recipient (the default) is in the run, the group also gets
 *   `letterhead-group--window` so CSS can reserve enough vertical space —
 *   absolute positioning takes the recipient out of flow, so without
 *   reservation the content following the group flows over the recipient
 *   block (cf. SPEC §25.4).
 * How: Walk top-level children once. When we hit a `.letterhead`, scan
 *   forward to the end of the run, wrap them in a fresh group div. The
 *   wrap happens *after* `annotateSourceLines` has stamped each letterhead,
 *   so `data-line` attributes are preserved on the children (the group
 *   has none) and scroll-sync still resolves correctly via its ancestor
 *   walk (cf. SPEC §14.2).
 */
export function groupLetterheads(root: HTMLElement): void {
  const doc = root.ownerDocument;
  let cursor: Element | null = root.firstElementChild;
  while (cursor !== null) {
    if (!cursor.classList?.contains('letterhead')) {
      cursor = cursor.nextElementSibling;
      continue;
    }
    const run: Element[] = [cursor];
    let next: Element | null = cursor.nextElementSibling;
    while (next !== null && next.classList?.contains('letterhead')) {
      run.push(next);
      next = next.nextElementSibling;
    }
    const group = doc.createElement('div');
    group.className = 'letterhead-group';
    if (run.some((el) => el.classList.contains('letterhead-window'))) {
      group.classList.add('letterhead-group--window');
    }
    cursor.parentNode!.insertBefore(group, cursor);
    for (const el of run) group.appendChild(el);
    cursor = next;
  }
}

/**
 * Purpose: Tiny inline formatter — applies `**bold**`, `*italic*`,
 *   `![alt](url)`, `[text](url)` after HTML-escaping the raw text.
 * How: HTML-escape first (so `<` and `&` in addresses are safe), then run
 *   replace passes. Order matters:
 *     - bold before italic so `**…**` isn't eaten by the single-star
 *       italic rule;
 *     - images BEFORE links so `![alt](url)` is consumed as an image
 *       rather than `!` + `[alt](url)` link.
 *   Empty alt is allowed in images (common for drag-dropped pictures
 *   that markpage stamps with `![](img://sha)`); empty text is NOT
 *   allowed in links (would match too eagerly).
 */
function formatInline(line: string): string {
  let s = escapeHtml(line);
  s = s.replaceAll(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replaceAll(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replaceAll(
    /!\[([^\]\n]*)\]\(([^)\n]+)\)/g,
    (_match, alt: string, url: string) =>
      `<img alt="${escapeAttr(alt)}" src="${escapeAttr(url)}">`,
  );
  s = s.replaceAll(
    /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
    (_match, text: string, url: string) =>
      `<a href="${escapeAttr(url)}">${text}</a>`,
  );
  return s;
}

/**
 * Purpose: HTML-escape text-content characters.
 * How: Replace `&`, `<`, `>` with named entities.
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Purpose: Escape a string for safe insertion inside a `"`-quoted HTML attr.
 * How: Replace `&` and `"`.
 */
function escapeAttr(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
