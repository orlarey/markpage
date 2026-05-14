# Writing Markdown for markpage

A reference for AI agents producing Markdown documents that will be
rendered by [markpage](https://markpage.org). markpage takes
Markdown source and produces print-ready paginated PDFs entirely
client-side. All standard Markdown works; this document covers the
extensions that make markpage useful for technical specifications,
academic writing, and structured documentation.

Optimise the source for **the constructs below** when they fit —
they render cleanly into the PDF and survive copy-paste anywhere
(everything is plain text Unicode in the source).

---

## Standard Markdown

GFM-flavoured Markdown is supported as-is:

- Headings `#` through `######` (only the first 4 levels have
  distinct styling; `#####` / `######` share level 4's size).
- Emphasis: `*italic*`, `**bold**`, `~~strikethrough~~`,
  `` `inline code` ``.
- Lists: `-` / `*` unordered, `1.` ordered (renumbered automatically
  in render).
- Blockquotes: `> …`.
- Task lists: `- [ ]` / `- [x]` (real checkbox glyphs in the PDF).
- Links: `[text](url)`, autolinks `<url>`.
- Images: `![alt](path-or-url)` — scaled to fit the column.
- Fenced code blocks: triple backticks with an optional language
  hint for syntax-highlighting (`js`, `python`, `rust`, …).

---

## Math (MathJax / LaTeX)

Inline math between `$ … $`. Display math either between `$$ … $$`
on its own paragraph, or inside a `math` fenced block (preferred —
no requirement that the `$$` markers sit alone on their line):

````
Inline: $c = 1 / \sqrt{\mu_0 \varepsilon_0}$.

```math
\begin{align*}
  \nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
  \nabla \times \mathbf{B} &= \mu_0 \mathbf{J}
    + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{align*}
```
````

Full LaTeX math syntax — `\frac`, `\sqrt`, `\sum`, `\int`,
`\begin{matrix}`, `\begin{cases}`, `\mathbb{N}`, `\mathcal{O}`, etc.
You may also write Unicode characters directly (α, ℕ, ⊢, ∀) in math
mode; MathJax accepts them.

---

## Inference rules

For type systems, operational semantics, sequent calculus, etc.,
use a dedicated `inference` fenced block. Premises separated by
`;`, a line of three or more dashes, then the conclusion. The label
in parentheses appears to the right of the bar.

````
```inference (T-App)
\Gamma \vdash f : A \to B; \Gamma \vdash x : A
---
\Gamma \vdash f\,x : B
```
````

LaTeX commands (`\Gamma`, `\vdash`, `\to`) and the corresponding
Unicode (Γ, ⊢, →) are interchangeable inside the block.

---

## Mermaid diagrams

Flowcharts, sequence, class, state, gantt, ER, mindmap, etc.

````
```mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    U->>S: GET /article/42
    S-->>U: 200 OK + HTML
```
````

> **Critical pitfall:** inside Mermaid blocks, always write arrows
> as **ASCII** — `-->`, `<--`, `->>`, `-.->`. The Mermaid parser
> does NOT accept Unicode `→` / `←`. Do not generate `-→`, `→`, or
> `⇒` inside a Mermaid fence.

---

## Charts from CSV

A `chart` fenced block reads inline CSV and emits an SVG plot.
First line is headers (column 1 = X axis label, remaining columns
= data series). Following lines are values.

````
```chart line "Audio latency"
buffer (samples), latency (ms)
64,    1.3
128,   2.7
256,   5.3
512,  10.7
1024, 21.3
```
````

Types: `line` (curves) or `bar` (histogram). Quoted title is
optional. X axis auto-detects continuous numbers, categorical
labels, or ISO 8601 dates (`YYYY-MM-DD`). Multiple data series
become coloured lines or grouped bars with an automatic legend.

---

## CSV / TSV tables

Dense tables are easier as CSV/TSV than as pipe tables:

````
```csv
Note, Concert pitch (Hz), MIDI
A4,    440.00, 69
A#4,   466.16, 70
B4,    493.88, 71
```
````

Use `csv` or `tsv` as the info string. Separator is auto-detected
(tab > `;` > `,`). Decimal commas (`3,14`) are recognised when the
field separator is `,` and there's no space around the digits.

---

## Pipe tables (GFM)

Standard pipe-and-dash syntax. Alignment is set by the separator
row:

```
| Left | Centre | Right |
|:-----|:------:|------:|
| a    | b      | c     |
```

Tables are centred horizontally on the page in the rendered PDF.

---

## Callouts (Pandoc fenced divs)

Highlight a passage with `:::` blocks. Optional title in brackets
after the class name.

```
::: warning
Careful, this operation is irreversible.
:::

::: theorem [Pythagoras]
In a right triangle, the square of the hypotenuse equals the sum
of the squares of the other two sides.
:::
```

Recognised classes:

- **Coloured boxes** (tinted background, coloured frame):
  `note` (blue), `tip` (green), `warning` (orange),
  `caution` (red), `important` (purple).
- **Academic** (plain frame, italic title, LaTeX-like):
  `theorem`, `lemma`, `proposition`, `corollary`, `definition`,
  `proof`, `example`, `remark`.

Any other class name (e.g. `::: aside`) renders with a neutral
frame — fine for ad-hoc conventions. The body of a callout accepts
the full Markdown vocabulary including math, code, and nested
constructs.

---

## Definition lists (Pandoc-style)

Term on one line, definition on the next prefixed with `:` and an
indent. Lines indented by **four spaces** (or a tab) fold into the
current definition. Multiple definitions per term are allowed.

```
DAG
:   *Directed Acyclic Graph* — a directed graph with no cycle,
    used everywhere from build systems to causal inference.

FFT
:   *Fast Fourier Transform* — the $O(n \log n)$ algorithm by
    Cooley & Tukey.
:   Also a verb. "FFT the signal" means "compute its frequency
    representation".
```

---

## Footnotes (Pandoc-style)

Reference inline with `[^id]`. Define elsewhere (typically at the
end) with `[^id]: …`. Numbers are assigned in order of first
reference; the footnote section is generated automatically with
back-links.

```
Quicksort runs in $O(n \log n)$ on average[^avg], but degrades to
$O(n^2)$ on already-sorted input unless a randomised pivot is
used[^rand].

[^avg]: Hoare, C. A. R. (1962). *Quicksort*. The Computer Journal.
[^rand]: Sedgewick proposed shuffling the array as a guard.
```

---

## Mathematical Unicode in prose

Outside `$…$` and code blocks, you can write Unicode math
characters directly: α β γ, ∈ ∉ ⊆ ⊕ ⊗, ∀ ∃ ∞, ℕ ℝ ℤ ℚ ℂ, ≤ ≥ ≠, →
←, ↦ ⇒ ⇔. They render as the Unicode characters they are — no
math-mode delimiters needed. This is shorter and cleaner than
wrapping single symbols in `$…$`.

In Markdown source the editor would substitute `\alpha` → α, `\in`
→ ∈, `<=` → ≤, `|N` → ℕ as you type, but when generating Markdown
programmatically just write the Unicode directly.

---

## What is NOT supported

- **Raw HTML beyond what marked passes through** — no `<style>`,
  `<script>`, no custom elements. Use the constructs above.
- **YAML frontmatter** for document metadata (title, author, date).
  These are configured in the markpage Settings panel per profile,
  not in the source.
- **Manual page breaks** — pagination is handled by paged.js
  automatically. The `keep-with-next` style rules try to keep
  headings attached to the paragraph below.
- **Inline styles / classes on Markdown elements** — there is no
  `{.classname}` or `{#id}` annotation syntax.

---

## Style summary for spec writers

- Lead with `#` H1 for the document title, `##` for sections, `###`
  for subsections. Don't skip levels.
- Wrap definitions in `::: definition [Name]` blocks; theorems /
  lemmas / propositions get their own class.
- Use `::: note` / `::: warning` sparingly — they're for genuine
  side-channel remarks, not running prose.
- Prefer `csv` blocks for tables with more than ~3 columns or
  ~5 rows. Pipe tables are fine for compact 2×2 / 3×3 layouts.
- Mermaid for control flow, sequence diagrams, state machines.
  `chart` blocks for plotting actual data.
- Math: inline for single expressions in a sentence (`$O(n \log
  n)$`), display for anything multi-line or that deserves its own
  paragraph.
- Inference blocks for any judgement-style rule (typing, reduction,
  proof system).
- Footnotes for citations and parenthetical asides that would
  otherwise interrupt the flow.
