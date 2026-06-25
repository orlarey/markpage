// esbuild.mjs — build the extension host (Node) and the webview (browser).
//
// The webview bundles @orlarey/markpage-render. We resolve it (and its deps)
// from the parent monorepo's node_modules, using the package's `development`
// export condition so we bundle the TypeScript sources directly. v0.1 wires the
// phase-A transform only (renderMarkpageMarkdown); MathJax/Mermaid (phase B,
// hydratePreview) are a follow-up — esbuild tree-shakes them out for now.

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
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  // Resolve @orlarey/markpage-render (+ deps) to their TS sources.
  conditions: ['development', 'browser', 'import', 'default'],
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
