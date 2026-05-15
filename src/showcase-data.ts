/********************************* showcase-data.ts ****************************
 *
 * Purpose: Curated showcase entries (title + description + Markdown snippet)
 *   shared by the vitrine page and the iframe demo runner.
 * How: Static `SHOWCASE_DATA` array ordered generalist → specialist, plus a
 *   `findShowcaseEntry` lookup and two reserved entries (playground / hero).
 *
 *******************************************************************************/

// Curated showcase entries used by both the long-page vitrine
// (`showcase.ts`) and the iframe runner (`demo.ts`). Each entry pairs
// a hand-written Markdown snippet — chosen so it renders cleanly in
// a small iframe — with a short title + description shown above the
// split (source on the left, live preview on the right).
//
// The snippets mirror the features documented in HELP.en.md / HELP.fr.md
// but are written to render live, not to be quoted as syntax. A future
// pass may auto-generate this file from a structured subset of HELP.
//
// Order: progressively generalist → specialist. Early segments cover
// what any spec writer reaches for (text, restyling, images, notes,
// tables, footnotes, glossaries, code). Mid-segments cover visual
// content (charts, mermaid). Late segments cover formal-methods
// territory (math, ligatures, inference rules, EBNF grammars, ADTs).
// Credits closes.

import pipeUrl from './assets/pipe.svg';
import type { ShowcaseEntry } from './showcase-types';

/**
 * Purpose: Ordered list of showcase sections rendered on the vitrine.
 * How: Each entry stands alone; `findShowcaseEntry` resolves by `id`.
 */
