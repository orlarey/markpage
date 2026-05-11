import { defineConfig } from 'vitest/config';

// happy-dom gives us `document` / `DOMParser` for the bits of the
// converters that lean on the browser DOM (preview HTML, SVG
// sanitisation). Tests that need a *real* browser layout engine
// (paged.js, mermaid's own renderer) are stubbed instead — we test
// our code, not theirs.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
