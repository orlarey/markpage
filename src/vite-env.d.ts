/// <reference types="vite/client" />

// Replaced at build time by Vite (see `define` in vite.config.ts) with
// the version string from package.json.
declare const __APP_VERSION__: string;

// `ebnf2railroad` ships no types. We only touch a tiny slice of its API
// (parse + per-production diagram + the TOC helpers needed to build
// metadata). The AST shape is structural; we treat it as `unknown[]`
// and narrow where needed in src/ebnf.ts.
declare module 'ebnf2railroad' {
  export function parseEbnf(src: string): unknown[];
}
declare module 'ebnf2railroad/src/build-diagram' {
  export function createDiagram(
    production: unknown,
    metadata: unknown,
    ast: unknown[],
    options: unknown,
  ): string;
}
declare module 'ebnf2railroad/src/toc' {
  export function createStructuralToc(ast: unknown[]): unknown;
  export function createDefinitionMetadata(toc: unknown): Record<string, unknown>;
}

// Minimal declaration for pagedjs (no @types package exists). We only use
// the Previewer class at runtime; the stronger typing lives in
// `preview-paginated.ts`.
declare module 'pagedjs' {
  export class Previewer {
    preview(
      content: HTMLElement | string,
      stylesheets: Array<Record<string, string>>,
      renderTo: HTMLElement,
    ): Promise<unknown>;
  }
  export class Polisher {}
  export class Chunker {}
  export class Handler {}
}
