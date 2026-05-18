# Welcome to markpage

**markpage** is an editor that produces PDFs ready to print or share.
You write almost plain text, and the app takes care of the layout.

You are currently reading this tutorial **inside the editor** — it is
itself a markpage document. Feel free to edit it, or start with a
blank page.

The **Help** button (yellow background) reopens this help page any
time, without touching your own document.

## Getting started

You only need **five or six tools** to write most documents. Follow
this tutorial step by step — the idea is that you write your first
document as you read.

### The principle

markpage uses a convention called **Markdown**. You write almost plain
text with **a few simple marks** that indicate formatting. No menus to
learn, no required shortcuts.

To give you an idea, this tutorial itself is written in Markdown. On
the right you see the typeset version (clicking **Preview**), and
here on the left you see the "real" source. You can look at the
left side any time to see "how it's done".

### Go ahead, write your first document

Select all the editor content (`Cmd/Ctrl + A`) and delete. The page
is blank. Let's go.

### The main title

On the first line, type a hash (`#`), a space, then the title of your
document:

```
# My first document
```

That's it. The `#` at the start of the line means *"what follows is
a heading"*. Just one line, no period at the end, no closing — you
just go to the next line when you're done.

> **Note**: this first `#` heading of the document acts as the
> **cover page** in the PDF (centred, followed by author,
> organisation and date if you fill them in under **Settings**). Your
> internal sections should therefore use `##` (two hashes) or `###`
> (three) instead.

### A section

Skip a line, then type two hashes followed by your section title:

```
## Introduction
```

### Some text

Below the heading, type your paragraph normally, like in an email.
Skip a blank line to start a new paragraph.

### Emphasis: *italic* and **bold**

To put a word in *italic*, surround it with **one** asterisk:

```
The word *important* is in italic.
```

For **bold**, surround it with **two** asterisks:

```
The word **important** is in bold.
```

> **Tip**: if asterisks feel tedious to type, select the word and
> press `Cmd/Ctrl + I` for italic or `Cmd/Ctrl + B` for bold — just
> like in Word. The result is exactly the same.

### A sub-section

Three hashes for a deeper heading level:

```
### My main ideas
```

You can go down to six hashes, but in practice three is enough for
most documents.

### Inserting an image

Three options:

1. **Drag-and-drop** an image from your desktop straight into the
   editor.
2. **Paste** a screenshot (`Cmd/Ctrl + V` after capturing it).
3. **Style** button in the toolbar → *"Insert image…"*.

The image is automatically resized and compressed (2000 px max on
each side), and gets inserted at the cursor position.

### The toolbar

At the top of the screen, a handful of buttons:

- **My doc ▾** — shows the current document's name; opens the list
  of your documents, lets you create / rename / duplicate / delete.
- **Import** — adds a file (`.md`, `.txt`, `.html`, `.docx`) as a
  new document, without touching the current one.
- **Style ▾** — a formatting menu (headings, bold, lists, insert
  image…). **Right-clicking** in the editor opens the same menu.
- **Help** (yellow) — opens this tutorial.
- **Preview** — toggles between editor and paginated rendering.
- **Export ▾** — produces a Markdown file (`.md`), a PDF, or a
  LaTeX source (`.tex`).
- **Settings ▾** — customise the PDF render (author, margins,
  fonts…). Opens in a **separate window** that you can place next
  to the preview to see each change in real time.

### Seeing the preview

You write in **editor** mode (plain text). To see what your document
will look like in the PDF, switch to **preview** mode:

- shortcut `Cmd/Ctrl + Enter`
- or click the **Preview** button

You see your document as it will be printed.

To go back to the editor, **click anywhere in the preview**: the
cursor lands right on the line you clicked. Handy: if you spot a
typo, click on it and you land straight on the word in the editor
to fix it. Or press `Cmd/Ctrl + Enter` again.

### Exporting to PDF

Click on **Export ▾** then **PDF (.pdf)**, or use the shortcut
`Cmd/Ctrl + P` directly.

The browser opens its print dialog. Choose:

- **Destination**: *Save as PDF*
- **Margins**: ⚠ **None** (see the box below)

Click **Save**, give the file a name, you're done.

