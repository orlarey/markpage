# markpage preview

Preview your Markdown the way **[markpage](https://markpage.org)** renders it —
math, diagrams, callouts, and print-ready A4 pages — right inside VS Code.

Open the preview beside your editor and it updates live as you type: a clean
white “paper” page that stays readable whatever your editor theme, using
markpage’s full rendering pipeline.

## Features

- **Rich Markdown** — headings, tables, task lists, footnotes, cross-references,
  and syntax-highlighted code (including Faust).
- **Callouts** — `::: note`, `::: tip`, `::: warning`, `::: important`,
  `::: caution`.
- **Math** — inline `$…$` and display `$$…$$`, rendered with MathJax.
- **Diagrams** — Mermaid, plus markpage’s own fenced DSLs: `chart`, `bda`,
  `category`, `adt`, `tree`, `diff`, `mosaic`, …
- **Layout & typography** — YAML frontmatter (title/author/date, page size,
  margins, fonts), local styling with `::: style`, page backdrops with
  `::: background`, and multi-column blocks.
- **Two preview modes** — a fast continuous view for writing, and a paginated
  **A4 page** view (real page breaks) to check the final layout.
- **Export to PDF** — print the paginated preview straight to a PDF.
- **Paper theme** — a white sheet on a neutral backdrop, independent of your
  light or dark editor theme.

## Getting started

1. Install the extension.
2. Open any Markdown (`.md`) file.
3. Run **markpage: Open Preview to the Side** — from the Command Palette
   (`⇧⌘P` / `Ctrl+Shift+P`), the **preview icon** in the editor’s title bar, or
   the shortcut `⌘K V` / `Ctrl+K V`.

The preview updates as you edit. Use the floating buttons at the top-right of the
preview to toggle pagination, or drag the page edge to zoom.

## Commands

| Command | Shortcut | What it does |
| :-- | :-- | :-- |
| **markpage: Open Preview to the Side** | `⌘K V` / `Ctrl+K V` | Opens the live preview next to your document. |
| **markpage: Toggle Pagination** | — | Switches between the continuous view (best for writing) and real **A4 pages** with page breaks (best for checking layout). |
| **markpage: Print / Export PDF** | — | Prints the preview — choose “Save as PDF”. Use it in paginated mode for proper A4 pages. |

## Tips

- **Writing vs. layout.** Stay in the continuous view while drafting; switch to
  paginated when you want to see exactly where pages break.
- **Best PDFs.** Toggle pagination **on**, then run **Print / Export PDF** so the
  output matches the on-screen A4 pages.

## About markpage

markpage is a browser-based Markdown → PDF editor that turns Markdown into
print-ready, typographically careful documents. This extension brings the same
renderer into VS Code so you can preview your files without leaving your editor.

- Web app: **[markpage.org](https://markpage.org)**
- Source & issues: **[github.com/orlarey/markpage](https://github.com/orlarey/markpage)**

## Requirements

VS Code **1.85** or newer. No other setup — math, diagrams and fonts are bundled.

## License

[AGPL-3.0-or-later](https://github.com/orlarey/markpage/blob/main/LICENSE)
