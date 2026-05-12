// Placeholder entry point for the long-page vitrine. The full
// implementation (hero, sections, lazy-loaded iframes) lands in the
// follow-up commit; this stub just unblocks the Vite multi-entry
// config so the build doesn't fail.

import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto-mono/400.css';

const root = document.getElementById('showcase');
if (root) {
  root.textContent = 'markpage showcase — coming soon';
}
