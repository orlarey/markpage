// Renders an ` ```ebnf ` fenced block as a series of railroad
// (syntax) diagrams. Source is W3C-style EBNF (the dialect ebnf2-
// railroad understands); each production becomes a separate SVG
// diagram, labelled by its non-terminal name.
//
// Parse errors are caught and rendered as a visible <pre> fallback
// so a typo doesn't blow up the whole document render.

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

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
