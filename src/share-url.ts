/********************************* share-url.ts ********************************
 *
 * Purpose: Encode a Markdown document into a self-contained `?import=…` URL
 *   the recipient can open in markpage to load the doc as a fresh local copy.
 * How: gzip (CompressionStream) + URL-safe base64. No infra, no auth — the
 *   document travels entirely in the query string. A hard cap protects
 *   against URLs longer than what email clients / browsers reliably handle.
 *
 *******************************************************************************/

// Hard cap on the encoded payload (chars). Below ~8 KB the URL works in
// most email clients, browsers, Slack-like chats. Above that, copy-paste
// loses suffix bytes and the import fails on the recipient side. Power
// users with big docs should use the OneDrive share path instead.
export const MAX_SHARE_PAYLOAD = 8000;

/**
 * Purpose: gzip + URL-safe base64 a Markdown source for embedding in `?import=`.
 * How: `CompressionStream('gzip')` (native, no deps) → ArrayBuffer → base64.
 */
export async function encodeShareContent(source: string): Promise<string> {
  const stream = new Blob([source])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return base64UrlEncode(new Uint8Array(buf));
}

/**
 * Purpose: Reverse of `encodeShareContent` — decodes a `?import=` payload back
 *   to the original Markdown source.
 * How: URL-safe base64 → bytes → `DecompressionStream('gzip')` → string.
 */
export async function decodeShareContent(encoded: string): Promise<string> {
  const bytes = base64UrlDecode(encoded);
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  // A link is a few KB of gzip; stop well before a "zip bomb" (a tiny payload
  // inflating to gigabytes) could freeze the tab.
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_DECODED_BYTES) {
      await reader.cancel();
      throw new Error('shared document too large');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

/** Past this, a shared payload is refused (a real one inflates to ≤ ~100 KB). */
export const MAX_DECODED_BYTES = 4 * 1024 * 1024;

/**
 * How a shared link first shows the document: in Lire (someone sent a link
 * to read it), in pages or not as the sender had it. Only the first opening —
 * the recipient's own choices are neither changed nor remembered.
 */
export interface ShareReading {
  pages: boolean;
}

function readingParams(reading: ShareReading): string {
  return `&view=read&pages=${reading.pages ? '1' : '0'}`;
}

/**
 * Purpose: Build the full share URL from the encoded payload.
 * How: Re-uses the current origin + pathname so a fork hosted at
 *   `example.com/markpage/` keeps the same prefix in shared links.
 */
export function buildShareUrl(payload: string, reading: ShareReading): string {
  return `${window.location.origin}${window.location.pathname}?import=${payload}${readingParams(reading)}`;
}

/** A URL as a query value, still readable: only what would break the query is escaped. */
function readableParam(url: string): string {
  return encodeURIComponent(url).replace(/%2F/g, '/').replace(/%3A/g, ':');
}

/**
 * The share link to a document published at `source` (a public GitHub file, a
 * public URL): the recipient's browser fetches it there, so the link always
 * shows the latest published version.
 */
export function buildSourceShareUrl(source: string, reading: ShareReading): string {
  return `${window.location.origin}${window.location.pathname}?src=${readableParam(source)}${readingParams(reading)}`;
}

/**
 * Purpose: URL-safe base64 (`-_` instead of `+/`, no padding).
 * How: Walk bytes through `String.fromCharCode` → `btoa` → swap chars.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  // Process in chunks so very large inputs don't blow the call stack via spread.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Purpose: Inverse of `base64UrlEncode`.
 * How: Swap `-_` back to `+/`, re-pad to multiple of 4, `atob`, byte-by-byte.
 */
function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
