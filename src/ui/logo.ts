// The markpage brand mark. Two variants:
//   - full  → "markpage", with `mark` in Roboto Mono / brand blue
//             and `page` in Roboto / black.
//   - short → "mp", same styling, suitable for tight spots.
// Both render as inline DOM, so they inherit font-size from the
// host (toolbar, window header, …). Colours and font families are
// driven by CSS (.markpage-logo-* classes in style.css).

export type LogoVariant = 'full' | 'short';

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