> **⚠ Important — select "Margins: None"**
>
> In the print dialog, open "More settings" and pick **"Margins:
> None"**. Otherwise the browser adds its own margins on top of the
> ones markpage already handles, which shrinks the printable area
> and makes the content overflow. The margins visible in the PDF
> are **always** the ones you chose under **Settings**, never the
> ones from the print dialog.

### And that's it

You know how to write a document with markpage. Most notes, reports
and short articles need nothing more than these few tools.

If you need anything else — lists, quotes, tables, math formulas,
diagrams, callouts, footnotes, charts — the rest of this tutorial
documents every advanced feature. Read at your own pace, or go
write your document now and come back later.

---

## Going further

Everything that follows is **optional**. Pick what you need. Each
section is independent. This part gathers what you need to **write
a richer document**: more Markdown elements, callouts, footnotes,
tables, charts. For **scientific typography** (math formulas,
ligatures, inference rules) and **Mermaid diagrams**, see the next
part *Going even further*.

### More Markdown elements

#### Lists

**Bullet lists**: a dash (`-`) or an asterisk (`*`) at the start of
the line:

```
- First idea
- Second idea
- Third idea
```

**Numbered lists**: a number followed by a period:

```
1. First step
2. Second step
3. Third step
```

(The numbers you type don't matter — Markdown renumbers; you can
type them all as `1.`)

**Nested lists**: indent by four spaces or one tab for a sub-list:

```
- Main idea
    - Sub-idea
    - Another sub-idea
- Second idea
```

#### Quotes

A chevron (`>`) at the start of the line:

```
> What is conceived clearly is expressed clearly.
> — Boileau
```

#### Links

```
Visit [Boileau's site](https://example.com).
```

The bracketed text becomes clickable, pointing at the URL in
parentheses. Shortcut: select the text, `Cmd/Ctrl + K`, paste the
URL.

#### Horizontal rules

Three dashes on a line of their own:

```
---
```

#### Inline code and code blocks

For **inline code** in a paragraph, surround it with backticks:
`` `let x = 42` `` gives `let x = 42`.

For an **entire code block**, surround it with three backticks each
on its own line:

````
```
function add(a, b) {
    return a + b;
}
```
````

#### Task lists

A checklist: dash, space, then `[ ]` (to do) or `[x]` (done):

```
- [x] Write draft
- [x] Proofread
- [ ] Send to the committee
- [ ] Prepare final version
```

The boxes are **purely visual**: to check / uncheck, edit the
`[ ]` to `[x]` directly in the markdown.

#### Simple tables

Classic Markdown for small tables:

```
| Name   | Age |
|--------|-----|
| Alice  | 32  |
| Bob    | 27  |
```

(For **dense data tables**, see the *Data tables (CSV / TSV)*
section below.)

### Managing multiple documents

markpage keeps **all your documents** in the browser. The list lives
behind the **My doc ▾** button, which also shows the name of the
document you're currently editing.

#### The My doc ▾ menu

- **Rename the current doc**: click in the field at the top of the
  menu, type, confirm with Enter. (Esc cancels.)
- **+ New document**: creates an empty document and switches to it.
  The previous doc stays in place, you can come back to it at any
  time.
- **List of other documents**: sorted by modification date. Click
  a name to open it. On hover, three actions appear:
  - *Rename* — edits the name directly in the list.
  - *Duplicate* — clones the document.
  - *Delete* — with a confirmation prompt.

#### Importing a file

The **Import** button (shortcut `Cmd/Ctrl + O`) adds an external
file as a **new document** in the list, without touching the one
you're working on. Accepted formats: `.md`, `.txt`, `.html`, `.docx`
(Word).

> **Note about Word files**: when importing a `.docx`, the text,
> headings, lists, bold/italic, links and quotes are recovered, but
> **not the images**. If your Word document contained photos, you'll
> need to re-insert them manually after import.

#### Exporting your document

The **Export ▾** button offers three formats:

| Format | Shortcut | Effect |
|---|---|---|
| **Markdown (.md)** | `Cmd/Ctrl + S` | Downloads your document as Markdown |
| **PDF (.pdf)** | `Cmd/Ctrl + P` | Produces the final PDF |
| **LaTeX (.tex)** | — | Produces a LaTeX source compilable with `xelatex` |

