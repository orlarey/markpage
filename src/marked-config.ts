/********************************* marked-config.ts *****************************
 *
 * Purpose: Side-effect-only module — registers our custom marked extensions
 *   (math, admonitions, footnotes, def-lists, fenced helpers) on the shared
 *   `marked` instance. Import once from main.ts before any parse / lexer call.
 * How: A single `marked.use({...})` call wires renderer overrides, hooks for
 *   footnote bookkeeping, and the block/inline extensions.
 *
 *******************************************************************************/

import { marked, type Tokens } from 'marked';
import { renderAdtBlock } from './adt';
import { renderChart } from './chart';
import { renderDiffBlock } from './diff';
import { renderEbnfBlock } from './ebnf';
import { renderTreeBlock } from './tree';
import { highlightCode, isKnownLanguage } from './highlight';

interface MathBlockToken {
  type: 'mathBlock';
  raw: string;
  text: string;
}

interface MathInlineToken {
  type: 'mathInline';
  raw: string;
  text: string;
}

interface AdmonitionToken {
  type: 'admonition';
  raw: string;
  klass: string;
  customTitle: string | null;
  tokens: Tokens.Generic[];
}

interface FootnoteRefToken {
  type: 'footnoteRef';
  raw: string;
  id: string;
  isFirst: boolean;
}

interface CitationRefToken {
  type: 'citationRef';
  raw: string;
  id: string;
  isFirst: boolean;
}

interface DefListItem {
  termTokens: Tokens.Generic[];
  defsTokens: Tokens.Generic[][];
}

interface DefListToken {
  type: 'defList';
  raw: string;
  items: DefListItem[];
}

declare module 'marked' {
  namespace Tokens {
    interface MathBlock {
      type: 'mathBlock';
      raw: string;
      text: string;
    }
    interface MathInline {
      type: 'mathInline';
      raw: string;
      text: string;
    }
  }
}

// Localised default titles for the admonition classes we recognise.
// Unknown classes get no default title (just the styling hook). Custom
// titles via `::: classname [Title]` always win.
const ADMONITION_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Astuce',
  warning: 'Avertissement',
  caution: 'Attention',
  important: 'Important',
  theorem: 'Théorème',
  lemma: 'Lemme',
  proposition: 'Proposition',
  corollary: 'Corollaire',
  definition: 'Définition',
  proof: 'Démonstration',
  example: 'Exemple',
  remark: 'Remarque',
};

// Footnote registry. Resets at the start of every parse via the
// preprocess hook. Definitions are collected as the block lexer runs;
// references then look them up in the inline pass (block parsing
// completes before inline parsing in marked, so all defs are known by
// the time refs are tokenized).
//
// `seen` tracks the ids in order of first reference — which is how
// they are numbered in the rendered list, regardless of where the
// definition appears in the source. This matches Pandoc's behaviour.
const footnoteDefs = new Map<string, string>();
const footnoteSeen: string[] = [];
// Pandoc-style citations. Same shape as footnotes (registry + order-of-
// first-appearance numbering) but a separate end-of-document section
// titled "References", and inline rendering as `[1]` square brackets
// rather than superscript `¹`.
const citationDefs = new Map<string, string>();
const citationSeen: string[] = [];
// Re-entrance guard. The postprocess hook calls `marked.parseInline()`
// to render each footnote / citation body as Markdown — but parseInline
// re-enters the preprocess/postprocess hooks, which would otherwise
// clear our registries mid-iteration. Setting this flag tells the hooks
// to no-op for the duration of the inner render.
let inEndnotesRender = false;

