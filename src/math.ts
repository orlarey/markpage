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
  render: (latex: string, display: boolean) => Promise<string>;
}

let mathPromise: Promise<Renderer> | null = null;
const cache = new Map<string, MathResult>();

/**
 * Purpose: Lazily load a MathJax 4 newcm-font dynamic-variant module on demand.
 * How: Dispatch on basename through a static registry (`NEWCM_DYNAMIC_VARIANTS`)
 *   so Vite can statically analyse, code-split, and resolve each variant
 *   through the same package path as the SVG output — guaranteeing the
 *   dynamic module registers on the same `MathJaxNewcmFont` class instance.
 */
import { NEWCM_DYNAMIC_VARIANTS } from './mathjax-newcm-dynamic.js';

async function loadNewcmVariant(name: string): Promise<unknown> {
  // MathJax passes paths like
  //   `@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js`
  const variant = name.match(/\/dynamic\/(.+?)(?:\.js)?$/)?.[1];
  if (!variant) {
    throw new Error(`MathJax asyncLoad: unrecognised path '${name}'`);
  }
  const loader = NEWCM_DYNAMIC_VARIANTS[variant];
  if (!loader) {
    throw new Error(`MathJax asyncLoad: no registered loader for '${variant}'`);
  }
  const mod = await loader();
  return (mod as { default?: unknown }).default ?? mod;
}

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
      import('@mathjax/src/js/mathjax.js'),
      import('@mathjax/src/js/input/tex.js'),
      import('@mathjax/src/js/output/svg.js'),
      import('@mathjax/src/js/adaptors/browserAdaptor.js'),
      import('@mathjax/src/js/handlers/html.js'),
      import('./mathjax-all-packages.js'),
    ]);
    // v4 splits font variants (sans-serif, fraktur, script, …) into
    // lazy-loaded chunks. Wire a Vite-aware loader so MathJax can fetch
    // them when typesetting hits a glyph not in the default variant.
    mathjax.asyncLoad = loadNewcmVariant;
    const adaptor = browserAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages });
    // 'local' = each SVG carries its own glyph <defs> and references them
    // via <use>; the SVG stays self-contained without duplicating every
    // glyph as inline path data the way 'none' would.
    // linebreaks.inline=false restores v3 behaviour: one monolithic SVG
    // per formula instead of multiple <svg> siblings separated by
    // <mjx-break>. The browser already line-breaks the surrounding text,
    // and intra-formula breaks would defeat our id-uniquification step
    // (cross-SVG xlink:href references can't be rewritten safely).
    const svg = new SVG({
      fontCache: 'local',
      linebreaks: { inline: false },
    });
    const doc = mathjax.document(document, {
      InputJax: tex,
      OutputJax: svg,
    });
    return {
      render: (latex: string, display: boolean) =>
        mathjax.handleRetriesFor(() => {
          const node = doc.convert(latex, { display });
          return adaptor.outerHTML(node);
        }) as Promise<string>,
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
    const wrapper = await mj.render(trimmed, display);
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
 * How: Parse as HTML (forgiving), pick the first top-level `<svg>` child of
 *   the wrapper, serialise via outerHTML. Robust to v4 emitting sibling
 *   elements (font cache stubs, accessibility nodes) that the previous
 *   greedy regex would over-capture into an invalid XML fragment.
 */
function extractSvg(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg');
  return svg ? svg.outerHTML : html;
}