The **Markdown** format (`.md`) is an open, plain-text format,
readable anywhere. You can send it to someone who doesn't use
markpage — they'll open it in any text editor.

The **LaTeX** format (`.tex`) is useful when you want to fine-tune
the layout with a LaTeX compiler, or submit your document to a
journal that requires `.tex` sources. When your document contains
images or diagrams (mermaid, chart), the download is a **`.zip`
file** containing the `.tex` and an `images/` directory. Compile
with:

```
xelatex --shell-escape your-document.tex
```

(`--shell-escape` is only needed when the document contains
diagrams, and requires `inkscape` to be installed.) The header
comment in the `.tex` reminds you of these prerequisites.

The exported filename matches your document's name (the one shown
on **My doc ▾**).

Your work is **saved automatically** in the browser, so if you
close the tab by mistake, everything is recovered the next time
you open it.

### Customising the PDF render (Settings)

The **Settings ▾** button (shortcut `Cmd/Ctrl + ,`) opens a
**separate window** where you can configure the PDF without touching
the content. **Tip**: switch to Preview mode first, open Settings,
place the window next to the preview — every change reflects in
real time on the paginated document.

The window is organised in several **cards** (Author and date, Page,
Fonts, Margins, Spacing, Headings, Body, Page number, Mermaid
diagrams). If you make the window wider, the cards
**automatically flow into two or three columns** side by side to
cut down on scrolling.

What you can adjust:

- **Author, organisation, date** shown under the main title
- **Page format** (A4, A5, Letter…)
- **Margins** in millimetres
- **Justification** of text
- **Line spacing**
- **Fonts** for headings, body and code — picked from a catalogue of
  ~15 Google Fonts (Inter, EB Garamond, JetBrains Mono…). Fonts
  are loaded on demand; first use needs a connection, after that
  the browser caches them. Roboto Condensed and Roboto Mono are
  bundled and work offline. *Note: the editor itself always keeps
  Roboto Condensed / Mono regardless of your choices — the
  input zone's appearance doesn't change.*
- **Custom Google Fonts** — for a family outside the catalogue,
  paste the Google Fonts URL (for example
  `https://fonts.googleapis.com/css2?family=Tangerine:wght@400;700&display=swap`)
  into the "+ Add" field, confirm. The font appears immediately
  in all three pickers (Headings / Body / Code) and can be removed
  with a click on the cross on its chip.
- **Spacing** — three ratios that control the document's vertical
  density:
  - *Above / below headings* (default `1.6` / `0.6`):
    space above a heading of size T equals `ratio × T`.
    Deliberately asymmetric — more air above, so the heading
    "belongs" to the section that follows.
  - *Between paragraphs* (default `1.0`): symmetric margin
    applied to each paragraph.
- **Headings (h1 to h4)** — for each: size, colour, **weight**
  (Light / Regular / Medium / Semibold / Bold), **italic**, and
  **rule** (border-bottom below the heading). If the chosen font
  doesn't ship the requested weight or italic cut, the browser
  *synthesises* a fake bold / italic, usually less pretty — the
  fix is to pick a more complete font, or to include the desired
  weight in your custom Google Fonts URL.
- **Body** — size and colour of normal text, code, and quotes
  (with their vertical bar).
- **Page number**: position, size, colour, italic
- **Mermaid diagrams**: max upscale, max width, max height
  (cf. *Mermaid diagrams* section below).

Settings are **remembered between sessions**. To revert to the
default values, open the **Profile** menu at the top of the Settings
window (cf. next section) and click *Reset*.

### Multiple settings profiles

You can keep **several settings sets** under different names — for
example a "Research article" profile that's sober, a "Course notes"
profile that's airy, an "A5 slides" third one — and switch between
them in one click. Only one profile is active at a time and applies
to all your documents.

The current profile's dropdown lives **at the top of the Settings
window**, next to the title. It shows the active profile's name
followed by `▾`.

Inside the menu:

- **The current name is editable** at the top. Type, confirm with
  `Enter`, the profile is renamed.
- **+ New profile** creates a profile starting from a copy of the
  current settings (useful for testing a variant without breaking
  the existing one) and switches to it.
- **The list below** shows the other profiles. **One click =
  switch** to that profile. The preview and PDF adapt
  immediately.
