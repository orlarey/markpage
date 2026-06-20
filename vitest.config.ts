import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const dir = fileURLToPath(new URL('.', import.meta.url));

// happy-dom gives us `document` / `DOMParser` for the bits of the
// converters that lean on the browser DOM (preview HTML, SVG
// sanitisation). Tests that need a *real* browser layout engine
// (paged.js, mermaid's own renderer) are stubbed instead — we test
// our code, not theirs.
export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace packages to their source (matches vite.config).
      '@markpage/blocks': resolve(dir, 'packages/blocks/src/index.ts'),
      '@markpage/marked': resolve(dir, 'packages/marked/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
