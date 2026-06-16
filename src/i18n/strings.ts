/********************************* strings.ts **********************************
 *
 * Purpose: Single source of truth for every user-facing string + the `t(key)`
 *   accessor used everywhere in the UI.
 * How: Flat per-locale records keyed by dotted namespaces; EN typed against
 *   the FR keyset so missing / surplus keys fail the build.
 *
 *******************************************************************************/

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
  'toolbar.present': 'Présenter',
  'toolbar.present-title':
    'Lancer la présentation plein écran (Ctrl+Maj+Entrée / Cmd+Maj+Entrée)',
  'toolbar.guides': 'Guides',
  'toolbar.guides-title':
    'Afficher les guides typographiques sur l’aperçu : zone imprimable, live area, diagonales du canon (Cmd/Ctrl+Maj+G)',
  'toolbar.style': 'Style',
  'toolbar.style-title': 'Mise en forme (titres, gras, listes…)',
  'toolbar.help': 'Aide',
  'toolbar.help-title': 'Ouvrir le tutoriel',
  'toolbar.export': 'Exporter',
  'toolbar.export-title': 'Exporter le document (Markdown ou PDF)',
  'toolbar.settings': 'Réglages',
  'toolbar.settings-title': 'Ouvrir le panneau de réglages (Ctrl+, / Cmd+,)',
  'toolbar.modified-title': 'Modifications non enregistrées',
  'toolbar.file': 'Fichier',
  'toolbar.file-title': 'Document, import, export…',
  'toolbar.doc-name-aria': 'Nom du document',
  'toolbar.linked-title': 'Lié à un dossier sur le disque',
  // ---- file menu ----------------------------------------------------
  'file-menu.new': 'Nouveau document',
  'file-menu.open': 'Ouvrir…',
  'file-menu.files': 'Fichiers…',
  'file-menu.save': 'Enregistrer',
  'file-menu.save-as': 'Enregistrer sous…',
  'file-menu.revert': 'Annuler les modifications',
  'file-menu.import': 'Importer…',
  'file-menu.open-disk': 'Ouvrir depuis le disque…',
  'file-menu.link-folder': 'Lier à un dossier…',
  'file-menu.reload-disk': 'Recharger depuis le disque…',
  'file-menu.unlink': 'Délier du disque',
  // ---- disk link (Phase 4) ------------------------------------------
  'disk.overwrite-confirm':
    'Le dossier « {name} » contient déjà un document. L’écraser avec le document courant ?',
  'disk.write-failed': 'Écriture sur le disque impossible.',
  'disk.read-failed': 'Lecture depuis le disque impossible.',
  'disk.permission-denied': 'Permission d’accès au dossier refusée.',

  // ---- doc menu -----------------------------------------------------
  'doc-menu.new': '+ Nouveau document',
  'doc-menu.rename': 'Renommer',
  'doc-menu.reload': 'Recharger',
  'doc-menu.reload-title': 'Remplacer le contenu par un fichier sur disque',
  'doc-menu.duplicate': 'Dupliquer',
  'doc-menu.delete': 'Supprimer',
  'doc-menu.delete-confirm': 'Supprimer « {name} » ?',
  'doc-menu.save': 'Enregistrer',
  'doc-menu.save-title': 'Enregistrer les modifications (Ctrl+S / Cmd+S)',
  'doc-menu.save-as': 'Enregistrer sous…',
  'doc-menu.revert': 'Annuler les modifications',
  'doc-menu.revert-confirm':
    'Annuler les modifications non enregistrées et revenir à la dernière version enregistrée ?',

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
  'import.failed': 'Échec de l’import : {msg}',
  'latex-export.failed': 'Échec de l’export LaTeX : {msg}',
  'default.help-doc-name': 'Aide markpage',
  'default.new-profile-name': 'Nouveau profil',
  'profile.default-name': 'Par défaut',

  // ---- export menu --------------------------------------------------
  'export-menu.markdown': 'Markdown (.md)',
  'export-menu.pdf': 'PDF (.pdf)',
  'export-menu.latex': 'LaTeX (.tex)',
  'export-menu.onedrive': 'OneDrive…',
  'onedrive.uploaded': 'Document envoyé sur OneDrive (dossier Apps/markpage).',
  'onedrive.uploaded-with-link':
    'Document envoyé sur OneDrive. Lien de partage copié dans le presse-papier.',
  'onedrive.uploaded-link-shown':
    'Document envoyé sur OneDrive. Lien de partage : {url}',
  'onedrive.failed': 'Échec OneDrive : {msg}',
  'export-menu.share-link': 'Copier le lien de partage',
  'export-menu.share-email': 'Envoyer par email',
  // ---- open… picker -------------------------------------------------
  'open.title': 'Ouvrir un document',
  'open.search': 'Rechercher…',
  'open.empty': 'Aucun document',
  'open.close': 'Fermer',
  // ---- files… manager ----------------------------------------------
  'files.title': 'Fichiers',
  'files.close': 'Fermer',
  'files.new': '+ Nouveau',
  'files.import': 'Importer…',
  'files.search': 'Rechercher…',
  'files.empty': 'Aucun document',
  'files.open': 'Ouvrir',
  'files.trash': 'Corbeille',
  'files.restore': 'Restaurer',
  'files.purge': 'Supprimer définitivement',
  'files.empty-trash': 'Vider la corbeille',
  'files.rename-prompt': 'Nouveau nom du document :',
  'files.purge-confirm':
    'Supprimer définitivement « {name} » ? Cette action est irréversible.',
  'files.empty-confirm':
    'Vider la corbeille ? Les documents seront supprimés définitivement.',
  'share.link-copied':
    'Lien de partage copié dans le presse-papier. Le destinataire ouvre le lien dans son navigateur et le document s’importe dans son éditeur.',
  'share.link-shown': 'Lien de partage : {url}',
  'share.failed': 'Échec du partage : {msg}',
  'share.too-large':
    'Document trop volumineux pour un lien URL ({size} caractères, max {max}). Utilise plutôt l’export OneDrive pour les gros documents.',
  'share.email-body': 'Voici le document : {url}',
  'share.imported-doc-name': 'Document partagé',
  'share.import-failed': 'Échec de l’import du lien : {msg}',

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
  'settings.section.mermaid': 'Diagrammes Mermaid',
  'settings.section.math': 'Formules mathématiques',
  'settings.section.ui-language': 'Interface',
  'settings.field.doc-language': 'Langue du document',
  'settings.section.page-format': 'Format de page',

  // ---- layout section (SPEC §9.5 / §9.6 / §9.7) --------------------
  'settings.section.layout': 'Mise en page',
  'settings.field.preset': 'Préréglage',
  'settings.field.duplex': 'Recto-verso',
  'settings.field.chapter-break': 'Saut avant chapitre',
  'settings.field.chapter-break.none': 'Aucun',
  'settings.field.chapter-break.next-page': 'Nouvelle page',
  'settings.field.chapter-break.next-recto': 'Page recto suivante',
  'settings.field.margin-mode': 'Mode des marges',
  'settings.field.margin-mode.manual': 'Manuel (4 sliders)',
  'settings.field.margin-mode.derived': 'Dérivé (canon Van de Graaf)',
  'settings.field.measure-chars': 'Mesure du texte (caractères / ligne)',
  'settings.field.live-area-chars': 'Mesure de la live area (caractères / ligne)',
  'settings.field.notes-position': 'Position des notes',
  'settings.field.notes-position.foot': 'Bas de page',
  'settings.field.notes-position.side': 'En marge (Tufte)',
  'settings.field.notes-position.end': 'Fin du document',
  'settings.preset.none': '— Personnalisé —',
  'settings.preset.tech-note': 'Note technique',
  'settings.preset.report': 'Rapport',
  'settings.preset.paper': 'Article scientifique',
  'settings.preset.book': 'Livre relié',
  'settings.preset.critical': 'Édition critique',

  // ---- help window --------------------------------------------------
  'help.window-title': 'Aide markpage',
  'help.title-suffix': 'Aide',
  'help.close': 'Fermer',
  'help.export-pdf': 'Exporter .pdf',
  'help.generating': 'Génération…',
  'help.toc': 'Sommaire',

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

  // ---- style menu --------------------------------------------------
  'style-menu.normal': 'Normal',
  'style-menu.h1': 'Titre 1',
  'style-menu.h2': 'Titre 2',
  'style-menu.h3': 'Titre 3',
  'style-menu.h4': 'Titre 4',
  'style-menu.bold': 'Gras',
  'style-menu.italic': 'Italique',
  'style-menu.code': 'Code en ligne',
  'style-menu.bullet': 'Liste à puces',
  'style-menu.numbered': 'Liste numérotée',
  'style-menu.quote': 'Citation',
  'style-menu.link': 'Insérer un lien…',
  'style-menu.image': 'Insérer une image…',
  'style-menu.numbering': 'Numéroter les sections',
  'style-menu.format-tables': 'Reformater les tableaux',

  // ---- help modal --------------------------------------------------
  'help.aria-label': 'Aide',

  // ---- date modes --------------------------------------------------
  'date.none': 'Pas de date',
  'date.today': 'Date du jour',
  'date.custom': 'Date personnalisée',
  'date.field-label': 'Date',

  // ---- settings field labels ---------------------------------------
  'settings.field.author': 'Auteur',
  'settings.field.organization': 'Organisation',
  'settings.field.page-size': 'Format',
  'settings.field.justify': 'Justifier le texte',
  'settings.field.line-height': 'Interligne',
  'settings.field.font-pack': 'Pack assorti',
  'font-pack.custom': 'Personnalisé',
  'font-pack.roboto-condensed': 'Roboto Condensed + NewCM',
  'font-pack.fira': 'Fira Sans + Fira Math',
  'font-pack.stix2': 'STIX Two + STIX Math',
  'settings.field.font-headings': 'Titres',
  'settings.field.font-body': 'Corps',
  'settings.field.font-code': 'Code',
  'settings.field.margin-top': 'Haut',
  'settings.field.margin-bottom': 'Bas',
  'settings.field.margin-left': 'Gauche',
  'settings.field.margin-right': 'Droite',
  'settings.field.heading-spacing-above': 'Au-dessus des titres',
  'settings.field.heading-spacing-below': 'En dessous des titres',
  'settings.field.paragraph-spacing': 'Entre paragraphes',
  'settings.field.h1': 'Titre 1 (h1)',
  'settings.field.h2': 'Titre 2 (h2)',
  'settings.field.h3': 'Titre 3 (h3)',
  'settings.field.h4': 'Titre 4 (h4)',
  'settings.field.body-text': 'Texte normal',
  'settings.field.code-text': 'Code',
  'settings.field.quote': 'Citation',
  'settings.field.quote-bar': 'Barre de citation',
  'settings.field.position': 'Position',
  'settings.field.size-pt': 'Taille (pt)',
  'settings.field.italic': 'Italique',
  'settings.field.color': 'Couleur',
  'settings.field.mermaid-scale': 'Agrandissement max.',
  'settings.field.mermaid-width': 'Largeur max. (% du texte)',
  'settings.field.mermaid-height': 'Hauteur max. (% du texte)',
  'settings.field.math-scale': 'Échelle des formules (%)',
  'settings.field.header-default': 'En-tête par défaut',
  'settings.field.header-default-placeholder': 'gauche | centre | droite',
  'settings.field.footer-default': 'Pied de page par défaut',
  'settings.field.footer-default-placeholder': '| {page} |',
  'settings.field.math-font-set': 'Police des formules',
  'math-font-set.newcm': 'NewComputerModern (serif)',
  'math-font-set.fira': 'Fira Math (sans-serif)',
  'math-font-set.stix2': 'STIX 2 (serif)',
  'math-font-set.asana': 'Asana Math (serif)',
  'math-font-set.tex': 'TeX classique',
  // ---- settings rail navigation groups -----------------------------
  'rail.group.app': 'Application',
  'rail.group.document': 'Document',
  'rail.group.typography': 'Typographie',
  'rail.group.content': 'Contenu',
  // ---- per-element matrix labels -----------------------------------
  'element.body': 'Texte normal',
  'element.title': 'Titre du document',
  'element.h1': 'Titre 1 (h1)',
  'element.h2': 'Titre 2 (h2)',
  'element.h3': 'Titre 3 (h3)',
  'element.h4': 'Titre 4 (h4)',
  'element.code-inline': 'Code en ligne',
  'element.inline-link': 'Lien hypertexte',
  'element.metadata': 'Métadonnées (auteur, date)',
  'element.code-block': 'Bloc de code',
  'element.quote': 'Citation',
  'element.math-block': 'Formule en bloc',
  'element.mermaid': 'Diagramme Mermaid',
  'element.callout': 'Encadré (callout)',
  'element.table': 'Tableau',
  'element.caption': 'Légende (caption)',
  'element.running-content': 'En-tête / pied de page',
  // ---- per-attribute labels (matrix columns) -----------------------
  'attr.family': 'Police',
  'attr.fontSize': 'Taille (pt)',
  'attr.color': 'Couleur',
  'attr.weight': 'Graisse',
  'attr.italic': 'Italique',
  'attr.underline': 'Souligner',
  'attr.align': 'Alignement',
  'attr.marginAbove': 'Marge avant (em)',
  'attr.marginBelow': 'Marge après (em)',
  'attr.lineHeight': 'Interligne',
  'attr.padding': 'Padding (em)',
  'attr.background': 'Couleur de fond',
  'attr.borders': 'Bordures',
  'attr.borderColor': 'Couleur bordure',
  'attr.borderWidth': 'Épaisseur bordure (px)',
  'attr.borderRadius': 'Arrondi (px)',
  'attr.inherited': 'Hérité',
  // ---- align options -----------------------------------------------
  'align.left': 'Gauche',
  'align.center': 'Centré',
  'align.right': 'Droite',
  'align.justify': 'Justifié',
  'settings.field.ui-language': 'Langue',
  'settings.field.editor-font': 'Police de l’éditeur',
  'settings.field.editor-text-color': 'Couleur du texte',
  'editor-font.sans': 'Sans-serif (Roboto)',
  'editor-font.mono': 'Monospace (Roboto Mono)',
  'editor-font.serif': 'Serif (Georgia)',
  'settings.metadata.show': 'Afficher',
  'settings.metadata.bold': 'Gras',
  'settings.style-row.weight-title': 'Graisse',
  'settings.style-row.italic-title': 'Italique',
  'settings.style-row.underline': 'trait',
  'settings.style-row.underline-title': 'Trait sous le titre',
  'settings.unit.pt': 'pt',
  'settings.custom-fonts-placeholder':
    'https://fonts.googleapis.com/css2?family=…',

  // ---- weight options (dropdown) -----------------------------------
  'weight.300': 'Light (300)',
  'weight.400': 'Regular (400)',
  'weight.500': 'Medium (500)',
  'weight.600': 'Semibold (600)',
  'weight.700': 'Bold (700)',
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
  'toolbar.present': 'Present',
  'toolbar.present-title':
    'Start the fullscreen presentation (Ctrl+Shift+Enter / Cmd+Shift+Enter)',
  'toolbar.guides': 'Guides',
  'toolbar.guides-title':
    'Toggle typographic guides on the preview: page area, live area, Van de Graaf diagonals (Cmd/Ctrl+Shift+G)',
  'toolbar.style': 'Style',
  'toolbar.style-title': 'Formatting (headings, bold, lists…)',
  'toolbar.help': 'Help',
  'toolbar.help-title': 'Open the tutorial',
  'toolbar.export': 'Export',
  'toolbar.export-title': 'Export the document (Markdown or PDF)',
  'toolbar.settings': 'Settings',
  'toolbar.settings-title': 'Open the settings panel (Ctrl+, / Cmd+,)',
  'toolbar.modified-title': 'Unsaved changes',
  'toolbar.file': 'File',
  'toolbar.file-title': 'Document, import, export…',
  'toolbar.doc-name-aria': 'Document name',
  'toolbar.linked-title': 'Linked to a folder on disk',
  'file-menu.new': 'New document',
  'file-menu.open': 'Open…',
  'file-menu.files': 'Files…',
  'file-menu.save': 'Save',
  'file-menu.save-as': 'Save As…',
  'file-menu.revert': 'Revert changes',
  'file-menu.import': 'Import…',
  'file-menu.open-disk': 'Open from disk…',
  'file-menu.link-folder': 'Link to a folder…',
  'file-menu.reload-disk': 'Reload from disk…',
  'file-menu.unlink': 'Unlink from disk',
  'disk.overwrite-confirm':
    'The folder “{name}” already contains a document. Overwrite it with the current document?',
  'disk.write-failed': 'Could not write to disk.',
  'disk.read-failed': 'Could not read from disk.',
  'disk.permission-denied': 'Folder access permission denied.',

  // ---- doc menu -----------------------------------------------------
  'doc-menu.new': '+ New document',
  'doc-menu.rename': 'Rename',
  'doc-menu.reload': 'Reload',
  'doc-menu.reload-title': 'Replace the content with a file from disk',
  'doc-menu.duplicate': 'Duplicate',
  'doc-menu.delete': 'Delete',
  'doc-menu.delete-confirm': 'Delete “{name}”?',
  'doc-menu.save': 'Save',
  'doc-menu.save-title': 'Save changes (Ctrl+S / Cmd+S)',
  'doc-menu.save-as': 'Save As…',
  'doc-menu.revert': 'Discard changes',
  'doc-menu.revert-confirm':
    'Discard unsaved changes and return to the last saved version?',

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
  'import.failed': 'Import failed: {msg}',
  'latex-export.failed': 'LaTeX export failed: {msg}',
  'default.help-doc-name': 'markpage Help',
  'default.new-profile-name': 'New profile',
  'profile.default-name': 'Default',

  // ---- export menu --------------------------------------------------
  'export-menu.markdown': 'Markdown (.md)',
  'export-menu.pdf': 'PDF (.pdf)',
  'export-menu.latex': 'LaTeX (.tex)',
  'export-menu.onedrive': 'OneDrive…',
  'onedrive.uploaded': 'Document uploaded to OneDrive (folder Apps/markpage).',
  'onedrive.uploaded-with-link':
    'Document uploaded to OneDrive. Share link copied to clipboard.',
  'onedrive.uploaded-link-shown':
    'Document uploaded to OneDrive. Share link: {url}',
  'onedrive.failed': 'OneDrive upload failed: {msg}',
  'export-menu.share-link': 'Copy share link',
  'export-menu.share-email': 'Send by email',
  'open.title': 'Open a document',
  'open.search': 'Search…',
  'open.empty': 'No document',
  'open.close': 'Close',
  'files.title': 'Files',
  'files.close': 'Close',
  'files.new': '+ New',
  'files.import': 'Import…',
  'files.search': 'Search…',
  'files.empty': 'No document',
  'files.open': 'Open',
  'files.trash': 'Trash',
  'files.restore': 'Restore',
  'files.purge': 'Delete permanently',
  'files.empty-trash': 'Empty trash',
  'files.rename-prompt': 'New document name:',
  'files.purge-confirm': 'Permanently delete “{name}”? This cannot be undone.',
  'files.empty-confirm':
    'Empty the trash? Documents will be permanently deleted.',
  'share.link-copied':
    'Share link copied to clipboard. The recipient opens the link in their browser and the document is imported into their editor.',
  'share.link-shown': 'Share link: {url}',
  'share.failed': 'Share failed: {msg}',
  'share.too-large':
    'Document too large for a URL share ({size} chars, max {max}). Use the OneDrive export for big documents.',
  'share.email-body': 'Here is the document: {url}',
  'share.imported-doc-name': 'Shared document',
  'share.import-failed': 'Share import failed: {msg}',

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
  'settings.section.mermaid': 'Mermaid diagrams',
  'settings.section.math': 'Math formulas',
  'settings.section.ui-language': 'Interface',
  'settings.field.doc-language': 'Document language',
  'settings.section.page-format': 'Page format',

  // ---- layout section (SPEC §9.5 / §9.6 / §9.7) --------------------
  'settings.section.layout': 'Layout',
  'settings.field.preset': 'Preset',
  'settings.field.duplex': 'Duplex (recto-verso)',
  'settings.field.chapter-break': 'Chapter break before h1',
  'settings.field.chapter-break.none': 'None',
  'settings.field.chapter-break.next-page': 'New page',
  'settings.field.chapter-break.next-recto': 'Next recto page',
  'settings.field.margin-mode': 'Margin mode',
  'settings.field.margin-mode.manual': 'Manual (4 sliders)',
  'settings.field.margin-mode.derived': 'Derived (Van de Graaf canon)',
  'settings.field.measure-chars': 'Text measure (chars / line)',
  'settings.field.live-area-chars': 'Live area measure (chars / line)',
  'settings.field.notes-position': 'Notes placement',
  'settings.field.notes-position.foot': 'Footnotes',
  'settings.field.notes-position.side': 'Sidenotes (Tufte)',
  'settings.field.notes-position.end': 'Endnotes',
  'settings.preset.none': '— Custom —',
  'settings.preset.tech-note': 'Tech note',
  'settings.preset.report': 'Report',
  'settings.preset.paper': 'Scientific paper',
  'settings.preset.book': 'Bound book',
  'settings.preset.critical': 'Critical edition',

  // ---- help window --------------------------------------------------
  'help.window-title': 'markpage help',
  'help.title-suffix': 'Help',
  'help.close': 'Close',
  'help.export-pdf': 'Export .pdf',
  'help.generating': 'Generating…',
  'help.toc': 'Contents',

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

  // ---- style menu --------------------------------------------------
  'style-menu.normal': 'Normal',
  'style-menu.h1': 'Heading 1',
  'style-menu.h2': 'Heading 2',
  'style-menu.h3': 'Heading 3',
  'style-menu.h4': 'Heading 4',
  'style-menu.bold': 'Bold',
  'style-menu.italic': 'Italic',
  'style-menu.code': 'Inline code',
  'style-menu.bullet': 'Bullet list',
  'style-menu.numbered': 'Numbered list',
  'style-menu.quote': 'Quote',
  'style-menu.link': 'Insert link…',
  'style-menu.image': 'Insert image…',
  'style-menu.numbering': 'Number sections',
  'style-menu.format-tables': 'Reformat tables',

  // ---- help modal --------------------------------------------------
  'help.aria-label': 'Help',

  // ---- date modes --------------------------------------------------
  'date.none': 'No date',
  'date.today': 'Today’s date',
  'date.custom': 'Custom date',
  'date.field-label': 'Date',

  // ---- settings field labels ---------------------------------------
  'settings.field.author': 'Author',
  'settings.field.organization': 'Organisation',
  'settings.field.page-size': 'Size',
  'settings.field.justify': 'Justify text',
  'settings.field.line-height': 'Line height',
  'settings.field.font-pack': 'Matching pack',
  'font-pack.custom': 'Custom',
  'font-pack.roboto-condensed': 'Roboto Condensed + NewCM',
  'font-pack.fira': 'Fira Sans + Fira Math',
  'font-pack.stix2': 'STIX Two + STIX Math',
  'settings.field.font-headings': 'Headings',
  'settings.field.font-body': 'Body',
  'settings.field.font-code': 'Code',
  'settings.field.margin-top': 'Top',
  'settings.field.margin-bottom': 'Bottom',
  'settings.field.margin-left': 'Left',
  'settings.field.margin-right': 'Right',
  'settings.field.heading-spacing-above': 'Above headings',
  'settings.field.heading-spacing-below': 'Below headings',
  'settings.field.paragraph-spacing': 'Between paragraphs',
  'settings.field.h1': 'Heading 1 (h1)',
  'settings.field.h2': 'Heading 2 (h2)',
  'settings.field.h3': 'Heading 3 (h3)',
  'settings.field.h4': 'Heading 4 (h4)',
  'settings.field.body-text': 'Body text',
  'settings.field.code-text': 'Code',
  'settings.field.quote': 'Quote',
  'settings.field.quote-bar': 'Quote bar',
  'settings.field.position': 'Position',
  'settings.field.size-pt': 'Size (pt)',
  'settings.field.italic': 'Italic',
  'settings.field.color': 'Colour',
  'settings.field.mermaid-scale': 'Max upscale',
  'settings.field.mermaid-width': 'Max width (% of text)',
  'settings.field.mermaid-height': 'Max height (% of text)',
  'settings.field.math-scale': 'Formula scale (%)',
  'settings.field.header-default': 'Default header',
  'settings.field.header-default-placeholder': 'left | centre | right',
  'settings.field.footer-default': 'Default footer',
  'settings.field.footer-default-placeholder': '| {page} |',
  'settings.field.math-font-set': 'Math font',
  'math-font-set.newcm': 'NewComputerModern (serif)',
  'math-font-set.fira': 'Fira Math (sans-serif)',
  'math-font-set.stix2': 'STIX 2 (serif)',
  'math-font-set.asana': 'Asana Math (serif)',
  'math-font-set.tex': 'Classic TeX',
  // ---- settings rail navigation groups -----------------------------
  'rail.group.app': 'Application',
  'rail.group.document': 'Document',
  'rail.group.typography': 'Typography',
  'rail.group.content': 'Content',
  // ---- per-element matrix labels -----------------------------------
  'element.body': 'Body text',
  'element.title': 'Document title',
  'element.h1': 'Heading 1 (h1)',
  'element.h2': 'Heading 2 (h2)',
  'element.h3': 'Heading 3 (h3)',
  'element.h4': 'Heading 4 (h4)',
  'element.code-inline': 'Inline code',
  'element.inline-link': 'Hyperlink',
  'element.metadata': 'Metadata (author, date)',
  'element.code-block': 'Code block',
  'element.quote': 'Blockquote',
  'element.math-block': 'Block formula',
  'element.mermaid': 'Mermaid diagram',
  'element.callout': 'Callout',
  'element.table': 'Table',
  'element.caption': 'Caption',
  'element.running-content': 'Header / footer',
  // ---- per-attribute labels (matrix columns) -----------------------
  'attr.family': 'Font',
  'attr.fontSize': 'Size (pt)',
  'attr.color': 'Colour',
  'attr.weight': 'Weight',
  'attr.italic': 'Italic',
  'attr.underline': 'Underline',
  'attr.align': 'Alignment',
  'attr.marginAbove': 'Margin above (em)',
  'attr.marginBelow': 'Margin below (em)',
  'attr.lineHeight': 'Line height',
  'attr.padding': 'Padding (em)',
  'attr.background': 'Background',
  'attr.borders': 'Borders',
  'attr.borderColor': 'Border colour',
  'attr.borderWidth': 'Border width (px)',
  'attr.borderRadius': 'Border radius (px)',
  'attr.inherited': 'Inherited',
  // ---- align options -----------------------------------------------
  'align.left': 'Left',
  'align.center': 'Center',
  'align.right': 'Right',
  'align.justify': 'Justify',
  'settings.field.ui-language': 'Language',
  'settings.field.editor-font': 'Editor font',
  'settings.field.editor-text-color': 'Text colour',
  'editor-font.sans': 'Sans-serif (Roboto)',
  'editor-font.mono': 'Monospace (Roboto Mono)',
  'editor-font.serif': 'Serif (Georgia)',
  'settings.metadata.show': 'Show',
  'settings.metadata.bold': 'Bold',
  'settings.style-row.weight-title': 'Weight',
  'settings.style-row.italic-title': 'Italic',
  'settings.style-row.underline': 'rule',
  'settings.style-row.underline-title': 'Rule below the heading',
  'settings.unit.pt': 'pt',
  'settings.custom-fonts-placeholder':
    'https://fonts.googleapis.com/css2?family=…',

  // ---- weight options (dropdown) -----------------------------------
  'weight.300': 'Light (300)',
  'weight.400': 'Regular (400)',
  'weight.500': 'Medium (500)',
  'weight.600': 'Semibold (600)',
  'weight.700': 'Bold (700)',
};

const STRINGS = { fr: FR, en: EN } as const;

export type StringKey = keyof typeof FR;

/**
 * Purpose: Translate `key` in the active locale, with `{placeholder}` interpolation.
 * How: Look up `STRINGS[lang][key]` with EN fallback, then `replaceAll` each param.
 */
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
