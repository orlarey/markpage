// local-server.ts — the VS Code side of "Open in markpage.org": wires the
// loopback document server (local-server-core.ts) to the editor — its setting
// for the app URL, the open documents' buffers (unsaved edits included), and
// the write-back of a document saved in markpage.

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
    return openDocument(file)?.getText();
  },
  // A save in markpage: an open document takes the text as one edit (VS Code's
  // undo can take it back) and is saved; a closed one is written to disk.
  async writeText(file, text) {
    const doc = openDocument(file);
    if (!doc) {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(file), Buffer.from(text, 'utf8'));
      return;
    }
    if (doc.getText() !== text) {
      const edit = new vscode.WorkspaceEdit();
      const all = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      edit.replace(doc.uri, all, text);
      if (!(await vscode.workspace.applyEdit(edit))) throw new Error('edit refused');
    }
    if (doc.isDirty && !(await doc.save())) throw new Error('save failed');
  },
});

/** The editor document of `file`, when VS Code has it open. */
function openDocument(file: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find(
    (d) => d.uri.scheme === 'file' && d.uri.fsPath === file,
  );
}

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
