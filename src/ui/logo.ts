/********************************* logo.ts *************************************
 *
 * Purpose: Build the markpage brand-mark inline element (`mark` + `page` spans).
 * How: Mint a `<span>` triple via the caller's `Document` so it works in spawned
 *   popup windows; styling (font, colour) is driven by CSS classes.
 *
 *******************************************************************************/

// The markpage brand mark. Two variants:
//   - full  → "markpage", with `mark` in Roboto Mono / brand blue
//             and `page` in Roboto / black.
//   - short → "mp", same styling, suitable for tight spots.
// Both render as inline DOM, so they inherit font-size from the
// host (toolbar, window header, …). Colours and font families are
// driven by CSS (.markpage-logo-* classes in style.css).

export type LogoVariant = 'full' | 'short';

/**
 * Purpose: Build the brand mark in the caller's `Document` (full or short variant).
 * How: Three nested spans (`markpage-logo`, `-mark`, `-page`); CSS handles the look.
 */
export function makeLogo(
  doc: Document,
  variant: LogoVariant = 'full',
): HTMLSpanElement {
  const wrap = doc.createElement('span');
  wrap.className = 'markpage-logo';
  const mark = doc.createElement('span');
  mark.className = 'markpage-logo-mark';
  mark.textContent = variant === 'full' ? 'mark' : 'm';
  const page = doc.createElement('span');
  page.className = 'markpage-logo-page';
  page.textContent = variant === 'full' ? 'page' : 'p';
  wrap.append(mark, page);
  return wrap;
}
