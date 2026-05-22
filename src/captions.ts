/********************************* captions.ts *********************************
 *
 * Purpose: Shared infrastructure for the "captioned block" feature — fence
 *   info-string parsing (``` ```algorithm "Bubble sort" `` `), auto-numbered
 *   prefixes per type (Algorithme N / Figure N / Tableau N / Listing N), and
 *   the `<figure>` wrapper that pairs a block with its caption.
 * How: A single module-level counter map (one entry per kind) reset by the
 *   marked preprocess hook. `parseFenceInfo` extracts the first `"…"` from
 *   the info string, returns the surrounding tokens as positional args, and
 *   picks up any `\label{}` so cross-refs can target the block.
 *   `withCaption` wraps any block HTML in a `<figure>` + `<figcaption>`,
 *   emitting an anchor `id` when a label is present.
 *
 *******************************************************************************/

import { anchorId, extractLabel } from './refs';

/**
 * Purpose: The four block "kinds" that can carry a caption.
 * How: Distinct from the markdown language tag — many tags map onto the same
 *   kind (e.g. csv / tsv → table; mermaid / chart / tree svg → figure).
 */
export type CaptionKind = 'algorithm' | 'figure' | 'table' | 'listing';

// French labels — matches the existing convention used by the admonition
// renderer (hardcoded French strings; LaTeX exporter handles English on
// its own side via babel + theorem env names).
const CAPTION_LABELS: Record<CaptionKind, string> = {
  algorithm: 'Algorithme',
  figure: 'Figure',
  table: 'Tableau',
  listing: 'Listing',
};

const counters: Record<CaptionKind, number> = {
  algorithm: 0,
  figure: 0,
  table: 0,
  listing: 0,
};

/**
 * Purpose: Reset every per-kind counter between renders.
 * How: Called from the marked `preprocess` hook so each parse starts at
 *   Algorithme 1 / Figure 1 / etc., no matter how many times the doc
 *   was re-rendered (preview + print are separate parses).
 */
export function resetCaptions(): void {
  for (const k of Object.keys(counters) as CaptionKind[]) counters[k] = 0;
}

/**
 * Purpose: Allocate the next number for a given kind.
 * How: Increment the kind's counter and return the new value.
 */
export function nextCaptionNumber(kind: CaptionKind): number {
  counters[kind] += 1;
  return counters[kind];
}

/**
 * Purpose: Parse a fence info string (everything after the opening backticks
 *   and language tag) into positional args + an optional quoted caption.
 * How: Strip the leading language word, then extract the first `"…"` (or
 *   `'…'`) substring — that's the caption. The remaining whitespace-split
 *   tokens are the args. Bare-words after the lang tag are treated as args
 *   too, so existing fences like ` ```chart bar ` keep working.
 *
 * Examples:
 *   `algorithm "Bubble sort"`      → { args: [],          caption: 'Bubble sort' }
 *   `chart bar "Sales 2025"`       → { args: ['bar'],     caption: 'Sales 2025' }
 *   `tree svg "Syntax tree"`       → { args: ['svg'],     caption: 'Syntax tree' }
 *   `tree svg`                     → { args: ['svg'],     caption: null }
 *   `chart bar`                    → { args: ['bar'],     caption: null }
 */
export function parseFenceInfo(
  lang: string,
): { args: string[]; caption: string | null; label: string | null } {
  // Drop the language tag — callers pass the full info string. The first
  // whitespace-separated word is consumed; everything after is the body.
  let body = lang.replace(/^\S+\s*/, '');
  // Extract any `\label{…}` first (LaTeX convention: caption + label are
  // separate, written like ` ```algorithm "Foo" \label{alg:foo} `).
  // Pull it out of the body so it doesn't pollute the positional args.
  const label = extractLabel(body);
  if (label !== null) {
    body = body.replaceAll(/\\label\{[^}\n]+\}/g, '').replace(/\s+/g, ' ').trim();
  }
  // Extract the first quoted run — double or single quotes. We don't
  // support escapes; a caption that needs both kinds of quote is rare
  // enough to defer.
  const QUOTED = /"([^"\n]*)"|'([^'\n]*)'/;
  const m = QUOTED.exec(body);
  if (!m) {
    const args = body.trim() === '' ? [] : body.trim().split(/\s+/);
    return { args, caption: null, label };
  }
  const caption = (m[1] ?? m[2] ?? '').trim();
  const before = body.slice(0, m.index).trim();
  const after = body.slice(m.index + m[0].length).trim();
  const args = [
    ...(before === '' ? [] : before.split(/\s+/)),
    ...(after === '' ? [] : after.split(/\s+/)),
  ];
  return { args, caption: caption === '' ? null : caption, label };
}

/**
 * Purpose: Wrap a block's HTML in a `<figure>` + `<figcaption>` pair, with
 *   the caption auto-numbered (e.g. "Algorithme 1: Bubble sort").
 * How: When `caption` is null, returns the block unchanged. Otherwise wraps
 *   the block in `<figure>` with the caption always *below* — uniform across
 *   kinds so the eye knows where to look. `<figure>` carries
 *   `page-break-inside: avoid` via CSS so the caption and its block stay
 *   together at print time.
 */
export function withCaption(
  kind: CaptionKind,
  caption: string | null,
  blockHtml: string,
  labelKey: string | null = null,
): string {
  if (caption === null) return blockHtml;
  const num = nextCaptionNumber(kind);
  const prefix = `${CAPTION_LABELS[kind]} ${num}`;
  // When a label is present we emit an id on the figcaption so `\ref{key}`
  // can scroll/jump there. The kind in `anchorId` maps the caption kind
  // 1:1 to the matching RefKind (algorithm/figure/table/listing).
  const idAttr =
    labelKey !== null ? ` id="${anchorId(kind, labelKey)}"` : '';
  const capHtml = `<figcaption class="caption"${idAttr}>${escapeHtml(prefix)}: ${escapeHtml(caption)}</figcaption>`;
  return `<figure class="captioned captioned-${kind}">${blockHtml}\n${capHtml}</figure>\n`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
