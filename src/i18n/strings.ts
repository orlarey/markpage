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
// (`'toolbar.file'`, `'docstyle.export'`). `t(key,
// params?)` walks the active locale, falls back to English, and
// interpolates `{name}` placeholders if any. Type-safety is enforced
// by typing the EN record against the FR keyset: a key present in FR
// but missing in EN (or vice-versa) is a compile-time error.

import { getLanguage } from './locale';

const FR = {
  // ---- toolbar ------------------------------------------------------
  'toolbar.preview': 'Aperçu',
  'preview-toggle.show': 'Aperçu',
  'preview-toggle.show-title':
    'Afficher / masquer l’aperçu en direct (Ctrl+Entrée / Cmd+Entrée)',
  'preview-toggle.paginate': 'Pages',
  'preview-toggle.paginate-title': 'Aperçu : flux continu ↔ pages paginées',
  'preview-toggle.repaginate': 'Repaginer',
  'preview-toggle.repaginate-title':
    'Aperçu paginé suspendu pendant l’édition — cliquer pour repaginer',
  'toolbar.present': 'Présenter',
  'toolbar.guides': 'Guides',
  'toolbar.style': 'Format',
  'toolbar.style-title': 'Mise en forme (titres, gras, listes…)',
  'toolbar.docstyle': 'Style',
  'toolbar.docstyle-title': 'Style du document — bibliothèque de styles nommés',
  'docstyle.export': 'Exporter le style courant…',
  'docstyle.import': 'Importer un style…',
  'docstyle.user-tag': 'perso',
  'docstyle.exported': 'Style exporté (fichier .mpstyle.json).',
  'docstyle.import-none': "Ce fichier n'est pas un style markpage valide.",
  'docstyle.imported': 'Style « {name} » importé et appliqué au document.',
  'docstyle.delete': 'Supprimer ce style perso',
  'docstyle.delete-confirm':
    'Supprimer le style perso « {name} » de la bibliothèque ?',
  'toolbar.view': 'Vue',
  'toolbar.view-title': 'Affichage : aperçu, présentation, repères',
  'toolbar.menu': 'Menu',
  'toolbar.menu-title': 'Tous les menus',
  'toolbar.help': 'Aide',
  'toolbar.help-title': 'Ouvrir le tutoriel',
  'toolbar.modified-title': 'Modifications non enregistrées',
  'toolbar.file': 'Fichier',
  'toolbar.file-title': 'Document, import, export…',
  'toolbar.doc-name-aria': 'Nom du document',
  'toolbar.conflict-title':
    'Conflit : modifié des deux côtés — cliquer pour résoudre',
  // ---- file menu ----------------------------------------------------
  'file-menu.new': 'Nouveau document',
  'file-menu.open': 'Ouvrir…',
  'file-menu.save': 'Enregistrer',
  'file-menu.save-as': 'Enregistrer sous…',
  'file-menu.revert': 'Annuler les modifications',
  'file-menu.reload': 'Recharger',
  'file-menu.unlink-origin': 'Délier',
  'file-menu.delete-doc': 'Mettre à la corbeille…',
  // ---- disk link (Phase 4) ------------------------------------------
  'disk.read-failed': 'Lecture depuis le disque impossible.',
  'disk.permission-denied': 'Permission d’accès au dossier refusée.',
  'disk.reload-confirm':
    'Ce document a des modifications non enregistrées. Les remplacer par la version du disque ?',
  'conflict.keep-mine': 'Garder ma version (écrase le disque)',
  'conflict.take-disk': 'Prendre le disque (écrase mes modifs)',

  // ---- import / export errors -------------------------------------
  'import.failed': 'Échec de l’import : {msg}',
  'latex-export.failed': 'Échec de l’export LaTeX : {msg}',
  'default.help-doc-name': 'Aide markpage',

  // ---- export menu --------------------------------------------------
  'export-menu.markdown': 'Markdown (.md)',
  'export-menu.pdf': 'PDF (.pdf)',
  'export-menu.latex': 'LaTeX (.tex)',
  'export-menu.share-link': 'Copier le lien de partage',
  'export-menu.share-email': 'Envoyer par email',
  'open.close': 'Fermer',
  // ---- share link ---------------------------------------------------
  'share.link-copied':
    'Lien de partage copié dans le presse-papier. Le destinataire ouvre le lien dans son navigateur et le document s’importe dans son éditeur.',
  'share.link-shown': 'Lien de partage : {url}',
  'share.failed': 'Échec du partage : {msg}',
  'share.too-large':
    'Document trop volumineux pour un lien URL ({size} caractères, max {max}). Utilise plutôt l’export OneDrive pour les gros documents.',
  'share.email-body': 'Voici le document : {url}',
  'share.imported-doc-name': 'Document partagé',
  'share.import-failed': 'Échec de l’import du lien : {msg}',

  // ---- help window --------------------------------------------------
  'help.window-title': 'Aide markpage',
  'help.title-suffix': 'Aide',
  'help.close': 'Fermer',
  'help.export-pdf': 'Exporter .pdf',
  'help.generating': 'Génération…',
  'help.toc': 'Sommaire',

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
  'style-menu.numbering': 'Numéroter les sections',
  'style-menu.format-tables': 'Reformater les tableaux',
  'toolbar.insert': 'Insérer',
  'toolbar.insert-title': 'Ajouter un élément : image, tableau, encadré, formule, diagramme…',
  'format.group.document': 'Tout le document',
  'edit.cut': 'Couper',
  'edit.copy': 'Copier',
  'edit.paste': 'Coller',
  'edit.paste-denied': 'Le navigateur bloque le collage depuis ce menu : utilisez {key}.',
  'insert.doc-meta': 'Titre, auteur et date',
  'insert.image': 'Image…',
  'insert.mosaic': 'Mur d’images…',
  'insert.link': 'Lien…',
  'insert.group.table': 'Tableau',
  'insert.table': 'Tableau simple',
  'insert.csv': 'Tableau de données (CSV)',
  'insert.group.callout': 'Encadré',
  'insert.note': 'Note',
  'insert.tip': 'Astuce',
  'insert.warning': 'Attention',
  'insert.caution': 'Danger',
  'insert.important': 'Important',
  'insert.academic': 'Style académique',
  'insert.theorem': 'Théorème',
  'insert.definition': 'Définition',
  'insert.proof': 'Démonstration',
  'insert.example': 'Exemple',
  'insert.remark': 'Remarque',
  'insert.group.math': 'Mathématiques',
  'insert.inline-math': 'Formule dans le texte',
  'insert.display-math': 'Formule centrée',
  'insert.inference': 'Règle d’inférence',
  'insert.group.diagram': 'Diagramme',
  'insert.flowchart': 'Schéma (étapes et flèches)',
  'insert.chart-line': 'Graphique en courbes',
  'insert.chart-bar': 'Graphique en barres',
  'insert.tree': 'Arborescence (texte)',
  'insert.tree-svg': 'Arborescence (dessin)',
  'insert.category': 'Diagramme commutatif',
  'insert.bda': 'Circuit Faust (BDA)',
  'insert.ebnf': 'Grammaire (EBNF)',
  'insert.adt': 'Type algébrique (ADT)',
  'insert.group.code': 'Code',
  'insert.code': 'Bloc de code',
  'insert.algorithm': 'Algorithme',
  'insert.diff': 'Différences (diff)',
  'insert.demo': 'Démo : source et rendu',
  'insert.group.refs': 'Références',
  'insert.footnote': 'Note de bas de page',
  'insert.citation': 'Référence bibliographique',
  'insert.label': 'Étiquette (pour un renvoi)',
  'insert.ref': 'Renvoi vers',
  'insert.ref-none': 'Aucune étiquette dans le document',
  'insert.group.layout': 'Mise en page',
  'insert.toc': 'Table des matières',
  'insert.columns': 'Colonnes',
  'insert.hr': 'Ligne de séparation',
  'insert.deflist': 'Liste de définitions',
  'insert.local-style': 'Texte mis en forme',
  'insert.background': 'Fond de page',
  'insert.header': 'En-tête de page',
  'insert.footer': 'Pied de page',
  'insert.group.letter': 'Courrier',
  'insert.sender': 'Expéditeur',
  'insert.recipient': 'Destinataire',
  'insert.place-date': 'Lieu et date',
  'insert.signature': 'Signature',
  'insert.ph.footnote': 'Texte de la note.',
  'insert.ph.citation': 'Auteur, A. (2026). *Titre*. Éditeur.',
  'insert.ph.title': 'Titre du document',
  'insert.ph.author': 'Prénom Nom',

  // ---- help modal --------------------------------------------------
  'help.aria-label': 'Aide',

  // ---- GitHub-sync (docs/GITHUB-SYNC-SPEC.md) ----------------------
  'settings.github.invalid': 'Jeton invalide ou expiré',
  // GitHub sync — prompts, notices, errors
  'github.prompt-token':
    'Aucun jeton GitHub configuré. Collez ici un jeton « fine-grained » (permission Contents : lecture et écriture).\n\nPour en créer un : {url}',
  'github.bad-repo': 'Dépôt invalide. Format attendu : propriétaire/dépôt.',
  'github.prompt-repo': 'Dépôt GitHub (propriétaire/dépôt) :',
  'github.prompt-branch': 'Branche :',
  'github.forked':
    'Divergence : le dépôt a changé de son côté. Pour ne rien perdre, ta version a été enregistrée dans « {mine} » ; « {theirs} » garde la version du dépôt. Fusionne-les quand tu veux, puis supprime le doublon.',
  'github.reload-suggested':
    'Le dépôt a avancé mais tu n’as pas d’édition locale en attente. Utilise « Recharger depuis GitHub » pour récupérer la dernière version.',
  'github.remote-gone':
    'Le fichier {path} est introuvable dans le dépôt (supprimé ou déplacé). Recrée-le, délie le document, ou corrige la cible.',
  'github.branch-absent':
    'La branche « {branch} » n’existe pas dans le dépôt. Crée-la sur GitHub, puis réessaie.',
  'github.error': 'Erreur GitHub (HTTP {status}).',
  'onedrive.error': 'Erreur OneDrive : {msg}',
  'onedrive.conflict':
    'Ce fichier a changé sur OneDrive depuis ta dernière synchro. Écraser avec ta version ?',
  // ---- Volumes (docs/VOLUMES-SPEC.md) ------------------------------
  'volume.browser-title': 'Ouvrir',
  'volume.save-title': 'Enregistrer sous',
  'volume.recents': 'Récents',
  'tabs.open-elsewhere': 'Ce document est déjà ouvert dans un autre onglet.',
  'tabs.read-only':
    'Ce document est ouvert dans un autre onglet : il est en lecture seule ici.',
  'tabs.taken-over': 'Ce document a été repris dans un autre onglet : lecture seule ici.',
  'tabs.take-over': 'Le modifier ici',
  'url.blocked':
    'Impossible de lire {url} : le site n’autorise pas sa lecture depuis markpage (CORS), ou il est injoignable.',
  'url.http': 'Impossible de lire {url} (erreur HTTP {status}).',
  'url.invalid': 'Adresse invalide : {url} (seules les adresses http(s) sont acceptées).',
  'url.kept-local':
    'Votre copie locale de ce document a été modifiée : elle est conservée. Fichier ▸ Recharger pour reprendre la version en ligne.',
  'url.prompt': 'Adresse (URL) du document Markdown à ouvrir :',
  'vscode.conflict':
    'Ce fichier a changé dans VS Code depuis la dernière synchronisation : rien n’est écrasé. Cliquez la pastille ⛓️‍💥 pour choisir la version à garder.',
  'vscode.kept-local':
    'Ce fichier a changé dans VS Code, et votre version dans markpage aussi : rien n’est écrasé. Cliquez la pastille ⛓️‍💥 pour choisir.',
  'vscode.unreachable':
    'VS Code ne répond pas (fermé ?) : enregistré dans markpage seulement. Rouvrez le fichier depuis VS Code (Open in markpage.org), puis enregistrez.',
  'volume.open-url': 'Ouvrir une URL…',
  'open.unknown-volume':
    '« {spec} » : aucun dossier, dépôt ou OneDrive monté ne porte ce nom. Montez-le d’abord (Fichier ▸ Ouvrir…).',
  'open.needs-permission': 'Pour ouvrir ce fichier, autorisez l’accès au dossier « {name} ».',
  'open.authorize': 'Autoriser',
  'volume.sort-title': 'Trier les fichiers',
  'volume.sort-name': 'Nom',
  'volume.sort-date': 'Date',
  'volume.root': 'markpage',
  'volume.name-placeholder': 'nom-du-fichier.md',
  'volume.save-here': 'Enregistrer ici',
  'volume.open-device': 'Ouvrir un fichier…',
  'volume.mount-disk': 'Monter un dossier…',
  'volume.mount-repo': 'Monter un dépôt…',
  'volume.mount-onedrive': 'Connecter OneDrive…',
  'volume.authorize': 'Autoriser',
  'volume.unmount': 'Démonter ce volume',
  'volume.delete': 'Mettre à la corbeille',
  'volume.restore': 'Restaurer',
  'volume.purge': 'Supprimer définitivement',
  'volume.empty-trash': 'Vider la corbeille',
  'volume.loading': 'Chargement…',
  'volume.empty': 'Dossier vide',
  'volume.list-failed': 'Impossible de lister ce dossier.',
  'volume.state.needs-permission': 'permission requise',
  'volume.state.offline': 'hors-ligne',
  'volume.state.error': 'erreur',
  'volume.state.ready': '',
  'volume.foreign-repo':
    'Ouvrir un fichier non-markdown depuis un dépôt n’est pas encore pris en charge.',
  // ---- pagination progress -----------------------------------------
  'preview.paginating': 'Mise en page…',
  'preview.paginating.pages': 'pages',
  'print.preparing': 'Préparation de l’impression…',
} as const;

