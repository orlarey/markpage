/********************************* math.ts **************************************
 *
 * Purpose: MathJax integration — render TeX (inline or display) to SVG for
 *   substitution into the preview / PDF, with selectable math font set.
 * How: Lazy-load MathJax via dynamic `import()` on first use; memoise a
 *   renderer per font set (each binds its own `MathJax*Font` class as
 *   `fontData`). One global `asyncLoad` dispatches dynamic variants to the
 *   right font by parsing the path MathJax requests.
 *
 *******************************************************************************/

import { FONT_SETS, type MathFontSet } from './mathjax-fontsets.js';
import { mathBodyToLatex } from './latex-math-symbols.js';

export type MathResult =
  | { ok: true; svg: string }
  | { ok: false; error: string };

interface Renderer {
  render: (latex: string, display: boolean) => Promise<string>;
}

const renderers = new Map<MathFontSet, Promise<Renderer>>();
const cache = new Map<string, MathResult>();
let asyncLoadInstalled = false;

/**
 * Purpose: Dispatch MathJax's `asyncLoad` to the right font's variant table.
 * How: Parse the font name out of the requested path
 *   (`@mathjax/mathjax-<font>-font/js/svg/dynamic/<variant>.js`), look it up
 *   in `FONT_SETS`. Static-import dispatch keeps Vite analysis happy and
 *   guarantees the same module instance as the SVG output's `fontData`.
 */
async function loadFontVariant(name: string): Promise<unknown> {
  const m = name.match(
    /@mathjax\/mathjax-([^/]+)-font\/js\/svg\/dynamic\/(.+?)(?:\.js)?$/,
  );
  if (!m) {
    throw new Error(`MathJax asyncLoad: unrecognised path '${name}'`);
  }
  const [, font, variant] = m;
  const set = FONT_SETS[font as MathFontSet];
  if (!set) {
    throw new Error(`MathJax asyncLoad: unknown font set '${font}'`);
  }
  const loader = set.variants[variant];
  if (!loader) {
    throw new Error(
      `MathJax asyncLoad: no '${variant}' variant in font set '${font}'`,
    );
  }
  const mod = await loader();
  return (mod as { default?: unknown }).default ?? mod;
}

/**
 * Purpose: Resolve to a fully wired MathJax `Renderer` for the given font set.
 * How: Per-font-set memoisation; first call also installs the global
 *   `asyncLoad` (which routes by path, so works for every font afterwards).
 */
