/********************************* ebnf.ts **************************************
 *
 * Purpose: Render the ` ```ebnf ` fence — W3C-style EBNF productions as
 *   railroad / syntax diagrams (one SVG per production).
 * How: Delegate parsing + SVG generation to `ebnf2railroad`, wrap each
 *   production in a `<dt>/<dd>` pair; parse errors become a visible `<pre>`.
 *
 *******************************************************************************/

// A vendored copy, not the npm package: markpage uses its parser, diagram
// builder and TOC helpers only, while the package also carries a command line
// and report builders, and with them `showdown` (unmaintained, open ReDoS /
// XSS advisories in every version). See scripts/vendor-ebnf2railroad.mjs,
// which generates the copy.
import {
  createDefinitionMetadata,
  createDiagram,
  createStructuralToc,
  parse,
} from './vendor/ebnf2railroad';

// The copy is untyped JavaScript: the slice of its API used here.
const parseEbnf = parse as (src: string) => unknown[];
const buildDiagram = createDiagram as (
  production: unknown,
  metadata: unknown,
  ast: unknown[],
  options: unknown,
) => string;
const structuralToc = createStructuralToc as (ast: unknown[]) => unknown;
const definitionMetadata = createDefinitionMetadata as (toc: unknown) => Record<string, unknown>;

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
    const metadata = definitionMetadata(structuralToc(ast));
    const productions = ast.filter(
      (p): p is Production & { identifier: string } =>
        !p.comment && typeof p.identifier === 'string',
    );
    if (productions.length === 0) {
      return `<pre class="ebnf-error">EBNF parse error: no productions found</pre>`;
    }
    const parts = productions.map((production) => {
      const svg = buildDiagram(production, metadata, ast, {});
      // Definition-list semantics — `<dt>` for the non-terminal name,
      // `<dd>` for the diagram. The CSS turns the dl into a 2-column
      // grid so every `=` sign lines up under the previous one.
      return (
        `<dt>${escapeHtml(production.identifier)}</dt>` +
        `<dd>${svg}</dd>`
      );
    });
    return `<dl class="ebnf-block block-rigid">${parts.join('')}</dl>`;
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
