# markpage — features

*Français : [FEATURES.fr.md](FEATURES.fr.md). For how to **write** markpage
Markdown, see [AI-AUTHORING.md](AI-AUTHORING.md); for the project overview, the
[README](README.md).*

**markpage** is a **Markdown → PDF** editor that runs entirely in the browser:
a static Vite/TypeScript app, **no server, no installation**, your data stays on
your machine. Source on the left, paginated preview (paged.js) on the right,
professional-quality PDF export. Bilingual **FR/EN**.

## Fenced blocks (```` ``` ````)

The full list, by family:

### Maths & science

- `math` — LaTeX formulas (MathJax), centred block
- `inference` — inference rules (premises separated by `;`, a `---` bar)
- `category` — commutative diagrams (dedicated DSL, **native SVG** by default,
  Mermaid fallback)
- `adt` — algebraic data types
- `ebnf` — EBNF grammars → **railroad diagrams** (one per production)
- `algorithm` — pseudo-code (keywords `if`/`elif`/`while`/`Input`/`Output`/
  `Require`/`Ensure`…)

### Data & charts

- `csv` / `tsv` — data tables (separator auto-detected for csv, RFC-4180 quoting)
- `chart` — `line` / `bar` charts, in-house SVG generator (options `y-min`/
  `y-max`/`y-ref`/`log-y`…)
- `tree` — trees (`tree svg`)
- `diff` — coloured diff

### Diagrams

- `mermaid` — full Mermaid syntax → SVG (post-processed)
- `bda` — Block-Diagram Algebra (Faust): operators `~ , : <: :>`, option
  `delays` (alias `faust`)

### Images & correspondence

- `mosaic` — justified image gallery (`height` / `gap` / `last=natural`)
- `sender` / `recipient` / `signature` — letter/invoice letterhead blocks
  (side-by-side flex)
- `header` / `footer` — running page headers/footers

### Other

- `demo` — interactive demo block (zoom)
- ordinary code blocks with **syntax highlighting** (31 highlight.js languages +
  a custom **Faust** grammar)

> The `chart`, `bda`, `category`, `adt`, `diff`, `tree` renderers are also
> published as standalone npm packages (`@orlarey/blocks`).

## Extended Markdown (beyond fences)

- **Callouts** `::: class [Title]`: `note`, `tip`, `warning`, `caution`,
  `important` + theorem-style: `theorem`, `lemma`, `proposition`, `corollary`,
  `definition`, `proof`, `example`, `remark`
- `::: toc+` — augmented table of contents (with outline)
- `::: columns` — multi-column layout
- `::: style` — local typographic overrides (colour, size, font, weight, align…)
  on recursive content — see [STYLE-SPEC](docs/STYLE-SPEC.md)
- `::: background` — page backdrop layer (positioned markdown minipages, full-page
  fill, cascading like `header`/`footer`) for covers & slide templates — see
  [BACKGROUND-SPEC](docs/BACKGROUND-SPEC.md)
- **Footnotes** `[^id]`, Pandoc-lite **citations** `[@key]`, **definition lists**
- **Margin figures** `{.margin}`, figure captions, `\label` / `\ref`
  (numbered cross-references)
- **YAML frontmatter**: metadata (`title`, `author`, `date`), behaviour
  (`slides`, `mathjax-preamble`), and portable layout/typography
  (`page-size`, `margins`, `page-numbers`, `font-*`, `markpage-profile`) —
  see [FRONTMATTER-SPEC](docs/FRONTMATTER-SPEC.md)
- **Input ligatures**: `\command␣` → Unicode symbol (single table shared with the
  LaTeX export), sequences `->` `<=` `[[`, sub/superscripts `_N`/`^N`,
  blackboard `|N`→ℕ

## Layout & styles

- **Layout presets**: Tech note, Report, Scientific paper, Bound book,
  **Critical edition** (+ Custom)
- **Style compare** view: Classic / Manuscript
- **Notes**: at the foot (`foot`) or **Tufte-style in the margin** (`side`)
- **Margins**: physical or **derived** (measure in characters, live area)
- Automatic **section numbering** (by example), duplex/recto-verso, chapter breaks
- **Presentation / slides** mode (`slides: true` → 16:9, Beamer-like)
- **Fonts**: Fira & STIX Two packs, adjustable editor font
- **Maths**: 5 MathJax font sets (`newcm`, `fira`, `stix2`, `asana`, `tex`),
  per-document TeX preamble
- Persisted **settings** + importable/exportable **profiles** (JSON)

## Files & volumes (unified file system, 0.32.0)

A single **Open**, one root, **4 mounted volumes**:

- **Library** — the browser's private file system (OPFS), always there, offline
- **Disk** — a local folder (File System Access, Chromium)
- **GitHub repo** — `owner/repo@branch` via a PAT, **R1–R4 sync** (atomic commit
  via the Git Data API, divergence detection → **non-destructive fork**
  `foo-<sha>.md`)
- **OneDrive** — Microsoft Graph app-folder (eTag + conflict detection)

Plus: **Trash** (soft delete), Save / Save As / Reload / Unlink, origin indicator.

## Export & share

- **PDF** (vector print), **LaTeX** `.tex` (xelatex `--shell-escape`),
  **Markdown** (text + images bundle)
- **Share link** (document encoded in the URL, ~8 KB) and **email** sharing
- Direct export to OneDrive

## Import

- **.docx** (mammoth), **.html** (turndown), **.md** — foreign formats converted
  into a Library copy

## AI integration — MCP (shipped v0.29.0)

An **MCP** bridge (Go ↔ WebSocket ↔ tab) exposes markpage as tools to an
assistant (create/open/edit/export a document, read the authoring guide,
validate a fence…).