async function loadMathJax(fontSet: MathFontSet): Promise<Renderer> {
  let entry = renderers.get(fontSet);
  if (entry) return entry;
  entry = (async () => {
    const [
      { mathjax },
      { TeX },
      { SVG },
      { browserAdaptor },
      { RegisterHTMLHandler },
      { AllPackages },
      FontClass,
    ] = await Promise.all([
      import('@mathjax/src/js/mathjax.js'),
      import('@mathjax/src/js/input/tex.js'),
      import('@mathjax/src/js/output/svg.js'),
      import('@mathjax/src/js/adaptors/browserAdaptor.js'),
      import('@mathjax/src/js/handlers/html.js'),
      import('./mathjax-all-packages.js'),
      FONT_SETS[fontSet].loadFontClass(),
    ]);
    if (!asyncLoadInstalled) {
      mathjax.asyncLoad = loadFontVariant;
      asyncLoadInstalled = true;
    }
    const adaptor = browserAdaptor();
    RegisterHTMLHandler(adaptor);
    // MathJax ships no stmaryrd, so the two double-bracket commands our
    // Unicode→LaTeX table emits (⟦ → \llbracket, ⟧ → \rrbracket) are undefined
    // and the `noundefined` package renders them as red literal text. Define
    // them here to the native Unicode glyphs MathJax already draws (U+27E6/E7),
    // with open/close spacing. Everything else the table emits is standard
    // base/ams and needs no help.
    const tex = new TeX({
      packages: AllPackages,
      macros: {
        llbracket: '\\mathopen{\\unicode{x27E6}}',
        rrbracket: '\\mathclose{\\unicode{x27E7}}',
      },
    });
    // 'local' = each SVG carries its own glyph <defs> and references them
    // via <use>; the SVG stays self-contained without duplicating every
    // glyph as inline path data the way 'none' would.
    // linebreaks.inline=false restores v3 behaviour: one monolithic SVG
    // per formula instead of multiple <svg> siblings separated by
    // <mjx-break>. The browser already line-breaks the surrounding text,
    // and intra-formula breaks would defeat our id-uniquification step
    // (cross-SVG xlink:href references can't be rewritten safely).
    // fontData = the MathJax*Font class chosen by the user.
    const svg = new SVG({
      fontCache: 'local',
      linebreaks: { inline: false },
      fontData: FontClass,
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
  renderers.set(fontSet, entry);
  return entry;
}

/**
 * Purpose: Render a TeX source string to an SVG (or error) result for `fontSet`.
 * How: Per-(fontSet, display, preamble, source) cache; on miss, normalise the
 *   body's Unicode math symbols to LaTeX (so MathJax only ever sees ASCII TeX —
 *   the single conversion the LaTeX export also uses), call MathJax on
 *   `preamble + tex`, and pull the bare `<svg>` from the wrapper. The preamble
 *   lets a doc's YAML frontmatter inject `\newcommand` macros visible to every
 *   formula without polluting the source of each one; it is already LaTeX, so
 *   it passes through unconverted.
 */
export async function renderMath(
  source: string,
  display: boolean,
  fontSet: MathFontSet = 'newcm',
  preamble = '',
): Promise<MathResult> {
  const trimmed = source.trim();
  const key = `${fontSet}|${display ? 'D' : 'I'}|${preamble.length}|${preamble}|${trimmed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let result: MathResult;
  try {
    const mj = await loadMathJax(fontSet);
    // Unicode → LaTeX up front: 𝒜 → \mathcal{A}, ⟦ → \llbracket, … so MathJax
    // renders canonical TeX and never sees an astral char (which it would echo
    // back as a broken surrogate). Unmapped non-ASCII passes through for
    // MathJax's own native handling.
    const tex = mathBodyToLatex(trimmed).text;
    const full = preamble ? `${preamble}\n${tex}` : tex;
    const wrapper = await mj.render(full, display);
    result = { ok: true, svg: extractSvg(wrapper) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { ok: false, error: msg };
  }
  cache.set(key, result);
  return result;
}

// Astral characters (e.g. 𝒜 U+1D49C) that MathJax echoes into its decorative
// `data-latex` / `data-c` annotations can come back out as an *unpaired* UTF-16
// surrogate — MathJax's TeX parser walks the source one UTF-16 code unit at a
// time and splits the pair across annotation boundaries. Those lone surrogates
// are an invalid string: later re-parsing the SVG as `image/svg+xml`
// (makeIdsUnique in hydrate.ts) makes the strict XML parser bail with
// "invalid utf-8 sequence", replacing the whole formula with the browser's
// pink XML-error page. The annotations are non-functional, so dropping the
// stray halves is harmless and keeps the SVG well-formed.
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripLoneSurrogates(s: string): string {
  return LONE_SURROGATE_RE.test(s) ? s.replace(LONE_SURROGATE_RE, '') : s;
}

/**
 * Purpose: Pull the outer `<svg>…</svg>` out of MathJax's `<mjx-container>` wrapper.
 * How: Parse as HTML (forgiving), pick the first top-level `<svg>` child of
 *   the wrapper, serialise via outerHTML, then strip any lone UTF-16 surrogate
 *   MathJax left in its annotations so the result stays valid XML. Robust to v4
 *   emitting sibling elements (font cache stubs, accessibility nodes) that the
 *   previous greedy regex would over-capture into an invalid XML fragment.
 */
function extractSvg(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg');
  return stripLoneSurrogates(svg ? svg.outerHTML : html);
}
