/********************************* import.ts ***********************************
 *
 * Purpose: Convert an uploaded file (md, txt, html, docx) into a
 *   Markdown string plus a base file name for the new document.
 * How: Dispatch on the lowercased extension; lazy-import Turndown/Mammoth
 *   so the heavy converters stay out of the initial bundle.
 *
 *******************************************************************************/

/**
 * Purpose: Output of `importFile` — the converted Markdown plus the
 *   original filename without its extension.
 */
export interface ImportResult {
  content: string;
  baseName: string;
}

const SUPPORTED_EXTENSIONS = [
  'md',
  'markdown',
  'txt',
  'html',
  'htm',
  'docx',
] as const;

export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(
  ',',
);

/**
 * Purpose: Convert a user-picked file into Markdown + a base name.
 * How: Match the extension, route to the plain/html/docx branch, throw
 *   a user-readable error on anything outside `SUPPORTED_EXTENSIONS`.
 */
export async function importFile(file: File): Promise<ImportResult> {
  const ext = (file.name.match(/\.([^.]+)$/) ?? ['', ''])[1]!.toLowerCase();
  const baseName = file.name.replace(/\.[^.]+$/, '');

  switch (ext) {
    case 'md':
    case 'markdown':
    case 'txt':
      return { content: await file.text(), baseName };
    case 'html':
    case 'htm':
      return { content: await convertHtml(await file.text()), baseName };
    case 'docx':
      return { content: await convertDocx(await file.arrayBuffer()), baseName };
    default:
      throw new Error(
        `Format non supporté : .${ext}. Formats acceptés : ${SUPPORTED_EXTENSIONS.join(', ')}`,
      );
  }
}

/**
 * Purpose: Convert an HTML string into Markdown.
 * How: Dynamically import Turndown with ATX headings, fenced code,
 *   `-` bullets, `*` emphasis.
 */
async function convertHtml(html: string): Promise<string> {
  const { default: TurndownService } = await import('turndown');
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  return td.turndown(html);
}

/**
 * Purpose: Convert a .docx buffer into Markdown.
 * How: Mammoth → HTML → Turndown (via `convertHtml`); images dropped (MVP).
 */
async function convertDocx(buffer: ArrayBuffer): Promise<string> {
  // Mammoth converts the .docx structure (headings, lists, bold/italic,
  // links, blockquotes) to HTML; we then run that HTML through Turndown to
  // get clean Markdown. Images are dropped (MVP).
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    { ignoreEmptyParagraphs: true, includeDefaultStyleMap: true },
  );
  return convertHtml(result.value);
}
