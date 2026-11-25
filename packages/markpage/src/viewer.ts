/********************************** viewer.ts **********************************
 *
 * Purpose: The standalone markpage viewer — the page `markpage html` writes.
 *   The SAME render as the app and the VS Code preview (it is the VS Code
 *   webview's script, in its plain-browser mode): named style, Markdown → HTML,
 *   MathJax, Mermaid, then the continuous sheet or Vivliostyle pages, with the
 *   Continuous / Pages switch and drag-to-zoom.
 * How: The document travels in the page as JSON
 *   (`<script type="application/json" id="markpage-source">`, so no `</script>`
 *   in the text can close the tag). Once the webview script has attached its
 *   message listener, post it the render message it expects from VS Code.
 *
 *******************************************************************************/

import '../../../vscode/src/webview/preview';
import '../../../vscode/media/preview.css';

interface Source {
  md: string;
  paginated?: boolean;
  language?: string;
  /** Where the document's relative images resolve (its folder, served). */
  baseUri?: string;
}

function boot(): void {
  const el = document.getElementById('markpage-source');
  if (!el) {
    console.error('[markpage] no #markpage-source in the page');
    return;
  }
  const src = JSON.parse(el.textContent ?? '{}') as Source;
  window.postMessage({
    type: 'render',
    md: src.md ?? '',
    baseUri: src.baseUri ?? '',
    paginated: src.paginated ?? true,
    uiLanguage: src.language ?? navigator.language,
  });
}

boot();
