/********************************* math.ts **************************************
 *
 * Purpose: MathJax integration — render TeX (inline or display) to SVG for
 *   substitution into the preview / PDF.
 * How: Lazy-load MathJax via dynamic `import()` on first use, cache the
 *   renderer + per-(source,display) results, expose `renderMath` to callers.
 *
 *******************************************************************************/

export type MathResult =
  | { ok: true; svg: string }
  | { ok: false; error: string };

interface Renderer {
  render: (latex: string, display: boolean) => string;
}

let mathPromise: Promise<Renderer> | null = null;
const cache = new Map<string, MathResult>();

/**
 * Purpose: Resolve to a fully wired MathJax `Renderer` (singleton).
 * How: Memoise a dynamic-import block that builds TeX+SVG jaxes, registers
 *   the HTML handler, and returns a `render(latex, display)` closure.
 */
async function loadMathJax(): Promise<Renderer> {
  mathPromise ??= (async () => {
    const [
      { mathjax },
      { TeX },
      { SVG },
      { browserAdaptor },
      { RegisterHTMLHandler },
      { AllPackages },
    ] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/browserAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ]);
    const adaptor = browserAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages });
    // 'local' = each SVG carries its own glyph <defs> and references them
    // via <use>; the SVG stays self-contained without duplicating every
    // glyph as inline path data the way 'none' would.
    const svg = new SVG({ fontCache: 'local' });
    const doc = mathjax.document(document, {
      InputJax: tex,
      OutputJax: svg,
    });
    return {
      render: (latex: string, display: boolean) => {
        const node = doc.convert(latex, { display });
        return adaptor.outerHTML(node);
      },
    };
  })();
  return mathPromise;
}

/**
 * Purpose: Render a TeX source string to an SVG (or error) result.
 * How: Look up the per-(display,trimmed) cache; on miss, call MathJax and
 *   extract the bare `<svg>` from the `<mjx-container>` wrapper.
 */
export async function renderMath(
  source: string,
  display: boolean,
): Promise<MathResult> {
  const trimmed = source.trim();
  const key = `${display ? 'D' : 'I'}|${trimmed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let result: MathResult;
  try {
    const mj = await loadMathJax();
    const wrapper = mj.render(trimmed, display);
    // MathJax wraps the SVG in an <mjx-container> custom element. Extract
    // the bare <svg> so the rest of the pipeline (centred preview block,
    // sanitisation for pdfmake) treats it the same way as Mermaid output.
    result = { ok: true, svg: extractSvg(wrapper) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { ok: false, error: msg };
  }
  cache.set(key, result);
  return result;
}

/**
 * Purpose: Pull the outer `<svg>…</svg>` out of MathJax's `<mjx-container>` wrapper.
 * How: Greedy regex — non-greedy would stop at the first nested `</svg>`.
 */
function extractSvg(html: string): string {
  // Greedy match: MathJax SVGs nest sub-<svg> elements (one per oversized
  // glyph like fence brackets), so a non-greedy match would only capture
  // the first inner </svg> instead of the wrapper's.
  const match = /<svg[\S\s]*<\/svg>/i.exec(html);
  return match ? match[0] : html;
}
