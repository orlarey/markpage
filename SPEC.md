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
| Aperçu paginé        | [`paged.js`](https://pagedjs.org/)                      |
| Génération PDF       | impression navigateur (`window.print()`) sur la vue paginée |
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
- Diagrammes Mermaid (bloc ```` ```mermaid ```` ; voir §7)
- Formules mathématiques en bloc (`$$…$$`) et en inline (`$…$`) via
  MathJax ; voir §8

### 3.2. Hors périmètre actuel

- Coloration syntaxique des blocs de code
- Import des **images embarquées dans un fichier Word** (`.docx`) :
  l'import récupère le texte, les titres, listes, gras/italique, liens
  et citations, mais pas les images
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
  Limitation DOCX : les images embarquées dans un Word ne sont **pas**
  importées (mammoth → HTML les sort en data URLs, mais notre filtre
  Turndown les retire pour rester sur du contenu textuel propre).
- **Enregistrer** : produit un `.md` portable (data URLs en fin de doc en
  forme ref-style, voir §6).
- **Exporter .pdf** : pipeline §5.1.
- **Aide** : ouvre une modale qui rend le HELP.md original (voir §10).
- **Style** : ouvre un menu déroulant avec les commandes de mise en forme.
  Même menu disponible au clic-droit dans l'éditeur. Les items déjà
  applicables au curseur courant sont signalés par une coche.
- **Réglages** : ouvre un panneau modal pour personnaliser le rendu PDF
  (voir §9).
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
  mermaid.ts           lazy import + cache de mermaid.render() par source
  math.ts              lazy import + cache de MathJax tex2svg par source
  marked-config.ts     extensions marked pour `$$…$$` (math display)
                       et `$…$` (math inline)
  preview-paginated.ts paged.js + dynamic CSS Paged Media (size, margins,
                       fragmentation rules) pour la pagination écran
  print-export.ts      export PDF via window.print() : prépare le contenu,
                       applique le CSS @page, ouvre le dialogue
  vite-env.d.ts        types Vite pour `?url`, `?raw`, etc.
  style.css            styles globaux + modales
  assets/
    cauchy.png         bandeau de fond de la toolbar (manuscrit Cauchy)
  ui/
    toolbar.ts         toolbar globale
    settings-panel.ts  panneau Réglages
    style-menu.ts      menu Style + menu contextuel (clic-droit)
    help-modal.ts      modale Aide
index.html
vite.config.ts
.github/workflows/deploy.yml
```

### 5.1. Pipeline d'aperçu (= pipeline d'export)

L'aperçu et l'export PDF partagent le même rendu. La preview montre le
résultat paginé à l'écran ; l'export ouvre le dialogue d'impression du
navigateur sur ce même contenu — d'où conformité parfaite preview ↔ PDF.

```
Doc éditeur (avec `img://uuid`)
   │
   ▼
expandRefsToBlobUrls() (preview) | expandRefsToInlineDataUrls() (export)
   ├─► IndexedDB → blobs → blob URLs (preview) ou data URLs (export, autonomes)
   │
   ▼
marked.parse() → HTML
   │
   ▼
applyPreviewMetadata() (insère bloc auteur/org/date)
   │
   ▼
annotateSourceLines() (data-line=N pour le scroll-sync)
   │
   ▼
renderMermaidBlocks / renderMathBlocks / renderMathInlines (en parallèle,
remplissent les placeholders avec les SVG MathJax / Mermaid)
   │
   ▼
keepLabelsWithNext() (regroupe titres + paragraphes-labels avec leur
suivant immédiat dans des `<div class="keep-with-next">`)
   │
   ├─► preview : paged.js → DOM paginé écran (.pagedjs_page)
   └─► export  : print-target dans le DOM live + window.print()
```

Le numéro de requête `previewReqId` empêche un rendu obsolète d'écraser
un plus récent quand la frappe est rapide. La repagination est
debouncée à 700 ms — paged.js fait un layout pass coûteux à chaque
appel, on attend qu'une rafale de frappes se calme.

### 5.2. Pipeline de sauvegarde / chargement

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

### 6.4. Polices

L'aperçu HTML utilise une cascade unique pour le texte courant comme pour
le PDF (puisque le PDF est produit par le moteur d'impression du
navigateur sur la même vue) :

| Police | Source | Couverture principale |
|---|---|---|
| Roboto Condensed (4 variantes) | `@fontsource/roboto-condensed/*` (CSS) | Latin, Cyrillique, Grec, ponctuation générale |
| Roboto Mono Regular | `@fontsource/roboto-mono/400` (CSS) | Code |
| Noto Sans Symbols Regular | `@expo-google-fonts/noto-sans-symbols` (`?url`) | Flèches, géométrique, dingbats, divers |
| Noto Sans Math Regular | `@expo-google-fonts/noto-sans-math` (`?url`) | Opérateurs mathématiques (U+2200-22FF) |

Roboto Condensed et Roboto Mono sont enregistrées via `@font-face` du
package `@fontsource` (chargement réseau standard). Noto Symbols et Noto
Math sont chargées via la `FontFace` API au démarrage (`fonts.ts`) en
prenant les TTF complets — le sous-set fourni par `@fontsource` pour ces
polices laissait de côté plusieurs blocs Unicode utiles (ex. flèches).

Le navigateur sélectionne le glyphe en cherchant dans cette cascade
(via `font-family: "Roboto Condensed", "Noto Sans Math", "Noto Sans
Symbols", sans-serif`), donc plus besoin de la détection Canvas par
caractère qu'on faisait pour pdfmake.

## 7. Diagrammes Mermaid

Un bloc de code dont le langage est `mermaid` est rendu en SVG dans
l'aperçu **et** dans le PDF — qualité vectorielle des deux côtés
puisque le PDF est produit par le moteur d'impression du navigateur
sur la même vue (cf. §5.1). La librairie mermaid (~600 KB minifié)
est chargée paresseusement via `import()` au premier diagramme
rencontré ; les rendus sont mémorisés par source.

`renderMermaidBlocks()` post-traite le HTML produit par marked : il
trouve chaque `<code class="language-mermaid">`, appelle
`renderMermaid(source)`, et remplace le `<pre>` parent par un `<div
class="mermaid-block">` contenant le SVG (ou un `<div
class="mermaid-error">` montrant la source si le rendu échoue). Les
attributs `data-line` du scroll-sync sont reportés sur le wrapper.

Le SVG produit par mermaid passe directement dans le DOM rendu — pas
de sanitisation supplémentaire. Le navigateur gère nativement les
constructions sur lesquelles pdfmake butait jadis (`<foreignObject>`,
`marker-end orient="auto"`/`auto-start-reverse`, CSS inline dans
`<style>`, `stroke-dasharray="0"`…). C'est l'un des grands gains de
la voie impression.

### 7.1. Réglages exposés

Trois champs sur `PdfSettings`, ajustables dans le panneau Réglages :

| Champ | Défaut | Effet |
|---|---|---|
| `mermaidMaxScale` | 2 | Facteur d'agrandissement maximal du diagramme. |
| `mermaidMaxWidthPct` | 1.0 | Fraction de la largeur de la zone de texte que le diagramme peut occuper. |
| `mermaidMaxHeightPct` | 0.7 | Fraction de la hauteur de la zone de texte qu'il peut occuper. |

> *Note d'implémentation* : ces réglages étaient câblés au pipeline
> pdfmake. Avec la voie impression ils ne sont plus appliqués
> automatiquement. À reconnecter via du CSS dans `pagedCss()`
> (`max-width`, `max-height` sur `.mermaid-block svg`) — ticket de
> rattrapage à prévoir.

## 8. Formules mathématiques

Les formules `$$…$$` (display) et `$…$` (inline) sont rendues via
[MathJax](https://www.mathjax.org/) en sortie SVG. La librairie est
chargée paresseusement (`import()`) au premier bloc math rencontré,
et chaque `(source, display)` est mémorisé une fois rendu.

Avec le pipeline impression (cf. §5.1), les formules **inline et
display sont rendues identiquement entre l'aperçu et le PDF** : le
navigateur intègre les SVG MathJax dans le flux du texte et respecte
le `vertical-align` que MathJax émet pour aligner la baseline. Plus
de fragmentation ni de fallback inline → bloc.

### 8.1. Reconnaissance Markdown

Une extension `marked` (`src/marked-config.ts`) ajoute deux types de
tokens :

- **`mathBlock`** (niveau block) — matche `^\$\$\n([\S\s]+?)\n\$\$`
  avec `$$` seul sur sa ligne d'ouverture comme de fermeture. Sans
  cette contrainte de ligne, des `$$` mentionnés dans des code spans
  ou fenced blocks seraient capturés à tort.
- **`mathInline`** (niveau inline) — matche
  `\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\d)`. Garde-fous Pandoc-style
  pour ne pas avaler des dollars de prix (« Cost $5 or $7 ») ni des
  `$$`. L'alternative `\\.` à l'intérieur du groupe permet d'écrire
  `\$` (ou tout autre caractère échappé) à l'intérieur de la formule
  sans casser la fermeture.

Le module est importé pour ses effets de bord depuis `main.ts`, avant
tout appel à `marked.parse` ou `marked.lexer`. Les renderers
produisent des placeholders `<div class="math-block" data-math="…">`
/ `<span class="math-inline" data-math="…">` ; le contenu LaTeX est
HTML-échappé pour pouvoir loger dans l'attribut `data-math`.

### 8.2. MathJax

`src/math.ts` configure MathJax 3 (paquet `mathjax-full`) en sortie
SVG :

```ts
const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'local' });
const doc = mathjax.document(document, { InputJax: tex, OutputJax: svg });
```

- `AllPackages` charge tous les paquets TeX (ams, amssymb, etc.) ;
  sans ça, `\begin{pmatrix}` ou `align*` lèveraient une erreur de
  parsing.
- `fontCache: 'local'` met les glyphes utilisés dans un `<defs>`
  interne à chaque SVG et y fait référence via `<use>` ; le SVG reste
  autonome sans dupliquer chaque glyph en path inline.

`mj.render(latex, display)` renvoie un `<mjx-container>` qui enveloppe
le SVG. On extrait le SVG racine via une regex *greedy*
(`<svg…</svg>`) parce que MathJax imbrique des `<svg>` enfants pour
les glyphes étirés (parenthèses extensibles, accolades), et un match
non-greedy ne capterait que le premier `</svg>` interne.

### 8.3. Substitution dans le DOM

Deux post-traitements parallèles au `Promise.all` du pipeline
d'aperçu :

- `renderMathBlocks(target)` trouve chaque
  `<div class="math-block" data-math="…">`, appelle
  `renderMath(source, display=true)` et insère le SVG.
- `renderMathInlines(target)` fait la même chose pour les
  `<span class="math-inline">` (avec `display=false`). Le navigateur
  pose le SVG inline dans le flux et applique le `vertical-align:
  -…ex` que MathJax émet, ce qui aligne la formule sur la baseline du
  texte environnant.

Erreurs de parsing : on ajoute la classe `math-error`, stylée en
bordure rouge avec ré-affichage de la source.

## 9. Réglages PDF

Un panneau **Réglages** (clic sur le bouton dans la toolbar ou
`Cmd/Ctrl + ,`) configure le rendu. Les réglages sont persistés dans
`localStorage`. Les réglages typographiques (tailles + couleurs des
titres, du corps, du code, des citations) s'appliquent aussi à l'aperçu
HTML pour visualiser leur effet sans exporter.

### 9.1. Schéma

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
  // Voir §7.4 pour la sémantique.
  mermaidMaxScale: number;
  mermaidMaxWidthPct: number;
  mermaidMaxHeightPct: number;
}
```

### 9.2. Comportements

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
  police), appliqué identiquement à l'aperçu et au PDF puisque les
  deux passent par le même moteur.
- Les **citations** sont affichées avec une **barre verticale** à gauche
  (`border-left` sur `<blockquote>`). Couleur réglable indépendamment du
  texte de la citation.
- Le **numéro de page** apparaît dès la page 1, à mi-hauteur de la marge
  haute ou basse selon la position. Format : entier seul (ex. « 12 »).
- Bouton **Réinitialiser** revient aux valeurs par défaut.

### 9.3. Valeurs par défaut

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
| Mermaid (scale max / largeur / hauteur) | 2 / 100 % / 70 %                |

## 10. Aide intégrée

- Le tutoriel `src/HELP.md` est bundlé via `import helpMd from './HELP.md?raw'`.
- Au premier lancement (`localStorage` vide), il sert de document par
  défaut dans l'éditeur. L'utilisateur peut le lire, l'éditer, le
  sauvegarder ou repartir d'une page blanche.
- Le **bouton Aide** (jaune pâle, à droite avant *Exporter .pdf*)
  ouvre une modale avec le HELP.md **d'origine** rendu en HTML, sans
  toucher au document de l'utilisateur. Échap / clic hors panneau /
  bouton Fermer pour la refermer.

## 11. Déploiement

- Workflow `.github/workflows/deploy.yml`.
- Déclenché sur `push` vers `main`.
- Étapes : checkout → install (`npm ci`) → build (`npm run build`, qui
  enchaîne `tsc --noEmit && vite build` — un échec TypeScript bloque le
  déploiement) → upload artifact → deploy via `actions/deploy-pages`.
- L'application doit fonctionner servie depuis un sous-chemin (ex.
  `https://user.github.io/md2pdf/`) → `base: './'` dans
  `vite.config.ts` produit des chemins relatifs.

## 12. Critères d'acceptation

1. `npm run dev` lance l'application localement, prête à éditer.
2. Le premier lancement (sans `localStorage`) charge le HELP.md.
3. Coller un Markdown couvrant les éléments §3.1 produit un aperçu HTML
   correct, et un PDF fidèle à l'aperçu (mêmes polices, mêmes glyphes
   pour les symboles `→`, `≤`, `★`…), aux limitations explicites de §3.2
   près — notamment les formules `$…$` inline qui s'affichent dans le
   flux du paragraphe à l'écran mais comme des blocs centrés en PDF.
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

## 13. Aperçu paginé et export PDF

L'aperçu (colonne de droite) simule des pages physiques (A4/A5/Letter…)
avec leurs marges, comme dans Word ou Pages. WYSIWYG strict : ce qu'on
voit dans la preview correspond pixel à pixel au PDF généré, parce que
les deux passent par le même moteur de rendu navigateur.

L'export PDF (`Exporter .pdf` ou `Cmd/Ctrl + P`) ouvre le dialogue
d'impression du navigateur, configuré pour produire un PDF sur la même
vue. L'utilisateur choisit « Enregistrer au format PDF » comme
destination.

### 13.1. Architecture

Module `src/preview-paginated.ts` :
- Lazy-load de [paged.js](https://pagedjs.org/) (~300 KB) au
  premier rendu.
- API : `paginate(htmlEl, settings, renderTo)`.
- paged.js implémente les standards W3C CSS Paged Media + CSS
  Fragmentation. Il fournit le **moteur** de pagination ; on lui
  fournit la **politique** via du CSS dynamique (§13.2).

Module `src/print-export.ts` :
- API : `exportViaPrint(source, settings, filename)`.
- Construit un sous-arbre DOM auto-suffisant (Markdown → métadonnées
  → mermaid/math/inline-math → keep-with-next), l'insère dans un
  `#md2pdf-print-target` caché en mode écran, applique le même
  `pagedCss(settings)` que l'aperçu, et appelle `window.print()`.
- Le print-target vit dans le document principal pour que les
  polices déjà chargées par l'éditeur soient disponibles au moteur
  d'impression sans round-trip iframe.
- `document.title` est temporairement remplacé par le nom de fichier
  voulu (la plupart des navigateurs s'en servent comme nom de
  fichier suggéré), restauré sur l'événement `afterprint`.

### 13.2. CSS dynamique

Généré depuis les `PdfSettings` à chaque rendu et injecté dans le
DOM (`pagedCss(settings)` dans `preview-paginated.ts`) :

```css
@page {
  size: <pageSize>;                  /* A4, A5… depuis settings.pageSize */
  margin: <top>mm <right>mm <bottom>mm <left>mm;
  @bottom-center {                   /* selon settings.pageNumber.position */
    content: counter(page);
    font-size: <pn.fontSize>pt;
    color: <pn.color>;
  }
}

/* Politique de fragmentation — minimum vital */
h1, h2, h3, h4 { break-after: avoid; }   /* pas de titre seul en bas de page */
.math-block,
.mermaid-block,
img { break-inside: avoid; }             /* blocs visuels indivisibles */
p, li, blockquote { orphans: 3; widows: 3; }
```

**Tableaux** : on utilise les défauts CSS, qui autorisent la coupure
entre lignes et **répètent automatiquement le `<thead>`** en haut de
chaque page (comportement Word/LaTeX standard, paged.js l'implémente
correctement).

**Citations `<blockquote>`** : également défauts CSS, avec
orphans/widows = 3. La barre verticale gauche (`border-left`) se
reprend naturellement en haut de la page suivante quand la citation
est coupée.

D'autres règles seront ajoutées **a posteriori** si on observe des
défauts visuels en pratique. La règle est de ne pas sur-spécifier.

### 13.3. Keep-with-next (titres et labels)

`break-after: avoid` sur les titres ne suffit pas toujours : paged.js
laisse parfois un titre orphelin en bas de page si le bloc qui le suit
ne tient pas sur la page courante. Solution : avant de passer le
contenu à paged.js, `keepLabelsWithNext()` enveloppe chaque **label**
avec son frère immédiat dans un `<div class="keep-with-next">` qui
porte un vrai `break-inside: avoid`. Un label est :

- un titre h1-h4, ou
- un paragraphe qui précède directement un bloc « présentable » :
  fenced code, `<table>`, `<img>`, `.math-block`, `.mermaid-block`.
  Le cas typique est `**Matrice**` suivi de `$$…$$`, où le gras tient
  lieu de titre.

L'enveloppement est fait en **ordre inverse** du document, pour que
les chaînes (h2 → h3 → paragraphe) finissent dans des wrappers
nestés et restent groupées.

### 13.4. Aspect visuel

- Fond `#e9eaee` (gris clair) derrière les pages.
- Pages blanches avec `box-shadow: 0 2px 8px rgba(0,0,0,.18)`.
- Espacement vertical entre pages : 24 px.
- Largeur de page : 100 % de la colonne preview. La hauteur suit le
  ratio du format choisi (`297/210` pour A4).
- Le contenu à l'intérieur d'une page conserve les marges
  (`@page margin`) — on retrouve donc visuellement la zone de texte.

### 13.5. Performance

- Repagination **debouncée à 700 ms** : la pagination est un calcul
  de layout coûteux.
- Annulation des repaginations en cours quand l'utilisateur continue
  de taper (pattern `previewReqId`).
- Ordre de grandeur observable : ~100 ms pour un doc de 5 pages,
  ~1 s pour un doc de 50 pages. Acceptable car la repagination est
  censée se voir lorsqu'on relit, pas pendant la frappe rapide.

### 13.6. Notes pratiques sur l'impression

- L'utilisateur doit choisir « Enregistrer au format PDF » (ou
  équivalent) comme destination dans le dialogue d'impression.
