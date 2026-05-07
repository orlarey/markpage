// Loads Roboto Condensed TTFs into pdfmake's VFS at runtime, so we don't pay
// the ~2 MB cost of pdfmake's bundled vfs_fonts.js (which embeds the standard
// Roboto). The TTFs are emitted as separate assets by Vite (`?url`) and
// fetched once on first export.
import pdfMake from 'pdfmake/build/pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import regularUrl from '@expo-google-fonts/roboto-condensed/400Regular/RobotoCondensed_400Regular.ttf?url';
import mediumUrl from '@expo-google-fonts/roboto-condensed/500Medium/RobotoCondensed_500Medium.ttf?url';
import italicUrl from '@expo-google-fonts/roboto-condensed/400Regular_Italic/RobotoCondensed_400Regular_Italic.ttf?url';
import mediumItalicUrl from '@expo-google-fonts/roboto-condensed/500Medium_Italic/RobotoCondensed_500Medium_Italic.ttf?url';
import monoRegularUrl from '@expo-google-fonts/roboto-mono/400Regular/RobotoMono_400Regular.ttf?url';
import symbolsRegularUrl from '@expo-google-fonts/noto-sans-symbols/400Regular/NotoSansSymbols_400Regular.ttf?url';
import mathRegularUrl from '@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf?url';

interface PdfMakeRuntime {
  vfs: Record<string, string>;
  fonts: Record<
    string,
    { normal: string; bold: string; italics: string; bolditalics: string }
  >;
}

async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : '');
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error(`Failed to read ${url}`));
    reader.readAsDataURL(blob);
  });
}

let fontsReady: Promise<void> | null = null;

function ensureFontsReady(): Promise<void> {
  fontsReady ??= (async () => {
    const [reg, med, ital, medItal, mono, symbols, math] = await Promise.all([
      fetchAsBase64(regularUrl),
      fetchAsBase64(mediumUrl),
      fetchAsBase64(italicUrl),
      fetchAsBase64(mediumItalicUrl),
      fetchAsBase64(monoRegularUrl),
      fetchAsBase64(symbolsRegularUrl),
      fetchAsBase64(mathRegularUrl),
    ]);
    const m = pdfMake as unknown as PdfMakeRuntime;
    m.vfs = {
      'RobotoCondensed-Regular.ttf': reg,
      'RobotoCondensed-Medium.ttf': med,
      'RobotoCondensed-Italic.ttf': ital,
      'RobotoCondensed-MediumItalic.ttf': medItal,
      'RobotoMono-Regular.ttf': mono,
      'NotoSansSymbols-Regular.ttf': symbols,
      'NotoSansMath-Regular.ttf': math,
    };
    // Override the default "Roboto" family so existing styles (which use
    // bold/italics) automatically pick up the condensed variants. We also
    // register "Mono" (code styles), "Symbols" (arrows, dingbats, geometric
    // shapes), and "Math" (Mathematical Operators block). Per-glyph font
    // selection happens at the call site via splitByFont.
    m.fonts = {
      Roboto: {
        normal: 'RobotoCondensed-Regular.ttf',
        bold: 'RobotoCondensed-Medium.ttf',
        italics: 'RobotoCondensed-Italic.ttf',
        bolditalics: 'RobotoCondensed-MediumItalic.ttf',
      },
      Mono: {
        normal: 'RobotoMono-Regular.ttf',
        bold: 'RobotoMono-Regular.ttf',
        italics: 'RobotoMono-Regular.ttf',
        bolditalics: 'RobotoMono-Regular.ttf',
      },
      Symbols: {
        normal: 'NotoSansSymbols-Regular.ttf',
        bold: 'NotoSansSymbols-Regular.ttf',
        italics: 'NotoSansSymbols-Regular.ttf',
        bolditalics: 'NotoSansSymbols-Regular.ttf',
      },
      Math: {
        normal: 'NotoSansMath-Regular.ttf',
        bold: 'NotoSansMath-Regular.ttf',
        italics: 'NotoSansMath-Regular.ttf',
        bolditalics: 'NotoSansMath-Regular.ttf',
      },
    };
    // Wait for the CSS-side @font-face declarations (including the dynamic
    // FontFace registrations from src/fonts.ts) to load too — the
    // splitByFont detector relies on these being available.
    await document.fonts.ready;
  })();
  return fontsReady;
}

// Kick off loading immediately so fonts are usually ready by the first export.
void ensureFontsReady();

export async function downloadPdf(
  doc: TDocumentDefinitions,
  filename: string,
): Promise<void> {
  await ensureFontsReady();
  pdfMake.createPdf(doc).download(filename);
}
