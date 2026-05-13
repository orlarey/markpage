/// <reference types="vite/client" />

// Replaced at build time by Vite (see `define` in vite.config.ts) with
// the version string from package.json.
declare const __APP_VERSION__: string;

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
