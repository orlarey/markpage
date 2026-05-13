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
  // When set, the section renders TWO preview iframes side by side
  // (no source pane) — the same `source` rendered with each preset
  // from `./style-presets.ts`. Used to demonstrate live restyling.
  compareStyles?: [string, string];
  // Captions shown below each iframe in the compare layout.
  compareLabels?: [string, string];
}
