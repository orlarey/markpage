// noto-fallback.ts — the app's glyph fallbacks (src/fonts.ts), as data: URLs in a
// chunk of their own: ~1.6 MB, loaded only for a document whose text needs
// symbols system fonts often lack. A font fetched from the bundle's CDN would be
// refused by an Artifact's CSP; a data: URL is not.

import notoSymbols from '@expo-google-fonts/noto-sans-symbols/400Regular/NotoSansSymbols_400Regular.ttf';
import notoMath from '@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf';

/** Register both faces under the family names the app's font stacks end with. */
export async function registerNotoFallback(): Promise<void> {
  await Promise.all(
    [
      { family: 'Noto Sans Symbols', url: notoSymbols },
      { family: 'Noto Sans Math', url: notoMath },
    ].map(async ({ family, url }) => {
      const face = new FontFace(family, `url(${url}) format('truetype')`);
      await face.load();
      document.fonts.add(face);
    }),
  );
}
