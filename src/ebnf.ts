/********************************* ebnf.ts **************************************
 *
 * Purpose: Render the ` ```ebnf ` fence — W3C-style EBNF productions as
 *   railroad / syntax diagrams (one SVG per production).
 * How: Delegate parsing + SVG generation to `ebnf2railroad`, wrap each
 *   production in a `<dt>/<dd>` pair; parse errors become a visible `<pre>`.
 *
 *******************************************************************************/

// Types declared ambiently in src/vite-env.d.ts — the package ships
// no .d.ts of its own.
import { parseEbnf } from 'ebnf2railroad';
import { createDiagram } from 'ebnf2railroad/src/build-diagram';
import {
  createDefinitionMetadata,
  createStructuralToc,
} from 'ebnf2railroad/src/toc';

interface Production {
  identifier?: string;
  comment?: unknown;
}

/**
 * Purpose: Entry point of the `ebnf` fence renderer.
 * How: Parse to AST, build one diagram per production, wrap in a `<dl>`;
 *   parse errors become a visible `<pre class="ebnf-error">`.
 */
export function renderEbnfBlock(source: string): string {
  try {
    const ast = parseEbnf(source) as Production[];
    const structuralToc = createStructuralToc(ast);
    const metadata = createDefinitionMetadata(structuralToc);
    const productions = ast.filter(
      (p): p is Production & { identifier: string } =>
        !p.comment && typeof p.identifier === 'string',
    );
    if (productions.length === 0) {
      return `<pre class="ebnf-error">EBNF parse error: no productions found</pre>`;
    }
    const parts = productions.map((production) => {
      const svg = createDiagram(production, metadata, ast, {}) as string;
      // Definition-list semantics — `<dt>` for the non-terminal name,
      // `<dd>` for the diagram. The CSS turns the dl into a 2-column
      // grid so every `=` sign lines up under the previous one.
      return (
        `<dt>${escapeHtml(production.identifier)}</dt>` +
        `<dd>${svg}</dd>`
      );
    });
    return `<dl class="ebnf-block">${parts.join('')}</dl>`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<pre class="ebnf-error">EBNF parse error: ${escapeHtml(msg)}</pre>`;
  }
}

/**
 * Purpose: Minimal HTML entity escape for `&`, `<`, `>`, `"`, `'`.
 * How: Sequential `replaceAll`.
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