- At the **bottom of the menu**, three actions apply to the
  **current profile only**:
  - *Duplicate* — creates a copy named "Copy of …" and switches
    to it.
  - *Delete* (with confirmation) — disabled if only one profile is
    left; the most recent remaining profile becomes the new
    current.
  - *Reset* — reverts to the default values **without changing the
    name**, equivalent of the historical Reset button.
- **Import…** opens a `.json` file picker (a colleague's profile
  export, for example). **Export…** downloads the current profile
  as `<profile-name>.json`. The format is self-contained and human-
  readable if needed.

### Special characters and symbols

Arrows (→, ←, ↑, ↓), math operators (≤, ≥, ≠), miscellaneous
symbols (★, ♥, ✓) are handled correctly, on screen as in the PDF.

### Numbering sections

To number the headings of a long document without configuring a
menu, just **show the example on the first heading of each level**:
the **Number sections** command (`Cmd/Ctrl + Shift + N`, or the
**Style** menu → *Number sections*) detects the numbering style you
wrote, then applies it to all other headings of the same level.

Example. You write:

```
# 1. Introduction

## 1.1 Context

## Goals

# Method

## Data

# Results
```

…you run the command, and the document becomes:

```
# 1. Introduction

## 1.1 Context

## 1.2 Goals

# 2. Method

## 2.1 Data

# 3. Results
```

The first `#` (h1) announces a flat decimal style (`1.`); the first
`##` (h2) announces a hierarchical style (`1.1`). The command
remembers and applies. If your first heading has no numbering, that
level won't be numbered at all, and any numeric prefix on later
headings at that level is removed (cleanup pass).

**Recognised styles** per level:

| First heading | Style applied |
|---|---|
| `# 1. Foo` | `1.`, `2.`, `3.`, … |
| `# 1) Foo` | `1)`, `2)`, `3)`, … |
| `# (1) Foo` | `(1)`, `(2)`, `(3)`, … |
| `# A. Foo` | `A.`, `B.`, …, `Z.`, `AA.` |
| `# a. Foo` | `a.`, `b.`, … |
| `# I. Foo` | `I.`, `II.`, `III.`, … |
| `# i. Foo` | `i.`, `ii.`, … |
| `## 1.1 Foo` | hierarchical: `1.1`, `1.2`, `2.1`, … |
| `## 1.1. Foo` | hierarchical with trailing period |
| (no prefix) | no numbering for that level |

Hierarchical numbering needs every parent level to be numbered
itself.

### Data tables (CSV / TSV)

For a dense table, writing the pipe-style syntax by hand is
tedious. You can instead paste a **CSV** or a **TSV** in a *fenced
block*:

````
```csv
Note, Concert pitch (Hz), MIDI
A4,    440.00, 69
A#4,   466.16, 70
B4,    493.88, 71
```
````

The **separator** is a comma for `csv`, a tab for `tsv`. The
**first line** becomes the table header, the following ones the
data.

If one of your cells contains the separator (for example a comma
in a name), surround it with double quotes:

````
```csv
Name, Description
"Doe, John", "Author, founder"
```
````

To insert a literal quote in a quoted cell, double it: `""`.

### Definition lists

For a list of **terms with their definitions** (glossary, notation,
dictionary), use the Pandoc syntax: a term on one line, then its
definition on the next line prefixed by `:` and at least one space.

```
DAG
:   Directed Acyclic Graph — a directed graph with no cycle.

FFT
:   Fast Fourier Transform, the $O(n \log n)$ algorithm by
    Cooley & Tukey.
```

Several definitions for the same term: add other `:` lines below.

```
Polynomial
:   An expression of the form $a_0 + a_1 x + \dots + a_n x^n$.
:   An object of the Faust language that represents the same thing.
```

Inside terms and definitions you can use inline Markdown (bold,
italic, code, formulas, links).

### Footnotes

You can add a **footnote** with the Pandoc syntax: a footnote call
`[^id]` in the text, and the definition `[^id]: content` anywhere
in the document (usually at the end).

```
The discrete Fourier transform[^dft] is the base tool for
analysing a digital signal.

[^dft]: See Cooley & Tukey (1965) for the fast algorithm.
```

