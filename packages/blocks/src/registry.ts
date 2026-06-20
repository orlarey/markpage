/********************************* registry.ts *********************************
 *
 * Purpose: A small registry of fenced-block renderers — the framework-agnostic
 *   core of @markpage/blocks. A renderer turns a fence body + info string into
 *   a self-contained HTML/SVG string. Markdown integrations (the marked /
 *   markdown-it plugins) and DOM auto-init sit on top of this map.
 * How: A plain Map keyed by the fence language word (`chart`, `bda`, …). The
 *   bundled renderers register themselves from `index.ts`.
 *
 *******************************************************************************/

/**
 * A block renderer: `(body, info) => html`.
 * - `body` is the fence content (text between the ``` lines).
 * - `info` is the full info string, language word included (e.g.
 *   `chart line "Title" y-min=0`), so the renderer can parse its own options.
 */
export type BlockRenderer = (body: string, info: string) => string;

const renderers = new Map<string, BlockRenderer>();

/** Register (or replace) the renderer for a fence language. */
export function registerBlock(name: string, renderer: BlockRenderer): void {
  renderers.set(name, renderer);
}

/** Whether a renderer is registered for `name`. */
export function hasBlock(name: string): boolean {
  return renderers.has(name);
}

/** The set of registered fence languages. */
export function blockNames(): string[] {
  return [...renderers.keys()];
}

/**
 * Render a registered block. Returns the HTML string, or null when no renderer
 * is registered for `name` (so a host can fall through to its default).
 */
export function renderBlock(name: string, body: string, info: string): string | null {
  const fn = renderers.get(name);
  return fn ? fn(body, info) : null;
}
