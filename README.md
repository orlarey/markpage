# markpage

A Markdown editor that produces print-ready PDFs, **entirely
client-side, in your browser**.

You write Markdown in the editor; one click switches to a paginated
preview that matches the PDF exactly — click anywhere in the
preview to jump back to the editor at that spot. When you're done
you save as `.pdf`, `.md`, or `.tex`.

## What's different

- **No installation.** Open the page, start writing.
- **No account, no subscription.** A static web app — host it
  yourself in five minutes if you want.
- **Nothing leaves your machine by default.** Documents, images,
  settings — all in the browser's local storage. No server-side state,
  no telemetry. The two opt-in exports (OneDrive upload, share-link)
  only push content out when you explicitly click them.
- **Direct to PDF.** No round-trip to an external service. The
  browser's own print engine renders the same paged layout you see
  in the preview, you click *Save as PDF*.

## What you can write

A Markdown extended for technical and scientific writing:

- **Math** via MathJax 4 (`$x^2$` inline, `$$ … $$` displayed, or
  fenced `math` blocks), with selectable math font set
- **Inference rules** (` ```inference `) — premises / dashes /
  conclusion, with automatic Gunter / Scott typography
  (calligraphic semantic functions, **bold** constructors inside
  `⟦…⟧`, sans-serif functions outside, numeric subscripts)
- **Commutative diagrams** (` ```category `) — declarative
  syntax (`f : A -> B`, equations, `by (…)` for universal
  morphisms), type-checked compositions, native SVG renderer
  with Mermaid `dagre` fallback for tricky topologies
- **EBNF grammars** (` ```ebnf `) as railroad / syntax diagrams,
  one diagram per production with aligned `=` signs
- **Algebraic data types** (` ```adt `) — `LHS ::= Ctor |
  Ctor(args)` definitions typeset with aligned `|` separators
  and two-tier highlighting (defined types vs constructors)
- **Faust block-diagram algebra** (` ```bda `) — left-to-right
  audio-DSP signal-flow circuits, five binary operators (`~ : ,
  <: :>`), native SVG renderer with optional `z⁻¹` markers
- **Mermaid diagrams** (flowcharts, sequence, class, state, …)
  and inline **`chart`** blocks (line, bar) — all rendered as SVG
- **Unified diffs** (` ```diff `) with per-line green/red/grey
  colouring
- **Indented trees** (` ```tree `) → Unicode box-drawing tree or
  top-down SVG (`tree svg`)
- **Algorithmic pseudocode** (` ```algorithm `) with line
  numbers and bolded keywords, à la LaTeX `algorithm2e`
- **Syntax-highlighted code blocks** — ~20 common languages
  bundled (Python, Rust, JS/TS, Go, C/C++, Haskell, OCaml, SQL,
  …) plus a custom Faust grammar for audio DSP specs
- **Captions and cross-references** — any rich fence can carry a
  quoted caption (auto-numbered "Figure N", "Listing N",
  "Algorithm N", "Table N") and a `\label{key}`; reference
  anywhere with `\ref{key}`
