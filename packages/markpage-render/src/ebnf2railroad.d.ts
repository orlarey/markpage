// `ebnf2railroad` ships no types. We touch a tiny slice of its API (parse +
// per-production diagram + TOC helpers). Declared here so this package builds
// standalone (the app has its own copy in src/vite-env.d.ts).
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
