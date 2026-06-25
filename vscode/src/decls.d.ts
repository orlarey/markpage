// CSS side-effect imports (esbuild bundles them).
declare module '*.css';

// paged.js ships no types; we touch only Previewer.preview().
declare module 'pagedjs' {
  export class Previewer {
    preview(
      content: unknown,
      stylesheets: Array<Record<string, string>>,
      renderTo: HTMLElement,
    ): Promise<unknown>;
  }
}
