// Image insertion pipeline. During editing, the markdown source carries only
// short `img://uuid` references; the actual binary lives in IndexedDB. We
// expand to data URLs (for PDF / save) or blob URLs (for preview) on the
// fly. This keeps the editor responsive even with many embedded images.

import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  deleteImage,
  getAllIds,
  getImage,
  putBlobBySha,
} from './image-store';

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;
const URL_SCHEME = 'img://';
// Forward slashes don't need escaping inside a string fed to `new RegExp()`,
// only inside a regex literal. Keeping the patterns as plain strings avoids
// the noisy `\\/`.
const URL_RE_PATTERN = 'img://([a-f0-9-]+)';
const DATA_URL_RE_PATTERN = 'data:image/[^;,]+;base64,[A-Za-z0-9+/=]+';

// Cache of object URLs handed out to the preview, keyed by the same id we
// use in IndexedDB. Lets us re-use URLs across renders without recreating
// them on every keystroke.
const blobUrlCache = new Map<string, string>();

// ---- image processing -------------------------------------------------

async function processImageToBlob(file: File): Promise<Blob> {
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
  const keepPng = file.type === 'image/png' && hasTransparency(ctx, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      keepPng ? 'image/png' : 'image/jpeg',
      JPEG_QUALITY,
    );
  });
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

// ---- insertion --------------------------------------------------------

// Inserts the processed image inline at the cursor. The actual binary lives
// in IndexedDB; the markdown only carries an opaque `img://<sha>` URL —
// content-addressed so two documents embedding the same image share one
// blob, and unused blobs are mechanically detectable by GC.
async function insertImageAtCursor(
  view: EditorView,
  blob: Blob,
): Promise<void> {
  const id = await putBlobBySha(blob);

  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const before = state.doc.sliceString(line.from, range.from);
  const after = state.doc.sliceString(range.to, line.to);
  const prefix = before.trim() === '' ? '' : '\n\n';
  const suffix = after.trim() === '' ? '' : '\n\n';
  const insert = `${prefix}![](${URL_SCHEME}${id})${suffix}`;
  // Caret lands inside the alt-text brackets so the user can type a label.
  const altPos = range.from + prefix.length + 2;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(altPos),
  });
  view.focus();
}

async function handleImageFile(file: File, view: EditorView): Promise<void> {
  try {
    const blob = await processImageToBlob(file);
    await insertImageAtCursor(view, blob);
  } catch (err) {
    console.error('Image insertion failed', err);
    globalThis.alert(
      `Impossible d'insérer l'image : ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// Resolves an `<img>` URL out of the various MIME types a browser may put on
// the DataTransfer when dragging from a web page. We try `text/html` first
// because dragging a rendered <img> often carries the actual image URL there
// even when `text/uri-list` only points to the page that hosted it.
function extractImageUrlFromDataTransfer(
  dt: DataTransfer | null,
): string | null {
  if (!dt) return null;

  const html = dt.getData('text/html');
  if (html) {
    const m = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html);
    if (m) return m[1];
  }

  const uriList = dt.getData('text/uri-list');
  if (uriList) {
    const first = uriList
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '' && !l.startsWith('#'));
    if (first) return first;
  }

  const plain = dt.getData('text/plain').trim();
  if (/^https?:\/\//i.test(plain)) return plain;

  return null;
}

async function handleImageUrl(url: string, view: EditorView): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new Error(
        `L'URL ne pointe pas sur une image (type : ${contentType || 'inconnu'}).`,
      );
    }
    const blob = await response.blob();
    const file = new File([blob], 'web-image', { type: blob.type });
    await handleImageFile(file, view);
  } catch (err) {
    console.error('Failed to fetch dropped URL', url, err);
    globalThis.alert(
      `Impossible de récupérer cette image depuis le web :\n${
        err instanceof Error ? err.message : String(err)
      }\n\n` +
        "Beaucoup de sites (Google Photos, etc.) bloquent l'accès direct aux images. " +
        "Téléchargez l'image localement, puis glissez-déposez-la depuis votre disque.",
    );
  }
}

export function attachImageHandlers(view: EditorView): void {
  view.dom.addEventListener(
    'drop',
    (e) => {
      const file = e.dataTransfer?.files?.[0];
      const imageFile = file?.type.startsWith('image/') ? file : null;
      const webUrl = imageFile
        ? null
        : extractImageUrlFromDataTransfer(e.dataTransfer);
      if (!imageFile && !webUrl) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos !== null) {
        view.dispatch({ selection: EditorSelection.cursor(pos) });
      }
      if (imageFile) {
        void handleImageFile(imageFile, view);
      } else if (webUrl) {
        void handleImageUrl(webUrl, view);
      }
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

// ---- ref resolution ---------------------------------------------------

function collectRefIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const m of text.matchAll(new RegExp(URL_RE_PATTERN, 'g'))) {
    ids.add(m[1]);
  }
  return ids;
}