- **Side-by-side demos** (` ```demo `) — source markdown and its
  rendered output displayed in two columns, with auto-zoom in
  slides mode
- **Slides mode** — 16:9 PDF presentations à la Beamer, every
  `## h2` starts a new slide; activate via Settings → Page →
  Format = Slides 16:9, or per-document via the `slides: true`
  frontmatter key
- **Callouts** (`::: theorem`, `::: note`, `::: warning`, …) with
  optional titles
- **Footnotes** (`[^id]`) and **Pandoc-lite citations**
  (`[@key]` + `[@key]: …`), each with auto-numbered
  end-of-document sections and back-links
- **Definition lists** and **CSV/TSV tables**
- On-the-fly **input ligatures**: `->` becomes `→`, `\alpha`
  becomes `α`, `\|N` becomes `ℕ`; double-backslash escapes
  (`\\alpha` keeps the source literal)
- **Section auto-numbering** — write the first heading the way
  you want, the rest follows the same style
- **YAML frontmatter** — optional `---` block at the top of a
  doc with `title:` / `author:` / `organization:` / `date:`
  overrides per-document, `slides: true` to switch to slides
  mode, plus `mathjax-preamble:` for defining `\newcommand`
  macros once and using them in every formula
- **Running page header / footer** (` ```header ` / ` ```footer `)
  — fill the top / bottom margin of every page with up to three
  slots (`left | center | right`); substitutions `{page}`,
  `{pages}`, `{date}` resolve per-page

## Export formats and sharing

| Format | Use case |
|---|---|
| **PDF** | The final document, paginated with the typography from Settings |
| **Markdown (`.md`)** | Portable source, opens in any editor |
| **LaTeX (`.tex`)** | Hand-off to a journal that wants TeX sources (compiles with `xelatex --shell-escape`) |
| **OneDrive** | Uploads the `.md` to your OneDrive `Apps/markpage/` folder and copies an anonymous share link to the clipboard |
| **Share link** | Encodes the doc into a `?import=…` URL anyone can open in markpage to load it as a fresh local copy — no account, no server. Capped at ~8 KB of source; bigger docs fall back to OneDrive. |
| **Send by email** | Same encoded URL, but opens the user's mail client with the link pre-filled in the body |

## Settings, profiles, languages

- Multiple **settings profiles** — switch in one click, import or
  export each as a JSON file
- **Interface and document languages** chosen independently
  (French / English; the architecture supports adding more)
- Pick fonts from a curated list of Google Fonts, or paste any
  `fonts.googleapis.com` URL for a custom family — plus
  pre-paired **font packs** that align the body / headings / code
  family with the math font in one click (Fira, STIX Two, …)
- Fine-grained typography: page format, margins, justification,
  line height, per-heading size / colour / weight / italic /
  underline, asymmetric heading and paragraph spacing
- A built-in **Help** tutorial that opens in a side window without
  disturbing your document

## Drive markpage with an AI (MCP)

markpage ships an optional **MCP bridge** (`markpage-mcp`) so an AI client
(Claude Desktop / Claude Code) can drive the app in your browser: read and
write the current document, switch views, list render errors, manage the
library, and export — plus two tab-free tools that hand the AI markpage's
authoring guide and fence syntax, so it writes idiomatic markpage Markdown
even if it has never seen the app.

Open the **MCP pill** (bottom-right of the app) to download the prebuilt
bridge for your platform and copy the `claude mcp add markpage …` command,
then restart your AI client. Architecture and the full tool list:
[`MCP-SPEC.md`](docs/MCP-SPEC.md); build / install / release details:
[`mcp/README.md`](mcp/README.md).

## Run locally

```sh
npm install
npm run dev        # development server
npm run build      # production build into dist/
npm run typecheck  # type-check
npm test           # regression test corpus
```

## Deployment

A push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which publishes the static build to GitHub Pages.

To enable Pages on a fresh fork: **Settings → Pages → Source:
GitHub Actions**.

## Documentation

Specs and design docs live in [`docs/`](docs/) (with an index). Quick links:

### For users

- [`FEATURES.md`](FEATURES.md) / [`FEATURES.fr.md`](FEATURES.fr.md) — the full
  feature list, including every supported fence.
- **Help** — the in-app tutorial (the Help button); source also at
  [`src/HELP.fr.md`](src/HELP.fr.md) / [`src/HELP.en.md`](src/HELP.en.md).
- [`AI-AUTHORING.md`](AI-AUTHORING.md) — how to write markpage Markdown: every
  fenced block and convention. (Also what the MCP `get_authoring_guide` tool
  serves to an AI.)

### Architecture & design

- [`SPEC.md`](docs/SPEC.md) — the app architecture reference (storage model, render
  pipelines, i18n, LaTeX export, regression test harness).
- [`MCP-SPEC.md`](docs/MCP-SPEC.md) — the MCP bridge: action↔tool audit, protocol,
  contract. Build / install / release: [`mcp/README.md`](mcp/README.md).
- [`FORMAL-METHOD-SPEC.md`](docs/FORMAL-METHOD-SPEC.md) — how specifications are written in
  this project (methodology, not a feature spec).

### Feature design specs

The original design documents; every feature below has shipped, so they read
as reference + history:

- [`CATEGORY-SPEC.md`](docs/CATEGORY-SPEC.md) — the commutative-diagram language
  (`category`).
- [`MOSAIC-SPEC.md`](docs/MOSAIC-SPEC.md) — the justified image gallery (`mosaic`).
- [`TOC-PLUS-SPEC.md`](docs/TOC-PLUS-SPEC.md) — the table of contents + plan
  (`::: toc+`).
- [`FILE-MANAGEMENT-SPEC.md`](docs/FILE-MANAGEMENT-SPEC.md) — document / asset
  storage and the disk-link feature (the original model, since superseded by
  `VOLUMES-SPEC`).
- [`VOLUMES-SPEC.md`](docs/VOLUMES-SPEC.md) — the unified file system: one
  *Open*, one root, mounted volumes (Library / Disk / GitHub repo / OneDrive).
- [`GITHUB-SYNC-SPEC.md`](docs/GITHUB-SYNC-SPEC.md) — shared documents across
  devices via a GitHub repo (fine-grained PAT, no server); the R1–R4 engine
  under the GitHub volume.

## Use the fences in your own Markdown pipeline

The rich block renderers (`chart`, `bda`, `category`, `adt`, `diff`, `tree`)
are published as standalone, framework-agnostic packages — drop them into any
Markdown toolchain, no markpage app required:

- **[`@orlarey/marked`](packages/marked/)** — a [marked](https://marked.js.org)
  plugin. `marked.use(markpageBlocks())` and the fences render, with optional
  auto-numbered figure captions.
- **[`@orlarey/blocks`](packages/blocks/)** — the renderers + a registry for
  any pipeline (`renderBlock('chart', body, info)` → HTML/SVG). Ships a
  portable stylesheet (`@orlarey/blocks/styles.css`, scoped to `.markpage`).

````js
import { marked } from 'marked';
import { markpageBlocks } from '@orlarey/marked';
import '@orlarey/blocks/styles.css';

marked.use(markpageBlocks());
const html = marked.parse('```chart line "Sales"\nq, rev\nQ1, 12\nQ2, 19\n```');
// wrap the output in <div class="markpage">…</div> so the styles apply
````

Fence body + option syntax: [AI-AUTHORING.md](AI-AUTHORING.md). See each
package's README for the full API.

## Templates

Ready-to-customise documents under [`templates/`](templates/):

- **Facture (FR)** — [`templates/facture.md`](templates/facture.md)
  is a French invoice scaffold using the dedicated ` ```sender ` /
  ` ```recipient ` / ` ```signature ` letterhead blocks (side-by-side
  flex layout),
  followed by a pipe-table of items, a totals block, and a
  `::: caution` callout for the mandatory mentions légales. Pair it
  with the matching profile
  [`templates/profil-facture.json`](templates/profil-facture.json):
  serif body (Source Serif 4), sober colours, hidden auteur /
  organisation / date metadata block (the invoice carries its own
  header). Import the profile from **Réglages → ▾ → Importer…**,
  switch to it, then *Importer* the `.md` to start a new invoice.

## Stack and credits

markpage is glue around a lot of open-source work. Each piece below
does something specific and does it well.

### Editor and rendering

- [**CodeMirror 6**](https://codemirror.net/) — the editor pane.
  Modular, fast, with the extension points we needed to hook the
  on-the-fly input ligatures and the click-back-to-source mapping.
- [**marked**](https://marked.js.org/) — Markdown parsing. We
  extend it with custom block tokens for admonitions, footnotes,
  definition lists and inference rules; everything still flows
  through the standard token API.
- [**paged.js**](https://pagedjs.org/) — pagination engine. Turns
  the flowing preview into discrete pages with proper margins,
  page numbers and break-before/avoid behaviour. Both the
  on-screen paginated preview and the PDF go through it, so what
  you see is what you get.

### Math, diagrams, charts

- [**MathJax**](https://www.mathjax.org/) — LaTeX math rendering
  for inline `$…$`, displayed `$$…$$`, and the dedicated
  ` ```inference ` blocks.
- [**Mermaid**](https://mermaid.js.org/) — flowcharts, sequence,
  class, state, gantt, mindmap, pie diagrams. Rendered as SVG so
  the PDF stays vector-crisp.
- [**ebnf2railroad**](https://github.com/matthijsgroen/ebnf2railroad)
  and [**railroad-diagrams**](https://github.com/tabatkins/railroad-diagrams)
  — W3C EBNF → SVG railroad diagrams for the ` ```ebnf ` fence,
  one diagram per production.
- Charts (`line`, `bar`) come from a small custom SVG generator in
  [`packages/blocks/src/renderers/chart.ts`](packages/blocks/src/renderers/chart.ts)
  — light enough that it wasn't worth pulling a full charting library.

### Syntax highlighting

- [**highlight.js**](https://highlightjs.org/) — colourising for
  fenced code blocks (a curated ~20-language subset bundled, plus
  a custom Faust grammar shipped in `src/highlight-faust.ts`).
  Theme: *atom-one-light*.

### Imports

- [**Mammoth.js**](https://github.com/mwilliamson/mammoth.js) —
  converts Word `.docx` files to clean HTML on import, which we
  then run through Turndown to land as Markdown.
- [**Turndown**](https://github.com/mixmark-io/turndown) — HTML →
  Markdown for the `.html` import path (and the second half of the
  `.docx` pipeline).

### Export

- [**JSZip**](https://stuk.github.io/jszip/) — bundles the `.tex`
  source with the referenced images / mermaid / chart SVGs into a
  single zip when the LaTeX export needs to ship resources.

### Fonts

- [**Roboto Condensed**](https://fonts.google.com/specimen/Roboto+Condensed)
  and [**Roboto Mono**](https://fonts.google.com/specimen/Roboto+Mono)
  bundled via [@fontsource](https://fontsource.org) so they work
  offline; the editor and the default PDF render on them. Plain
  [**Roboto**](https://fonts.google.com/specimen/Roboto) is bundled
  too for the brand mark.
- [**Noto Sans Math**](https://fonts.google.com/noto/specimen/Noto+Sans+Math)
  and [**Noto Sans Symbols**](https://fonts.google.com/noto/specimen/Noto+Sans+Symbols)
  ride the fallback cascade for math glyphs and miscellaneous
  Unicode symbols.
- Every other Google Font in the catalogue is fetched on demand
  via the standard `fonts.googleapis.com` CSS endpoint when the
  user picks it in Settings.

### Build, types, tests

- [**Vite**](https://vitejs.dev/) for the dev server, the bundling
  and the static build that ships to GitHub Pages.
- [**TypeScript**](https://www.typescriptlang.org/) for the type
  system — every module is fully typed, no `any` outside thin
  boundary shims.
- [**vitest**](https://vitest.dev/) + [**happy-dom**](https://github.com/capricorn86/happy-dom)
  for the regression corpus: each `.md` test case has pinned
  snapshots of its LaTeX and HTML output, so any rendering
  change is reviewed as a precise diff in pull requests.

### Built with Claude Code

A substantial part of the development happened in pair with
[**Claude Code**](https://claude.com/claude-code), Anthropic's
agentic CLI for Claude. The architecture decisions, the regression
test harness, the i18n rework, most of the LaTeX export pipeline
and a large fraction of the diff-by-diff iteration were designed
and implemented through that workflow. The commit history carries
`Co-Authored-By: Claude Opus 4.x` trailers where appropriate.
