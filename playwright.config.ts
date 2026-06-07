import { defineConfig, devices } from '@playwright/test';

/**
 * Purpose: Configuration for Playwright end-to-end tests (live browser
 *   driving the markpage SPA — Settings UI, preview rendering, paged.js
 *   output). Distinct from the vitest unit tests under `tests/` which
 *   run in happy-dom and target pure modules.
 * How: A single Chromium project (we don't currently need cross-browser
 *   coverage; markpage targets the same engine used by Vite dev preview
 *   and paged.js itself). `webServer` boots the Vite dev server once for
 *   the entire run and reuses it across tests. Tests live in `e2e/`.
 *
 * Run with `npm run test:e2e`; add `:headed` to watch the browser drive.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // The dev server is single-instance; keep runs serial for now.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