The `id` identifier can be a number, a word, or a short label — it
only serves to link the call to its definition, and never appears
in the render. Footnotes are **numbered automatically** in the
order they appear in the text (not in the order of the
definitions), and grouped at the end of the document.

Inside a footnote you can use **`bold`**, *italic*, `inline code`,
links, or even `$math$`. The same footnote can be referenced
several times — all the occurrences point to the same entry.

Clicking on the call `¹` jumps to the note; clicking on the `↩` at
the end of the note returns to the call.

### Citations

To cite a paper or a book, use the **Pandoc-lite syntax**: `[@key]`
in the text, with the definition `[@key]: reference text` at the
end of the document.

```
Quicksort runs in $O(n \log n)$ on average[@hoare1962], but
degrades to $O(n^2)$ on already-sorted input without a randomised
pivot[@sedgewick1978].

[@hoare1962]: Hoare, C. A. R. (1962). *Quicksort*. The Computer Journal 5(1), 10-16.
[@sedgewick1978]: Sedgewick, R. (1978). *Implementing Quicksort programs*. CACM 21(10), 847-857.
```

The rendering: each call becomes `[1]`, `[2]`, … numbered in order
of appearance (a repeated reference keeps its number). A
**References** section is generated at the end of the document
with the definitions, in citation order, each with a `↩` back-link
to the call.

Keys accept letters, digits, and `_:.-` (BibTeX-friendly). A
reference to an undefined key stays as literal text in the render
— avoids blank `[N]` markers on typos.

The reference text is written in Markdown: you keep control of the
format (italic for the title, bold for the author, …). No
automated CSL / APA / IEEE formatting.

### Callouts (notes, theorems…)

You can highlight a passage with a **callout**: open with `:::`
followed by the callout name, write your content, close with `:::`
alone on a line. This is the Pandoc *fenced div* syntax.

```
::: warning
Careful, this operation is irreversible.
:::
```

The recognised callout names fall in two families:

- **Generic** (coloured frame, tinted background):
  `note` (blue), `tip` (green), `warning` (orange), `caution` (red),
  `important` (purple).
- **Academic** (plain frame, italic title, LaTeX-like):
  `theorem`, `lemma`, `proposition`, `corollary`, `definition`,
  `proof`, `example`, `remark`.

You can add a **title** in brackets after the name:

```
::: theorem [Pythagoras]
In a right triangle, the square of the hypotenuse equals the sum
of the squares of the other two sides.
:::
```

…displays with the title **"Theorem — Pythagoras"**.

If you write a callout with a name that isn't in the list above
(for example `::: aside`), it's rendered with a neutral frame —
useful for your own conventions.

The inside of a callout is Markdown like the rest: formatted text,
lists, formulas, even tables.

### Charts

To draw a curve or chart from data, use a `chart` *fenced block*:

````
```chart line "Latency by buffer size"
buffer, latency (ms)
64,  12
128,  8
256,  5
512,  3
1024, 2
```
````

Available types are **`line`** (curve) and **`bar`** (histogram).
The quoted title after the type is optional.

The **first line** gives the headers: the first column becomes the
X-axis label, the following columns become as many **data series**
(each one its colour, and an automatic legend if more than one
series).

The following **data lines** contain the values. If the first
column is numeric, the X axis is continuous; if it contains text
labels (months, categories…), the X axis is categorical.

#### CSV format: French commas

The field separator is **auto-detected** on the first line:

- if there is a tab → separator = tab,
- otherwise if there is a semicolon → separator = `;`,
- otherwise → separator = `,`.

When the separator is `,`, **commas between two digits** (with no
space around them) are recognised as **decimal commas**, so `3,14`
stays a single number. The separating comma is then written
followed by a space: `foo, 3,14` gives two cells `foo` and `3,14`.

For rare ambiguous cases (`1,2,3,4` compact), switch to `;` or to
TSV — or add spaces: `1, 2, 3, 4`.

Numbers in cells accept both formats (period or decimal comma) —
`3.14` and `3,14` are equivalent.

#### Time series

If the first column contains **ISO 8601 dates** (`YYYY-MM-DD`,
optionally with a time), the X axis is treated as a time scale.
The app picks appropriate ticks automatically (day, month or year
depending on the range):

