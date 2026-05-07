// Mermaid integration: code blocks tagged ```mermaid get rendered to SVG and
// substituted into the preview / PDF. Mermaid is a heavy library (~600 KB
// minified) so we lazy-load it via a dynamic import the first time a
// diagram is rendered. Results are cached in memory by source string so a
// stable doc only triggers one render per diagram per session.

export type MermaidResult =
  | { ok: true; svg: string }
  | { ok: false; error: string };

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
const cache = new Map<string, MermaidResult>();
let renderCounter = 0;

async function loadMermaid(): Promise<typeof import('mermaid').default> {
  mermaidPromise ??= (async () => {
    const m = (await import('mermaid')).default;
    m.initialize({
      startOnLoad: false,
      // 'neutral' renders sober black-on-white-ish diagrams that print well.
      theme: 'neutral',
      // Strict sanitisation; users should never be inserting dangerous
      // payloads here, but no reason to take chances.
      securityLevel: 'strict',
      // Force pure-SVG labels (no <foreignObject> wrapping a <div>).
      // pdfmake's strict SVG parser chokes on the foreignObject path.
      // We apply this to every diagram type that has the toggle.
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
      gitGraph: { useMaxWidth: false },
    });
    return m;
  })();
  return mermaidPromise;
}

export async function renderMermaid(source: string): Promise<MermaidResult> {
  const trimmed = source.trim();
  const cached = cache.get(trimmed);
  if (cached) return cached;

  let result: MermaidResult;
  try {
    const mermaid = await loadMermaid();
    renderCounter += 1;
    const id = `mermaid-${renderCounter}`;
    const { svg } = await mermaid.render(id, trimmed);
    result = { ok: true, svg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { ok: false, error: msg };
  }
  cache.set(trimmed, result);
  return result;
}
