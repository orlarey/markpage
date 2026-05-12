import { DEFAULT_SETTINGS, type PdfSettings } from '../../src/settings';

// Settings used by every corpus test. We pin the date and clear the
// author/organization so the golden output is reproducible regardless
// of when the test runs or who's running it.
export const TEST_SETTINGS: PdfSettings = {
  ...DEFAULT_SETTINGS,
  author: { text: 'Test Author', show: true, bold: true },
  organization: { text: 'Test Org', show: true, bold: true },
  date: { mode: 'custom', custom: '2026-01-01' },
};

// English-locale settings, used by the small EN corpus that locks
// in the language-aware bits of the LaTeX export (English babel,
// English theorem env names, English banner / warning comments).
// Everything else matches TEST_SETTINGS.
export const TEST_SETTINGS_EN: PdfSettings = {
  ...TEST_SETTINGS,
  language: 'en',
};
