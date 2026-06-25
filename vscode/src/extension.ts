// extension.ts — the VS Code host side of the markpage preview.
//
// Registers `markpage.openPreview`, opens a WebviewPanel beside the active
// Markdown editor, and streams the document text to the webview (which renders
// it with @orlarey/markpage-render). Live-updates on edit. Images are resolved
// against the document's folder as webview URIs.

import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | undefined;
let trackedDoc: vscode.TextDocument | undefined;
let suppressEditorScrollUntil = 0; // ignore the visible-range echo after a webview-driven reveal
let paginated = false; // continuous (fast, live) vs paged.js A4 pages

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('markpage.openPreview', () => openPreview(context)),
    // Toggle continuous ↔ paged.js A4 pages (the latter mirrors the PDF).
    vscode.commands.registerCommand('markpage.togglePagination', () => {
      paginated = !paginated;
      void vscode.window.showInformationMessage(
        `markpage preview: ${paginated ? 'paginated (A4 pages)' : 'continuous'}`,
      );
      update();
    }),
    // Print the preview (→ "Save as PDF"); best in paginated mode.
    vscode.commands.registerCommand('markpage.print', () => {
      if (!panel) return;
      void panel.webview.postMessage({ type: 'print' });
    }),
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

  // Scroll-sync: editor scroll → preview. (The reverse, preview → editor, is the
  // webview's `revealLine` message, handled in openPreview.)
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (!panel || e.textEditor.document !== trackedDoc) return;
      if (Date.now() < suppressEditorScrollUntil) return; // our own echo
      const top = e.visibleRanges[0]?.start.line ?? 0;
      void panel.webview.postMessage({ type: 'scrollToLine', line: top });
    }),
  );
}

/** Preview → editor: reveal `line` in the tracked editor (guarded against echo). */
function revealEditorLine(line: number): void {
  const editor = vscode.window.visibleTextEditors.find((ed) => ed.document === trackedDoc);
  if (!editor) return;
  suppressEditorScrollUntil = Date.now() + 250;
  const range = new vscode.Range(line, 0, line, 0);
  editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
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
  panel.webview.onDidReceiveMessage(
    (m: { type?: string; line?: number }) => {
      if (m?.type === 'revealLine' && typeof m.line === 'number') revealEditorLine(m.line);
    },
    undefined,
    context.subscriptions,
  );
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
    paginated,
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
  // Bundled CSS (hljs theme + @orlarey/blocks styles), then the paper theme.
  const bundledCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'preview.css'),
  );
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    // The webview bundle is an ES module that lazy-imports MathJax/Mermaid
    // chunks; 'strict-dynamic' lets the nonced root module load them.
    `script-src 'nonce-${n}' 'strict-dynamic'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${bundledCssUri}?v=${n}">
  <link rel="stylesheet" href="${styleUri}?v=${n}">
</head>
<body>
  <div id="markpage-preview"></div>
  <script type="module" nonce="${n}" src="${scriptUri}?v=${n}"></script>
</body>
</html>`;
}

export function deactivate(): void {
  /* nothing to clean up */
}
