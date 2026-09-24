// local-server-core.ts — serve a local Markdown document (and the files next to
// it) to markpage.org, for the "Open in markpage.org" command. Plain Node (no
// `vscode` import) so it is unit-tested; local-server.ts wires it to VS Code.
//
// A web page cannot read a local file by its path — the browser forbids it.
// The extension can: it serves the document over loopback HTTP and opens
// `markpage.org/?src=<that URL>`; markpage fetches it like any URL document
// (src/url-origin.ts), relative images included.
//
// Safety: bound to 127.0.0.1 only; every URL carries a random per-session
// token; only files inside the folder of a document explicitly shared by the
// command are served (no `..` escape); reads are allowed (CORS) only from the
// markpage app's origin (and the local dev server); GET only.

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as path from 'path';

const MIME: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

export interface LocalServerOptions {
  /** Origins allowed to read (the markpage app, the local dev server). */
  allowedOrigins(): Set<string>;
  /** The text of `file` when it is open in the editor (unsaved edits
   *  included); undefined → read from disk. */
  bufferText(file: string): string | undefined;
}

export class LocalDocServer {
  private server: http.Server | undefined;
  private port = 0;
  private readonly token = crypto.randomBytes(16).toString('hex');
  /** Folders of the documents shared so far (a request must fall inside one). */
  private readonly sharedDirs = new Set<string>();

  constructor(private readonly opts: LocalServerOptions) {}

  /** Serve `file` (and its folder) and return the URL markpage should fetch. */
  async share(file: string): Promise<string> {
    await this.ensureServer();
    const abs = path.resolve(file);
    this.sharedDirs.add(path.dirname(abs));
    const segments = abs.split(path.sep).filter((s) => s !== '').map(encodeURIComponent);
    return `http://127.0.0.1:${this.port}/${this.token}/${segments.join('/')}`;
  }

  stop(): void {
    this.server?.close();
    this.server = undefined;
    this.sharedDirs.clear();
  }

  /** The absolute file path a request names, or null when it isn't one we serve. */
  private requestedPath(urlPath: string): string | null {
    const prefix = `/${this.token}/`;
    if (!urlPath.startsWith(prefix)) return null;
    let rel: string;
    try {
      rel = decodeURIComponent(urlPath.slice(prefix.length));
    } catch {
      return null;
    }
    const abs = process.platform === 'win32' ? path.resolve(rel) : path.resolve('/', rel);
    for (const dir of this.sharedDirs) {
      if (abs === dir || abs.startsWith(dir + path.sep)) return abs;
    }
    return null;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const origin = req.headers.origin;
    if (origin && this.opts.allowedOrigins().has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      // Preflight — including Chrome's private-network access check (a public
      // site reading a loopback address).
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    const file = this.requestedPath(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    try {
      const text = this.opts.bufferText(file);
      const body = text !== undefined ? Buffer.from(text, 'utf8') : await fs.readFile(file);
      res.setHeader(
        'Content-Type',
        MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      );
      res.setHeader('Cache-Control', 'no-store');
      res.writeHead(200).end(body);
    } catch {
      res.writeHead(404).end();
    }
  }

  private async ensureServer(): Promise<void> {
    if (this.server) return;
    const s = http.createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      s.once('error', reject);
      s.listen(0, '127.0.0.1', () => resolve());
    });
    this.port = (s.address() as { port: number }).port;
    this.server = s;
  }
}

/** The markpage URL that opens `docUrl` — base64url, the only form of a query
 *  value that survives VS Code's URI encoding untouched (see decodeSrcParam in
 *  the app's src/url-origin.ts). */
export function markpageUrlFor(app: string, docUrl: string): string {
  return `${app.replace(/\/+$/, '')}/?src=${Buffer.from(docUrl, 'utf8').toString('base64url')}`;
}
