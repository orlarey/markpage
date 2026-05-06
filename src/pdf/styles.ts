import type { TDocumentDefinitions, StyleDictionary } from 'pdfmake/interfaces';
import { mmToPt, type PdfSettings } from '../settings';

// (ascender − descender) / unitsPerEm for Roboto Condensed, ≈ 1.17. Used to
// translate the user's CSS-style lineHeight (multiplier of font size) into
// pdfmake's lineHeight (multiplier of the font's natural line height).
const ROBOTO_CONDENSED_LH_FACTOR = 1.17;

export function buildStyleDictionary(s: PdfSettings): StyleDictionary {
  const headingMargin = (size: number): [number, number, number, number] => [
    0,
    Math.round(size * 0.6),
    0,
    Math.round(size * 0.3),
  ];
  // Headings (h2..h6) are always left-aligned, regardless of the global
  // justify setting, so they don't end up stretched across the line. h1 is
  // treated as the document title and centered.
  const headingBase = { bold: true, alignment: 'left' as const };

  return {
    h1: {
      ...headingBase,
      alignment: 'center' as const,
      fontSize: s.styles.h1.fontSize,
      color: s.styles.h1.color,
      margin: headingMargin(s.styles.h1.fontSize),
    },
    h2: {
      ...headingBase,
      fontSize: s.styles.h2.fontSize,
      color: s.styles.h2.color,
      margin: headingMargin(s.styles.h2.fontSize),
    },
    h3: {
      ...headingBase,
      fontSize: s.styles.h3.fontSize,
      color: s.styles.h3.color,
      margin: headingMargin(s.styles.h3.fontSize),
    },
    h4: {
      ...headingBase,
      fontSize: s.styles.h4.fontSize,
      color: s.styles.h4.color,
      margin: headingMargin(s.styles.h4.fontSize),
    },
    // h5 / h6 inherit h4 visuals (SPEC: only h1..h4 + body are configurable).
    h5: {
      ...headingBase,
      fontSize: s.styles.h4.fontSize,
      color: s.styles.h4.color,
      margin: headingMargin(s.styles.h4.fontSize),
    },
    h6: {
      ...headingBase,
      fontSize: s.styles.h4.fontSize,
      color: s.styles.h4.color,
      margin: headingMargin(s.styles.h4.fontSize),
    },
    paragraph: {
      fontSize: s.styles.body.fontSize,
      color: s.styles.body.color,
      margin: [0, 0, 0, 6],
    },
    metadata: {
      fontSize: s.styles.body.fontSize,
      color: s.styles.body.color,
      alignment: 'center',
      margin: [0, 0, 0, 2],
    },
    code: {
      font: 'Courier',
      fontSize: Math.max(8, s.styles.body.fontSize - 1),
      background: '#f6f8fa',
    },
    codeBlock: {
      font: 'Courier',
      fontSize: Math.max(8, s.styles.body.fontSize - 1),
      margin: [0, 0, 0, 6],
      preserveLeadingSpaces: true,
    },
    blockquote: {
      italics: true,
      color: '#57606a',
      margin: [12, 0, 0, 6],
    },
    link: {
      color: '#0969da',
      decoration: 'underline',
    },
  };
}

export function buildBaseDocDefinition(
  s: PdfSettings,
): Pick<
  TDocumentDefinitions,
  'pageSize' | 'pageMargins' | 'defaultStyle' | 'styles'
> {
  return {
    pageSize: s.pageSize,
    pageMargins: [
      mmToPt(s.margins.left),
      mmToPt(s.margins.top),
      mmToPt(s.margins.right),
      mmToPt(s.margins.bottom),
    ],
    defaultStyle: {
      fontSize: s.styles.body.fontSize,
      color: s.styles.body.color,
      // pdfmake's lineHeight is a multiplier on the font's natural line
      // height (ascent + descent in em units), not on the font size like CSS
      // line-height. Roboto Condensed's natural line height is ~1.17× its
      // size, so we divide the user-facing CSS-like value by this factor to
      // keep the PDF visually aligned with the HTML preview.
      lineHeight: s.lineHeight / ROBOTO_CONDENSED_LH_FACTOR,
      alignment: s.justify ? 'justify' : 'left',
    },
    styles: buildStyleDictionary(s),
  };
}