- Selon le navigateur, des en-têtes/pieds par défaut (URL, date)
  peuvent apparaître ; ils se décochent dans les options du dialogue.
- Le nom de fichier suggéré reprend le `document.title` que
  `exportViaPrint()` met temporairement à la valeur de la zone
  « Nom » de la toolbar.

## 14. Synchronisation éditeur ↔ aperçu

L'éditeur et l'aperçu paginé sont **co-positionnés** : ce qu'on regarde
dans l'un correspond à ce qu'on regarde dans l'autre. Le mécanisme
fonctionne dans les deux sens (scroll dans l'une fait scroller l'autre,
même chose pour le clic).

### 14.1. Le principe : ligne d'ancrage + position d'ancrage

Toute synchronisation se ramène à une **ligne d'ancrage** `L` (une
ligne source du document) et une **position d'ancrage** `y` (en pixels,
dans le viewport de la vue qui pilote). L'opération est :

> *Trouver le bloc `data-line=L` dans l'autre vue, et la scroller pour
> que ce bloc apparaisse au pixel `y` de son viewport.*

Le choix de `(L, y)` change selon ce qui a déclenché la sync :

| Action utilisateur (sur la vue A) | `L` | `y` |
|---|---|---|
| Clic à la position verticale `yc` | ligne sous le clic | `yc` |
| Scroll **vers le bas** | dernière ligne visible | **position réelle de cette ligne dans le viewport** |
| Scroll **vers le haut** | première ligne visible | **position réelle de cette ligne dans le viewport** |

