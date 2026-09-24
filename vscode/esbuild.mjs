// esbuild.mjs — build the extension host (Node) and the webview (browser).
//
// The webview bundles the markpage app's own render pipeline (../src:
// document-render, preview, Vivliostyle pagination, named styles) plus
// @orlarey/markpage-render. We resolve them (and their deps) from the parent
// monorepo's node_modules, using the package's `development` export condition
// so we bundle the TypeScript sources directly.
//
// The webview is built as ESM with code-splitting so MathJax / Mermaid (lazy
// `import()`s under hydratePreview) become on-demand chunks instead of bloating
// the main bundle — only the default font set (and mermaid, when present) load
// at runtime. The chunks sit in dist/ (a webview localResourceRoot); the loader
// `<script type="module" nonce>` plus CSP `'strict-dynamic'` lets them load.

import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build, context } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

// The app's sources use two Vite import queries esbuild doesn't know:
//   `x.css?inline` → the file's text as a string (preview-vivliostyle injects
//                    stylesheets into the standalone document it paginates);
//   `x.ttf?url`    → the emitted asset's URL (fonts.ts registers fallbacks).
//                    esbuild's file loader yields a path relative to dist/,
//                    which the page would resolve against ITS url — so resolve
//                    it against the bundle's own <script> (dist/webview.js).
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
    b.onLoad({ filter: /.*/, namespace: 'vite-url' }, (args) => ({
      contents:
        `import rel from ${JSON.stringify(args.path)};\n` +
        `const s = document.querySelector('script[src*="webview.js"]');\n` +
        `export default new URL(rel, s ? s.src : import.meta.url).href;\n`,
      resolveDir: dirname(args.path),
      loader: 'js',
    }));
  },
};

const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'], // provided by the VS Code runtime
};

const webviewConfig = {
  ...common,
  entryPoints: ['src/webview/preview.ts'],
  outdir: 'dist',
  entryNames: 'webview',
  chunkNames: 'chunks/[name]-[hash]',
  platform: 'browser',
  format: 'esm',
  splitting: true, // lazy MathJax/Mermaid/Vivliostyle imports → on-demand chunks
  plugins: [viteQueries],
  // Font files referenced from the bundled CSS (@fontsource, ET Book) and the
  // `?url` fallbacks land next to the bundle, loaded relative to it.
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.otf': 'file' },
  assetNames: 'assets/[name]-[hash]',
  // Resolve @orlarey/markpage-render (+ deps) to their TS sources.
  conditions: ['development', 'browser', 'import', 'default'],
  // The MathJax font set comes from the document's style. Only the built-in
  // styles resolve in VS Code, and they use newcm, stix2 and fira: mark the two
  // others external so esbuild doesn't emit their hundreds of unused chunks —
  // their `import()`s are never executed.
  external: ['@mathjax/mathjax-asana-font/*', '@mathjax/mathjax-tex-font/*'],
};

async function run() {
  if (watch) {
    const ext = await context(extensionConfig);
    const web = await context(webviewConfig);
    await Promise.all([ext.watch(), web.watch()]);
    console.log('[esbuild] watching…');
  } else {
    await Promise.all([build(extensionConfig), build(webviewConfig)]);
    console.log('[esbuild] build done');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
