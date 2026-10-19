---
name: view
description: Show a markpage Markdown document rendered by markpage (math, inference rules, diagrams, named style, pages), published as a claude.ai Artifact when the Artifact tool is available, otherwise as an HTML page sent to the user or opened in the browser. Use after writing a markpage document (with the write skill, the rewrite-rules skill, a specification), when the user asks to see, preview, render, visualize or publish a .md written in markpage Markdown, or asks for an Artifact written in markpage (« visualise », « affiche le rendu », « montre-moi le document »).
argument-hint: "[file.md] [--pages]"
---

# Show a markpage document rendered

Target: $ARGUMENTS

If no file is given, take the markpage document most recently written or discussed in this conversation; if there is none, ask which file. Content that is not in a file yet goes into a `.md` first (in the scratchpad directory when the session has one).

## How the page is made

The plugin's script turns the Markdown file into a small web page:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/markpage-page.mjs" <file.md> [options]
```

The page holds the Markdown, HTML-escaped, in `<pre class="markpage-source">`, and one `<script type="module">` that loads the markpage viewer (`@orlarey/markpage-viewer`, a pinned version, from `cdn.jsdelivr.net`). In the reader's browser the viewer renders the document with the markpage app's own pipeline: the style named by `document-style:`, MathJax, Mermaid, every fence, as a white sheet with a Continuous / Pages switch, a Source view and a link that opens the document in markpage.org. Until the viewer runs, the page shows the plain source. So the page stays a few kilobytes and fully readable: the source you wrote plus about twenty lines of HTML.

Options: `--pages` opens in Pages (the document cut into pages, as printed; the default is Continuous); `--lang fr|en` sets the language when the document has no `language:` key; `--link` also prints a markpage.org link that opens the document in the web app, to edit it or export a PDF (documents up to about 8 KB once gzipped).

## Pick the display

1. **The Artifact tool is available** (claude.ai, Claude Code on the web or in the desktop app): publish an Artifact.
   1. Run the script with `--artifact --out <dir>/<name>.html`, where `<dir>` is the scratchpad directory when the session has one, else `.markpage/` in the working directory. Reuse the same `--out` path for every later render of the same document: republishing the same file path updates the same Artifact instead of creating a new one.
   2. Read the generated page before publishing it, as for any file you publish.
   3. When the script lists files under "files to publish with it", those are the document's local images: look at each one, then pass them as the Artifact's `files` map, published path → source path, exactly as listed.
   4. Publish with `file_path` set to the page, `icon: "document"` on the first publish, and a one-sentence `description` of the document. The page already follows the Artifact page contract (a `<title>` from the front matter, a theme-aware background, a phone layout, only a pinned script from jsDelivr and fonts from Google Fonts). Its design is the document's markpage style: do not rewrite the document as hand-made HTML, and do not restyle the page.
2. **No Artifact tool, but a tool that shows the user a file** (SendUserFile): run the script with `--inline-images --out <scratchpad>/<name>.html` and send the page with display `render`.
3. **Otherwise** (Claude Code in a terminal on the user's machine): run the script with `--open`. It writes the page under the system temp directory and opens it in the default browser, with the images loaded from the document's folder. From there, Pages then Print → Save as PDF gives the paged PDF.

## Report

Give the link or the path in one line, plus the script's warnings verbatim, if there are any: a remote image is blocked inside an Artifact, an image was not found, the document is too large for a markpage.org link.

If the user reports that the page shows only the Markdown source, the viewer did not load: their network blocks `cdn.jsdelivr.net`, or this viewer version is not published yet. Offer the markpage.org link (`--link`) instead.