Subtilité importante sur le `y` du scroll : on ne prend **pas**
simplement `viewportH` pour le scroll-down (resp. `0` pour le
scroll-up), mais bien la position réelle où la ligne d'ancrage est
rendue. Cette nuance unifie le scroll et le clic : *scroller vers le
bas, c'est cliquer sur la dernière ligne visible à l'endroit exact où
elle apparaît*. Au milieu du document, la dernière ligne visible
touche le bas du viewport (`y ≈ viewportH`) ; mais à la fin du
document, la dernière ligne avec `data-line` n'atteint pas le bord bas
du viewport (il y a derrière la marge basse de la page, le numéro de
page, …) et `y` reflète cette position effective pour que le suiveur
s'aligne correctement.

Cas particuliers aux bords du document — clamp explicite, en plus
de l'algorithme ci-dessus :

- Si la vue pilote est à `scrollTop = 0`, on force le suiveur à `0`.
- Si la vue pilote est à `scrollTop = scrollMax`, on force le suiveur
  à `scrollMax`.

Le clamp est belt-and-suspenders : l'algorithme principal couvre déjà
la majorité des cas grâce au `y` réel, mais aux extrêmes mathématiques
exacts (scrollTop = 0 ou = scrollMax) il y a des arrondis sub-pixel
qui peuvent laisser le suiveur quelques pixels avant le bord. Le clamp
garantit l'alignement parfait.

