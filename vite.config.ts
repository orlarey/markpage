import { defineConfig } from 'vite';

// `base: './'` makes assets resolve relatively, so the build works whether
// served at the root or under a GitHub Pages subpath like /markpage/.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
