# @orlarey/markpage-viewer

Render **markpage Markdown** in any web page, with the
[markpage](https://markpage.org) app's own renderer: math (MathJax), inference
rules, abstract syntax, commutative diagrams, EBNF, charts, Mermaid, callouts,
footnotes, cross-references, the named document styles, and real pages.

````html
<pre class="markpage-source">
---
title: PGCD par soustractions
document-style: note-a4
language: fr
---

# Règles

```inference (Sub1)
a > b
---
(a, b) → (a − b, b)
```
</pre>
<script type="module" src="https://cdn.jsdelivr.net/npm/@orlarey/markpage-viewer@0.1.0/dist/viewer.js"></script>
````

The Markdown goes in the `<pre>`, HTML-escaped (`&` → `&amp;`, `<` → `&lt;`).
Until the module runs, or if it cannot load, the page reads as the plain
source. Once it runs, the source becomes a white sheet on a desk, with a
**Continuous / Pages** switch, a **Source** view, and a **markpage ↗** link
that opens the document in the web app (for documents whose `?import=` link
fits markpage's 8 KB cap).

This is what the [Claude Code plugin](../claude-code/) publishes: its script
writes such a page from a `.md` file.

## Options

On the `<pre class="markpage-source">`:

| Attribute | Effect |
| :-- | :-- |
| `data-pages="1"` | Open in Pages (default: Continuous). |
| `data-lang="fr"` / `"en"` | Base document language (else the browser's). A `language:` front-matter key overrides it. |
| `data-base="<url>"` | Base URL for relative image paths (default: the page's URL). |
| `data-app="<url>"` | The markpage web app the link opens (default `https://markpage.org/`). |

One document per page. Only markpage's built-in styles resolve here (`note-a4`,
`article-a4`, `rapport-a4`, `livre-a4`, `lettre-a4`, their Letter variants, and
`presentation-16x9`); a style imported into the web app lives in that browser, so a
document naming it renders with the default style.

## What it needs from the page

The viewer is built to run as a **claude.ai Artifact**, whose CSP admits
scripts only from a few CDNs (jsDelivr among them), stylesheets only from
Google Fonts, and refuses every other load. So:

- the CSS ships as text inside the module and is injected as a `<style>`
  (needs `style-src 'unsafe-inline'`);
- Roboto, Roboto Condensed and Roboto Mono come from Google Fonts; ET Book and
  the Noto Sans Math / Symbols fallbacks are `data:` URLs (needs `font-src
  data: https://fonts.gstatic.com`) — the Noto pair, ~1.6 MB, loads only for a
  document whose text uses symbols system fonts often lack;
- MathJax, Mermaid and Vivliostyle (Pages) are lazy chunks, fetched as module
  scripts next to `dist/viewer.js`;
- nothing is fetched: Vivliostyle's own `fetch('data:…')` of its templates is
  answered in-page, so Pages works under a restricted `connect-src`;
- no `eval`.

Images resolve against the page (or `data-base`); inside an Artifact, only
`data:` URLs and the Artifact's own files load.

## Develop

The bundle is built from the app's sources (`../src`) and the `@orlarey/*`
packages' TypeScript (the `development` export condition), resolved from the
monorepo's `node_modules` — run `npm ci` at the repository root first.

```sh
npm ci              # esbuild + typescript
npm run build       # → dist/viewer.js + dist/chunks/
npm run typecheck
npm test            # build, then test/render.mjs
```

`test/render.mjs` writes a page from `test/sample.md` with the plugin's script,
serves it from one loopback origin and `dist/` from another under the jsDelivr
path, with a CSP mirroring an Artifact's, and checks in Chromium (desktop light,
phone dark, Pages dark) that the sheet, math, inference rules, `adt`, Mermaid
and the image render with no CSP violation and no console error. Screenshots
land in `test/__shots__/`. Set `CHROMIUM_PATH` to use a preinstalled Chromium
instead of Playwright's own.

## Publish

```sh
make viewer-publish   # from the repo root: npm publish (builds + tests first)
```

Then pin the new version in the Claude Code plugin
(`VIEWER_VERSION` in `../claude-code/scripts/markpage-page.mjs`).

## License

[AGPL-3.0-or-later](https://github.com/orlarey/markpage/blob/main/LICENSE) —
the bundle includes the markpage app's render code and Vivliostyle (AGPL).
