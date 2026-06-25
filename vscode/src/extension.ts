// extension.ts — the VS Code host side of the markpage preview.
//
// Registers `markpage.openPreview`, opens a WebviewPanel beside the active
// Markdown editor, and streams the document text to the webview (which renders
// it with @orlarey/markpage-render). Live-updates on edit. Images are resolved
// against the document's folder as webview URIs.

import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | undefined;
let trackedDoc: vscode.TextDocument | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('markpage.openPreview', () => openPreview(context)),
  );

  // Live update: re-render when the tracked document changes (debounced).
  let timer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!panel || !trackedDoc || e.document !== trackedDoc) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => update(), 150);
    }),
  );

  // Follow the active editor when it's a Markdown file.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (panel && editor?.document.languageId === 'markdown') {
        trackedDoc = editor.document;
        update();
      }
    }),
  );
}

function openPreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    void vscode.window.showInformationMessage('Open a Markdown file first.');
    return;
  }
  trackedDoc = editor.document;

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true);
    update();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'markpagePreview',
    'markpage preview',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: localRoots(context),
    },
  );
  panel.onDidDispose(() => {
    panel = undefined;
  });
  panel.webview.html = htmlShell(context, panel.webview);
  update();
}

/** Allow loading the extension's bundle + the document's folder (for images). */
function localRoots(context: vscode.ExtensionContext): vscode.Uri[] {
  const roots = [vscode.Uri.joinPath(context.extensionUri, 'dist')];
  const folder = docFolder();
  if (folder) roots.push(folder);
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (ws) roots.push(ws);
  return roots;
}

function docFolder(): vscode.Uri | undefined {
  if (!trackedDoc || trackedDoc.uri.scheme !== 'file') return undefined;
  return vscode.Uri.joinPath(trackedDoc.uri, '..');
}

/** Push the current document's text + an image base URI to the webview. */
function update(): void {
  if (!panel || !trackedDoc) return;
  const folder = docFolder();
  const baseUri = folder ? panel.webview.asWebviewUri(folder).toString() : '';
  void panel.webview.postMessage({
    type: 'render',
    md: trackedDoc.getText(),
    baseUri,
  });
}

function nonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function htmlShell(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const n = nonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'preview.css'),
  );
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `script-src 'nonce-${n}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="markpage-preview"></div>
  <script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function deactivate(): void {
  /* nothing to clean up */
}
