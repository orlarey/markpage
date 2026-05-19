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

import type { Style } from './settings';

/**
 * Purpose: Emit the inline-text declarations of `s`: font, color, weight,
 *   italic, alignment, margin, line-height. `underline` is left to the caller.
 * How: Skip fields that are undefined; the cascade keeps existing rules.
 */
export function inlineCss(s: Style): string {
  const parts: string[] = [];
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
  return parts.join(' ');
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
