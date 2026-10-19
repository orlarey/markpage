// esbuild.mjs — build @orlarey/markpage-viewer: one ES module (+ lazy chunks)
// that renders a page's markpage Markdown with the app's own pipeline.
//
// The bundle must run where only SCRIPTS may come from its origin (a claude.ai
// Artifact loads it from cdn.jsdelivr.net; its CSP refuses stylesheets, fonts and
// fetches from there). So:
//   - CSS is bundled in a first pass and shipped as TEXT inside the module
//     (`virtual:viewer-css`), injected as a <style> at run time;
//   - the fonts that CSS references (ET Book) and the Noto fallbacks become
//     data: URLs — the Noto pair in a lazy chunk of its own;
//   - MathJax, Mermaid and Vivliostyle stay lazy `import()`s: on-demand chunks,
//     which ARE scripts, fetched next to dist/viewer.js.
// Like the VS Code webview (../vscode/esbuild.mjs), the app's packages resolve to
// their TypeScript sources (`development` condition) from the monorepo's
// node_modules.

import { readFile } from 'node:fs/promises';
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

/** Pass 1: every stylesheet the render needs, fonts inlined, as one string. */
async function buildCss() {
  const out = await build({
    entryPoints: ['src/viewer.css'],
    bundle: true,
    write: false,
    minify: true,
    logLevel: 'warning',
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    conditions: ['development', 'style', 'default'],
  });
  return out.outputFiles[0].text;
}

// The app's sources use two Vite import queries esbuild doesn't know:
//   `x.css?inline` → the file's text (preview-vivliostyle injects stylesheets
//                    into the standalone document it paginates);
//   `x.ttf?url`    → an asset URL; here a data: URL, since a font fetched from
//                    the bundle's CDN would be refused by an Artifact's CSP.
/** @type {import('esbuild').Plugin} */
const viteQueries = {
  name: 'vite-queries',
  setup(b) {
    b.onResolve({ filter: /\?(inline|url)$/ }, async (args) => {
      const [path, query] = args.path.split('?');
      const r = await b.resolve(path, {
        kind: args.kind,
        resolveDir: args.resolveDir,
        importer: args.importer,
      });
      if (r.errors.length) return { errors: r.errors };
      return { path: r.path, namespace: `vite-${query}` };
    });
    b.onLoad({ filter: /.*/, namespace: 'vite-inline' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'vite-url' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'dataurl',
    }));
  },
};

/** `virtual:viewer-css` → the pass-1 stylesheet, as the module's default export. */
function viewerCss(css) {
  return {
    name: 'viewer-css',
    setup(b) {
      b.onResolve({ filter: /^virtual:viewer-css$/ }, () => ({
        path: 'viewer-css',
        namespace: 'viewer-css',
      }));
      b.onLoad({ filter: /.*/, namespace: 'viewer-css' }, () => ({
        contents: css,
        loader: 'text',
      }));
    },
  };
}

async function jsConfig() {
  return {
    entryPoints: ['src/viewer.ts'],
    bundle: true,
    minify: true,
    logLevel: 'info',
    outdir: 'dist',
    entryNames: 'viewer',
    chunkNames: 'chunks/[name]-[hash]',
    platform: 'browser',
    format: 'esm',
    splitting: true, // lazy MathJax / Mermaid / Vivliostyle / Noto → on-demand chunks
    plugins: [viteQueries, viewerCss(await buildCss())],
    loader: { '.ttf': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
    conditions: ['development', 'browser', 'import', 'default'],
    // Only the built-in styles resolve outside the app, and they use the newcm,
    // stix2 and fira math fonts: the two others would add hundreds of chunks
    // whose `import()`s never run (as in the VS Code build).
    external: ['@mathjax/mathjax-asana-font/*', '@mathjax/mathjax-tex-font/*'],
  };
}

if (watch) {
  const ctx = await context(await jsConfig());
  await ctx.watch();
  console.log('[viewer] watching… (CSS changes need a restart)');
} else {
  await build(await jsConfig());
  console.log('[viewer] build done');
}