// Public alias so callers outside this module (GC orchestrator in
// main.ts) can collect every `img://<id>` referenced by a markdown
// source without depending on the internal regex.
export function collectImageRefs(text: string): Set<string> {
  return collectRefIds(text);
}

// Replaces `img://id` URLs with short-lived blob URLs for the HTML preview.
// Uses the in-memory cache to avoid recreating URLs on every keystroke.
export async function expandRefsToBlobUrls(text: string): Promise<string> {
  const ids = collectRefIds(text);
  if (ids.size === 0) return text;
  await Promise.all(
    [...ids].map(async (id) => {
      if (blobUrlCache.has(id)) return;
      const blob = await getImage(id);
      if (blob) blobUrlCache.set(id, URL.createObjectURL(blob));
    }),
  );
  return text.replaceAll(
    new RegExp(URL_RE_PATTERN, 'g'),
    (full, id: string) => blobUrlCache.get(id) ?? full,
  );
}

// Replaces `img://id` URLs with full base64 data URLs. Reference definitions
// are kept in place so the .md remains in nice ref-style form, just with
// portable data URLs instead of opaque ids. Used at save time.
export async function expandRefsToDataUrls(text: string): Promise<string> {
  const ids = collectRefIds(text);
  if (ids.size === 0) return text;
  const map = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      const blob = await getImage(id);
      if (blob) map.set(id, await blobToDataUrl(blob));
    }),
  );
  return text.replaceAll(
    new RegExp(URL_RE_PATTERN, 'g'),
    (full, id: string) => map.get(id) ?? full,
  );
}

// Produces a fully-inline form of the document with every image url turned
// into a base64 data URL. Used as the input to PDF generation, where we
// don't want to depend on marked's reference resolution.
export async function expandRefsToInlineDataUrls(text: string): Promise<string> {
  // 1. Replace every `img://id` URL — inline OR inside a definition — with
  // the matching data URL. Handles both new-style ref docs *and* old-style
  // inline-image docs that came in via extractDataUrlsToStore.
  let out = await expandRefsToDataUrls(text);

  // 2. Inline reference-style uses so the PDF token walker sees `![alt](url)`
  // directly. We don't strip the definitions afterwards: marked treats
  // unused defs as inert link entries, and keeping them avoids breaking any
  // intentional non-image references the user may have written.
  const defRe = /^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*(\S+)[ \t]*$/gm;
  const labelToUrl = new Map<string, string>();
  for (const m of out.matchAll(defRe)) {
    labelToUrl.set(m[1].toLowerCase().trim(), m[2]);
  }
  if (labelToUrl.size > 0) {
    out = out.replaceAll(
      /!\[([^\]]*)\]\[([^\]\n]+)\]/g,
      (full, alt: string, label: string) => {
        const url = labelToUrl.get(label.toLowerCase().trim());
        return url ? `![${alt}](${url})` : full;
      },
    );
    out = out.replaceAll(
      /(?<!!)\[([^\]]+)\]\[([^\]\n]+)\]/g,
      (full, txt: string, label: string) => {
        const url = labelToUrl.get(label.toLowerCase().trim());
        return url ? `[${txt}](${url})` : full;
      },
    );
  }

  // 3. Sanity check: warn if any unresolved `img://` urls slipped through —
  // means the IDB blob is missing for those ids, the PDF would render a
  // blank where the image should be.
  const unresolved = collectRefIds(out);
  if (unresolved.size > 0) {
    console.warn(
      'Some image refs could not be resolved — missing IDB blobs:',
      [...unresolved],
    );
  }

  return out;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

// ---- import / GC ------------------------------------------------------

// Walks an imported document, hoists every inline data URL into IndexedDB,
// and replaces it with an `img://id` reference. Then inlines any reference-
// style image use whose target became an `img://` URL — the split form was
// useful for hiding multi-megabyte data URLs, but with our short opaque
// scheme it just adds noise to the editor.
export async function extractDataUrlsToStore(text: string): Promise<string> {
  const matches = [...text.matchAll(new RegExp(DATA_URL_RE_PATTERN, 'g'))];
  let result = text;
  if (matches.length > 0) {
    const replacements = new Map<string, string>();
    for (const m of matches) {
      const dataUrl = m[0];
      if (replacements.has(dataUrl)) continue;
      try {
        const blob = await dataUrlToBlob(dataUrl);
        const id = await putBlobBySha(blob);
        replacements.set(dataUrl, `${URL_SCHEME}${id}`);
      } catch (err) {
        console.error('Failed to import inline image', err);
      }
    }
    for (const [dataUrl, ref] of replacements) {
      result = result.split(dataUrl).join(ref);
    }
  }
  return inlineImageRefs(result);
}

