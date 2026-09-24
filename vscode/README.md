# markpage preview

Preview your Markdown the way **[markpage](https://markpage.org)** renders it —
math, diagrams, callouts, and print-ready pages — right inside VS Code.

Open the preview and it updates live as you type: a white “paper” page that
stays readable whatever your editor theme. The extension runs the markpage web
app’s own renderer — same styles, same page layout engine — so what you see
here is what markpage prints.

## Features

- **Rich Markdown** — headings, tables, task lists, footnotes, cross-references,
  and syntax-highlighted code (including Faust).
- **Callouts** — `::: note`, `::: tip`, `::: warning`, `::: important`,
  `::: caution`.
- **Math** — inline `$…$` and display `$$…$$`, rendered with MathJax.
- **Diagrams** — Mermaid, plus markpage’s own fenced DSLs: `chart`, `bda`,
  `category`, `adt`, `tree`, `diff`, `mosaic`, …
- **Named styles** — pick the look with one front-matter line,
  `document-style: rapport-a4` (Note, Article, Rapport, Livre, Lettre — A4 or
  Letter — and a 16:9 Présentation). Without it, the default Note style
  applies. Page size, margins, fonts, colours, running headers and footers all
  come from the style.
- **Document metadata** — `title`, `subtitle`, `author`, `organization`,
  `date` and `language` in the front-matter; local styling with `::: style`,
  page backdrops with `::: background`, multi-column blocks, and
  ` ```header ` / ` ```footer ` fences that override the style’s bands.
- **Two preview modes** — a fast continuous view for writing, and a paginated
  view (real page breaks) to check the final layout.
- **Export to PDF** — opens a self-contained copy of the preview in your browser,
  ready to print as PDF.
- **Open in markpage.org** — hands the file to the markpage web app, to edit
  it there with the full toolbar and export it. The extension serves the file
  (and the images next to it) to markpage only, over a private local address;
  reopening the same file finds the same markpage document.
- **Paper theme** — a white sheet on a neutral backdrop, independent of your
  light or dark editor theme.

## Getting started

1. Install the extension.
2. Open any Markdown (`.md`) file.
3. Run **markpage: Open markpage Preview** — from the Command Palette
   (`⇧⌘P` / `Ctrl+Shift+P`), the **preview icon** in the editor’s title bar, or
   the shortcut `⌘K V` / `Ctrl+K V`.

The preview updates as you edit. Use the floating buttons at the top-right of the
preview to toggle pagination, or drag the page edge to zoom.

## Commands

| Command | Shortcut | What it does |
| :-- | :-- | :-- |
| **markpage: Open markpage Preview** | `⌘K V` / `Ctrl+K V` | Opens the live preview of your document. |
| **markpage: Toggle Pagination** | — | Switches between the continuous view (best for writing) and real **pages** with page breaks (best for checking layout). |
| **markpage: Print / Export PDF** | — | Opens the preview in your browser — print it and choose “Save as PDF”. Use it in paginated mode for proper pages. |
| **markpage: Open in markpage.org** | — | Opens the file in the markpage web app, with its unsaved edits (also from the editor title bar, the Explorer’s context menu, and the preview’s **↗ markpage.org** button). |

## Settings

| Setting | Default | What it does |
| :-- | :-- | :-- |
| `markpage.appUrl` | `https://markpage.org` | The markpage web app that **Open in markpage.org** targets (for instance a self-hosted copy). |

## Tips

- **Writing vs. layout.** Stay in the continuous view while drafting; switch to
  paginated when you want to see exactly where pages break.
- **Best PDFs.** Toggle pagination **on**, then run **Print / Export PDF** so the
  output matches the on-screen pages. In the browser’s print dialog, set the
  margins to *None*: the page margins are already part of the pages.
- **Styles.** Only markpage’s built-in styles are available in VS Code: a style
  you imported into the web app lives in that browser, so a document naming it
  previews with the default style (the extension tells you so).

## About markpage

markpage is a browser-based Markdown → PDF editor that turns Markdown into
print-ready, typographically careful documents. This extension brings the same
renderer into VS Code so you can preview your files without leaving your editor.

- Web app: **[markpage.org](https://markpage.org)**
- Source & issues: **[github.com/orlarey/markpage](https://github.com/orlarey/markpage)**

## Requirements

VS Code **1.85** or newer. No other setup — math, diagrams and fonts are bundled
(fonts a style takes from Google Fonts load from the network).

## License

[AGPL-3.0-or-later](https://github.com/orlarey/markpage/blob/main/LICENSE)
