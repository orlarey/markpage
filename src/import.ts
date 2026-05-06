// File import: detects the format from the extension, converts to Markdown,
// and returns the result. Heavy converters (Turndown, Mammoth) are loaded
// dynamically so they don't bloat the initial bundle.

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
