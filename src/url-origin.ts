/********************************* url-origin.ts ********************************
 *
 * Purpose: Documents whose origin is a URL (`markpage.org/?url=<https://…>`):
 *   fetched by the browser itself (no server in between), kept as a library
 *   copy that remembers where it came from — reopening the same URL reuses it,
 *   *Recharger* fetches the latest, *Enregistrer* only saves the local copy.
 * How: pure helpers (normalise, dedupe key, name, relative resolution) plus
 *   one fetch. The page can only read a URL whose server allows it (CORS):
 *   raw GitHub files, gists, GitHub Pages and most static hosting do; a
 *   failure says so plainly. Loopback URLs are the VS Code extension serving
 *   a local file (vscode/src/local-server.ts).
 *
 *******************************************************************************/

/**
 * The URL to fetch for what the user gave: http(s) only; a GitHub *page*
 * (`github.com/<owner>/<repo>/blob/<branch>/<path>`) becomes its raw file.
 * Throws on anything else.
 */
export function normalizeDocUrl(input: string): URL {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`unsupported URL scheme: ${url.protocol}`);
  }
  if (url.hostname === 'github.com') {
    const m = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname);
    if (m) return new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
  }
  url.hash = '';
  return url;
}

/**
 * The document URL a `?url=` / `?src=` value names: a URL as is, or its
 * base64url form — what the VS Code extension sends, since an external link
 * opened by VS Code survives its URI encoding only with URL-safe characters.
 */
export function decodeSrcParam(value: string): string {
  const v = value.trim();
  if (/^https?:/i.test(v) || !/^[A-Za-z0-9_-]+$/.test(v)) return v;
  try {
    const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
    const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return /^https?:\/\//i.test(text) ? text : v;
  } catch {
    return v;
  }
}

/** A loopback URL (the VS Code extension's local server). */
export function isLoopbackUrl(url: URL): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
}

/**
 * The identity of a URL document — what "the same document" means on reopen.
 * A loopback URL carries a per-session port and token (`/<token>/<abs path>`):
 * its identity is the file path alone, so VS Code reopening the same file finds
 * the same library copy.
 */
export function urlDocKey(url: URL): string {
  if (isLoopbackUrl(url)) {
    const path = url.pathname.split('/').slice(2).join('/');
    return `local:/${decodeURIComponent(path)}`;
  }
  return url.href;
}

/** A document name from its URL: the file name without `.md`, else the host. */
export function docNameFromUrl(url: URL): string {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  const name = last.replace(/\.(md|markdown|txt)$/i, '');
  return name !== '' ? name : url.hostname;
}

/** Where a relative reference in the document points (images, links). */
export function resolveAgainstDoc(docUrl: string, rel: string): string | null {
  try {
    return new URL(rel, docUrl).href;
  } catch {
    return null;
  }
}

/** The origin shown on the toolbar chip: host (or "local") + folder. */
export function urlChip(url: URL): string {
  const dir = decodeURIComponent(url.pathname.replace(/[^/]*$/, ''));
  if (isLoopbackUrl(url)) {
    const path = dir.split('/').slice(2).join('/');
    return `🔗 /${path}`;
  }
  return `🌐 ${url.hostname}${dir === '/' ? '' : ` ▸ ${dir.replace(/^\//, '')}`}`;
}

/** Why a URL couldn't be read: refused / unreachable (CORS, network), or an
 *  HTTP error status. The app words it for the user. */
export class UrlFetchError extends Error {
  constructor(
    readonly url: string,
    readonly kind: 'blocked' | 'http',
    readonly status?: number,
  ) {
    super(kind === 'http' ? `${url} — HTTP ${status}` : `${url} — blocked or unreachable`);
  }
}

/**
 * Fetch the document's text — no cookies sent, no cache reuse (the point of
 * reopening is the latest version).
 */
export async function fetchDocText(url: URL): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url.href, { credentials: 'omit', cache: 'no-cache' });
  } catch {
    throw new UrlFetchError(url.href, 'blocked');
  }
  if (!res.ok) throw new UrlFetchError(url.href, 'http', res.status);
  return res.text();
}
