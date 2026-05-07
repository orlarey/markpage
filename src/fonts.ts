// Registers the full Noto Sans Symbols / Math TTFs (the same files we feed to
// pdfmake) as @font-face declarations in the browser, so the HTML preview's
// font cascade has access to the exact same glyph coverage as the PDF.
//
// We use the FontFace API rather than @fontsource here because the
// @fontsource subset of Noto Sans Symbols leaves out a fair chunk of the
// arrows and math blocks (U+2191, U+2193, U+2200-U+22FF…), and we want the
// preview to never tofu when the PDF wouldn't.

import notoSymbolsUrl from '@expo-google-fonts/noto-sans-symbols/400Regular/NotoSansSymbols_400Regular.ttf?url';
import notoMathUrl from '@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf?url';

const FAMILIES: Array<{ family: string; url: string }> = [
  { family: 'Noto Sans Symbols', url: notoSymbolsUrl },
  { family: 'Noto Sans Math', url: notoMathUrl },
];

let registered: Promise<void> | null = null;

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
