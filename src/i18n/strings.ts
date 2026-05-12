// Single source of truth for every user-facing string in markpage.
//
// Pattern: a flat record per locale, keyed by dotted namespace strings
// (`'toolbar.import'`, `'menu.profile.delete-confirm'`). `t(key,
// params?)` walks the active locale, falls back to English, and
// interpolates `{name}` placeholders if any. Type-safety is enforced
// by typing the EN record against the FR keyset: a key present in FR
// but missing in EN (or vice-versa) is a compile-time error.

import { getLanguage } from './locale';

const FR = {
  // ---- toolbar ------------------------------------------------------
  'toolbar.docs-title': 'Documents',
  'toolbar.import': 'Importer',
  'toolbar.import-title':
    'Importer un fichier (.md / .docx / .html / .txt) comme nouveau document (Ctrl+O / Cmd+O)',
  'toolbar.preview': 'Aperçu',
  'toolbar.preview-title':
    'Basculer entre éditeur et aperçu (Ctrl+Enter / Cmd+Enter)',
  'toolbar.style': 'Style',
  'toolbar.style-title': 'Mise en forme (titres, gras, listes…)',
  'toolbar.help': 'Aide',
  'toolbar.export': 'Exporter',
  'toolbar.settings': 'Réglages',
  'toolbar.settings-title': 'Ouvrir le panneau de réglages (Ctrl+, / Cmd+,)',

  // ---- doc menu -----------------------------------------------------
  'doc-menu.new': '+ Nouveau document',
  'doc-menu.rename': 'Renommer',
  'doc-menu.duplicate': 'Dupliquer',
  'doc-menu.delete': 'Supprimer',
  'doc-menu.delete-confirm': 'Supprimer « {name} » ?',

  // ---- profile menu -------------------------------------------------
  'profile-menu.new': '+ Nouveau profil',
  'profile-menu.duplicate': 'Dupliquer',
  'profile-menu.delete': 'Supprimer',
  'profile-menu.delete-confirm': 'Supprimer le profil « {name} » ?',
  'profile-menu.reset': 'Réinitialiser',
  'profile-menu.reset-confirm':
    'Revenir aux réglages par défaut pour ce profil ? Le nom est conservé.',
  'profile-menu.import': 'Importer…',
  'profile-menu.export': 'Exporter…',
  'profile-menu.import-failed': 'Import du profil échoué : {error}',

  // ---- export menu --------------------------------------------------
  'export-menu.markdown': 'Markdown (.md)',
  'export-menu.pdf': 'PDF (.pdf)',
  'export-menu.latex': 'LaTeX (.tex)',

  // ---- settings form (window title + section headers) --------------
  'settings.window-title': 'Réglages markpage',
  'settings.h1': 'Réglages',
  'settings.section.author-date': 'Auteur et date',
  'settings.section.page': 'Page',
  'settings.section.fonts': 'Polices',
  'settings.section.margins': 'Marges (mm)',
  'settings.section.spacing': 'Espacement',
  'settings.section.headings': 'Titres',
  'settings.section.body': 'Corps',
  'settings.section.page-number': 'Numéro de page',
  'settings.section.mermaid': 'Diagrammes Mermaid',
  'settings.section.ui-language': 'Langue de l’interface',

  // ---- help window --------------------------------------------------
  'help.window-title': 'Aide markpage',
  'help.title-suffix': 'Aide',
  'help.close': 'Fermer',
  'help.export-pdf': 'Exporter .pdf',

  // ---- profile / settings import-export errors ---------------------
  'profile-import.invalid-json': 'JSON invalide',
  'profile-import.unexpected-format': 'Format inattendu',
  'profile-import.unknown-version':
    'Version d’export non reconnue (mise à jour de markpage nécessaire ?)',
  'profile-import.missing-fields': 'Champ "name" ou "settings" manquant',

  // ---- custom-fonts ------------------------------------------------
  'fonts.custom-fonts-label': 'Polices Google personnalisées',
  'fonts.custom-fonts-empty': 'Aucune pour le moment.',
  'fonts.custom-fonts-add': 'Ajouter',
  'fonts.custom-fonts-already-added': 'Déjà ajoutée.',
  'fonts.custom-fonts-invalid-url': 'URL invalide',
  'fonts.custom-fonts-bad-host': 'Doit pointer vers fonts.googleapis.com',
  'fonts.custom-fonts-no-family': 'Aucun paramètre "family=" dans l’URL',
} as const;

