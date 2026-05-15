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
- **Nothing leaves your machine.** Documents, images, settings — all
  in the browser's local storage. No server-side state, no upload,
  no telemetry.
- **Direct to PDF.** No round-trip to an external service. The
  browser's own print engine renders the same paged layout you see
  in the preview, you click *Save as PDF*.

## What you can write

A Markdown extended for technical and scientific writing:

- **Math** via MathJax (`$x^2$` inline, `$$ … $$` displayed, or
  fenced `math` blocks)
- **Inference rules** with a dedicated fenced `inference` block —
  premises / dashes / conclusion, with automatic Gunter / Scott
  typography (calligraphic semantic functions, **bold**
  constructors inside `⟦…⟧`, sans-serif functions outside,
  numeric subscripts)
- **EBNF grammars** as railroad / syntax diagrams via the `ebnf`
  fence, one diagram per production with aligned `=` signs
- **Algebraic data types** via the `adt` fence — `LHS ::= Ctor |
  Ctor(args)` definitions typeset with aligned `|` separators and
  two-tier highlighting (defined types vs pure constructors)
- **Mermaid diagrams** (flowcharts, sequence, class, state, …) and
  inline **`chart`** blocks (line, bar) — all rendered as SVG
- **Syntax-highlighted code blocks** — ~20 common languages
  bundled (Python, Rust, JS/TS, Go, C/C++, Haskell, OCaml, SQL, …)
  plus a custom Faust grammar for audio DSP specs
- **Callouts** (`::: theorem`, `::: note`, `::: warning`, …) with
  optional titles
- **Footnotes**, **definition lists**, **CSV/TSV tables**
- On-the-fly **input ligatures**: `->` becomes `→`, `\alpha` becomes
  `α`, `\|N` becomes `ℕ`; double-backslash escapes (`\\alpha` keeps
  the source literal)
- **Section auto-numbering** — write the first heading the way you
  want, the rest follows the same style

## Three export formats

| Format | Use case |
|---|---|
| **PDF** | The final document, paginated with the typography from Settings |
| **Markdown (`.md`)** | Portable source, opens in any editor |
| **LaTeX (`.tex`)** | Hand-off to a journal that wants TeX sources (compiles with `xelatex --shell-escape`) |

## Settings, profiles, languages

- Multiple **settings profiles** — switch in one click, import or
  export each as a JSON file
- **Interface and document languages** chosen independently
  (French / English; the architecture supports adding more)
- Pick fonts from a curated list of Google Fonts, or paste any
  `fonts.googleapis.com` URL for a custom family
- Fine-grained typography: page format, margins, justification,
  line height, per-heading size / colour / weight / italic /
  underline, asymmetric heading and paragraph spacing
- A built-in **Help** tutorial that opens in a side window without
  disturbing your document

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

- The built-in **Help** button opens a complete tutorial (also
  available as [`src/HELP.fr.md`](src/HELP.fr.md) /
  [`src/HELP.en.md`](src/HELP.en.md)).
- [`SPEC.md`](SPEC.md) describes the architecture in detail
  (storage model, render pipelines, i18n, LaTeX export, regression
  test harness).

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
- Charts (`line`, `bar`) come from a small custom SVG generator in
  `src/chart.ts` — light enough that it wasn't worth pulling a
  full charting library.

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
