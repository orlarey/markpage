/********************************* image.ts ************************************
 *
 * Purpose: Image insertion + reference plumbing. The markdown source
 *   carries opaque `img://<sha>` refs; binaries live in IndexedDB and
 *   get expanded to data/blob URLs on the fly for preview, save and PDF.
 * How: Insert pipeline (process → store → splice ref); drop / paste / pick
 *   handlers; ref ↔ inline-data conversions; UUID→SHA rewriter and GC.
 *
 *******************************************************************************/

import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  deleteImage,
  getAllIds,
  getImage,
  putBlobBySha,
} from './image-store';
import {
  extractExternalRefs,
  loadMapping,
  rewriteExternalRefs,
} from './resource-mapping';

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;
const URL_SCHEME = 'img://';
// Forward slashes don't need escaping inside a string fed to `new RegExp()`,
// only inside a regex literal. Keeping the patterns as plain strings avoids
// the noisy `\\/`.
const URL_RE_PATTERN = 'img://([a-f0-9-]+)';
// Image refs come in two forms: the legacy custom scheme `img://<sha>` and the
// new relative bundle path `assets/<sha>.<ext>` (Phase 1 file-management). Both
// resolve to the same SHA-keyed blob; this matches either, capturing the SHA in
// group 1 (img://) or group 2 (assets/). New inserts use the assets/ form;
// img:// stays recognised for backward compatibility.
const REF_RE_PATTERN =
  'img://([a-f0-9-]+)|assets/([a-f0-9]{64})\\.[A-Za-z0-9]+';
const DATA_URL_RE_PATTERN = 'data:image/[^;,]+;base64,[A-Za-z0-9+/=]+';

/** File extension for an image MIME type (defaults to png). */
function extForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'png';
  }
}

// Cache of object URLs handed out to the preview, keyed by the same id we
// use in IndexedDB. Lets us re-use URLs across renders without recreating
// them on every keystroke.
const blobUrlCache = new Map<string, string>();

// ---- image processing -------------------------------------------------

/**
 * Purpose: Normalise a user-picked image into a downsized JPEG/PNG blob.
 * How: Decode → draw to a canvas clamped to `MAX_DIMENSION` → re-encode
 *   as PNG when the alpha channel is non-trivial, else JPEG@`JPEG_QUALITY`.
 */
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

/**
 * Purpose: Decode a `File` into an `HTMLImageElement` ready to draw.
 * How: Object URL + `Image.onload`; revoke the URL in both branches.
 */
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

/**
 * Purpose: Tell whether a canvas region contains any non-opaque pixel.
 * How: `getImageData` then scan every 4th byte (the alpha channel).
 */
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

/**
 * Purpose: Splice a `![](img://<sha>)` reference at the cursor and stash
 *   the binary in IndexedDB.
 * How: `putBlobBySha`, then insert the markdown with surrounding blank
 *   lines as needed and land the caret inside the alt-text brackets.
 */
async function insertImageAtCursor(
  view: EditorView,
  blob: Blob,
): Promise<void> {
  const id = await putBlobBySha(blob);
  const ext = extForMime(blob.type);

  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const before = state.doc.sliceString(line.from, range.from);
  const after = state.doc.sliceString(range.to, line.to);
  const prefix = before.trim() === '' ? '' : '\n\n';
  const suffix = after.trim() === '' ? '' : '\n\n';
  const insert = `${prefix}![](assets/${id}.${ext})${suffix}`;
  // Caret lands inside the alt-text brackets so the user can type a label.
  const altPos = range.from + prefix.length + 2;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(altPos),
  });
  view.focus();
}

/**
 * Purpose: Full pick-to-insert pipeline for one image file.
 * How: `processImageToBlob` → `insertImageAtCursor`; surface failures
 *   via `alert` and `console.error`.
 */
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

/**
 * Purpose: Extract the most likely image URL from a `DataTransfer`.
 * How: Try `text/html` (`<img src=…>`), then the first non-comment line
 *   of `text/uri-list`, then `text/plain` if it looks like an http(s) URL.
 */
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

/**
 * Purpose: Fetch an image URL from the web and feed it through `handleImageFile`.
 * How: `fetch` → verify `content-type` starts with `image/` → wrap as
 *   `File` → handler. Errors are alerted with hosting-site guidance.
 */
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

