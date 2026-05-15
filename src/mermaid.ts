/********************************* mermaid.ts ***********************************
 *
 * Purpose: Mermaid integration — render ` ```mermaid ` fences to SVG for
 *   substitution into the preview / PDF.
 * How: Lazy-load mermaid via dynamic `import()` on first use, cache the
 *   library promise + per-source results so a stable doc renders each diagram once.
 *
 *******************************************************************************/

export type MermaidResult =
  | { ok: true; svg: string }
  | { ok: false; error: string };

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
const cache = new Map<string, MermaidResult>();
let renderCounter = 0;

/**
 * Purpose: Resolve to a fully initialised mermaid module (singleton).
 * How: Memoise a dynamic import; configure for sober/print-friendly output
 *   with pure-SVG labels so pdfmake's strict parser accepts it.
 */
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

/**
 * Purpose: Render a mermaid source string to an SVG (or error) result.
 * How: Look up the per-source cache; on miss, call `mermaid.render` with
 *   a fresh id, capture errors, then memoise.
 */
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