````
```chart line "Downloads"
date, total
2025-01-15, 120
2025-02-15, 180
2025-03-15, 245
2025-04-15, 310
```
````

Ambiguous formats (FR `15/01/2025` and US `01/15/2025`) are **not**
recognised — always use ISO 8601, which is unambiguous.

#### Multiple series

````
```chart bar "Codec comparison"
Codec, Size (KB), Time (ms)
MP3, 4200, 120
Opus, 3800, 95
FLAC, 12500, 280
```
````

Two side-by-side bars per category, with a legend at the top right
identifying each series.

---

## Going even further

This last part gathers **more specialised tools**: input ligatures
that make mathematical Unicode comfortable to type, LaTeX formulas,
inference rules, and Mermaid diagrams (flowcharts, sequences,
states, etc., each with its own syntax). If you're writing a
research article, a course, an algorithm spec, or technical
documentation, you'll find what you need here. Otherwise you can
skip straight to Credits.

### Input ligatures

To save you from looking up each Unicode symbol in a character
table, the editor **replaces on the fly** certain ASCII sequences
with their mathematical equivalent. Two mechanics coexist:

**Short symbol sequences** are replaced as soon as they're complete:

| Type | Get | Type | Get |
|---|---|---|---|
| `[[` | ⟦ | `<<` | ⟨ |
| `]]` | ⟧ | `>>` | ⟩ |
| `->` | → | `<-` | ← |
| `=>` | ⇒ | | |
| `<=` | ≤ | `>=` | ≥ |
| `!=` | ≠ | `+-` | ± |
| `\|-` | ⊢ | `-\|` | ⊣ |
| `...` | … | | |

**LaTeX commands** (`\xxx`) wait for a **terminator character**
(space, punctuation, operator, newline) before firing. Type `\alpha`
then a space: the space stays, and `\alpha` is replaced by α. This
rule lets overlapping names (`\in`, `\int`, `\infty`; `\subset`,
`\subseteq`) coexist without a shorter prefix shadowing a longer
command.

**Greek letters**:

| Type | Get | Type | Get | Type | Get |
|---|---|---|---|---|---|
| `\alpha` | α | `\iota` | ι | `\rho` | ρ |
| `\beta` | β | `\kappa` | κ | `\sigma` | σ |
| `\gamma` | γ | `\lambda` | λ | `\tau` | τ |
| `\delta` | δ | `\mu` | μ | `\upsilon` | υ |
| `\epsilon` | ϵ | `\nu` | ν | `\phi` | ϕ |
| `\zeta` | ζ | `\xi` | ξ | `\chi` | χ |
| `\eta` | η | `\omicron` | ο | `\psi` | ψ |
| `\theta` | θ | `\pi` | π | `\omega` | ω |

Typographic variants:
`\varepsilon` ε, `\varphi` φ, `\vartheta` ϑ, `\varpi` ϖ, `\varrho` ϱ,
`\varsigma` ς.

Uppercase (only those that differ from Latin):
`\Gamma` Γ, `\Delta` Δ, `\Theta` Θ, `\Lambda` Λ, `\Xi` Ξ, `\Pi` Π,
`\Sigma` Σ, `\Upsilon` Υ, `\Phi` Φ, `\Psi` Ψ, `\Omega` Ω.

**Set theory & quantifiers**:
`\in` ∈, `\notin` ∉, `\subset` ⊂, `\supset` ⊃, `\subseteq` ⊆,
`\supseteq` ⊇, `\cup` ∪, `\cap` ∩, `\emptyset` ∅, `\forall` ∀,
`\exists` ∃.

**Logic**: `\wedge` ∧, `\vee` ∨, `\neg` ¬.

**Relations**: `\approx` ≈, `\equiv` ≡, `\cong` ≅, `\sim` ∼,
`\propto` ∝, `\perp` ⊥, `\parallel` ∥.

**Operators**: `\oplus` ⊕, `\otimes` ⊗, `\circ` ∘, `\bullet` •,
`\cdot` ⋅, `\times` ×, `\div` ÷.

**Calculus**: `\partial` ∂, `\nabla` ∇, `\infty` ∞, `\sum` ∑,
`\prod` ∏, `\int` ∫, `\oint` ∮.

