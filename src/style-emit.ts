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

import type { BorderSides, Style } from './settings';

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
 * How: `borderSides` enumerates which sides carry the border declaration so
 *   the caller can keep e.g. only `left` (blockquote bar). 'none' clears.
 */
export function blockBoxCss(s: Style): string {
  const parts: string[] = [];
  if (s.padding !== undefined) parts.push(`padding: ${s.padding}em;`);
  if (s.background !== undefined) parts.push(`background: ${s.background};`);
  if (s.borderRadius !== undefined)
    parts.push(`border-radius: ${s.borderRadius}px;`);
  if (s.borderSides === 'none') {
    parts.push('border: none;');
  } else if (s.borderSides) {
    const w = s.borderWidth ?? 1;
    const c = s.borderColor ?? '#d0d7de';
    const decl = `${w}px solid ${c}`;
    parts.push('border: none;');
    for (const side of expandBorderSides(s.borderSides)) {
      parts.push(`border-${side}: ${decl};`);
    }
  }
  return parts.join(' ');
}

/**
 * Purpose: Translate a `BorderSides` token into the list of CSS side names.
 * How: Static switch; default = no sides.
 */
function expandBorderSides(s: BorderSides): string[] {
  switch (s) {
    case 'all':
      return ['top', 'right', 'bottom', 'left'];
    case 'left':
      return ['left'];
    case 'right':
      return ['right'];
    case 'top':
      return ['top'];
    case 'bottom':
      return ['bottom'];
    case 'top-bottom':
      return ['top', 'bottom'];
    case 'left-right':
      return ['left', 'right'];
    default:
      return [];
  }
}
