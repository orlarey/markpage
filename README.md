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
- **Inference rules** with a dedicated fenced `inference` block
- **Mermaid diagrams** (flowcharts, sequence, class, state, …) and
  inline **`chart`** blocks (line, bar) — all rendered as SVG
- **Callouts** (`::: theorem`, `::: note`, `::: warning`, …) with
  optional titles
- **Footnotes**, **definition lists**, **CSV/TSV tables**
- On-the-fly **input ligatures**: `->` becomes `→`, `\alpha` becomes
  `α`, `\|N` becomes `ℕ`
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

## Stack

TypeScript + [Vite](https://vitejs.dev/) · [CodeMirror 6](https://codemirror.net/) (editor) ·
[marked](https://marked.js.org/) (parser) · [paged.js](https://pagedjs.org/) (pagination) ·
[MathJax](https://www.mathjax.org/) (math) · [Mermaid](https://mermaid.js.org/) (diagrams) ·
[vitest](https://vitest.dev/) + happy-dom (regression tests).
