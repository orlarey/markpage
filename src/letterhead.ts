/********************************* letterhead.ts *******************************
 *
 * Purpose: Render the ` ```sender ` and ` ```recipient ` fences — paired
 *   address blocks (émetteur / destinataire) for invoices, devis,
 *   courriers, propositions commerciales. Each block emits a labelled
 *   div; a downstream DOM pass (`groupLetterheads`) wraps consecutive
 *   `.letterhead` siblings in a flex container so they sit side-by-side.
 * How: One line of body text per address line, separated by `<br>`.
 *   Minimal inline markdown is supported (`**bold**`, `*italic*`,
 *   `[text](url)`) without dragging in `marked.parseInline` — which
 *   would re-trigger preprocess / postprocess hooks (footnote
 *   registries get clobbered, cf. SPEC §17.3).
 *
 *******************************************************************************/

/** Default labels keyed by fence kind. Hardcoded FR (markpage convention —
 *  see ADMONITION_LABELS in marked-config.ts). Override per-block via the
 *  info-string caption: ` ```sender "Sender" `. */
const DEFAULT_LABELS: Record<LetterheadKind, string> = {
  sender: 'Émetteur',
  recipient: 'Destinataire',
};

export type LetterheadKind = 'sender' | 'recipient';

/**
 * Purpose: Render a `<div class="letterhead letterhead-<kind>">` containing
 *   an optional label and a `<br>`-joined body.
 * How: Trim blank head / tail lines, escape HTML, then apply a tiny inline
 *   formatter for `**bold**`, `*italic*`, `[text](url)`. Lines are joined
 *   with `<br>` — addresses are dense, not paragraphs.
 */
export function renderLetterhead(
  kind: LetterheadKind,
  body: string,
  customLabel: string | null,
): string {
  const label = customLabel ?? DEFAULT_LABELS[kind];
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const bodyHtml = lines.map(formatInline).join('<br>');
  const labelHtml =
    label !== ''
      ? `<div class="letterhead-label">${escapeHtml(label)}</div>`
      : '';
  return (
    `<div class="letterhead letterhead-${kind}">` +
    labelHtml +
    `<div class="letterhead-body">${bodyHtml}</div>` +
    `</div>\n`
  );
}

/**
 * Purpose: Wrap runs of consecutive `.letterhead` siblings under `root` in
 *   a `<div class="letterhead-group">` flex container so they lay out
 *   side-by-side (and a lone `recipient` floats to the right via CSS).
 * How: Walk top-level children once. When we hit a `.letterhead`, scan
 *   forward to the end of the run, wrap them all in a fresh group div.
 *   The wrap happens *after* `annotateSourceLines` has stamped each
 *   letterhead, so `data-line` attributes are preserved on the children
 *   (the group has none) and scroll-sync still resolves correctly via
 *   its ancestor walk (cf. SPEC §14.2).
 */
export function groupLetterheads(root: HTMLElement): void {
  const doc = root.ownerDocument;
  let cursor: Element | null = root.firstElementChild;
  while (cursor !== null) {
    if (!cursor.classList?.contains('letterhead')) {
      cursor = cursor.nextElementSibling;
      continue;
    }
    // Collect the run of consecutive letterhead siblings.
    const run: Element[] = [cursor];
    let next: Element | null = cursor.nextElementSibling;
    while (next !== null && next.classList?.contains('letterhead')) {
      run.push(next);
      next = next.nextElementSibling;
    }
    // Wrap them in a new group div inserted in place of the first.
    const group = doc.createElement('div');
    group.className = 'letterhead-group';
    cursor.parentNode!.insertBefore(group, cursor);
    for (const el of run) group.appendChild(el);
    // Continue after the group.
    cursor = next;
  }
}

/**
 * Purpose: Tiny inline formatter — applies `**bold**`, `*italic*`,
 *   `[text](url)` after HTML-escaping the raw text.
 * How: HTML-escape first (so `<` and `&` in addresses are safe), then run
 *   three replace passes. Order matters: bold before italic so `**…**`
 *   isn't eaten by the single-star italic rule.
 */
function formatInline(line: string): string {
  let s = escapeHtml(line);
  s = s.replaceAll(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replaceAll(/\*([^*\n]+)\*/g, '<em>$1</em>');
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