**Constants**: `\aleph` ℵ, `\hbar` ℏ.

**Ellipses**: `\cdots` ⋯, `\vdots` ⋮, `\ddots` ⋱, `\ldots` …

**Long arrows**: `\mapsto` ↦, `\Leftarrow` ⇐, `\Rightarrow` ⇒,
`\Leftrightarrow` ⇔.

> To write a command **literally** in prose (for instance to document
> `\alpha`), double the backslash: `\\alpha` stays as-is in the
> source — and renders as `\alpha` in Markdown, which interprets
> `\\` as an escaped backslash. Inside a code block, ligatures are
> also disabled.

For **"blackboard bold" letters** (set symbols), `|` followed by
any uppercase letter gives its doubled version:

| Type | Get | Type | Get | Type | Get |
|---|---|---|---|---|---|
| `\|A` | 𝔸 | `\|J` | 𝕁 | `\|S` | 𝕊 |
| `\|B` | 𝔹 | `\|K` | 𝕂 | `\|T` | 𝕋 |
| `\|C` | ℂ | `\|L` | 𝕃 | `\|U` | 𝕌 |
| `\|D` | 𝔻 | `\|M` | 𝕄 | `\|V` | 𝕍 |
| `\|E` | 𝔼 | `\|N` | ℕ | `\|W` | 𝕎 |
| `\|F` | 𝔽 | `\|O` | 𝕆 | `\|X` | 𝕏 |
| `\|G` | 𝔾 | `\|P` | ℙ | `\|Y` | 𝕐 |
| `\|H` | ℍ | `\|Q` | ℚ | `\|Z` | ℤ |
| `\|I` | 𝕀 | `\|R` | ℝ | | |

The replacement modifies the document's **source** (not just the
display), so the Unicode characters are there if you copy the text
elsewhere.

To undo a ligature that fired when you wanted the literal text,
press `Cmd/Ctrl + Z` immediately after — the substitution is
undone, the ASCII text is restored.

### Math formulas

You can include **LaTeX formulas**, either **as a block** between
`$$ … $$` (the formula is centred on its own line), or **inline**
between `$ … $` in the middle of a sentence. Rendering uses
[MathJax](https://www.mathjax.org/) and produces a PDF of
professional typographic quality.

For blocks, you can also use a *fenced block* with the language
`math` — that's the GitHub convention and it avoids the `$$`
trap of requiring those marks alone on their line:

````
```math
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
```
````

The render is strictly identical to `$$ … $$`.

#### Useful examples

**Sums and integrals**

```
$$
\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}
\qquad
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
```

$$
\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}
\qquad
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

**Matrix**

```
$$
A = \begin{pmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{pmatrix}
$$
```

