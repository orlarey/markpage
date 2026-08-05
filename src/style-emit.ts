/********************************* style-emit.ts *******************************
 *
 * Purpose: Convert a `Style` value to a CSS declaration fragment, separating
 *   inline-text concerns from block-box concerns so the same helpers serve
 *   the fluid preview and the paginated print pipeline.
 * How: Two pure functions emit only declarations whose source field is set;
 *   the renderer concatenates them inside its scoped selector. Caller picks
 *   whether `underline` means `border-bottom` (headings) or `text-decoration`
 *   (links) — `inlineCss` skips it on purpose.
 *
 *******************************************************************************/

import { quoteFontFamily } from './font-loader';
import type { HeadingNumbering, Style } from './settings';

/**
 * Purpose: Emit the inline-text declarations of `s`: font, color, weight,
 *   italic, alignment, margin, line-height. `underline` is left to the caller.
 * How: Skip fields that are undefined; the cascade keeps existing rules.
 *   `family` (per-element override) is emitted as a bare quoted name —
 *   the surrounding selector's parent rule provides the fallback chain.
 */
export function inlineCss(s: Style): string {
  const parts: string[] = [];
  if (s.family !== undefined && s.family.trim() !== '')
    parts.push(`font-family: ${quoteFontFamily(s.family)};`);
  if (s.fontSize !== undefined) parts.push(`font-size: ${s.fontSize}pt;`);
  if (s.color !== undefined) parts.push(`color: ${s.color};`);
  if (s.weight !== undefined) parts.push(`font-weight: ${s.weight};`);
  if (s.italic !== undefined)
    parts.push(`font-style: ${s.italic ? 'italic' : 'normal'};`);
  if (s.align !== undefined) parts.push(`text-align: ${s.align};`);
  if (s.marginAbove !== undefined)
    parts.push(`margin-top: ${s.marginAbove}em;`);
  if (s.marginBelow !== undefined)
    parts.push(`margin-bottom: ${s.marginBelow}em;`);
  if (s.lineHeight !== undefined) parts.push(`line-height: ${s.lineHeight};`);
  const caps = capsCss(s);
  if (caps) parts.push(caps);
  return parts.join(' ');
}

/**
 * Purpose: Emit the capitals / tracking declarations of `s`.
 * How: `smallCaps` → `font-variant: small-caps` (small) or `text-transform:
 *   uppercase` (all); `letterSpacing` → `letter-spacing` in em. Both resolved,
 *   both opt-in (empty when unset). Shared by inline, heading and running paths.
 */
export function capsCss(s: Style): string {
  const parts: string[] = [];
  if (s.smallCaps === 'small') parts.push('font-variant: small-caps;');
  else if (s.smallCaps === 'all') parts.push('text-transform: uppercase;');
  if (s.letterSpacing !== undefined)
    parts.push(`letter-spacing: ${s.letterSpacing}em;`);
  return parts.join(' ');
}

/**
 * Purpose: Emit the heading / running-content "filet" (horizontal rule)
 *   declaration — the caller's choice for what `underline` means on headings.
 * How: Prefer the resolved `rule` (position + colour/width/style) the style
 *   editor compiles; fall back to the legacy `underline` boolean (a 1px grey
 *   rule below). Empty string when neither is set.
 */
export function filetCss(s: Style): string {
  const r = s.rule;
  if (r) {
    const w = r.width ?? 1;
    const st = r.style ?? 'solid';
    const c = r.color ?? '#d0d7de';
    const decl = `${w}px ${st} ${c}`;
    return r.position === 'above'
      ? `border-top: ${decl}; padding-top: 0.2em;`
      : `border-bottom: ${decl}; padding-bottom: 0.2em;`;
  }
  return s.underline
    ? `border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em;`
    : '';
}

/**
 * Purpose: Emit the block-box declarations of `s`: padding, background,
 *   border (per side), border-radius.
 * How: Each of `borderTop/Right/Bottom/Left` is independent; only the sides
 *   set to `true` emit a border declaration. Always reset `border: none`
 *   first so the cascade can't bleed an outer rule onto an unset side.
 */
export function blockBoxCss(s: Style): string {
  const parts: string[] = [];
  if (s.padding !== undefined) parts.push(`padding: ${s.padding}em;`);
  if (s.background !== undefined) parts.push(`background: ${s.background};`);
  if (s.borderRadius !== undefined)
    parts.push(`border-radius: ${s.borderRadius}px;`);
  const anySide =
    s.borderTop || s.borderRight || s.borderBottom || s.borderLeft;
  if (anySide) {
    const w = s.borderWidth ?? 1;
    const c = s.borderColor ?? '#d0d7de';
    const decl = `${w}px solid ${c}`;
    parts.push('border: none;');
    if (s.borderTop) parts.push(`border-top: ${decl};`);
    if (s.borderRight) parts.push(`border-right: ${decl};`);
    if (s.borderBottom) parts.push(`border-bottom: ${decl};`);
    if (s.borderLeft) parts.push(`border-left: ${decl};`);
  }
  return parts.join(' ');
}

/**
 * Purpose: Emit the CSS for MARGINAL heading numbers — the number sits in the
 *   left margin, right-aligned to the text block, separated from it by the same
 *   gutter as an outer-margin sidenote (`sidenote.gap`). The text block keeps its
 *   full width; the number keeps its heading's colour, tabular figures.
 * How: The wrapped `<span class="heading-num">` (see wrapHeadingNumbers) is taken
 *   OUT of flow — `position: absolute` relative to the heading, `left: 0` then
 *   `translateX(-100% - gap)` puts its right edge `gap` into the left margin, so
 *   numbers of any width share one right edge. A chapter-opening h1 is EXCLUDED —
 *   its number becomes the big `.chapter-num` opening numeral instead.
 */
export function headingNumberCss(
  numbering: HeadingNumbering | undefined,
  chapterBreak: string,
  scope: string,
  gapMm: number,
): string {
  if (!numbering || !numbering.on) return '';
  const depth = Math.max(1, Math.min(6, numbering.depth));
  const gap = `${Math.round(Math.max(0, gapMm) * 10) / 10}mm`;
  const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].slice(0, depth);
  // The heading is the positioned ancestor for its absolute number. A chapter-
  // opening h1 is excluded — it carries the big numeral, not a marginal one.
  const rel = chapterBreak !== 'none' ? levels.filter((h) => h !== 'h1') : levels;
  const relSel = rel.map((h) => `${scope} ${h}:not(.doc-title)`).join(', ');
  const pos = relSel ? `${relSel} { position: relative; }\n` : '';
  return (
    `${pos}` +
    `${scope} :is(h1, h2, h3, h4, h5, h6) .heading-num { ` +
    `position: absolute; left: 0; transform: translateX(calc(-100% - ${gap})); ` +
    `white-space: nowrap; text-align: right; ` +
    `font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; ` +
    `letter-spacing: 0; text-transform: none; }` // colour inherits the heading
  );
}