// EN must declare exactly the same keys. Typed via `Record<keyof typeof
// FR, string>` so a missing or surplus key fails the build.
const EN: Record<keyof typeof FR, string> = {
  // ---- toolbar ------------------------------------------------------
  'toolbar.docs-title': 'Documents',
  'toolbar.import': 'Import',
  'toolbar.import-title':
    'Import a file (.md / .docx / .html / .txt) as a new document (Ctrl+O / Cmd+O)',
  'toolbar.preview': 'Preview',
  'toolbar.preview-title':
    'Toggle between editor and preview (Ctrl+Enter / Cmd+Enter)',
  'toolbar.style': 'Style',
  'toolbar.style-title': 'Formatting (headings, bold, lists…)',
  'toolbar.help': 'Help',
  'toolbar.export': 'Export',
  'toolbar.settings': 'Settings',
  'toolbar.settings-title': 'Open the settings panel (Ctrl+, / Cmd+,)',

  // ---- doc menu -----------------------------------------------------
  'doc-menu.new': '+ New document',
  'doc-menu.rename': 'Rename',
  'doc-menu.duplicate': 'Duplicate',
  'doc-menu.delete': 'Delete',
  'doc-menu.delete-confirm': 'Delete “{name}”?',

  // ---- profile menu -------------------------------------------------
  'profile-menu.new': '+ New profile',
  'profile-menu.duplicate': 'Duplicate',
  'profile-menu.delete': 'Delete',
  'profile-menu.delete-confirm': 'Delete the “{name}” profile?',
  'profile-menu.reset': 'Reset',
  'profile-menu.reset-confirm':
    'Revert this profile to the default settings? The name is kept.',
  'profile-menu.import': 'Import…',
  'profile-menu.export': 'Export…',
  'profile-menu.import-failed': 'Profile import failed: {error}',

  // ---- export menu --------------------------------------------------
  'export-menu.markdown': 'Markdown (.md)',
  'export-menu.pdf': 'PDF (.pdf)',
  'export-menu.latex': 'LaTeX (.tex)',

  // ---- settings form ------------------------------------------------
  'settings.window-title': 'markpage settings',
  'settings.h1': 'Settings',
  'settings.section.author-date': 'Author and date',
  'settings.section.page': 'Page',
  'settings.section.fonts': 'Fonts',
  'settings.section.margins': 'Margins (mm)',
  'settings.section.spacing': 'Spacing',
  'settings.section.headings': 'Headings',
  'settings.section.body': 'Body',
  'settings.section.page-number': 'Page number',
  'settings.section.mermaid': 'Mermaid diagrams',
  'settings.section.ui-language': 'Interface language',

  // ---- help window --------------------------------------------------
  'help.window-title': 'markpage help',
  'help.title-suffix': 'Help',
  'help.close': 'Close',
  'help.export-pdf': 'Export .pdf',

  // ---- profile / settings import-export errors ---------------------
  'profile-import.invalid-json': 'Invalid JSON',
  'profile-import.unexpected-format': 'Unexpected format',
  'profile-import.unknown-version':
    'Unrecognised export version (markpage update needed?)',
  'profile-import.missing-fields': 'Missing "name" or "settings" field',

  // ---- custom-fonts ------------------------------------------------
  'fonts.custom-fonts-label': 'Custom Google fonts',
  'fonts.custom-fonts-empty': 'None yet.',
  'fonts.custom-fonts-add': 'Add',
  'fonts.custom-fonts-already-added': 'Already added.',
  'fonts.custom-fonts-invalid-url': 'Invalid URL',
  'fonts.custom-fonts-bad-host': 'Must point at fonts.googleapis.com',
  'fonts.custom-fonts-no-family': 'No "family=" parameter in the URL',
};

const STRINGS = { fr: FR, en: EN } as const;

export type StringKey = keyof typeof FR;

// Returns the translated string for `key` in the active UI locale,
// with `{placeholder}` tokens replaced by the matching values in
// `params`. Falls back to English if the key happens to be missing
// from the active locale (defensive — the type guarantee should
// prevent this).
export function t(key: StringKey, params?: Record<string, string>): string {
  const lang = getLanguage();
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? (key as string);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, v);
    }
  }
  return s;
}
