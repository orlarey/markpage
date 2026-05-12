// Curated showcase entries used by both the long-page vitrine
// (`showcase.ts`) and the iframe runner (`demo.ts`). Each entry pairs
// a hand-written Markdown snippet — chosen so it renders cleanly in
// a small iframe — with a short title + description shown above the
// split (source on the left, live preview on the right).
//
// The snippets mirror the features documented in HELP.en.md / HELP.fr.md
// but are written to render live, not to be quoted as syntax. A future
// pass may auto-generate this file from a structured subset of HELP.

import type { ShowcaseEntry } from './showcase-types';

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

Three reasons that observation matters:

1. **Representation is not the thing represented.**
2. **A label can lie even when the picture is faithful.**
3. **Once you notice, you can't un-notice.**
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
    id: 'charts',
    title: 'Charts from CSV data',
    description:
      'A ```chart block reads a tiny CSV inline and emits an SVG curve or bar chart. Auto-detects continuous, categorical, and ISO-date X axes.',
    sourceLang: 'chart',
    source: `## Latency by buffer size

\`\`\`chart line "Audio latency"
buffer (samples), latency (ms)
64,  12
128,  8
256,  5
512,  3
1024, 2
\`\`\`

Doubling the buffer roughly halves the latency, until system overhead
takes over.
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
];

// Lookup helper used by both the showcase page (to render the
// section list in order) and demo.ts (to find the snippet matching
// a `?id=<id>` query parameter).
export function findShowcaseEntry(id: string): ShowcaseEntry | undefined {
  return SHOWCASE_DATA.find((e) => e.id === id);
}

// `playground` is a synthetic entry — empty snippet — used by the
// hero iframe so visitors can type their own Markdown from scratch.
export const PLAYGROUND_ENTRY: ShowcaseEntry = {
  id: 'playground',
  title: '',
  description: '',
  source: '',
};