/**
 * Purpose: Wire drop/paste listeners on the editor for image insertion.
 * How: On `drop`, accept a `File` or fall back to `extractImageUrlFromDataTransfer`;
 *   on `paste`, take the first `image/*` clipboard item. Caret is moved
 *   to the drop point first.
 */
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

/**
 * Purpose: Open the OS file picker and insert the chosen image.
 * How: Hidden `<input type=file accept="image/*">`; on `change`, route
 *   through `handleImageFile` and remove the element.
 */
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

/**
 * Purpose: Collect every image-ref SHA from a markdown source.
 * How: Global match using `REF_RE_PATTERN` (both `img://<sha>` and
 *   `assets/<sha>.<ext>`); SHA is group 1 or 2; deduped via `Set`.
 */
function collectRefIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const m of text.matchAll(new RegExp(REF_RE_PATTERN, 'g'))) {
    const id = m[1] ?? m[2];
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Purpose: Public alias of `collectRefIds` for the GC orchestrator.
 * How: Direct call-through — keeps the internal regex private.
 */
export function collectImageRefs(text: string): Set<string> {
  return collectRefIds(text);
}

/**
 * Purpose: Replace `img://id` refs with short-lived object URLs for preview.
 * How: Look each id up in `blobUrlCache`, fetching + caching on miss;
 *   then `replaceAll` URL refs with their cached blob URL.
 */
export async function expandRefsToBlobUrls(text: string): Promise<string> {
  // 1. Internal refs: img://<sha> → blob URL (existing behaviour).
  const ids = collectRefIds(text);
  // 2. External refs: relative paths resolved via the resource mapping —
  //    SPEC §6.5. The source markdown keeps the original path; only the
  //    rendered output substitutes the blob URL in.
  const externalPaths = extractExternalRefs(text);
  const mapping = loadMapping();
  // Collect every SHA we need a blob URL for in this render.
  const neededShas = new Set<string>(ids);
  for (const p of externalPaths) {
    const sha = mapping[p]?.sha;
    if (sha) neededShas.add(sha);
  }
  if (neededShas.size === 0) return text;
  await Promise.all(
    [...neededShas].map(async (sha) => {
      if (blobUrlCache.has(sha)) return;
      const blob = await getImage(sha);
      if (blob) blobUrlCache.set(sha, URL.createObjectURL(blob));
    }),
  );
  // Step A: img://<sha> and assets/<sha>.<ext> substitution.
  let out = text.replaceAll(
    new RegExp(REF_RE_PATTERN, 'g'),
    (full, g1: string | undefined, g2: string | undefined) => {
      const id = g1 ?? g2;
      return (id ? blobUrlCache.get(id) : undefined) ?? full;
    },
  );
  // Step B: external path substitution via the mapping.
  if (externalPaths.length > 0) {
    out = rewriteExternalRefs(out, (path) => {
      const sha = mapping[path]?.sha;
      if (!sha) return null;
      return blobUrlCache.get(sha) ?? null;
    });
  }
  return out;
}

/**
 * Purpose: Replace `img://id` refs with base64 data URLs for save.
 * How: Build an `{ id → dataURL }` map (via `blobToDataUrl`), then
 *   `replaceAll` URL refs; reference definitions stay in place.
 */
export async function expandRefsToDataUrls(text: string): Promise<string> {
  // Internal `img://<sha>` refs only — external (relative) paths are
  // intentionally left as-is. Save (`triggerSave` in main.ts) calls this
  // expander; preserving external refs keeps the round-trip identity an
  // imported `.md` author expects (SPEC §6.5). The PDF / print pipeline
  // goes through `expandRefsToInlineDataUrls` below, which adds a second
  // pass to inline external resources too.
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
    new RegExp(REF_RE_PATTERN, 'g'),
    (full, g1: string | undefined, g2: string | undefined) => {
      const id = g1 ?? g2;
      return (id ? map.get(id) : undefined) ?? full;
    },
  );
}