export const SHOWCASE_DATA: ShowcaseEntry[] = [
  {
    id: 'markdown-essentials',
    title: 'Plain Markdown, paginated',
    description:
      'Every standard Markdown construct works the way you expect — headings, bold, italic, lists, code spans. What you see in the editor is what comes out of the PDF.',
    sourceLang: 'markdown',
    source: `# The Treachery of Images

In 1929, René Magritte painted a pipe with the caption *Ceci n'est pas
une pipe*. The point was simple: an image of a pipe is not a pipe.

## Three corollaries

1. **Representation is not the thing represented.**
2. **A label can lie even when the picture is faithful.**
3. **Once you notice, you can't un-notice.**
`,
  },
  {
    id: 'styles',
    title: 'Restyle the document, not the source',
    description:
      'The same Markdown rendered through two style presets. Open the Réglages panel to tweak fonts, sizes, colours, spacing, page numbers — every change updates the preview live. Save the configuration as a profile, export it as JSON to share or version, import one from a colleague.',
    source: `# Meeting notes — 12 May

**Present:** Alice, Bob, Carole.

## Decisions

1. Hold the December 15 deadline.
2. Two remote days per week starting in January.
3. Extend the survey until the end of the month.

> Next meeting: Tuesday 17, 14:00.
`,
    compareStyles: ['classic', 'manuscript'],
    compareLabels: ['Classic preset', 'Manuscript preset'],
  },
  {
    id: 'images',
    title: 'Drop in any picture',
    description:
      'Drag an image from your desktop, paste a screenshot, or pick a file from the Style menu — it lands at the cursor, sized to fit, and travels with the PDF.',
    sourceLang: 'markdown',
    source: `## Not Magritte's pipe

![A line drawing of a tobacco pipe](${pipeUrl})

A picture of a pipe is not a pipe — you can name it, hang it on
the wall, write a caption underneath. But you cannot smoke the
picture.
`,
  },
  {
    id: 'callouts',
    title: 'Callouts and theorem-like blocks',
    description:
      'Pandoc-style fenced divs (`::: theorem`, `::: warning`, `::: note`, …) with optional titles. Theorem-family classes render in the LaTeX academic style; coloured ones are good for tips and warnings.',
    sourceLang: 'markdown',
    source: `::: theorem [Pythagoras]
In a right triangle, the square of the hypotenuse equals the sum of
the squares of the other two sides.
:::

::: warning
This action cannot be undone. Make sure you have a backup first.
:::

::: note [Why now]
The change is motivated by a regression in the upstream behaviour.
See the linked issue for the root cause.
:::
`,
  },
  {
    id: 'tables',
    title: 'Dense tables straight from CSV',
    description:
      'Pasting a CSV (or TSV) into a fenced block renders it as a proper table — auto-aligned, with the first row as the header. No pipe-and-dash gymnastics.',
    sourceLang: 'csv',
    source: `## Note frequencies

\`\`\`csv
Note, Concert pitch (Hz), MIDI
A4,    440.00, 69
A#4,   466.16, 70
B4,    493.88, 71
C5,    523.25, 72
\`\`\`
`,
  },
  {
    id: 'footnotes',
    title: 'Pandoc-style footnotes',
    description:
      'Reference any note in the body with `[^id]` and define it elsewhere. Numbers are assigned automatically in order of appearance; the notes are grouped at the end of the document with back-links.',
    sourceLang: 'markdown',
    source: String.raw`## Algorithmic complexity

Quicksort runs in $O(n \log n)$ on average[^avg], but degrades to
$O(n^2)$ on already-sorted input unless a randomised pivot is used[^rand].
The median-of-three heuristic is a popular middle ground.

[^avg]: Hoare, C. A. R. (1962). *Quicksort*. The Computer Journal.
[^rand]: Sedgewick proposed shuffling the array as a guard. Linear
    expected time, no worst-case pathology.
`,
  },
  {
    id: 'deflists',
    title: 'Definition lists for glossaries',
    description:
      'A term on one line, its definition prefixed by `:` on the next. Several definitions per term are allowed. Markdown inline formatting works inside terms and definitions.',
    sourceLang: 'markdown',
    source: String.raw`## Acronyms

DAG
:   *Directed Acyclic Graph* — a directed graph with no cycle. Used
    everywhere from build systems to causal inference.

FFT
:   *Fast Fourier Transform* — the $O(n \log n)$ algorithm by Cooley
    & Tukey that made digital signal processing tractable.
:   Also a verb. "FFT the signal" means "compute its frequency
    representation."
`,
  },
  {
    id: 'code-highlight',
    title: 'Syntax-highlighted code',
    description:
      'Fenced code blocks with a language hint get proper syntax highlighting — ~20 common languages bundled (Python, Rust, JS/TS, Go, C/C++, Haskell, OCaml, SQL, …) plus a custom Faust grammar for audio DSP specs.',
    sourceLang: 'markdown',
    source: `## Same idea, two languages

\`\`\`python
def quicksort(xs):
    if len(xs) <= 1:
        return xs
    pivot, rest = xs[0], xs[1:]
    return (
        quicksort([x for x in rest if x < pivot])
        + [pivot]
        + quicksort([x for x in rest if x >= pivot])
    )
\`\`\`

A custom **Faust** language is registered too — handy for audio
DSP specs:

\`\`\`faust
declare name "Echo";
import("stdfaust.lib");

delay = vslider("delay [ms]", 100, 1, 1000, 1) * 0.001;
fb    = vslider("feedback", 0.5, 0, 0.99, 0.01);

process = + ~ (de.delay(48000, delay * ma.SR) * fb);
\`\`\`
`,
  },
  {
    id: 'charts',
    title: 'Charts from CSV data',
    description:
      'A ```chart block reads a tiny CSV inline and emits an SVG curve or bar chart. Auto-detects continuous, categorical, and ISO-date X axes.',
    sourceLang: 'chart',
    source: `## Latency by buffer size

\`\`\`chart line "Audio latency"
buffer (samples), latency (ms)
64,    1.3
128,   2.7
256,   5.3
512,  10.7
1024, 21.3
\`\`\`

Latency scales linearly with the buffer size — at 48 kHz, doubling the
buffer doubles the wait before a sample reaches the output.
`,
  },
  {
    id: 'mermaid',
    title: 'Mermaid diagrams, SVG-crisp',
    description:
      'Flowcharts, sequence diagrams, class diagrams, gantt charts, mindmaps — describe with a few lines of text, render as SVG, print without pixelation.',
    sourceLang: 'mermaid',
    source: `## Request lifecycle

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    participant DB as Database
    U->>S: GET /article/42
    S->>DB: SELECT * FROM articles WHERE id = 42
    DB-->>S: { title, body, author_id }
    S->>DB: SELECT name FROM authors WHERE id = ?
    DB-->>S: { name: "..." }
    S-->>U: 200 OK + HTML
\`\`\`
`,
  },
  {
    id: 'math',
    title: 'Math formulas, professional typesetting',
    description:
      'LaTeX math rendered by MathJax — inline, displayed, aligned systems, matrices. Same source you would feed to a TeX compiler, ready for the PDF.',
    sourceLang: 'markdown',
    source: String.raw`## Maxwell's equations

In differential form, the four equations governing classical
electrodynamics are:

$$
\begin{align*}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{align*}
$$

Inline maths work too: the speed of light $c = 1 / \sqrt{\mu_0 \varepsilon_0}$.
`,
  },
  {
    id: 'ligatures',
    title: 'Math without the character picker',
    description:
      'Short ASCII sequences (\\alpha, \\in, ->, |N) are swapped for their Unicode equivalent as you type. The math characters end up in your source — no Unicode picker, no escape codes, copy-paste anywhere and the glyphs travel along.',
    sourceLang: 'markdown',
    source: `## You type ASCII…

\`\`\`
<=  >=  !=  ->  <-
\\alpha \\beta \\gamma  \\pi \\sigma \\omega
\\in \\notin \\subseteq \\cup \\cap \\emptyset
\\forall \\exists \\infty \\nabla \\partial
|N |R |Z |Q
\`\`\`

## …the source becomes Unicode

≤  ≥  ≠  →  ←
α β γ  π σ ω
∈ ∉ ⊆ ∪ ∩ ∅
∀ ∃ ∞ ∇ ∂
ℕ ℝ ℤ ℚ

Two-character tokens (\`<=\`, \`->\`, …) fire instantly; LaTeX commands
(\`\\alpha\`, \`\\in\`, …) wait for a space or other terminator. Type
\`\\\\alpha\` (double backslash) to keep the source literal.
`,
  },
  {
    id: 'inference',
    title: 'Inference rules for logic and semantics',
    description:
      'A dedicated ```inference fenced block renders premises / dashes / conclusion through MathJax. Input ligatures (->, |-, \\Gamma) work inside the block, so the source stays readable.',
    sourceLang: 'markdown',
    source: `## A typing rule

The application rule of the simply-typed lambda calculus reads:

\`\`\`inference (T-App)
\\Gamma \\vdash f : A \\to B; \\Gamma \\vdash x : A
---
\\Gamma \\vdash f\\,x : B
\`\`\`

Premises separated by \`;\` go side by side, with a \`\\quad\` of breathing
room. The rule label appears to the right of the bar.
`,
  },
  {
    id: 'ebnf',
    title: 'EBNF grammars as railroad diagrams',
    description:
      'A W3C-style EBNF source in a ```ebnf fenced block becomes one railroad diagram per production. Non-terminal names sit on the left with the `=` signs aligned vertically — LaTeX-style align-on-equals — and the diagrams flow right.',
    sourceLang: 'markdown',
    source: `## Arithmetic expressions

\`\`\`ebnf
expression = term, { ("+" | "-"), term };
term = factor, { ("*" | "/"), factor };
factor = number | "(", expression, ")";
number = digit, { digit };
\`\`\`
`,
  },
  {
    id: 'adt',
    title: 'Algebraic data types, typeset',
    description:
      'A ```adt block accepts BNF-style definitions (LHS ::= Ctor | Ctor(args)) and typesets them with aligned `|` separators, side annotations, and two-tier highlighting — defined types in one colour, pure constructors in another.',
    sourceLang: 'markdown',
    source: `## Abstract syntax

\`\`\`adt
Expr ::= Const(c)              (* c ∈ ℝ *)
       | Vec(v)                 (* v ∈ 𝒱 *)
       | Op(o, Expr, Expr)      (* o ∈ Ω *)
       | Split(Expr)

Op   ::= Add | Sub | Mul | Div
\`\`\`
`,
  },
  {
    id: 'credits',
    title: 'Free software, all the way down',
    description:
      'markpage is open-source, MIT-licensed, and assembled from free libraries. Every credit below points to a project worth knowing.',
    sourceLang: 'markdown',
    source: `## Credits

markpage is an open-source project assembled from free software.
Thanks to everyone who maintains these projects:

- **Editing and rendering**:
  [CodeMirror](https://codemirror.net/) for the editor,
  [marked](https://marked.js.org/) for the Markdown parser,
  [paged.js](https://pagedjs.org/) for paginated layout.
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
  (\`.docx\`) import,
  [Turndown](https://github.com/mixmark-io/turndown) for HTML →
  Markdown conversion.
- **Fonts**:
  [Roboto](https://fonts.google.com/specimen/Roboto) and
  [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono)
  (Christian Robertson, Google),
  [Noto Sans Math](https://fonts.google.com/noto/specimen/Noto+Sans+Math)
  and [Noto Sans Symbols](https://fonts.google.com/noto/specimen/Noto+Sans+Symbols)
  for mathematical characters.
- **Build tools**:
  [Vite](https://vitejs.dev/) and [TypeScript](https://www.typescriptlang.org/).
- **AI pair-programming**:
  this project was built with the assistance of
  [Claude Code](https://www.anthropic.com/claude-code).

Source on [GitHub](https://github.com/orlarey/markpage).
`,
  },
];

