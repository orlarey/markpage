// Shape of an entry in the showcase / vitrine page. Same type
// imported by the generated `showcase-data.ts`, by the showcase
// page's entry (`showcase.ts`), and by `main.ts` to look up the
// snippet when the iframe is loaded with `?demo=<id>`.

export interface ShowcaseEntry {
  // Slug used in the `?demo=<id>` query param. Stable, kebab-case.
  id: string;
  // Section heading shown on the showcase page.
  title: string;
  // Short intro (one or two sentences), shown above the source +
  // preview split.
  description: string;
  // The Markdown source rendered on the left of the split, and
  // also injected into the markpage iframe on the right via the
  // demo-mode bootstrap.
  source: string;
  // Hint for syntax highlighting on the static source pane. `mermaid`
  // / `chart` / `inference` / `csv` / `math` come through directly;
  // anything else falls back to plain markdown.
  sourceLang?: string;
}
