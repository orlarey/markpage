// esbuild.mjs — build the extension host (Node) and the webview (browser).
//
// The webview bundles @orlarey/markpage-render. We resolve it (and its deps)
// from the parent monorepo's node_modules, using the package's `development`
// export condition so we bundle the TypeScript sources directly.
//
// The webview is built as ESM with code-splitting so MathJax / Mermaid (lazy
// `import()`s under hydratePreview) become on-demand chunks instead of bloating
// the main bundle — only the default font set (and mermaid, when present) load
// at runtime. The chunks sit in dist/ (a webview localResourceRoot); the loader
// `<script type="module" nonce>` plus CSP `'strict-dynamic'` lets them load.

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
  splitting: true, // lazy MathJax/Mermaid imports → on-demand chunks
  // Resolve @orlarey/markpage-render (+ deps) to their TS sources.
  conditions: ['development', 'browser', 'import', 'default'],
  // The webview only ever requests the default MathJax font set (newcm). Mark the
  // other four external so esbuild doesn't emit ~300 unused font chunks — their
  // `import()`s are never executed at runtime (fontSet is hard-coded to newcm).
  external: [
    '@mathjax/mathjax-fira-font/*',
    '@mathjax/mathjax-asana-font/*',
    '@mathjax/mathjax-stix2-font/*',
    '@mathjax/mathjax-tex-font/*',
  ],
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
