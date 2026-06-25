# markpage preview (VS Code extension)

Preview Markdown with **all markpage extensions** (fenced DSLs, callouts,
footnotes, refs, …) inside VS Code, by reusing markpage's own render pipeline
(`@orlarey/markpage-render`) in a webview — see
[`docs/VSCODE-PREVIEW-SPEC.md`](../docs/VSCODE-PREVIEW-SPEC.md).

## Status

**v0.1 — full pipeline (phase A + B).** Renders headings, callouts (`::: note`),
tables, footnotes, syntax-highlighted code, the block DSLs from `@orlarey/blocks`
(`chart`, `bda`, `category`, `adt`, `diff`, `tree`), **MathJax** (`$…$` / `$$…$$`)
and **Mermaid** diagrams. MathJax/Mermaid load as on-demand ESM chunks from
`dist/chunks/` under the webview CSP (`'strict-dynamic'`).

## Run it (Extension Development Host)

```sh
cd vscode
npm install        # extension dev deps (esbuild, @types/vscode, typescript)
npm run build      # bundles dist/extension.js + dist/webview.js
```

Then in VS Code: open the `vscode/` folder and press **F5** to launch the
Extension Development Host. Open a Markdown file and run **“markpage: Open
Preview to the Side”** (or `Cmd/Ctrl+K V`, or the editor-title preview icon).

`npm run watch` rebuilds on change.

## How it works

- `src/extension.ts` (host) — registers the command, opens a `WebviewPanel`
  beside the editor with a strict CSP (nonce) and `localResourceRoots`, and
  streams the document text + an image base URI to the webview on edit.
- `src/webview/preview.ts` (webview) — renders with
  `renderMarkpageMarkdown(md, { resolveImageSrc })`, resolving relative image
  paths to webview URIs.
- `esbuild.mjs` bundles `@orlarey/markpage-render` (resolved from the monorepo's
  `node_modules`, via its `development` export → TS sources).

## Dev harness (no VS Code needed)

`test-harness.html` loads the built `dist/webview.js` and feeds it a sample
document, to check the render pipeline in a plain browser:

```sh
npm run build && python3 -m http.server 8090
# open http://localhost:8090/test-harness.html
```

## Next

- Trim the bundle: the lazy MathJax imports emit ~400 font chunks (all sets);
  restrict to the default set, or pre-pick per the document's `mathjax` setting.
- Layer in markpage's style presets; map VS Code light/dark theme.
- Scroll-sync (the render already annotates source lines).