$$
A = \begin{pmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{pmatrix}
$$

**Aligned equation system**

```
$$
\begin{align*}
f(x)   &= ax^2 + bx + c \\
f'(x)  &= 2ax + b \\
f''(x) &= 2a
\end{align*}
$$
```

$$
\begin{align*}
f(x)   &= ax^2 + bx + c \\
f'(x)  &= 2ax + b \\
f''(x) &= 2a
\end{align*}
$$

**Inline formula**: type for example
`Let $\epsilon > 0$ such that…` and you get:

Let $\epsilon > 0$ such that…

#### Things to know

- Formula size matches the current text size; if you change the
  **Body text** setting under **Settings**, formulas grow or shrink
  proportionally.
- If a formula is wider than the page's text area, it is
  automatically scaled down to fit.
- The usual LaTeX commands work: `\frac`, `\sqrt`, `\sum`, `\int`,
  `\lim`, `\vec`, `\partial`, Greek letters (`\alpha`, `\beta`, …),
  operators (`\pm`, `\times`, `\le`), arrows (`\to`,
  `\Rightarrow`), environments `pmatrix` / `bmatrix` / `align*`,
  etc.

### Inference rules

To write an **inference rule** (logical deduction, operational
semantics, etc.), use a *fenced block* with the language
`inference`:

````
```inference (MP)
Γ ⊢ A; Γ ⊢ A → B
-------------------
Γ ⊢ B
```
````

The block is rendered as LaTeX `\dfrac{premises}{conclusion}` via
MathJax. A **line of dashes** (3 dashes or more, alone on its line)
separates the premises from the conclusion. Premises are separated
by `;` or split across several lines. The optional **label** in
parentheses after `inference` (here `(MP)` for modus ponens)
appears to the right of the bar.

Inside an `inference` block, **input ligatures** remain active —
you can type `|-`, `->`, `[[`, `|N`, etc. and get the Unicode
characters (⊢, →, ⟦, ℕ, …) directly, which MathJax knows how to
render in math mode as-is. It's the only exception to the usual
"ligatures disabled in code blocks" behaviour.

For LaTeX commands that have no Unicode equivalent in our ligatures
(for example `\Gamma`, `\forall`, `\exists`, `\Rightarrow`,
`\leq`), type them directly.

### Mermaid diagrams

[Mermaid](https://mermaid.js.org/) lets you describe a diagram with
a few lines of text. Place your code in a block whose language is
`mermaid`:

````
```mermaid
flowchart LR
    A[Idea] --> B[Draft]
    B --> C[Final document]
    C --> D[PDF]
```
````

…and you get:

```mermaid
flowchart LR
    A[Idea] --> B[Draft]
    B --> C[Final document]
    C --> D[PDF]
```

The diagram is rendered as **SVG**, both in the preview **and** in
the PDF (vector quality, no pixelation when printed).

#### A few examples

**Sequence diagram** (exchange between two actors):

```mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    U->>S: GET /data request
    S-->>U: 200 OK + JSON
```

**Class diagram**:

```mermaid
classDiagram
    class Animal {
        +String name
        +eat()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog
```

**Pie chart**:

```mermaid
pie title Distribution
    "Work" : 40
    "Leisure" : 30
    "Sleep" : 30
```

Other recognised types: `stateDiagram`, `gantt`, `mindmap`, etc. —
see the [Mermaid documentation](https://mermaid.js.org/) for the
full list.

#### Settings

The **Mermaid diagrams** section of the **Settings** panel offers
three controls to adjust diagram size in the PDF:

- **Max upscale**: maximum scale-up factor (default 2). Small
  diagrams are scaled up to this factor; never beyond.
- **Max width (% of text)**: fraction of the page width (excluding
  margins) the diagram can occupy (default 100 %).
- **Max height (% of text)**: fraction of the page height
  (excluding margins) the diagram can occupy (default 70 %).

---

## Credits

markpage is an open-source project assembled from free software.
Thanks to everyone who maintains these projects:

- **Editing and rendering**:
  [CodeMirror](https://codemirror.net/) for the editor,
  [marked](https://marked.js.org/) for the Markdown parser,
  [paged.js](https://pagedjs.org/) for paginated layout
  (the preview and the PDF both go through the browser's print
  engine on this same rendering).
- **Diagrams and formulas**:
  [Mermaid](https://mermaid.js.org/) for flowcharts and sequence
  diagrams,
  [MathJax](https://www.mathjax.org/) for LaTeX formulas,
  [ebnf2railroad](https://github.com/matthijsgroen/ebnf2railroad) and
  [railroad-diagrams](https://github.com/tabatkins/railroad-diagrams)
  for EBNF syntax diagrams.
- **Syntax highlighting**:
  [highlight.js](https://highlightjs.org/) for fenced code blocks.
- **Imports**:
  [Mammoth.js](https://github.com/mwilliamson/mammoth.js) for Word
  (`.docx`) import,
  [Turndown](https://github.com/mixmark-io/turndown) for HTML →
  Markdown conversion.
- **Fonts**:
  [Roboto Condensed](https://fonts.google.com/specimen/Roboto+Condensed) and
  [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono)
  (Christian Robertson, Google),
  [Noto Sans Math](https://fonts.google.com/noto/specimen/Noto+Sans+Math) and
  [Noto Sans Symbols](https://fonts.google.com/noto/specimen/Noto+Sans+Symbols)
  (Google) for mathematical characters and symbols.
- **Build tools**:
  [Vite](https://vitejs.dev/) and [TypeScript](https://www.typescriptlang.org/).

markpage's source code is on
[GitHub](https://github.com/orlarey/markpage).

---

That's it. You can now:

- Erase this content and start writing your own document
- Save it to find it again later
- Click **Help** any time to revisit this tutorial

Happy writing.
