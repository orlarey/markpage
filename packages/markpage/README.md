# @orlarey/markpage

Render a [markpage](https://markpage.org) Markdown document from the command
line — the same pages as markpage.org (named styles, MathJax, Mermaid, EBNF,
Vivliostyle pagination) — and save them as **one self-contained HTML file**:
the laid-out pages, their CSS, only the fonts and glyphs they use, their
images; no script, no server, readable offline.

```sh
markpage html note.md                 # → note.html, in pages
markpage html note.md --continuous    # the continuous view
markpage html note.md -o out.html
markpage pdf note.md                  # → note.pdf, the same pages, printed
markpage check note.md                # pagination loses, adds, duplicates nothing?
```

`markpage check` first reads the authoring defects off the render — a fence
that failed (bad `ebnf`, `inference`, `category`… syntax, with the parser's
message) and a `toc+` entry matching no heading. It then renders the document
continuous and in pages, at device pixel ratios 1 and 2 (`--scale 1,2`), and
compares them: the word sequence
both ways (nothing lost, nothing added or laid twice), each source block laid
once, notes and formulas counted, no text a line or more outside the text
area. It prints a report (`--json` for the full one) and exits with 1 on any
defect — the same check as the e2e suite (`lib/conservation.mjs`, shared).

```text
markpage check : s04.md
  densité 1 : 23 page(s) — 2 défaut(s)
    texte ajouté ou doublé : Le typage  ⟨) . Le typage Le typage La variabilité de Faust⟩
    bloc posé deux fois : pages 10 et 11 : Le typage
```

It drives a headless Chromium: `--chrome <path>`, else `$MARKPAGE_CHROME`,
else Playwright's browser, else the one of a Claude Code cloud session, else
the installed Chrome or Chromium (`npx playwright install chromium` when
there is none). Pages are laid
out at a device pixel ratio of 2 (`--scale`), as on a HiDPI screen: Chrome
measures glyphs differently at 1, which moves the page breaks.

## How

`build.mjs` bundles the standalone viewer (`dist/viewer`) — the VS Code
preview's script in its plain-browser mode, hence the very pipeline of the
app. The CLI serves it, with the document's folder, on a loopback port, opens
it with the document embedded, waits for its "rendered" signal, and saves the
viewer's standalone export.

## With Claude Code

`skill/markpage-render` (in the markpage repository; `make install`) teaches
Claude Code to run `check` after writing a markpage document, fix what is the
document's, and show the pages.

## Publish

`.github/workflows/npm-release.yml`: bump `version` here, then push a
`npm-v<version>` tag (or run the workflow by hand). Needs the `NPM_TOKEN`
repository secret.

## Develop

```sh
npm run build -w @orlarey/markpage    # the viewer bundle
npm run smoke -w @orlarey/markpage    # html, check and pdf on a small document
```

`markpage pdf` prints those very pages with Chromium: one sheet per page, at
the style's page size, fonts embedded.

`MARKPAGE_VIEWER=<dir>` points the CLI at another viewer build (to check an
older version, say).