// EN must declare exactly the same keys. Typed via `Record<keyof typeof
// FR, string>` so a missing or surplus key fails the build.
const EN: Record<keyof typeof FR, string> = {
  // ---- toolbar ------------------------------------------------------
  'toolbar.preview': 'Preview',
  'preview-toggle.show': 'Preview',
  'preview-toggle.show-title':
    'Show / hide the live preview (Ctrl+Enter / Cmd+Enter)',
  'preview-toggle.paginate': 'Pages',
  'preview-toggle.paginate-title':
    'Preview: continuous flow ↔ paginated pages',
  'preview-toggle.repaginate': 'Repaginate',
  'preview-toggle.repaginate-title':
    'Paginated preview suspended while editing — click to repaginate',
  'toolbar.present': 'Present',
  'toolbar.guides': 'Guides',
  'toolbar.style': 'Format',
  'toolbar.style-title': 'Formatting (headings, bold, lists…)',
  'toolbar.docstyle': 'Style',
  'toolbar.docstyle-title': 'Document style — library of named styles',
  'docstyle.export': 'Export current style…',
  'docstyle.import': 'Import a style…',
  'docstyle.user-tag': 'custom',
  'docstyle.exported': 'Style exported (.mpstyle.json file).',
  'docstyle.import-none': 'This file is not a valid markpage style.',
  'docstyle.imported': 'Style “{name}” imported and applied to the document.',
  'docstyle.delete': 'Delete this custom style',
  'docstyle.delete-confirm':
    'Delete the custom style “{name}” from the library?',
  'toolbar.view': 'View',
  'toolbar.view-title': 'View: preview, presentation, guides',
  'toolbar.menu': 'Menu',
  'toolbar.menu-title': 'All menus',
  'toolbar.help': 'Help',
  'toolbar.help-title': 'Open the tutorial',
  'toolbar.modified-title': 'Unsaved changes',
  'toolbar.file': 'File',
  'toolbar.file-title': 'Document, import, export…',
  'toolbar.doc-name-aria': 'Document name',
  'toolbar.conflict-title': 'Conflict: edited on both sides — click to resolve',
  'file-menu.new': 'New document',
  'file-menu.open': 'Open…',
  'file-menu.save': 'Save',
  'file-menu.save-as': 'Save As…',
  'file-menu.revert': 'Revert changes',
  'file-menu.reload': 'Reload',
  'file-menu.unlink-origin': 'Unlink',
  'file-menu.delete-doc': 'Move to Trash…',
  'disk.read-failed': 'Could not read from disk.',
  'disk.permission-denied': 'Folder access permission denied.',
  'disk.reload-confirm':
    'This document has unsaved changes. Replace them with the version on disk?',
  'conflict.keep-mine': 'Keep my version (overwrite disk)',
  'conflict.take-disk': 'Take the disk version (discard my edits)',

  // ---- import / export errors -------------------------------------
  'import.failed': 'Import failed: {msg}',
  'latex-export.failed': 'LaTeX export failed: {msg}',
  'default.help-doc-name': 'markpage Help',

  // ---- export menu --------------------------------------------------
  'export-menu.markdown': 'Markdown (.md)',
  'export-menu.pdf': 'PDF (.pdf)',
  'export-menu.latex': 'LaTeX (.tex)',
  'export-menu.share-link': 'Copy share link',
  'export-menu.share-email': 'Send by email',
  'open.close': 'Close',
  // ---- share link ---------------------------------------------------
  'share.link-copied':
    'Share link copied to clipboard. The recipient opens the link in their browser and the document is imported into their editor.',
  'share.link-shown': 'Share link: {url}',
  'share.failed': 'Share failed: {msg}',
  'share.too-large':
    'Document too large for a URL share ({size} chars, max {max}). Use the OneDrive export for big documents.',
  'share.email-body': 'Here is the document: {url}',
  'share.imported-doc-name': 'Shared document',
  'share.import-failed': 'Share import failed: {msg}',

  // ---- help window --------------------------------------------------
  'help.window-title': 'markpage help',
  'help.title-suffix': 'Help',
  'help.close': 'Close',
  'help.export-pdf': 'Export .pdf',
  'help.generating': 'Generating…',
  'help.toc': 'Contents',

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
  'style-menu.numbering': 'Number sections',
  'style-menu.format-tables': 'Reformat tables',
  'toolbar.insert': 'Insert',
  'toolbar.insert-title': 'Add an element: image, table, callout, formula, diagram…',
  'format.group.document': 'Whole document',
  'edit.cut': 'Cut',
  'edit.copy': 'Copy',
  'edit.paste': 'Paste',
  'edit.paste-denied': 'The browser blocks pasting from this menu: use {key}.',
  'insert.doc-meta': 'Title, author and date',
  'insert.image': 'Image…',
  'insert.mosaic': 'Image wall…',
  'insert.link': 'Link…',
  'insert.group.table': 'Table',
  'insert.table': 'Simple table',
  'insert.csv': 'Data table (CSV)',
  'insert.group.callout': 'Callout',
  'insert.note': 'Note',
  'insert.tip': 'Tip',
  'insert.warning': 'Warning',
  'insert.caution': 'Caution',
  'insert.important': 'Important',
  'insert.academic': 'Academic',
  'insert.theorem': 'Theorem',
  'insert.definition': 'Definition',
  'insert.proof': 'Proof',
  'insert.example': 'Example',
  'insert.remark': 'Remark',
  'insert.group.math': 'Math',
  'insert.inline-math': 'Formula in the text',
  'insert.display-math': 'Centred formula',
  'insert.inference': 'Inference rule',
  'insert.group.diagram': 'Diagram',
  'insert.flowchart': 'Flowchart (steps and arrows)',
  'insert.chart-line': 'Line chart',
  'insert.chart-bar': 'Bar chart',
  'insert.tree': 'Tree (text)',
  'insert.tree-svg': 'Tree (drawing)',
  'insert.category': 'Commutative diagram',
  'insert.bda': 'Faust circuit (BDA)',
  'insert.ebnf': 'Grammar (EBNF)',
  'insert.adt': 'Algebraic type (ADT)',
  'insert.group.code': 'Code',
  'insert.code': 'Code block',
  'insert.algorithm': 'Algorithm',
  'insert.diff': 'Differences (diff)',
  'insert.demo': 'Demo: source and result',
  'insert.group.refs': 'References',
  'insert.footnote': 'Footnote',
  'insert.citation': 'Bibliography reference',
  'insert.label': 'Label (for a cross-reference)',
  'insert.ref': 'Cross-reference to',
  'insert.ref-none': 'No label in the document',
  'insert.group.layout': 'Layout',
  'insert.toc': 'Table of contents',
  'insert.columns': 'Columns',
  'insert.hr': 'Separator line',
  'insert.deflist': 'Definition list',
  'insert.local-style': 'Styled text',
  'insert.background': 'Page background',
  'insert.header': 'Page header',
  'insert.footer': 'Page footer',
  'insert.group.letter': 'Letter',
  'insert.sender': 'Sender',
  'insert.recipient': 'Recipient',
  'insert.place-date': 'Place and date',
  'insert.signature': 'Signature',
  'insert.ph.footnote': 'Text of the note.',
  'insert.ph.citation': 'Author, A. (2026). *Title*. Publisher.',
  'insert.ph.title': 'Document title',
  'insert.ph.author': 'First Last',

  // ---- help modal --------------------------------------------------
  'help.aria-label': 'Help',

  // ---- GitHub-sync (docs/GITHUB-SYNC-SPEC.md) ----------------------
  'settings.github.invalid': 'Invalid or expired token',
  // GitHub sync — prompts, notices, errors
  'github.prompt-token':
    'No GitHub token configured. Paste a fine-grained token here (Contents: Read and write permission).\n\nTo create one: {url}',
  'github.bad-repo': 'Invalid repo. Expected format: owner/repo.',
  'github.prompt-repo': 'GitHub repo (owner/repo):',
  'github.prompt-branch': 'Branch:',
  'github.forked':
    'Divergence: the repo changed on its side. To lose nothing, your version was saved to “{mine}”; “{theirs}” keeps the repo version. Merge them whenever you like, then delete the duplicate.',
  'github.reload-suggested':
    'The repo moved ahead but you have no pending local edits. Use “Reload from GitHub” to get the latest version.',
  'github.remote-gone':
    'The file {path} is missing from the repo (deleted or moved). Recreate it, unlink the document, or fix the target.',
  'github.branch-absent':
    'The branch “{branch}” does not exist in the repo. Create it on GitHub, then try again.',
  'github.error': 'GitHub error (HTTP {status}).',
  'onedrive.error': 'OneDrive error: {msg}',
  'onedrive.conflict':
    'This file changed on OneDrive since your last sync. Overwrite with your version?',
  // ---- Volumes (docs/VOLUMES-SPEC.md) ------------------------------
  'volume.browser-title': 'Open',
  'volume.save-title': 'Save As',
  'volume.recents': 'Recent',
  'tabs.open-elsewhere': 'This document is already open in another tab.',
  'tabs.read-only': 'This document is open in another tab: read-only here.',
  'tabs.taken-over': 'This document was taken over in another tab: read-only here.',
  'tabs.take-over': 'Edit it here',
  'url.blocked':
    'Cannot read {url}: the site does not allow markpage to read it (CORS), or it is unreachable.',
  'url.http': 'Cannot read {url} (HTTP error {status}).',
  'url.invalid': 'Invalid address: {url} (only http(s) addresses are accepted).',
  'url.kept-local':
    'Your local copy of this document was edited: it is kept. File ▸ Reload to take the online version.',
  'url.prompt': 'Address (URL) of the Markdown document to open:',
  'vscode.conflict':
    'This file changed in VS Code since the last sync: nothing is overwritten. Click the ⛓️‍💥 chip to choose which version to keep.',
  'vscode.kept-local':
    'This file changed in VS Code, and your version in markpage too: nothing is overwritten. Click the ⛓️‍💥 chip to choose.',
  'vscode.unreachable':
    'VS Code does not answer (closed?): saved in markpage only. Reopen the file from VS Code (Open in markpage.org), then save.',
  'volume.open-url': 'Open a URL…',
  'open.unknown-volume':
    '“{spec}”: no mounted folder, repo or OneDrive has that name. Mount it first (File ▸ Open…).',
  'open.needs-permission': 'To open this file, allow access to the folder “{name}”.',
  'open.authorize': 'Allow',
  'volume.sort-title': 'Sort files',
  'volume.sort-name': 'Name',
  'volume.sort-date': 'Date',
  'volume.root': 'markpage',
  'volume.name-placeholder': 'file-name.md',
  'volume.save-here': 'Save here',
  'volume.open-device': 'Open a file…',
  'volume.mount-disk': 'Mount a folder…',
  'volume.mount-repo': 'Mount a repo…',
  'volume.mount-onedrive': 'Connect OneDrive…',
  'volume.authorize': 'Authorize',
  'volume.unmount': 'Unmount this volume',
  'volume.delete': 'Move to Trash',
  'volume.restore': 'Restore',
  'volume.purge': 'Delete permanently',
  'volume.empty-trash': 'Empty the Trash',
  'volume.loading': 'Loading…',
  'volume.empty': 'Empty folder',
  'volume.list-failed': 'Could not list this folder.',
  'volume.state.needs-permission': 'permission needed',
  'volume.state.offline': 'offline',
  'volume.state.error': 'error',
  'volume.state.ready': '',
  'volume.foreign-repo':
    'Opening a non-markdown file from a repo is not supported yet.',
  // ---- pagination progress -----------------------------------------
  'preview.paginating': 'Laying out…',
  'preview.paginating.pages': 'pages',
  'print.preparing': 'Preparing to print…',
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