// Pandoc-style fenced div: `::: classname [Optional title]\n…body…\n:::`.
// Constraints to keep the syntax non-greedy and predictable:
//   - opening `:::` must be at the start of a line (LF, no leading WS)
//   - class name is a single identifier (letters / digits / hyphen /
//     underscore). The Pandoc curly-brace form `{.cls #id}` is not
//     supported in v1 — keep it simple
//   - optional title in square brackets, single line, no nested `]`
//   - closing `:::` alone on its line (trailing tabs/spaces tolerated)
//   - we do NOT support nesting in v1; a body `:::` would close the
//     outer block. If a user needs that we'll add the multi-colon
//     fence (`::::` opens, `:::` inside is fine) later.
const ADMONITION_RE =
  /^:::[ \t]+([A-Za-z][\w-]*)(?:[ \t]+\[([^\]\n]+)\])?[ \t]*\n([\s\S]+?)\n:::[ \t]*(?=\n|$)/;

// Only matches `$$` that's the very first thing on its line (no leading
// whitespace) and a closing `$$` that's also alone on its line.
// Trailing spaces/tabs on either delimiter line are tolerated — users
// often have them by accident and would never notice. The line-start
// anchor is what keeps us from swallowing `$$` mentions inside inline
// code spans or fenced code samples.
const MATH_BLOCK_RE =
  /^\$\$[ \t]*\n([\S\s]+?)\n[ \t]*\$\$[ \t]*(?=\n|$)/;

// Inline math: `$x$`. Pandoc-ish constraints to keep it from eating prose
// dollars (prices, etc.):
//   - opening `$` is not followed by whitespace
//   - closing `$` is not preceded by whitespace
//   - closing `$` is not followed by a digit (so "Cost $5 or $7" survives)
//   - content has no newline and no unescaped `$`
// `\\.` lets users write `\$` inside the formula if they really need a
// literal dollar sign.
const MATH_INLINE_RE = /^\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\d)/;

