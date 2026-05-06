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
    const [reg, med, ital, medItal] = await Promise.all([
      fetchAsBase64(regularUrl),
      fetchAsBase64(mediumUrl),
      fetchAsBase64(italicUrl),
      fetchAsBase64(mediumItalicUrl),
    ]);
    const m = pdfMake as unknown as PdfMakeRuntime;
    m.vfs = {
      'RobotoCondensed-Regular.ttf': reg,
      'RobotoCondensed-Medium.ttf': med,
      'RobotoCondensed-Italic.ttf': ital,
      'RobotoCondensed-MediumItalic.ttf': medItal,
    };
    // Override the default "Roboto" family so existing styles (which use
    // bold/italics) automatically pick up the condensed variants.
    m.fonts = {
      Roboto: {
        normal: 'RobotoCondensed-Regular.ttf',
        bold: 'RobotoCondensed-Medium.ttf',
        italics: 'RobotoCondensed-Italic.ttf',
        bolditalics: 'RobotoCondensed-MediumItalic.ttf',
      },
    };
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
