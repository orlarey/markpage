# md2pdf — Spécifications

## 1. Objectif

Application web statique pour rédiger des documents Markdown et les exporter
en PDF. **Entièrement côté client** (aucun backend), déployée
automatiquement sur GitHub Pages.

## 2. Contraintes techniques

| Élément              | Choix                                                   |
| -------------------- | ------------------------------------------------------- |
| Langage              | TypeScript (vanilla, pas de framework UI)               |
| Build                | Vite                                                    |
| Parser Markdown      | [`marked`](https://github.com/markedjs/marked)          |
| Générateur PDF       | [`pdfmake`](https://github.com/bpampuch/pdfmake)        |
| Éditeur de texte     | [CodeMirror 6](https://codemirror.net/)                 |
| Stockage images      | IndexedDB (origin-private)                              |
| Stockage doc         | localStorage                                            |
| Hébergement          | GitHub Pages                                            |
| CI/CD                | GitHub Actions (build + deploy)                         |
| Pas de serveur       | tout s'exécute dans le navigateur                       |

Conversion d'imports non-Markdown : `turndown` pour HTML, `mammoth` pour
DOCX. Les deux sont chargés en `import()` dynamique, donc absents du bundle
initial.

## 3. Périmètre fonctionnel

### 3.1. Éléments Markdown supportés

- Titres `#` à `######` (h1 → h6)
- Paragraphes
- **Gras** (`**…**`) et *italique* (`*…*`)
- Code en ligne `` `…` `` et blocs de code (```` ``` ````), sans coloration
  syntaxique
- Listes à puces (`-`, `*`) et numérotées (`1.`)
- Citations `>`
- Liens `[texte](url)` (cliquables dans le PDF)
- Règles horizontales `---`
- Images, en deux formes :
  - inline `![alt](url)` ou data URL
  - référence `![alt][label]` + `[label]: url` ailleurs dans le doc
- Tableaux GFM (`| col | col |` + ligne `|---|`)

### 3.2. Hors périmètre actuel

- Coloration syntaxique des blocs de code
- Formules mathématiques (KaTeX/MathJax)
- Listes de tâches `- [ ]`
- Notes de bas de page
- HTML brut dans le Markdown
- Recto/verso (marges alternées) à l'export PDF

## 4. Interface utilisateur

### 4.1. Layout

```
┌─ Toolbar globale ─────────────────────────────────────────────────────┐
│ [Ouvrir] [Enregistrer] [Style ▾]   Nom : […]   [Aide] [Exporter .pdf]│
│                                                          [Réglages ▾] │
├──────────────────────────────────┬────────────────────────────────────┤
│                                  │                                    │
│   Éditeur (CodeMirror)           │   Aperçu HTML                      │
│   numéros de ligne, wrapping     │   rendu en direct, fonte Roboto    │
│   syntaxe Markdown colorée       │   Condensed                        │
│                                  │                                    │
└──────────────────────────────────┴────────────────────────────────────┘
```

Toolbar globale en grille 3 colonnes (gauche / centre / droite). Le bouton
**Aide** a un fond jaune pâle pour le distinguer des actions habituelles.
Les boutons **Style** et **Réglages** affichent un caret `▾` pour signaler
qu'ils ouvrent un menu / panneau.

### 4.2. Comportements

- **Aperçu** : recalculé à chaque frappe (résolution `img://` → blob URLs
  via IndexedDB, voir §6) ; le rendu marked est synchrone, le pipeline est
  protégé par un compteur de requêtes pour ignorer les rendus obsolètes.
- **Persistance** : le doc est sauvegardé en `localStorage` à chaque
  modification (debounce 200 ms). Au prochain démarrage, le doc est
  restauré. Si `localStorage` est vide, c'est `HELP.md` qui est chargé
  comme document par défaut.
- **Ouvrir** : accepte `.md`, `.markdown`, `.txt`, `.html`, `.htm`,
  `.docx`. Demande confirmation si le doc courant n'est ni vide ni le
  HELP. À l'ouverture, les data URLs inlinées sont migrées en IndexedDB.
- **Enregistrer** : produit un `.md` portable (data URLs en fin de doc en
  forme ref-style, voir §6).
- **Exporter .pdf** : pipeline §5.1.
- **Aide** : ouvre une modale qui rend le HELP.md original (voir §8).
- **Style** : ouvre un menu déroulant avec les commandes de mise en forme.
  Même menu disponible au clic-droit dans l'éditeur. Les items déjà
  applicables au curseur courant sont signalés par une coche.
- **Réglages** : ouvre un panneau modal pour personnaliser le rendu PDF
  (voir §7).
- **Sélection ligne entière** : clic sur un numéro de ligne dans la
  gouttière sélectionne la ligne ; glisser-en sélectionne plusieurs.
- **Synchronisation du scroll** : le scroll de l'éditeur et celui de
  l'aperçu sont synchronisés via un mapping ligne source → bloc rendu
  (annotations `data-line` sur les éléments de l'aperçu).
- **Insertion d'image** : trois entrées (drag-drop sur l'éditeur, paste
  d'une image du presse-papier, item « Insérer une image… » du menu Style).
  Les images sont automatiquement redimensionnées (max 2000 px) et
  réencodées (JPEG q0.85, ou PNG si l'original a une couche alpha).
  Stockées en IndexedDB (voir §6). Possible aussi par drag-drop depuis le
  web (avec limites CORS, voir §6).
- **Métadonnées centrées** (auteur / organisation / date) insérées juste
  après le premier `# Titre 1` du doc, dans l'aperçu et dans le PDF.

### 4.3. Raccourcis clavier

**Mise en forme** (actifs quand l'éditeur a le focus) :

| Raccourci | Action |
|---|---|
| `Cmd/Ctrl` + `B` | Gras |
| `Cmd/Ctrl` + `I` | Italique |
| `Cmd/Ctrl` + `E` | Code en ligne |
| `Cmd/Ctrl` + `K` | Insérer un lien |
| `Cmd/Ctrl` + `0` | Texte normal (retire le titre) |
| `Cmd/Ctrl` + `1..4` | Titres h1-h4 |
| `Cmd/Ctrl` + `Maj` + `L` | Liste à puces |
| `Cmd/Ctrl` + `Maj` + `O` | Liste numérotée |
| `Cmd/Ctrl` + `Maj` + `Q` | Citation |
| `Cmd/Ctrl` + `Alt` + `I` | Insérer une image (file picker) |

**Application** (globaux, indépendants du focus) :

| Raccourci | Action |
|---|---|
| `Cmd/Ctrl` + `O` | Ouvrir |
| `Cmd/Ctrl` + `S` | Enregistrer .md |
| `Cmd/Ctrl` + `P` | Exporter .pdf |
| `Cmd/Ctrl` + `,` | Réglages |

Le listener global ignore les évènements déjà traités par CodeMirror
(`event.defaultPrevented`) pour éviter les conflits.

## 5. Architecture

```
src/
  main.ts              point d'entrée, montage de l'UI, raccourcis globaux
  HELP.md              tutoriel chargé au premier lancement et via Aide
  fonts.ts             enregistre les TTF de fallback côté navigateur
  editor.ts            CodeMirror : keymap formats, gutter sélection,
                       drag-drop images, surbrillance Markdown
  editor-commands.ts   commandes de transformation (toggle bold/italic,
                       set heading, list, blockquote, insert link…)
  preview.ts           Markdown → HTML via marked, styles dynamiques,
                       annotation `data-line` pour le scroll-sync
  scroll-sync.ts       sync bidirectionnelle éditeur ↔ aperçu
  storage.ts           lecture/écriture localStorage (doc + filename)
  settings.ts          modèle PdfSettings, défauts, sérialisation
  import.ts            file → markdown (turndown / mammoth via import())
  image.ts             pipeline images (process, IDB, ref-expansion,
                       extract data URLs, GC, drop/paste handlers)
  image-store.ts       wrapper IndexedDB
  vite-env.d.ts        types Vite pour `?url`, `?raw`, etc.
  style.css            styles globaux + modales
  assets/
    cauchy.png         bandeau de fond de la toolbar (manuscrit Cauchy)
  pdf/
    convert.ts         tokens marked → docDefinition pdfmake
    styles.ts          styles pdfmake dérivés des PdfSettings
    maker.ts           init pdfmake, chargement des TTF, downloadPdf
  ui/
    toolbar.ts         toolbar globale
    settings-panel.ts  panneau Réglages
    style-menu.ts      menu Style + menu contextuel (clic-droit)
    help-modal.ts      modale Aide
index.html
vite.config.ts
.github/workflows/deploy.yml
```

### 5.1. Pipeline d'export PDF

```
Doc éditeur (avec `img://uuid`)
   │
   ▼
expandRefsToInlineDataUrls()
   ├─► IndexedDB → blobs → data URLs inline
   └─► défs ref-style également inlinées
   │
   ▼
markdownToDocDefinition() = marked.lexer + tokens → pdfmake content
   │
   ▼
pdfMake.createPdf(docDefinition).download()
```

`marked.lexer` est utilisé plutôt que `marked.parse` pour walker les tokens
nous-mêmes. La détection de fontes par caractère (Roboto / Math / Symbols)
se fait au moment de produire les `text` runs (voir §7).

### 5.2. Pipeline d'aperçu

```
Doc éditeur (avec `img://uuid`)
   │
   ▼
expandRefsToBlobUrls()  ── IndexedDB → blobs → blob URLs (cache)
   │
   ▼
marked.parse() → HTML → previewEl.innerHTML
   │
   ▼
applyPreviewMetadata() (insère bloc auteur/org/date)
   │
   ▼
annotateSourceLines() (data-line=N pour le scroll-sync)
```

Le numéro de requête `previewReqId` empêche un rendu obsolète d'écraser un
plus récent quand la frappe est rapide.

### 5.3. Pipeline de sauvegarde / chargement

- **Save** :
  ```
  Editor → refifyImageUrls (inline `![](img://…)` → ref-style)
         → expandRefsToDataUrls (img:// → data:)
         → gcUnusedImages (purge IDB)
         → download .md
  ```
- **Open** (importFile + extractDataUrlsToStore + inlineImageRefs) :
  ```
  File → importFile (md/txt/html/docx)
       → extractDataUrlsToStore (data: → img:// via IDB)
       → inlineImageRefs (`[label]: img://…` → `![](img://…)`)
       → editor
  ```

L'éditeur voit toujours **inline** ; le fichier sauvegardé est toujours
**ref-style** (lisible dans un éditeur externe). Round-trip propre.

## 6. Stockage et gestion des images

### 6.1. Format interne

- Le doc en mémoire / localStorage utilise `![](img://uuid)` où `uuid` est
  un identifiant stable (UUID v4) lié à un blob stocké en IndexedDB.
- À l'export, la conversion `img://` → data URL se fait à la volée. Le
  data URL n'est jamais visible dans l'éditeur.

### 6.2. Insertion

- **Glisser-déposer** sur l'éditeur (capture phase, pour passer avant le
  handler de texte de CodeMirror).
- **Coller** une image du presse-papier (capture screenshot par exemple).
- Item **« Insérer une image… »** du menu Style → file picker.
- **Drag-drop depuis le web** : on extrait l'URL depuis `text/html`
  (`<img src=…>`), `text/uri-list`, puis `text/plain` ; on `fetch()` ; on
  vérifie `Content-Type: image/*`. Échoue silencieusement avec un
  `alert()` explicite si CORS / 404 / type inadapté.

### 6.3. Traitement

- Lecture en `Image` via `URL.createObjectURL`, dessin sur un `canvas`,
  redimensionnement (max 2000 px sur le grand côté), réencodage :
  - PNG d'origine **avec alpha** → PNG (alpha détectée via `getImageData`)
  - PNG d'origine **sans alpha** → JPEG q0.85
  - autre → JPEG q0.85
- Le `Blob` produit est stocké en IDB sous la clé UUID, et l'éditeur reçoit
  `![](img://uuid)`.

### 6.4. Polices et fallback de glyphes

`pdfMake.fonts` enregistre quatre familles. Les TTF correspondantes sont
chargées paresseusement au premier export depuis `@expo-google-fonts/...`
via Vite `?url`.

| Famille (pdfmake) | Police TTF | Couverture principale |
|---|---|---|
| `Roboto` | Roboto Condensed (4 variantes) | Latin, Cyrillique, Grec, ponctuation générale |
| `Mono` | Roboto Mono Regular | Code |
| `Symbols` | Noto Sans Symbols Regular | Flèches, géométrique, dingbats, divers |
| `Math` | Noto Sans Math Regular | Opérateurs mathématiques (U+2200-22FF) |

Pour chaque caractère de chaque `text` run produit, `splitByFont` détermine
via une heuristique Canvas si Roboto Condensed possède le glyphe ; sinon il
essaie successivement Math puis Symbols, et tagge le run avec la famille
adaptée. Cache mémoire `Map<codepoint, FallbackFont | undefined>`.

L'aperçu HTML déclare les TTF complètes via `FontFace` API au démarrage
(module `fonts.ts`), pour que le navigateur ait la même cascade que pdfmake
et que le rendu visuel reste cohérent.

## 7. Réglages PDF

Un panneau **Réglages** (clic sur le bouton dans la toolbar ou
`Cmd/Ctrl + ,`) configure le rendu. Les réglages sont persistés dans
`localStorage`. Les réglages typographiques (tailles + couleurs des
titres, du corps, du code, des citations) s'appliquent aussi à l'aperçu
HTML pour visualiser leur effet sans exporter.

### 7.1. Schéma

```ts
interface PdfSettings {
  pageSize: 'A3' | 'A4' | 'A5' | 'B5' | 'LETTER' | 'LEGAL';
  margins: { top: number; bottom: number; left: number; right: number }; // mm
  justify: boolean;
  lineHeight: number; // multiplier "à la CSS", défaut 1.25
  author:       { text: string; show: boolean; bold: boolean };
  organization: { text: string; show: boolean; bold: boolean };
  date: { mode: 'none' | 'today' | 'custom'; custom: string };
  styles: {
    h1:    { fontSize: number; color: string };
    h2:    { fontSize: number; color: string };
    h3:    { fontSize: number; color: string };
    h4:    { fontSize: number; color: string };
    body:  { fontSize: number; color: string };
    code:  { fontSize: number; color: string };
    quote: { fontSize: number; color: string; barColor: string };
  };
  pageNumber: {
    position:
      | 'none'
      | 'top-left' | 'top-center' | 'top-right'
      | 'bottom-left' | 'bottom-center' | 'bottom-right';
    style: { fontSize: number; italics: boolean; color: string };
  };
}
```

### 7.2. Comportements

- Les **titres** sont toujours en gras (Roboto Medium 500), choix non
  exposé dans l'UI.
- Le **h1** est traité comme titre du document : toujours **centré**.
- h2..h6 sont toujours alignés à gauche, indépendamment de l'option
  « Justifier le texte ».
- h5 et h6 héritent automatiquement des réglages de h4.
- Le **bloc métadonnées** (auteur / organisation / date) est centré et
  inséré juste après le premier h1 du document (ou en tête si pas de
  h1). N'apparaît que pour les éléments dont la case « Afficher » est
  cochée (auteur, organisation) ou si le mode date n'est pas
  « Pas de date ».
- Le mode **« Date du jour »** affiche la date courante au format français
  long (`Intl.DateTimeFormat('fr-FR', {dateStyle: 'long'})`),
  recalculée à chaque export / ré-affichage.
- **Justifier le texte** s'applique aux paragraphes, listes et citations,
  PDF et aperçu HTML, sauf les titres (toujours alignés).
- **Interligne** : valeur "à la CSS" (multiplicateur de la taille de
  police). Pour le PDF on divise par ~1.17 (facteur de hauteur de ligne
  naturelle de Roboto Condensed) avant de la passer à pdfmake, afin que
  le rendu visuel corresponde à celui de l'aperçu.
- Les **citations** sont affichées avec une **barre verticale** à gauche.
  Couleur réglable indépendamment du texte de la citation.
  Côté PDF, on enveloppe le bloc dans une mini-table 1 cellule avec un
  layout custom (border gauche uniquement).
- Le **numéro de page** apparaît dès la page 1, à mi-hauteur de la marge
  haute ou basse selon la position. Format : entier seul (ex. « 12 »).
- Bouton **Réinitialiser** revient aux valeurs par défaut.

### 7.3. Valeurs par défaut

| Réglage              | Valeur                                       |
| -------------------- | -------------------------------------------- |
| Format               | A4                                           |
| Marges               | haut/bas 25 mm, gauche/droite 35 mm          |
| Justifier le texte   | activé                                       |
| Interligne           | 1.25                                         |
| Auteur               | « Prénom Nom », affiché, gras                |
| Organisation         | « Mon organisation », affichée, grasse       |
| Date                 | Date du jour                                 |
| h1 / h2 / h3 / h4    | 24 / 20 / 16 / 14 pt, couleur #09438b        |
| Texte normal         | 11 pt, couleur #000000                       |
| Code                 | 10 pt, couleur #1f2328, fond #f6f8fa (fixe)  |
| Citation             | 11 pt, couleur #57606a, barre #d0d7de        |
| Numéro de page       | bas centre, 9 pt, non italique, #57606a      |

## 8. Aide intégrée

- Le tutoriel `src/HELP.md` est bundlé via `import helpMd from './HELP.md?raw'`.
- Au premier lancement (`localStorage` vide), il sert de document par
  défaut dans l'éditeur. L'utilisateur peut le lire, l'éditer, le
  sauvegarder ou repartir d'une page blanche.
- Le **bouton Aide** (jaune pâle, à droite avant *Exporter .pdf*)
  ouvre une modale avec le HELP.md **d'origine** rendu en HTML, sans
  toucher au document de l'utilisateur. Échap / clic hors panneau /
  bouton Fermer pour la refermer.

## 9. Déploiement

- Workflow `.github/workflows/deploy.yml`.
- Déclenché sur `push` vers `main`.
- Étapes : checkout → install (`npm ci`) → build (`vite build`) → upload
  artifact → deploy via `actions/deploy-pages`.
- L'application doit fonctionner servie depuis un sous-chemin (ex.
  `https://user.github.io/md2pdf/`) → `base: './'` dans
  `vite.config.ts` produit des chemins relatifs.

## 10. Critères d'acceptation

1. `npm run dev` lance l'application localement, prête à éditer.
2. Le premier lancement (sans `localStorage`) charge le HELP.md.
3. Coller un Markdown couvrant les éléments §3.1 produit un aperçu HTML
   correct, et un PDF fidèle à l'aperçu (mêmes polices, mêmes glyphes
   pour les symboles `→`, `≤`, `★`…).
4. Les images insérées par drag-drop, paste ou menu sont stockées en IDB,
   visibles dans l'aperçu et dans le PDF, et absentes du data URL inline
   du doc en cours.
5. Save → Open d'un doc avec images est un round-trip stable (le doc
   sauvegardé est en ref-style, l'éditeur le rouvre en inline).
6. Les raccourcis clavier de §4.3 fonctionnent.
7. Le push sur `main` publie automatiquement la nouvelle version sur
   GitHub Pages.
8. L'application charge et fonctionne sans connexion réseau une fois
   servie (toutes les polices et libs sont bundlées).

## 11. À décider plus tard

- Recto/verso (marges alternées).
- Choix d'une autre famille de polices que Roboto Condensed dans les
  réglages.
- Mode sombre de l'éditeur.
- Export d'un HTML autonome.
- Sauvegarde / chargement de plusieurs documents (multi-doc).
- Coloration syntaxique des blocs de code.
- Listes de tâches `- [ ]`, notes de bas de page, formules math.
