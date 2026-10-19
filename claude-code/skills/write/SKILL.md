---
name: write
description: Write documents in markpage Markdown, the Markdown dialect of markpage.org — math, inference rules, abstract syntax (adt), commutative diagrams, EBNF, charts, mermaid, callouts, footnotes, cross-references, named document styles. Use whenever Claude writes a document meant to be rendered by markpage, a specification (« rédige des spécifications », « écris une spec », "write a spec"), a formal or technical write-up, or rules in markpage notation (for instance for the rewrite-rules skill). Loads the markpage authoring guide and fence syntax before writing.
argument-hint: "[what to write]"
---

# Writing markpage Markdown

Task: $ARGUMENTS

markpage Markdown is standard Markdown plus the constructs of technical and scientific writing, rendered by markpage into print-ready pages. Its authoritative reference ships with this skill:

- `${CLAUDE_SKILL_DIR}/references/AI-AUTHORING.md` — every construct and convention, with a "Picking the right block" table and a style summary. **Read it in full before writing** (once per conversation is enough). When another skill or instruction disagrees with it on markpage syntax, the guide wins.
- `${CLAUDE_SKILL_DIR}/references/SYNTAX.md` — the exact body and option grammar of the rich fences (`chart`, `bda`, `category`, `adt`, `diff`, `tree`). Read it when you use one of them.

## How to write

1. **Skeleton first** (guide, *Document skeleton*): a YAML front matter with the title in `title:` — never a `#` title in the body — the style in `document-style:` (for example `note-a4`, `article-a4`, `rapport-a4`) and the language in `language:` (`fr` or `en`, the language of the document). In the body, `#` opens a section, `##` a subsection; never number headings by hand: markpage numbers them.
2. **Prefer a construct of the guide whenever one fits the intent** over plain prose: `inference` for any judgement-style rule, `adt` for abstract syntax, `math` blocks and `$…$` for formulas, `::: definition` / `::: proposition` / `::: proof` callouts, `mermaid` for control flow and state machines, `csv` or pipe tables, footnotes, `\label{…}` / `\ref{…}` cross-references.
3. **Unicode over LaTeX** in prose and in `inference` fences (`→ ⊢ ∈ ⟦ ⟧ σ Γ`); no invented LaTeX macros. Inside `inference` fences typography is automatic — follow the guide's naming conventions instead of `\mathcal` / `\mathbf`.
4. **One source line per paragraph**; do not hard-wrap prose.

Save the document where the user or the calling skill says (the rewrite-rules skill: `docs/rules/<name>.md`); otherwise next to the files it documents, or in `docs/`.

## Then show it

When the document is written, show it rendered with this plugin's **view** skill (`/markpage:view <file>`), unless the user asked for the file only. Rendering is the quickest check that every fence parses: a construct that failed shows as a red block.
