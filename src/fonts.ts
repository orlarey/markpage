/*********************************** fonts.ts **********************************
 *
 * Purpose: Register the full Noto Sans Symbols / Math TTFs (same files pdfmake
 *   uses) as `@font-face` declarations so the preview never tofus on glyphs.
 * How: Use the FontFace API with the imported TTF URLs; memoise via a promise.
 *
 *******************************************************************************/

import notoSymbolsUrl from '@expo-google-fonts/noto-sans-symbols/400Regular/NotoSansSymbols_400Regular.ttf?url';
import notoMathUrl from '@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf?url';

const FAMILIES: Array<{ family: string; url: string }> = [
  { family: 'Noto Sans Symbols', url: notoSymbolsUrl },
  { family: 'Noto Sans Math', url: notoMathUrl },
];

let registered: Promise<void> | null = null;

/**
 * Purpose: Make sure the Noto fallback faces are loaded into `document.fonts`.
 * How: One-shot promise: per family, `new FontFace(...).load()` then `add`.
 */
export function registerFallbackFonts(): Promise<void> {
  registered ??= (async () => {
    await Promise.all(
      FAMILIES.map(async ({ family, url }) => {
        const face = new FontFace(family, `url(${url}) format('truetype')`);
        await face.load();
        document.fonts.add(face);
      }),
    );
  })();
  return registered;
}