/**
 * Purpose: Resolve every external (relative-path) image reference into a
 *   base64 data URL using the resource mapping.
 * How: For each external path returned by `extractExternalRefs`, look up the
 *   mapping → SHA → IDB blob, materialise as data URL, then `rewriteExternalRefs`
 *   to substitute the URL in the source. Unmapped paths pass through.
 *   Used by `expandRefsToInlineDataUrls` so the PDF / print pipeline gets a
 *   fully-self-contained markdown; the save path does not call it.
 */
async function inlineExternalRefs(text: string): Promise<string> {
  const externalPaths = extractExternalRefs(text);
  if (externalPaths.length === 0) return text;
  const mapping = loadMapping();
  const shaToDataUrl = new Map<string, string>();
  await Promise.all(
    externalPaths.map(async (path) => {
      const sha = mapping[path]?.sha;
      if (!sha || shaToDataUrl.has(sha)) return;
      const blob = await getImage(sha);
      if (blob) shaToDataUrl.set(sha, await blobToDataUrl(blob));
    }),
  );
  return rewriteExternalRefs(text, (path) => {
    const sha = mapping[path]?.sha;
    return sha ? shaToDataUrl.get(sha) ?? null : null;
  });
}

/**
 * Purpose: Fully-inline form of the doc with every image as a data URL —
 *   the input to PDF generation.
 * How: `expandRefsToDataUrls` first; then resolve external (relative)
 *   resources via the mapping; then expand reference-style image uses
 *   (`![alt][label]`) to inline form using the doc's link definitions;
 *   warn on any unresolved `img://` left.
 */
export async function expandRefsToInlineDataUrls(text: string): Promise<string> {
  // 1. Replace every `img://id` URL — inline OR inside a definition — with
  // the matching data URL. Handles both new-style ref docs *and* old-style
  // inline-image docs that came in via extractDataUrlsToStore.
  let out = await expandRefsToDataUrls(text);
  // 1b. Inline externally-mapped resources too — the PDF / print pipeline
  // needs a self-contained markdown (SPEC §6.5). Unmapped externals pass
  // through and would render as broken images in the PDF; that's the same
  // signal a reader would get on the screen preview.
  out = await inlineExternalRefs(out);

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

/**
 * Purpose: Convert a blob into a base64 data URL.
 * How: `FileReader.readAsDataURL`; resolve on `onloadend`.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Purpose: Convert a base64 data URL back into a `Blob`.
 * How: `fetch(dataUrl).then(r => r.blob())` — the platform parses it for us.
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

// ---- import / GC ------------------------------------------------------

/**
 * Purpose: On import, hoist every inline data URL into IndexedDB and
 *   rewrite the source to use `img://<sha>` refs.
 * How: Match `DATA_URL_RE_PATTERN`, `putBlobBySha` each unique data URL,
 *   replace all occurrences; then `inlineImageRefs` to collapse ref-style.
 */
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

/**
 * Purpose: Convert every reference-style image use whose target is
 *   `img://…` into inline form, dropping its now-redundant definition line.
 * How: Build a `label → url` map, rewrite `![alt][label]` to `![alt](url)`
 *   for `img://` URLs only, then strip the matching `[label]: img://…` defs.
 */
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

/**
 * Purpose: Inverse of `inlineImageRefs` — pull every inline `img://` URL
 *   into a definition at the end of the doc.
 * How: Collect occurrences, allocate fresh `img-N` labels avoiding
 *   collisions, rewrite uses as `![alt][label]`, append one def per
 *   unique URL.
 */
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

/**
 * Purpose: Pick the separator that yields a blank line before appended defs.
 * How: Returns `''` / `'\n'` / `'\n\n'` depending on the current trailing
 *   newline count of `text`.
 */
function trailingSeparator(text: string): string {
  if (text.endsWith('\n\n')) return '';
  if (text.endsWith('\n')) return '\n';
  return '\n\n';
}

/**
 * Purpose: Rewrite every `img://oldId` reference using a `{ oldId → newId }`
 *   map (used by the UUID → content-addressed migration).
 * How: Global `replaceAll` on `URL_RE_PATTERN`; absent ids fall through.
 */
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

/**
 * Purpose: Drop IDB entries whose ids aren't in `referenced`.
 * How: Iterate `getAllIds`, `deleteImage` the missing ones, also revoke
 *   any cached blob URL for the dropped id.
 */
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
