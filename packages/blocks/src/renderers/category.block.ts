/***************************** category.block.ts ******************************
 *
 * Purpose: Orchestrate a `category` block — parse + typecheck, emit a native
 *   SVG commutative diagram, and fall back to a Mermaid placeholder for
 *   topologies the native grid placer can't lay out. Errors render red.
 *
 * Note: the Mermaid fallback emits `<pre><code class="language-mermaid">` —
 *   the *host* is responsible for running Mermaid over it (as the markpage
 *   app does). Self-contained otherwise.
 *
 *******************************************************************************/

import { parse as parseCategory, typecheck as typecheckCategory } from './category';
import { emitMermaid as emitCategoryMermaid } from './category-mermaid';
import { emitSvg as emitCategorySvg } from './category-svg';
import { escapeHtml } from '../util/escape';

/** Render a `category` fence body to an SVG (or Mermaid fallback / error). */
export function renderCategory(body: string): string {
  const { ast, errors: parseErrors } = parseCategory(body);
  const tcErrors = parseErrors.length === 0 ? typecheckCategory(ast) : [];
  const all = [...parseErrors, ...tcErrors];
  if (all.length > 0) {
    const items = all
      .map((e) => {
        const where = e.line > 0 ? `ligne ${e.line}: ` : '';
        return `<li>${escapeHtml(where + e.message)}</li>`;
      })
      .join('');
    return (
      `<div class="category-error">` +
      `<div class="category-error-msg">Erreur category</div>` +
      `<ul>${items}</ul>` +
      `<pre>${escapeHtml(body)}</pre>` +
      `</div>\n`
    );
  }
  // Native SVG first; null ⇒ no acceptable grid layout ⇒ Mermaid fallback.
  const svg = emitCategorySvg(ast);
  if (svg !== null) {
    return `<div class="category-wrap block-rigid">${svg}</div>\n`;
  }
  const mermaidSrc = emitCategoryMermaid(ast);
  return `<pre><code class="language-mermaid">${escapeHtml(mermaidSrc)}</code></pre>\n`;
}
