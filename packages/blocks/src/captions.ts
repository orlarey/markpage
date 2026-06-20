/********************************* captions.ts *********************************
 *
 * Purpose: Per-document caption numbering + the `<figure>` / `<figcaption>`
 *   wrapper, shared by hosts (the markpage app and @orlarey/marked). A
 *   caption context holds the per-kind counters so two documents never share
 *   state — the module-global counters of the app are replaced by an instance.
 * How: `createCaptionContext()` returns `{ reset, next, wrap }`. Labels and the
 *   cross-ref anchor-id scheme are injectable (the app uses French labels + its
 *   own ref system; the library defaults to English + a simple slug).
 *
 *******************************************************************************/

import { escapeHtml } from './util/escape.js';
import { extractLabel } from './util/labels.js';

/** The block "kinds" that can carry a caption (many fences map onto one). */
export type CaptionKind = 'algorithm' | 'figure' | 'table' | 'listing';

const DEFAULT_LABELS: Record<CaptionKind, string> = {
  algorithm: 'Algorithm',
  figure: 'Figure',
  table: 'Table',
  listing: 'Listing',
};

export interface CaptionContextOptions {
  /** Override the per-kind label words (e.g. French for the markpage app). */
  labels?: Partial<Record<CaptionKind, string>>;
  /** Build the `id` for a `\label{key}`'d caption (cross-ref target). */
  anchorId?: (kind: CaptionKind, key: string) => string;
}

export interface CaptionContext {
  /** Zero every counter — call once per document parse. */
  reset(): void;
  /** Allocate the next number for `kind`. */
  next(kind: CaptionKind): number;
  /**
   * Wrap block HTML in a numbered `<figure>` + `<figcaption>`. A null caption
   * returns the block unchanged. A `labelKey` adds an `id` (cross-ref target).
   */
  wrap(
    kind: CaptionKind,
    caption: string | null,
    blockHtml: string,
    labelKey?: string | null,
  ): string;
}

/** Create an isolated caption context (per-document counters). */
export function createCaptionContext(
  opts: CaptionContextOptions = {},
): CaptionContext {
  const labels = { ...DEFAULT_LABELS, ...opts.labels };
  const anchorId = opts.anchorId ?? ((kind, key) => `mp-${kind}-${key}`);
  const counters: Record<CaptionKind, number> = {
    algorithm: 0,
    figure: 0,
    table: 0,
    listing: 0,
  };
  return {
    reset() {
      for (const k of Object.keys(counters) as CaptionKind[]) counters[k] = 0;
    },
    next(kind) {
      counters[kind] += 1;
      return counters[kind];
    },
    wrap(kind, caption, blockHtml, labelKey = null) {
      if (caption === null) return blockHtml;
      counters[kind] += 1;
      const prefix = `${labels[kind]} ${counters[kind]}`;
      const idAttr =
        labelKey != null ? ` id="${anchorId(kind, labelKey)}"` : '';
      const capHtml = `<figcaption class="caption"${idAttr}>${escapeHtml(prefix)}: ${escapeHtml(caption)}</figcaption>`;
      return `<figure class="captioned captioned-${kind}">${blockHtml}\n${capHtml}</figure>\n`;
    },
  };
}

/**
 * Purpose: Parse a fence info string into positional args + an optional quoted
 *   caption + an optional `\label{}`.
 * How: Drop the language word, pull out `\label{…}`, then extract the first
 *   quoted run as the caption; the surrounding bare words are the args.
 */
export function parseFenceInfo(lang: string): {
  args: string[];
  caption: string | null;
  label: string | null;
} {
  let body = lang.replace(/^\S+\s*/, '');
  const label = extractLabel(body);
  if (label !== null) {
    body = body.replaceAll(/\\label\{[^}\n]+\}/g, '').replace(/\s+/g, ' ').trim();
  }
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
