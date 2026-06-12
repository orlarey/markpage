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
 * How: Memoise a dynamic import; configure for sober/print-friendly output.
 *   `htmlLabels: true` (the mermaid default) renders labels as a `<div>`
 *   wrapped in `<foreignObject>` so authors can use `<br>` for line
 *   breaks, `<b>` for bold, etc. The historical `htmlLabels: false`
 *   override was set to keep pdfmake's strict SVG parser happy — that
 *   pipeline is gone (PDF export now goes through paged.js + the
 *   browser's print engine, which renders foreignObject natively), so
 *   the override is dropped.
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
    result = { ok: true, svg: voidTagsToXhtml(svg) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { ok: false, error: msg };
  }
  cache.set(trimmed, result);
  return result;
}

/**
 * Purpose: Self-close HTML void tags in mermaid's SVG output so the
 *   string parses cleanly as XML/XHTML.
 * How: When `htmlLabels: true` (mermaid's default), labels are wrapped
 *   in `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">…
 *   </div></foreignObject>`. mermaid emits HTML5-style void tags
 *   (`<br>`, `<img …>`, etc.) inside that XHTML island — which the
 *   browser's strict XML / SVG parser then rejects ("Opening and
 *   ending tag mismatch: br line N and p"). Result: the rendered SVG
 *   is replaced with `<parsererror>` markup and the diagram is broken
 *   visually. We patch the most common void tags to their self-closed
 *   form (`<br/>`, `<img …/>`, `<hr/>`, `<wbr/>`) before injection so
 *   the parser stays happy. The regex matches the opening tag
 *   followed by optional attributes, then a `>` that is NOT already
 *   preceded by `/`, and inserts the slash.
 */
const VOID_TAGS = ['br', 'hr', 'img', 'wbr', 'input', 'col', 'area'];
// Exported for unit testing — the production code path goes through
// `renderMermaid` above, which always pipes the SVG through this fixup.
export function voidTagsToXhtml(svg: string): string {
  let out = svg;
  for (const tag of VOID_TAGS) {
    const re = new RegExp(`<${tag}((?:\\s[^>]*)?[^/])>`, 'g');
    out = out.replace(re, `<${tag}$1/>`);
    // Match the no-attribute case separately (the regex above requires
    // at least one char before `>`).
    const bareRe = new RegExp(`<${tag}>`, 'g');
    out = out.replace(bareRe, `<${tag}/>`);
  }
  return out;
}