### 14.2. Cartographie ligne-source ↔ position

Le rendu de l'aperçu stamp un `data-line="N"` sur chaque bloc rendu
(paragraphe, titre, liste, math, mermaid, …) où `N` est la ligne
0-indexée du token marked correspondant dans la source. paged.js
préserve ces attributs lors du chunking en pages.

À chaque cycle de pagination on (re)construit une **table de
correspondance** triée par ligne source :

```ts
type LineMap = Array<{
  line: number;     // ligne source
  editorY: number;  // top de la ligne dans le scroller éditeur
  previewY: number; // top du bloc dans le scroller aperçu
}>;
```

Pour `editorY`, CodeMirror fournit `coordsAtPos(pos).top` ;
pour `previewY`, on lit `el.getBoundingClientRect().top -
container.getBoundingClientRect().top + container.scrollTop`.

L'interpolation linéaire ligne ↔ pixel **n'est faite qu'entre deux
entrées consécutives** de la table : elle ne traverse pas les gaps
inter-pages ni les marges `@page`, parce que ces zones n'ont pas de
ligne source associée — la table saute simplement par-dessus.

### 14.3. Détection de la direction du scroll

À chaque scroll-event sur A, on compare le `scrollTop` courant à celui
mémorisé du précédent event :

- `newTop > prevTop` → mouvement **vers le bas** (l'utilisateur
  approche la fin du document).