const REF_DEF_RE = /^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*(\S+)[ \t]*$/gm;
const REF_USE_RE = /!\[([^\]]*)\]\[([^\]\n]+)\]/g;

// Converts every reference-style image use whose URL is `img://...` into the
// equivalent inline form `![alt](img://...)`, then strips the now-redundant
// `[label]: img://...` definition lines. Regular link refs and non-image
// definitions are left untouched.
function inlineImageRefs(text: string): string {
  const labelToUrl = new Map<string, string>();
  for (const m of text.matchAll(REF_DEF_RE)) {
    labelToUrl.set(m[1].toLowerCase().trim(), m[2]);
  }
  if (labelToUrl.size === 0) return text;
  let out = text.replaceAll(REF_USE_RE, (full, alt: string, label: string) => {
    const url = labelToUrl.get(label.toLowerCase().trim());
    return url?.startsWith(URL_SCHEME) ? `![${alt}](${url})` : full;
  });
  out = out.replaceAll(
    new RegExp(
      String.raw`^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*${URL_SCHEME}\S+[ \t]*\n?`,
      'gm',
    ),
    '',
  );
  return out;
}

// The inverse of inlineImageRefs: collects every `![alt](img://uuid)` use,
// generates fresh `img-N` labels (avoiding collisions with existing
// definitions), rewrites each use as `![alt][label]`, and appends one
// `[label]: img://uuid` definition per unique URL at the very end of the
// document. Used at save time so the .md file keeps the body readable
// (the data URLs end up grouped at the bottom after expandRefsToDataUrls).
export function refifyImageUrls(text: string): string {
  const inlineRe = new RegExp(
    String.raw`!\[([^\]]*)\]\((${URL_SCHEME}[a-f0-9-]+)\)`,
    'g',
  );
  const occurrences = [...text.matchAll(inlineRe)];
  if (occurrences.length === 0) return text;

  const existingLabels = new Set<string>();
  for (const m of text.matchAll(REF_DEF_RE)) {
    existingLabels.add(m[1].toLowerCase().trim());
  }

  const urlToLabel = new Map<string, string>();
  let counter = 1;
  for (const m of occurrences) {
    const url = m[2];
    if (urlToLabel.has(url)) continue;
    let label: string;
    do {
      label = `img-${counter}`;
      counter += 1;
    } while (existingLabels.has(label));
    existingLabels.add(label);
    urlToLabel.set(url, label);
  }

  let out = text.replaceAll(inlineRe, (full, alt: string, url: string) => {
    const label = urlToLabel.get(url);
    return label ? `![${alt}][${label}]` : full;
  });

  const defs = [...urlToLabel.entries()]
    .map(([url, label]) => `[${label}]: ${url}`)
    .join('\n');
  out += `${trailingSeparator(out)}${defs}\n`;
  return out;
}

function trailingSeparator(text: string): string {
  if (text.endsWith('\n\n')) return '';
  if (text.endsWith('\n')) return '\n';
  return '\n\n';
}

// Applies a mapping `oldId → newId` to every `img://oldId` reference
// inside `text`. Untouched ids pass through. Used by the legacy UUID →
// content-addressed migration.
export function rewriteImageRefs(
  text: string,
  mapping: Map<string, string>,
): string {
  if (mapping.size === 0) return text;
  return text.replaceAll(
    new RegExp(URL_RE_PATTERN, 'g'),
    (full, id: string) => {
      const replaced = mapping.get(id);
      return replaced ? `${URL_SCHEME}${replaced}` : full;
    },
  );
}

// Removes IDB entries whose ids are absent from the `referenced` set,
// and revokes any cached blob URL for the dropped ids. Caller is
// responsible for building `referenced` by walking every doc — see
// runGC in main.ts. In multi-doc mode an image referenced by *any*
// doc must be kept, so this no longer accepts a single source string.
export async function gcUnusedImages(referenced: Set<string>): Promise<void> {
  const all = await getAllIds();
  for (const id of all) {
    if (referenced.has(id)) continue;
    await deleteImage(id);
    const url = blobUrlCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      blobUrlCache.delete(id);
    }
  }
}
