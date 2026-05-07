// Inserts images into the Markdown source as base64 data URLs, after a
// downscale + re-encode pass so users (who typically paste straight from
// Google Photos / a phone screenshot) don't end up with a multi-megabyte
// .md file. The output is portable: the .md remains self-contained and
// renders correctly anywhere, no asset tracking needed.

import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

async function processImage(file: File): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(img, 0, 0, w, h);
  // Keep PNG only when the source actually carries transparency. Opaque PNGs
  // (typical screenshots) are converted to JPEG, which is dramatically
  // smaller for that kind of content.
  const keepPng = file.type === 'image/png' && hasTransparency(ctx, w, h);
  return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', JPEG_QUALITY);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Impossible de lire l'image (${file.name})`));
    };
    img.src = url;
  });
}

function hasTransparency(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

// Inserts a Markdown image as a reference-style link: a short `![][img-N]` at
// the cursor and the matching `[img-N]: data:...` definition appended at the
// end of the document. This keeps the body of the .md readable instead of
// being cluttered with multi-kilobyte data URLs inline.
function insertImageAtCursor(view: EditorView, dataUrl: string): void {
  const { state } = view;
  const docText = state.doc.toString();
  const docEnd = state.doc.length;
  const label = nextImageLabel(docText);

  // The reference at the cursor — wrapped in blank lines if the cursor isn't
  // already on an empty line, so marked sees the image as a paragraph and
  // the PDF renders it as a block.
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const before = state.doc.sliceString(line.from, range.from);
  const after = state.doc.sliceString(range.to, line.to);
  const prefix = before.trim() === '' ? '' : '\n\n';
  const suffix = after.trim() === '' ? '' : '\n\n';
  const cursorInsert = `${prefix}![][${label}]${suffix}`;
  // Caret lands inside the alt-text brackets so the user can type a label.
  const altPos = range.from + prefix.length + 2;

  // The reference definition. Always prefix with two newlines: works for
  // empty docs, gives a blank line otherwise (markdown collapses extras).
  const defInsert = `\n\n[${label}]: ${dataUrl}\n`;

  view.dispatch({
    changes: [
      { from: range.from, to: range.to, insert: cursorInsert },
      { from: docEnd, insert: defInsert },
    ],
    selection: EditorSelection.cursor(altPos),
  });
  view.focus();
}

// Picks the next free `img-N` label by scanning the existing document for
// references and definitions that follow our naming convention.
function nextImageLabel(docText: string): string {
  const re = /\[img-(\d+)\]/g;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(docText)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `img-${max + 1}`;
}

async function handleImageFile(file: File, view: EditorView): Promise<void> {
  try {
    const dataUrl = await processImage(file);
    insertImageAtCursor(view, dataUrl);
  } catch (err) {
    console.error('Image insertion failed', err);
    globalThis.alert(
      `Impossible d'insérer l'image : ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// Drag-and-drop and paste of image files anywhere in the editor pane.
// Listeners are registered in capture phase so we beat CodeMirror's own
// default text-handling for pastes and drops.
export function attachImageHandlers(view: EditorView): void {
  view.dom.addEventListener(
    'drop',
    (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file?.type.startsWith('image/')) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos !== null) {
        view.dispatch({ selection: EditorSelection.cursor(pos) });
      }
      void handleImageFile(file, view);
    },
    true,
  );
  view.dom.addEventListener(
    'paste',
    (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault();
          e.stopPropagation();
          const file = item.getAsFile();
          if (file) void handleImageFile(file, view);
          return;
        }
      }
    },
    true,
  );
}

// Opens a native file picker, then inserts the chosen image.
export function pickAndInsertImage(view: EditorView): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) void handleImageFile(file, view);
  });
  input.click();
}
