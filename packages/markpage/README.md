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
```

It drives a headless Chromium: `--chrome <path>`, else `$MARKPAGE_CHROME`,
else Playwright's browser, else the installed Google Chrome. Pages are laid
out at a device pixel ratio of 2 (`--scale`), as on a HiDPI screen: Chrome
measures glyphs differently at 1, which moves the page breaks.

## How

`build.mjs` bundles the standalone viewer (`dist/viewer`) — the VS Code
preview's script in its plain-browser mode, hence the very pipeline of the
app. The CLI serves it, with the document's folder, on a loopback port, opens
it with the document embedded, waits for its "rendered" signal, and saves the
viewer's standalone export.

## Develop

```sh
npm run build -w @orlarey/markpage    # the viewer bundle
npm run smoke -w @orlarey/markpage    # render a small document, check it
```

Next: `markpage check` (the conservation check of e2e/conservation.ts: no text
lost, added or duplicated by pagination) and `markpage pdf`.