// Register all our custom extensions / hooks / renderer overrides in
// one `marked.use({...})` block — this is the side effect of importing
// this module.
marked.use({
  // Treat ```math fenced blocks as display math, equivalent to a $$…$$
  // block. GitHub renders ```math as LaTeX since 2023 — we follow that
  // convention. Emits the same `<div class="math-block">` placeholder
  // as the mathBlock extension below, so the rest of the pipeline
  // (renderMathBlocks → MathJax → SVG) handles them uniformly.
  // Other languages fall through to the default fenced-code renderer.
  renderer: {
    code(token) {
      const lang = (token.lang ?? '').trim();
      // The original fenced-block source. Stashed as data-source on
      // each emitted block so the help window can offer "insert this"
      // even on blocks whose output (table / SVG / math placeholder)
      // doesn't preserve the markdown form.
      const raw = token.raw ?? '';
      if (lang === 'math') {
        const escaped = escapeHtml(token.text);
        return injectSource(
          `<div class="math-block" data-math="${escaped}"></div>\n`,
          raw,
        );
      }
      if (lang === 'csv') {
        return injectSource(renderDataTable(token.text, ','), raw);
      }
      if (lang === 'tsv') {
        return injectSource(renderDataTable(token.text, '\t'), raw);
      }
      // ```inference (Label) — premises / dashes / conclusion. The
      // info string after `inference` is the optional rule label.
      if (lang === 'inference' || lang.startsWith('inference ')) {
        const labelMatch = /^inference\s*(.*)$/.exec(lang);
        const label = labelMatch ? (labelMatch[1] ?? '').trim() : '';
        return injectSource(renderInference(token.text, label), raw);
      }
      // ```chart <type> [Title] — see chart.ts. Everything after the
      // word "chart" (type + optional title) is forwarded as the info
      // string; the helper does its own parsing.
      if (lang === 'chart' || lang.startsWith('chart ')) {
        const m = /^chart\s*(.*)$/.exec(lang);
        return injectSource(renderChart(token.text, m?.[1] ?? ''), raw);
      }
      // ```ebnf — W3C EBNF parsed into a railroad / syntax diagram
      // per production. Pure SVG output, embedded as-is.
      if (lang === 'ebnf') {
        return injectSource(renderEbnfBlock(token.text), raw);
      }
      // ```adt — algebraic-data-type definitions in BNF-ish form
      // (LHS ::= Ctor(args) | …), typeset with aligned `|` and
      // constructor highlighting. Distinct from ebnf because the
      // intent is type definition rather than grammar.
      if (lang === 'adt') {
        return injectSource(renderAdtBlock(token.text), raw);
      }
      // ```diff — unified-diff text with per-line green / red /
      // grey coloration for added / removed / context lines.
      if (lang === 'diff') {
        return injectSource(renderDiffBlock(token.text), raw);
      }
      // ```tree [svg] — indent-based outline rendered as either a
      // Unicode box-drawing tree (default — file structures, code
      // hierarchies) or a top-down SVG diagram (`svg` keyword —
      // syntax trees, parser derivations).
      if (lang === 'tree' || lang.startsWith('tree ')) {
        const mode = /\bsvg\b/.test(lang) ? 'svg' : 'unicode';
        return injectSource(renderTreeBlock(token.text, mode), raw);
      }
      // Programming-language fences — highlight via highlight.js
      // (curated subset registered in src/highlight.ts). Unknown
      // languages fall through to marked's plain monospace block.
      if (lang !== '' && isKnownLanguage(lang)) {
        return injectSource(highlightCode(token.text, lang), raw);
      }
      return false;
    },
  },
  // Hooks for footnote + citation bookkeeping. preprocess wipes both
  // registries so a new parse doesn't inherit state from the previous
  // one (preview and print run separate parses on the same module).
  // postprocess appends the footnotes section then the references
  // section if anything was referenced.
  hooks: {
    preprocess(src) {
      if (inEndnotesRender) return src;
      footnoteDefs.clear();
      footnoteSeen.length = 0;
      citationDefs.clear();
      citationSeen.length = 0;
      return src;
    },
    postprocess(html) {
      if (inEndnotesRender) return html;
      if (footnoteSeen.length === 0 && citationSeen.length === 0) return html;
      inEndnotesRender = true;
      try {
        let out = html;
        if (footnoteSeen.length > 0) {
          const items = footnoteSeen
            .map((id) => {
              const content = footnoteDefs.get(id) ?? '';
              // Inline-parse the body so users can use **bold**,
              // $math$, links, etc. inside their footnotes.
              const inlineHtml = marked.parseInline(content) as string;
              const idEsc = escapeHtml(id);
              return `<li id="fn-${idEsc}">${inlineHtml} <a href="#fnref-${idEsc}" class="footnote-back" aria-label="Retour à l'appel de note">↩</a></li>`;
            })
            .join('');
          out += `\n<section class="footnotes" role="doc-endnotes"><hr><ol>${items}</ol></section>\n`;
        }
        if (citationSeen.length > 0) {
          const items = citationSeen
            .map((id) => {
              const content = citationDefs.get(id) ?? '';
              const inlineHtml = marked.parseInline(content) as string;
              const idEsc = escapeHtml(id);
              return `<li id="cite-${idEsc}">${inlineHtml} <a href="#citeref-${idEsc}" class="citation-back" aria-label="Retour à l'appel de citation">↩</a></li>`;
            })
            .join('');
          out += `\n<section class="references" role="doc-bibliography"><h2>References</h2><ol>${items}</ol></section>\n`;
        }
        return out;
      } finally {
        inEndnotesRender = false;
      }
    },
  },
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(src: string) {
        // Position of `$$` at the start of input or right after a
        // newline, optionally followed by trailing spaces/tabs before
        // the line break. Ignores `$$` mid-line (inside code spans).
        if (/^\$\$[ \t]*\n/.test(src)) return 0;
        const m = /\n\$\$[ \t]*\n/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        const match = MATH_BLOCK_RE.exec(src);
        if (!match) return undefined;
        const token: MathBlockToken = {
          type: 'mathBlock',
          raw: match[0],
          text: (match[1] ?? '').trim(),
        };
        return token as unknown as Tokens.Generic;
      },
      // Renderer emits a placeholder element. The preview pipeline finds
      // these and swaps in the MathJax SVG once it's loaded.
      renderer(token) {
        const t = token as unknown as MathBlockToken;
        const escaped = escapeHtml(t.text);
        return injectSource(
          `<div class="math-block" data-math="${escaped}"></div>\n`,
          t.raw,
        );
      },
    },
    {
      name: 'admonition',
      level: 'block',
      start(src: string) {
        if (/^:::[ \t]+/.test(src)) return 0;
        const m = /\n:::[ \t]+/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        const match = ADMONITION_RE.exec(src);
        if (!match) return undefined;
        const klass = (match[1] ?? '').toLowerCase();
        const customTitle = match[2] ?? null;
        const inner = match[3] ?? '';
        // Recurse into the body so nested Markdown (paragraphs, lists,
        // math, mermaid…) is parsed normally.
        const tokens: Tokens.Generic[] = [];
        this.lexer.blockTokens(inner, tokens);
        const token: AdmonitionToken = {
          type: 'admonition',
          raw: match[0],
          klass,
          customTitle,
          tokens,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as AdmonitionToken;
        const klass = escapeHtml(t.klass);
        const defaultLabel = ADMONITION_LABELS[t.klass];
        let titleHtml = '';
        if (t.customTitle && defaultLabel) {
          // Known class with custom title: combine them — "Théorème — Pythagore".
          titleHtml = `<div class="admonition-title">${escapeHtml(defaultLabel)} — ${escapeHtml(t.customTitle)}</div>`;
        } else if (t.customTitle) {
          titleHtml = `<div class="admonition-title">${escapeHtml(t.customTitle)}</div>`;
        } else if (defaultLabel) {
          titleHtml = `<div class="admonition-title">${escapeHtml(defaultLabel)}</div>`;
        }
        const body = this.parser.parse(t.tokens);
        return injectSource(
          `<div class="admonition admonition-${klass}">${titleHtml}<div class="admonition-body">${body}</div></div>\n`,
          t.raw,
        );
      },
      childTokens: ['tokens'],
    },
    {
      name: 'footnoteDef',
      level: 'block',
      start(src: string) {
        if (/^\[\^[^\]\n]+\]:/.test(src)) return 0;
        const m = /\n\[\^[^\]\n]+\]:/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        // Single-line definition for v1: `[^id]: content`. Pandoc also
        // allows multi-paragraph defs with 4-space-indented continuations;
        // we'll add that if a real document needs it.
        const match = /^\[\^([^\]\n]+)\]:[ \t]*(.+)/.exec(src);
        if (!match) return undefined;
        const id = match[1] ?? '';
        const content = (match[2] ?? '').trim();
        footnoteDefs.set(id, content);
        // Expose id + pre-parsed inline tokens on the token itself, so
        // non-HTML consumers (e.g. the LaTeX exporter) can inline the
        // body into `\footnote{…}` without re-parsing. The HTML
        // renderer keeps using the global `footnoteDefs` map.
        const tokens: Tokens.Generic[] = [];
        this.lexer.inlineTokens(content, tokens);
        return {
          type: 'footnoteDef',
          raw: match[0],
          id,
          tokens,
        };
      },
      // Defs don't render in place — they're collected and emitted at
      // the end of the document via the postprocess hook.
      renderer() {
        return '';
      },
    },
    {
      name: 'footnoteRef',
      level: 'inline',
      start(src: string) {
        const m = /\[\^/.exec(src);
        return m === null ? undefined : m.index;
      },
      tokenizer(src: string) {
        const match = /^\[\^([^\]\n]+)\]/.exec(src);
        if (!match) return undefined;
        const id = match[1] ?? '';
        // Refs to undefined ids fall through to default Markdown
        // (rendered as literal `[^id]` text). Avoids surprising "blank"
        // numbers when a user typos an id.
        if (!footnoteDefs.has(id)) return undefined;
        const isFirst = !footnoteSeen.includes(id);
        if (isFirst) footnoteSeen.push(id);
        const token: FootnoteRefToken = {
          type: 'footnoteRef',
          raw: match[0],
          id,
          isFirst,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as FootnoteRefToken;
        const num = footnoteSeen.indexOf(t.id) + 1;
        const idEsc = escapeHtml(t.id);
        // Only the first reference carries the back-link target id —
        // a footnote referenced N times shouldn't generate N elements
        // with the same DOM id.
        const idAttr = t.isFirst ? ` id="fnref-${idEsc}"` : '';
        return `<sup class="footnote-ref"><a href="#fn-${idEsc}"${idAttr}>${num}</a></sup>`;
      },
    },
    {
      // Pandoc-lite citation definition: `[@key]: text`. Same shape
      // as footnoteDef but a different sigil — keys are restricted to
      // BibTeX-friendly chars `[A-Za-z0-9_:.-]` to keep the reference
      // syntax unambiguous in prose.
      name: 'citationDef',
      level: 'block',
      start(src: string) {
        if (/^\[@[\w:.-]+\]:/.test(src)) return 0;
        const m = /\n\[@[\w:.-]+\]:/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        const match = /^\[@([\w:.-]+)\]:[ \t]*(.+)/.exec(src);
        if (!match) return undefined;
        const id = match[1] ?? '';
        const content = (match[2] ?? '').trim();
        citationDefs.set(id, content);
        const tokens: Tokens.Generic[] = [];
        this.lexer.inlineTokens(content, tokens);
        return {
          type: 'citationDef',
          raw: match[0],
          id,
          tokens,
        };
      },
      // Defs don't render in place — collected and emitted in the
      // References section via the postprocess hook.
      renderer() {
        return '';
      },
    },
    {
      // Pandoc-lite citation reference: `[@key]`. Renders as a `[N]`
      // square-bracketed link to the References entry. Numbering
      // follows order of first appearance, like footnotes.
      name: 'citationRef',
      level: 'inline',
      start(src: string) {
        const m = /\[@/.exec(src);
        return m === null ? undefined : m.index;
      },
      tokenizer(src: string) {
        const match = /^\[@([\w:.-]+)\]/.exec(src);
        if (!match) return undefined;
        const id = match[1] ?? '';
        // Undefined ids fall through to default Markdown so a typo
        // doesn't silently turn into a blank `[N]`.
        if (!citationDefs.has(id)) return undefined;
        const isFirst = !citationSeen.includes(id);
        if (isFirst) citationSeen.push(id);
        const token: CitationRefToken = {
          type: 'citationRef',
          raw: match[0],
          id,
          isFirst,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as CitationRefToken;
        const num = citationSeen.indexOf(t.id) + 1;
        const idEsc = escapeHtml(t.id);
        const idAttr = t.isFirst ? ` id="citeref-${idEsc}"` : '';
        return `<span class="citation-ref"><a href="#cite-${idEsc}"${idAttr}>[${num}]</a></span>`;
      },
    },
    {
      name: 'defList',
      level: 'block',
      // Cheap pre-check: a `:` at the start of a line, preceded by
      // anything that isn't itself a `:` line. The full validation
      // happens in the tokenizer below — here we just want to skip
      // ahead efficiently.
      start(src: string) {
        if (/^[^\n:][^\n]*\n:[ \t]+/.test(src)) return 0;
        const m = /\n[^\n:][^\n]*\n:[ \t]+/.exec(src);
        return m === null ? undefined : m.index + 1;
      },
      tokenizer(src: string) {
        const parsed = parseDefListBlock(src);
        if (!parsed) return undefined;
        const items: DefListItem[] = parsed.pairs.map((pair) => ({
          termTokens: this.lexer.inlineTokens(pair.term),
          defsTokens: pair.defs.map((d) => this.lexer.inlineTokens(d)),
        }));
        const token: DefListToken = {
          type: 'defList',
          raw: parsed.raw,
          items,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as DefListToken;
        const parts: string[] = ['<dl>'];
        for (const item of t.items) {
          parts.push(`<dt>${this.parser.parseInline(item.termTokens)}</dt>`);
          for (const defTokens of item.defsTokens) {
            parts.push(`<dd>${this.parser.parseInline(defTokens)}</dd>`);
          }
        }
        parts.push('</dl>\n');
        return parts.join('');
      },
    },
    {
      name: 'mathInline',
      level: 'inline',
      start(src: string) {
        const idx = src.indexOf('$');
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src: string) {
        const match = MATH_INLINE_RE.exec(src);
        if (!match) return undefined;
        const text = (match[1] ?? '').trim();
        if (text === '') return undefined;
        const token: MathInlineToken = {
          type: 'mathInline',
          raw: match[0],
          text,
        };
        return token as unknown as Tokens.Generic;
      },
      renderer(token) {
        const t = token as unknown as MathInlineToken;
        const escaped = escapeHtml(t.text);
        return `<span class="math-inline" data-math="${escaped}"></span>`;
      },
    },
  ],
});

/**
 * Purpose: Thread the original fenced-block markdown into the first tag of `html`.
 * How: Insert a `data-source="<escaped raw>"` attribute via a single regex on `<\w+`.
 */
function injectSource(html: string, raw: string): string {
  const escaped = escapeHtml(raw);
  return html.replace(/<(\w+)/, `<$1 data-source="${escaped}"`);
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

// Renders an ```inference fenced block as a display-math `\dfrac{...}
// {...}` placeholder, picked up downstream by renderMathBlocks. The
// block is split on a "horizontal bar" line (3+ dashes, optionally
// padded), premises above, conclusion below. Multiple premises on a
// single line are separated by `;` (converted to `\quad` for spacing);
// premises spread across several lines are joined with `\quad` too.
//
// We do NOT pre-substitute ASCII shortcuts like `|-` → `\vdash`: the
// editor's ligature pass is enabled inside ```inference (an
// exception in inCodeContext, see editor-ligatures.ts), so the source
// arriving here already contains the Unicode operators (`⊢`, `→`,
// `⟦`, …). MathJax 3 with the textmacros / unicode packages renders
// these directly in math mode.
// Typography heuristic following the Gunter / Scott convention for
// semantics papers (e.g. Gunter, *Semantics of Programming Languages*,
// MIT Press, 1992):
//
//   Rule A — a single capital letter followed immediately by `⟦` or
//   `[[` is a **semantic function** : `E⟦e⟧` → `\mathcal{E}⟦e⟧`,
//   rendered in calligraphic.
//
//   Rule B — a letter (case-insensitive) followed by digits is a
//   variable with a numeric subscript: `e1` / `T2` → `e_{1}` /
//   `T_{2}`, rendered with proper subscript instead of as adjacent
//   letter+digit.
//
//   Rule C (context-aware) — any other multi-letter identifier (not
//   inside a LaTeX macro argument) is wrapped depending on bracket
//   depth:
//     - **Inside** Scott brackets `⟦…⟧` (or `[[…]]`) — this is
//       abstract-syntax territory, so the identifier is a
//       **constructor**: wrap in `\mathbf{}`.
//     - **Outside** brackets — this is the semantic / meta level, so
//       the identifier is a **function / auxiliary name**: wrap in
//       `\mathsf{}`.
//   LaTeX commands (`\Gamma`, `\vdash`, `\to`, `\quad`, …) are skipped
//   because the preceding `\` is detected; identifiers immediately
//   inside `\xxx{…}` are skipped because the preceding `{` is
//   detected (gives idempotency over our own output).
//
// Single capital letters (`A`, `B`, `T`, `Γ` via `\Gamma`, …) remain
// italic — the standard math convention for type / context / term
// variables in typing-rule notation.
/**
 * Purpose: Apply the Gunter/Scott typography heuristics to an inference rule body.
 * How: Rules A (`\mathcal`) and B (subscript) via two regex passes, then Rule C
 *   via `wrapIdentifiersByBracketContext`.
 */
function applyInferenceTypography(src: string): string {
  let s = src;
  s = s.replace(/(?<![\\{])\b([A-Z])(?=⟦|\[\[)/g, '\\mathcal{$1}');
  s = s.replace(/(?<![\\{])\b([A-Za-z])([0-9]+)\b/g, '$1_{$2}');
  return wrapIdentifiersByBracketContext(s);
}

/**
 * Purpose: Wrap multi-letter identifiers depending on Scott-bracket depth —
 *   `\mathbf{}` inside `⟦…⟧` (constructors), `\mathsf{}` outside (functions).
 * How: Left-to-right scan tracking bracket depth; skip LaTeX command names
 *   and identifiers immediately inside `{…}` for idempotency.
 */
function wrapIdentifiersByBracketContext(s: string): string {
  const IDENT_RE = /^[A-Za-z]{2,}\b/;
  let out = '';
  let i = 0;
  let bracketDepth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '⟦') {
      bracketDepth += 1;
      out += c;
      i += 1;
      continue;
    }
    if (c === '⟧') {
      if (bracketDepth > 0) bracketDepth -= 1;
      out += c;
      i += 1;
      continue;
    }
    if (c === '[' && s[i + 1] === '[') {
      bracketDepth += 1;
      out += '[[';
      i += 2;
      continue;
    }
    if (c === ']' && s[i + 1] === ']') {
      if (bracketDepth > 0) bracketDepth -= 1;
      out += ']]';
      i += 2;
      continue;
    }
    // LaTeX command: consume the leading `\` plus its alphabetic
    // name so the name itself isn't treated as an identifier to wrap.
    if (c === '\\') {
      out += '\\';
      i += 1;
      while (i < s.length && /[A-Za-z]/.test(s[i] ?? '')) {
        out += s[i];
        i += 1;
      }
      continue;
    }
    const idMatch = IDENT_RE.exec(s.slice(i));
    if (idMatch) {
      const id = idMatch[0];
      const prev = i > 0 ? s[i - 1] : '';
      // Idempotency / safety: identifiers right after `\` (LaTeX
      // command continuation — unreachable here but defensive) or
      // `{` (already inside a macro argument like `\mathrm{Foo}`)
      // are passed through.
      if (prev === '\\' || prev === '{') {
        out += id;
        i += id.length;
        continue;
      }
      const wrap = bracketDepth > 0 ? '\\mathbf' : '\\mathsf';
      out += `${wrap}{${id}}`;
      i += id.length;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Purpose: Render an ```inference block as a display-math `\dfrac{P}{C}` placeholder.
 * How: Split on the `---` bar, join premises with `\quad`, apply typography,
 *   optionally append a parenthesised rule label, emit a `<div class="math-block">`.
 */
function renderInference(src: string, label: string): string {
  const lines = src.replaceAll(/\r\n?/g, '\n').split('\n');
  const barIndex = lines.findIndex((l) => /^\s*-{3,}\s*$/.test(l));
  if (barIndex === -1) {
    // No bar: treat the whole thing as a fallback display math block
    // so the user sees *something* instead of nothing.
    const fallback = escapeHtml(applyInferenceTypography(src.trim()));
    return `<div class="math-block" data-math="${fallback}"></div>\n`;
  }
  const premiseLines = lines
    .slice(0, barIndex)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const conclusionLines = lines
    .slice(barIndex + 1)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const QUAD = String.raw` \quad `;
  const premises = applyInferenceTypography(
    premiseLines
      .flatMap((l) => l.split(';').map((s) => s.trim()).filter((s) => s !== ''))
      .join(QUAD),
  );
  const conclusion = applyInferenceTypography(conclusionLines.join(QUAD));
  let latex = String.raw`\dfrac{${premises}}{${conclusion}}`;
  if (label !== '') {
    // Strip surrounding parens/brackets if the user wrote them — the
    // renderer adds its own pair so the label always reads as a
    // parenthesised side note next to the bar.
    const stripped = label.replaceAll(/^[([{]\s*|\s*[)\]}]$/g, '').trim();
    if (stripped !== '') {
      latex += String.raw` \quad \textsf{(${stripped})}`;
    }
  }
  return `<div class="math-block" data-math="${escapeHtml(latex)}"></div>\n`;
}

/**
 * Purpose: Render a CSV/TSV fenced block as an HTML `<table>` (first non-empty
 *   row = header).
 * How: Normalise CRLF, drop blank lines, parse each line with `parseCsvLine`,
 *   then emit `<thead>` + `<tbody>` cells with HTML-escaped content.
 */
function renderDataTable(src: string, sep: string): string {
  const lines = src.replaceAll(/\r\n?/g, '\n').split('\n');
  const rows = lines
    .filter((l) => l.trim() !== '')
    .map((l) => parseCsvLine(l, sep));
  if (rows.length === 0) return '';
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  const headHtml = head
    .map((cell) => `<th>${escapeHtml(cell)}</th>`)
    .join('');
  const bodyHtml = body
    .map((row) => {
      const cells = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table class="data-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>\n`;
}

/**
 * Purpose: Consume a Pandoc-style definition list (Term / `:` Def / 4-space
 *   continuations) from the head of `src`.
 * How: Loop while we see a Term line followed by a `:` line; fold 4-space
 *   continuations into the current def; return raw consumed text + parsed pairs.
 */
//
// Format (Pandoc-style):
//   Term
//   :   Definition
//       continuation lines indented by 4+ spaces (or a tab)
//   :   Second definition for the same term
//
// Multiple defs per term, multiple consecutive term-pairs in the
// same dl block are supported. 4-space (or tab) indented lines
// after a `:` line are folded into the current definition as a soft
// line break (rendered like a wrapped paragraph). A blank line or
// any line that's neither a `:` line nor a continuation closes the
// dl.
function parseDefListBlock(
  src: string,
): { raw: string; pairs: { term: string; defs: string[] }[] } | null {
  const lines = src.split('\n');
  const pairs: { term: string; defs: string[] }[] = [];
  let i = 0;
  const CONT_RE = /^(?: {4}|\t)(.*)$/;
  while (i < lines.length) {
    const termLine = lines[i] ?? '';
    // Term: non-empty, doesn't start with `:`. Stop the loop on
    // anything else — we only consume contiguous pairs.
    if (termLine === '' || termLine.startsWith(':')) break;
    const defLine = lines[i + 1];
    if (defLine === undefined || !/^:[ \t]+/.test(defLine)) break;
    const defs: string[] = [defLine.replace(/^:[ \t]+/, '')];
    i += 2;
    while (i < lines.length) {
      const line = lines[i] ?? '';
      const contMatch = CONT_RE.exec(line);
      if (contMatch) {
        // Indented continuation: append to the current def. We
        // join with a space rather than a literal newline so the
        // inline lexer sees one flowing line — emphasis and other
        // span markers stitch across the hard wrap.
        defs[defs.length - 1] = `${defs.at(-1) ?? ''} ${(contMatch[1] ?? '').trim()}`;
        i += 1;
        continue;
      }
      if (/^:[ \t]+/.test(line)) {
        defs.push(line.replace(/^:[ \t]+/, ''));
        i += 1;
        continue;
      }
      break;
    }
    pairs.push({ term: termLine, defs });
  }
  if (pairs.length === 0) return null;
  const raw = lines.slice(0, i).join('\n');
  return { raw, pairs };
}

/**
 * Purpose: Parse one CSV/TSV line — minimal RFC-4180-ish, double-quoted fields
 *   with `""` escape, no embedded newlines.
 * How: Char-by-char state machine toggling on the quote / separator chars.
 */
function parseCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else if (c === '"' && cur.trim() === '') {
      // Opening quote at the start of a field. We allow whitespace
      // between the previous separator and the quote (CSVs from
      // spreadsheets often pad after the comma) and drop it so the
      // padding doesn't end up inside the parsed field.
      inQuote = true;
      cur = '';
    } else if (c === sep) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}
