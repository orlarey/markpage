// local-server.ts — the VS Code side of "Open in markpage.org": wires the
// loopback document server (local-server-core.ts) to the editor — its setting
// for the app URL, and the open documents' buffers (unsaved edits included).

import * as vscode from 'vscode';
import { LocalDocServer, markpageUrlFor as urlFor } from './local-server-core';

const DEV_ORIGIN = 'http://localhost:5173';

/** The markpage app URL (setting `markpage.appUrl`), without a trailing slash. */
function appUrl(): string {
  return vscode.workspace
    .getConfiguration('markpage')
    .get<string>('appUrl', 'https://markpage.org')
    .replace(/\/+$/, '');
}

const server = new LocalDocServer({
  allowedOrigins() {
    const out = new Set([DEV_ORIGIN]);
    try {
      out.add(new URL(appUrl()).origin);
    } catch {
      /* a malformed setting: only the dev origin */
    }
    return out;
  },
  bufferText(file) {
    return vscode.workspace.textDocuments
      .find((d) => d.uri.scheme === 'file' && d.uri.fsPath === file)
      ?.getText();
  },
});

/** Serve `file` (and its folder) and return the URL markpage should fetch. */
export function shareFile(file: string): Promise<string> {
  return server.share(file);
}

/** The markpage URL that opens `docUrl`. */
export function markpageUrlFor(docUrl: string): string {
  return urlFor(appUrl(), docUrl);
}

export function stopServer(): void {
  server.stop();
}