/**
 * Purpose: Resolve a showcase entry by its kebab-case `id`.
 * How: Linear scan of `SHOWCASE_DATA`; returns `undefined` when missing.
 */
// Lookup helper used by both the showcase page (to render the
// section list in order) and demo.ts (to find the snippet matching
// a `?id=<id>` query parameter).
export function findShowcaseEntry(id: string): ShowcaseEntry | undefined {
  return SHOWCASE_DATA.find((e) => e.id === id);
}

/**
 * Purpose: Empty-canvas fallback when the requested showcase id is unknown.
 * How: Inert entry with blank source — also reserved for a future editable demo.
 */
// `playground` is the empty fallback used when the URL specifies an
// id we don't recognise. Kept around for potential reuse later (e.g.
// an editable mode where the visitor types from scratch).
export const PLAYGROUND_ENTRY: ShowcaseEntry = {
  id: 'playground',
  title: '',
  description: '',
  source: '',
};

/**
 * Purpose: Friendly first-impression snippet shown in the showcase hero iframe.
 * How: Meeting-notes Markdown covering common constructs (no math/LaTeX).
 */
// Rich-but-friendly snippet used by the showcase hero iframe. Aimed
// at total-beginner visitors: a short, ordinary-looking document
// (meeting notes) that demonstrates the most common Markdown
// constructs — H1, H2, bold, italic, ordered list, bullet list,
// blockquote — without any scientific syntax. The point is to
// show that producing a clean PDF doesn't require math or LaTeX
// fluency; the advanced features come further down the page.
export const HERO_DEMO_ENTRY: ShowcaseEntry = {
  id: 'hero',
  title: '',
  description: '',
  source: `# Meeting notes — 12 May

**Present:** Alice, Bob, Carole.

Three topics on the agenda:

1. December delivery schedule
2. The new remote-work policy
3. Feedback on the internal survey

## Decisions

- Hold the December 15 deadline.
- Two remote days per week starting in January.
- Extend the survey until the end of the month.

> *Next meeting: Tuesday 17, 14:00.*
`,
};