- `newTop < prevTop` → mouvement **vers le haut**.
- `newTop === prevTop` → ignore (déclenché par un changement de
  layout, pas un scroll utilisateur).

Cas particulier au tout premier event après l'ouverture du doc :
on prend l'ancrage haut par défaut (le doc est à `scrollTop = 0`).

### 14.4. Sync par clic / curseur

- **Clic dans l'éditeur** (ou déplacement du curseur) à la ligne `L`
  visible à la position verticale `yc` : on scrolle l'aperçu pour
  amener le bloc `data-line=L` à `yc` dans son viewport.
- **Clic dans l'aperçu** sur un bloc `data-line=L` à la position `yc` :
  on scrolle l'éditeur pour amener cette ligne à `yc` (CodeMirror
  expose `scrollIntoView(line, "top|center|nearest")` ; on calcule la
  cible directement en pixels).

### 14.5. Anti-boucle

Une sync programmatique scrolle B, ce qui déclenche son `scroll` event
qui re-déclencherait une sync vers A. On évite la boucle avec un
drapeau `syncSource` réglé sur la vue qui pilote au moment de la sync,
levé ~150 ms après le dernier mouvement programmatique.

### 14.6. Performances

- La `LineMap` est mise à jour seulement après une repagination
  complète (donc au pire à chaque debounce de 700 ms en frappe
  active).
- Pendant le scroll, chaque sync est en O(log N) (recherche binaire
  dans la table) plus deux lectures DOM. Imperceptible jusqu'à
  plusieurs centaines de pages.

## 15. À décider plus tard

- Recto/verso (marges alternées).
- Choix d'une autre famille de polices que Roboto Condensed dans les
  réglages.
- Mode sombre de l'éditeur.
- Export d'un HTML autonome.
- Sauvegarde / chargement de plusieurs documents (multi-doc).
- Coloration syntaxique des blocs de code.
- Listes de tâches `- [ ]`, notes de bas de page.
- Préambule MathJax par document via un champ `mathjax-preamble:` en
  frontmatter YAML. Son contenu (typiquement `\newcommand` + ligatures
  `\mathlig`) serait préfixé à chaque source TeX avant `doc.convert()`
  dans `src/math.ts`. Les `\mathlig{X}{Y}` n'étant pas connus de
  MathJax, il faudrait les détecter au parsing du préambule et les
  convertir en pré-substitutions textuelles. Permet à un auteur d'avoir
  ses macros perso (notations sémantique dénotationnelle, théorie des
  catégories, etc.) sans polluer le code de l'app et garde les `.md`
  autonomes.
