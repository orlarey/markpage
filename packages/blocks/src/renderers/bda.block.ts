/******************************** bda.block.ts *********************************
 *
 * Purpose: Orchestrate a `bda` block — parse + typecheck the Block-Diagram
 *   Algebra expression, then emit a native SVG. Parse / typecheck errors
 *   render as a red error block.
 *
 *******************************************************************************/

import { parse as parseBda, typecheck as typecheckBda } from './bda';
import { emitSvg as emitBdaSvg } from './bda-svg';
import { escapeHtml, fenceArgs } from '../util/escape';

/** Render a `bda` fence (body + full info string) to an SVG / error block. */
export function renderBda(body: string, info = ''): string {
  const { ast, errors: parseErrors } = parseBda(body);
  const tcErrors = ast !== null ? typecheckBda(ast).errors : [];
  const all = [...parseErrors, ...tcErrors];
  if (all.length > 0 || ast === null) {
    const items = all
      .map((e) => {
        const where = e.line > 0 ? `ligne ${e.line}: ` : '';
        return `<li>${escapeHtml(where + e.message)}</li>`;
      })
      .join('');
    return (
      `<div class="bda-error">` +
      `<div class="bda-error-msg">Erreur bda</div>` +
      `<ul>${items}</ul>` +
      `<pre>${escapeHtml(body)}</pre>` +
      `</div>\n`
    );
  }
  // Positional arg `delays` (alias `faust`) enables z⁻¹ markers on feedback
  // wires. No-op for diagrams without `~`.
  const args = fenceArgs(info);
  const opts = { delays: args.includes('delays') || args.includes('faust') };
  return `<div class="bda-wrap block-rigid">${emitBdaSvg(ast, opts)}</div>\n`;
}
