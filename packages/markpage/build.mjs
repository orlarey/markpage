// build.mjs — bundle the standalone viewer: dist/viewer/{viewer.js, viewer.css,
// chunks/, assets/} + viewer.html. The `markpage` CLI serves this directory to a
// headless Chromium, lets the viewer render the document, and saves the result
// as a self-contained page (only the fonts and glyph data actually used are
// inlined — the full MathJax font sets alone weigh 17 MB). As in the VS Code
// build, MathJax / Mermaid / Vivliostyle are lazy chunks.
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const production = !process.argv.includes('--dev');

// Same Vite import queries as the VS Code build (vscode/esbuild.mjs):
//   x.css?inline → the file's text; x.ttf?url → the emitted file's URL.
const viteQueries = {
  name: 'vite-queries',
  setup(b) {
    b.onResolve({ filter: /\?(inline|url)$/ }, async (args) => {
      const [path, query] = args.path.split('?');
      const r = await b.resolve(path, { kind: args.kind, resolveDir: args.resolveDir, importer: args.importer });
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
        `export default new URL(rel, import.meta.url).href;\n`,
      resolveDir: dirname(args.path),
      loader: 'js',
    }));
  },
};

// Start from nothing: chunks and assets are named by content hash, so the
// files of earlier builds would pile up beside the new ones — and be published
// with them (`files: dist`): 891 files instead of 357 after a few builds.
await rm('dist/viewer', { recursive: true, force: true });

const result = await build({
  entryPoints: ['src/viewer.ts'],
  outdir: 'dist/viewer',
  entryNames: 'viewer',
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  splitting: true,
  bundle: true,
  minify: production,
  sourcemap: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  plugins: [viteQueries],
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.otf': 'file' },
  conditions: ['development', 'browser', 'import', 'default'],
  // Only the built-in styles resolve outside the app; they use the newcm,
  // stix2 and fira MathJax font sets (as in vscode/esbuild.mjs).
  external: ['@mathjax/mathjax-asana-font/*', '@mathjax/mathjax-tex-font/*'],
  metafile: true,
  logLevel: 'warning',
});
const out = result.metafile.outputs;
for (const [f, o] of Object.entries(out)) console.log(`${f}: ${(o.bytes / 1e6).toFixed(2)} MB`);
if (process.argv.includes('--analyze')) {
  const by = {};
  for (const o of Object.values(out)) {
    for (const [inp, v] of Object.entries(o.inputs)) {
      const m = inp.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
      const k = m ? m[1] : inp.split('/').slice(0, 4).join('/');
      by[k] = (by[k] || 0) + v.bytesInOutput;
    }
  }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 18)) {
    console.log(`  ${(v / 1e6).toFixed(2)} MB  ${k}`);
  }
}

// The page the CLI loads: the viewer, and a slot for the document.
await writeFile(
  'dist/viewer/viewer.html',
  `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>markpage</title>
<link rel="stylesheet" href="viewer.css"></head>
<body class="mp-webview">
<section id="preview-pane" class="markpage"></section>
<script type="application/json" id="markpage-source">{}</script>
<script type="module" src="viewer.js"></script>
</body></html>
`,
);
