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
      // The caption overlays the signature image; with no image, it is the
      // signature itself and stays in the flow.
      const textOnly = imageLines.length === 0 ? ' letterhead-signature--text' : '';
      return `<div class="letterhead letterhead-signature${textOnly}">${imgHtml}${captionHtml}</div>\n`;
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
 * Page geometry the letterhead layout needs, in millimetres. `textBlockInner` /
 * `liveAreaInner` are the text block's and the header/footer band's inner
 * margins: when they differ, the body carries an inner-gutter padding and the
 * signature / window recipient shift by it; omit them (or pass `null`) for no
 * shift.
 */
export interface LetterheadGeom {
  margins: { top: number; right: number; bottom: number; left: number };
  pageW: number;
  pageH: number;
  textBlockInner?: number | null;
  liveAreaInner?: number | null;
}

/**
 * Purpose: the letterhead *layout* CSS (sender / recipient / signature
 *   positioning) as a string to splice into the page stylesheet handed to
 *   paged.js. Shared by the host app ([src/preview-paginated.ts]) and the
 *   VS Code extension's webview so the two can't drift — the same drift that
 *   left the extension rendering the recipient stacked under the sender
 *   instead of at the FR DL envelope window.
 * How: the positions are computed from the page geometry. The recipient
 *   window sits at the norm's 110 mm / 40 mm from the A4 edge, resolved
 *   against `.pagedjs_page_content` (paged.js positions it relative), so the
 *   profile margins are subtracted. Scoped with `:where(…)` to the paged
 *   containers of both consumers; `break-*` props inside are best-effort
 *   (paged.js honours them inconsistently — the real keep is the group wrap).
 */
export function letterheadCss(
  g: LetterheadGeom,
  opts: {
    /** The containers the rules apply in (default: the paged containers). */
    scope?: string;
    /** What the window's coordinates are relative to: the page's text block
     *  (paged.js: `.pagedjs_page_content`) or the whole sheet (the continuous
     *  preview's page-wide `.mp-continuous-sheet`). */
    windowOrigin?: 'content' | 'sheet';
  } = {},
): string {
  const m = g.margins;
  const fromSheet = opts.windowOrigin === 'sheet';
  // Inner-gutter compensation: how far the body's text block is pushed in past
  // the band anchors. 0 when they coincide (or are not given).
  const gutter =
    g.textBlockInner != null && g.liveAreaInner != null
      ? Math.max(0, g.textBlockInner - g.liveAreaInner)
      : 0;
  const sigLeft = Math.max(0, 110 - m.left - gutter);
  // The continuous sheet shrinks to its pane (its text reflows): horizontal
  // positions are then fractions of the sheet's width, not millimetres.
  const frac = (mm: number): string => `${((mm / g.pageW) * 100).toFixed(4)}%`;
  // An in-flow margin resolves against the content width C = sheet − margins.
  const sheetX = (mm: number): string =>
    `calc(${(mm / g.pageW).toFixed(6)} * (100% + ${m.left + m.right}mm) - ${m.left}mm)`;
  const sigImgMaxW = (g.pageW - m.left - m.right) / 4;
  const winLeft = fromSheet ? frac(110) : `${Math.max(0, 110 - m.left)}mm`;
  const winWidth = fromSheet ? frac(85) : '85mm';
  const sigMargin = fromSheet ? sheetX(110) : `${sigLeft}mm`;
  const winTop = fromSheet ? 40 : Math.max(0, 40 - m.top);
  const S = opts.scope ?? ':where(#preview-pane, #markpage-print-target, #markpage-preview)';
  return `
    /* Letterhead — sender / recipient blocks for invoices, devis, courriers.
       Adjacent siblings are wrapped in a .letterhead-group by groupLetterheads()
       so the sender + an in-flow ('flow') recipient lay out side-by-side. The
       default recipient is window-positioned (absolute, FR DL envelope window)
       and lives outside the flex flow. */
    ${S} .letterhead-group {
      display: flex;
      gap: 4mm;
      align-items: flex-start;
      margin: 0 0 1.4em;
      break-inside: avoid;
    }
    ${S} .letterhead {
      flex: 0 1 calc(50% - 2mm);
      line-height: 1.4;
    }
    /* 'recipient flow' opt-out — recipient stays in the flex flow, right column. */
    ${S} .letterhead-recipient.letterhead-flow {
      margin-left: auto;
    }
    /* Signature block — left edge aligned with the FR DL window recipient
       (110 mm from the page edge). position: relative + flex: 0 0 auto so it
       sizes to its image; the caption overlays bottom-left inside it. */
    ${S} .letterhead-signature {
      position: relative;
      flex: 0 0 auto;
      margin-left: ${sigMargin};
      margin-top: 2em;
      break-inside: avoid;
    }
    ${S} .letterhead-signature img {
      max-width: ${sigImgMaxW}mm;
      max-height: 30mm;
    }
    ${S} .letterhead-signature-caption {
      position: absolute;
      bottom: 0;
      left: 0;
      white-space: nowrap;
      line-height: 1.2;
    }
    ${S} .letterhead-signature--text .letterhead-signature-caption {
      position: static;
      line-height: 1.4;
    }
    /* Default recipient: absolute at the FR DL envelope window (left edge at
       110 mm, top at 40 mm from the A4 edge; coords resolve against
       .pagedjs_page_content, so subtract the profile margins). */
    ${S} .letterhead-recipient.letterhead-window {
      position: absolute;
      left: ${winLeft};
      top: ${winTop}mm;
      width: ${winWidth};
      margin: 0;
      flex: none;
    }
    /* The window recipient is out of flow — reserve 70 mm so following content
       doesn't flow over it. display: block (not the inherited flex) so the
       absolute recipient anchors on the page, not on the group's variable top. */
    ${S} .letterhead-group--window {
      display: block;
      min-height: 70mm;
    }
    ${S} .letterhead-group--window > .letterhead-sender {
      width: calc(50% - 2mm);
    }`;
}

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
    // A signature closes the letter: it never joins the head's run (it would
    // land inside the space kept for the envelope window) — its own group.
    const isSignature = (el: Element): boolean => el.classList.contains('letterhead-signature');
    const run: Element[] = [cursor];
    let next: Element | null = cursor.nextElementSibling;
    while (
      !isSignature(cursor) &&
      next !== null &&
      next.classList?.contains('letterhead') &&
      !isSignature(next)
    ) {
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
