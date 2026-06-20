import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const dir = fileURLToPath(new URL('.', import.meta.url));

// Single source of truth for the displayed version: `package.json`.
// Bump with `npm version patch|minor|major` and both the toolbar and
// the showcase pick it up at next build.
const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
  version: string;
};

// `base: './'` makes assets resolve relatively, so the build works whether
// served at the root or under a GitHub Pages subpath like /markpage/.
// We ship three entry points:
//   index.html     — the full markpage app
//   demo.html      — the minimal iframe runner for showcase sections
//   showcase.html  — the long marketing / vitrine page
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@markpage/blocks': resolve(dir, 'packages/blocks/src/index.ts'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(dir, 'index.html'),
        demo: resolve(dir, 'demo.html'),
        showcase: resolve(dir, 'showcase.html'),
      },
    },
  },
});
