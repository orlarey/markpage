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

CommonMark + GFM de base :

- Titres `#` à `######` (h1 → h6)
- Paragraphes
- **Gras** (`**…**`) et *italique* (`*…*`), barré (`~~…~~`)
- Code en ligne `` `…` `` et blocs de code (```` ``` ````), sans coloration
  syntaxique
- Listes à puces (`-`, `*`) et numérotées (`1.`)
- Listes de tâches GFM (`- [ ]` / `- [x]`) — case visuelle, le toggle
  se fait en éditant la source
- Citations `>`
- Liens `[texte](url)` (cliquables dans le PDF) et autolinks `<url>`
- Règles horizontales `---`
- Images, en deux formes :
  - inline `![alt](url)` ou data URL
  - référence `![alt][label]` + `[label]: url` ailleurs dans le doc
- Tableaux GFM (`| col | col |` + ligne `|---|`)

Extensions md2pdf (toutes implémentées comme extensions `marked` ou
overrides du renderer `code`, voir §5 et §8) :

- **Diagrammes Mermaid** — bloc ```` ```mermaid ````. Voir §7.
- **Formules mathématiques** — `$$…$$` (display) et `$…$` (inline) via
  MathJax. Le bloc ```` ```math ```` est un alias *display* équivalent à
  `$$…$$` (convention GitHub depuis 2023). Voir §8.
- **Règles d'inférence** — bloc ```` ```inference [Label] ```` avec
  prémisses / barre de tirets / conclusion. Rendu en LaTeX
  `\dfrac{prem}{conc}` via MathJax. Voir §8.4.
- **Tableaux de données** — blocs ```` ```csv ```` et ```` ```tsv ````.
  Première ligne = en-têtes, suivantes = données. Séparateur
  auto-détecté pour `csv`. Guillemets RFC-4180 supportés.
- **Graphiques** — bloc ```` ```chart <type> [Title] ```` avec données
  CSV-like (`<type>` ∈ `line` / `bar`). Auto-détection séparateur,
  smart-comma pour les nombres FR (`3,14`), abscisses numériques /
  catégorielles / dates ISO 8601. Rendu inline SVG. Voir §16.
- **Encadrés (admonitions)** — syntaxe Pandoc fenced div
  `::: classname [titre] … :::`. Classes génériques (`note`, `tip`,
  `warning`, `caution`, `important`) en cadres colorés ; classes
  académiques (`theorem`, `lemma`, `proposition`, `corollary`,
  `definition`, `proof`, `example`, `remark`) en style sobre titre
  italique ; classes inconnues en cadre neutre.
- **Notes de bas de page** — syntaxe Pandoc `[^id]` (référence) +
  `[^id]: contenu` (définition). Numérotation automatique dans l'ordre
  des références (pas des définitions) ; collectées en fin de document
  sous une fine `<hr>`. Voir §17.
- **Listes de définitions** — syntaxe Pandoc `Terme\n:   Définition`.
  Plusieurs définitions par terme et plusieurs termes consécutifs dans
  la même `<dl>` supportés.

### 3.2. Hors périmètre actuel

- Coloration syntaxique des blocs de code
- Import des **images embarquées dans un fichier Word** (`.docx`) :
  l'import récupère le texte, les titres, listes, gras/italique, liens
  et citations, mais pas les images
- HTML brut dans le Markdown
- Recto/verso (marges alternées) à l'export PDF
- Notes de bas de page **multi-paragraphes** (continuations indentées
  à la Pandoc — single-line seulement en v1)
- Numérotation automatique des admonitions académiques
  (« Théorème 1.2 », « Lemme 3 », …)
- Citations bibliographiques `[@key]` et bibliographie

## 4. Interface utilisateur

### 4.1. Layout — single-pane

L'éditeur et l'aperçu paginé sont **deux vues du même document, jamais
visibles simultanément**. L'utilisateur bascule de l'une à l'autre par
un raccourci (`Cmd/Ctrl + Enter`) ou un bouton toolbar **Aperçu**.

```
┌─ Toolbar ─────────────────────────────────────────────────────────────┐
│ [Ouvrir] [Enregistrer] [Style ▾] [Aide]   Nom : […]   [Aperçu] [Exporter .pdf] [Réglages ▾] │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ╔═══════════════════════════════════════════════════════════════╗   │
│   ║  Vue active (l'une ou l'autre, selon le mode)                 ║   │
│   ║                                                               ║   │
│   ║  - Éditeur Markdown (CodeMirror) — par défaut au démarrage    ║   │
│   ║  - Aperçu paginé (paged.js) — quand la preview est demandée   ║   │
│   ║                                                               ║   │
│   ╚═══════════════════════════════════════════════════════════════╝   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

Le bouton **Aperçu** porte un état pressé (`aria-pressed=true`, fond
bleuté) quand on est en mode preview. Le bouton **Aide** garde son
fond jaune pâle. Les boutons **Style** et **Réglages** affichent un
caret `▾`.

L'élément `#panes` porte un `data-view="editor" | "preview"` qui pilote
via CSS la visibilité de chaque section (`display: none` sur l'autre).
Le `<section id="preview-pane">` est `tabindex="0"` pour que les
touches PgUp/PgDn et flèches scrollent l'aperçu après basculement.

**Pourquoi ce choix.** Le split bidirectionnel précédent générait des
boucles de feedback ingérables : taper un caractère déclenchait
re-pagination + re-sync, qui scrollait l'aperçu, qui re-syncait
l'éditeur, etc. Le single-pane découple complètement édition et
pagination — la frappe ne déclenche plus rien dans la vue paginée
(qui n'est pas visible), et la pagination ne tourne qu'au moment
d'un toggle vers la preview, sur un doc *dirty* (voir §13.5).

### 4.2. Bascule éditeur ↔ aperçu

- **Toggle (`Cmd/Ctrl + Enter` ou bouton Aperçu)** :
  - **éditeur → aperçu** : on capture l'**ancre** du curseur (ligne +
    position verticale dans le viewport éditeur), on bascule la vue,
    on re-pagine si le doc est dirty (cf. §13.5), puis on aligne
    l'aperçu sur cette ancre.
  - **aperçu → éditeur** : pas d'ancre, le curseur reste là où il
    était dans l'éditeur. La vue éditeur réapparaît telle quelle.
- **Click dans l'aperçu** = **retour éditeur avec ancrage** :
  l'utilisateur clique sur un bloc `data-line=L` à la position `yc`
  de son viewport ; on bascule en éditeur, on place le curseur en
  début de ligne `L`, et on scrolle l'éditeur pour que `L` apparaisse
  à `yc`. C'est le workflow « j'ai vu une faute, je la corrige » :
  un clic suffit.
- **Scroll dans l'aperçu** : reste local. Pas de propagation à
  l'éditeur.

Voir §14 pour les détails de la sync par ancre.

### 4.3. Comportements

- **Frappe → marque dirty** : chaque modification dans l'éditeur met
  un drapeau `dirty = true` au niveau de l'app. **Aucune autre action
  n'est déclenchée par la frappe** (pas de re-pagination, pas de
  sync, pas de re-render).
- **Persistance** : le doc est sauvegardé en `localStorage` à chaque
  modification (debounce 200 ms). Au prochain démarrage, le doc est
  restauré. Si `localStorage` est vide, c'est `HELP.md` qui est chargé
  comme document par défaut.
- **Importer** : accepte `.md`, `.markdown`, `.txt`, `.html`, `.htm`,
  `.docx`. Crée toujours un **nouveau document** dans l'index, jette
  le SHA du contenu dans le pool de blobs, bascule dessus. Pas de
  confirmation (le doc courant n'est jamais touché). À l'import, les
  data URLs inlinées sont migrées en IndexedDB. L'app bascule en mode
  éditeur (si on était en preview) et marque dirty. Limitation DOCX :
  les images embarquées dans un Word ne sont **pas** importées
  (mammoth → HTML les sort en data URLs, mais notre filtre Turndown
  les retire pour rester sur du contenu textuel propre).
- **Exporter ▾** : dropdown qui regroupe les sorties (cf. §19.4) :
  - `.md` produit un Markdown portable (data URLs en fin de doc en
    forme ref-style, voir §6).
  - `.pdf` exécute le pipeline §13.6 via paged.js.
  Le nom de fichier est dérivé du nom du doc courant (slugifié).
- **Aide** : ouvre la fenêtre d'aide séparée (cf. §10).
- **Style** : ouvre un menu déroulant avec les commandes de mise en forme.
  Même menu disponible au clic-droit dans l'éditeur. Les items déjà
  applicables au curseur courant sont signalés par une coche. Inclut
  également **Numéroter les sections** (cf. §15).
- **Réglages** : ouvre une fenêtre browser séparée (mêmes mécaniques
  que la fenêtre d'aide, fallback modal si popup bloqué) pour
  personnaliser le rendu PDF (§9). Les changements marquent dirty et
  re-paginent immédiatement si la preview est visible — l'idée étant
  de poser cette fenêtre à côté de l'aperçu et voir l'effet en temps
  réel.
- **Sélection ligne entière** : clic sur un numéro de ligne dans la
  gouttière sélectionne la ligne ; glisser-en sélectionne plusieurs.
- **Insertion d'image** : trois entrées (drag-drop sur l'éditeur, paste
  d'une image du presse-papier, item « Insérer une image… » du menu Style).
  Les images sont automatiquement redimensionnées (max 2000 px) et
  réencodées (JPEG q0.85, ou PNG si l'original a une couche alpha).
  Stockées en IndexedDB (voir §6). Possible aussi par drag-drop depuis le
  web (avec limites CORS, voir §6).
- **Métadonnées centrées** (auteur / organisation / date) insérées juste
  après le premier `# Titre 1` du doc, dans l'aperçu et dans le PDF.
- **Ligatures de saisie** (cf. §18) : actives à la frappe et au paste,
  désactivées dans les fenced code blocks (sauf ` ```inference `).

### 4.4. Raccourcis clavier

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
| `Cmd/Ctrl` + `Maj` + `N` | Numéroter les sections (§15) |
| `Cmd/Ctrl` + `Alt` + `I` | Insérer une image (file picker) |
| `Tab` (curseur seul ou sélection mono-ligne) | Insérer un `\t` |
| `Tab` (sélection multi-lignes) | Indenter |
| `Maj` + `Tab` | Désindenter |

**Application** (globaux, indépendants du focus) :

| Raccourci | Action |
|---|---|
| `Cmd/Ctrl` + `Enter` | Basculer éditeur ↔ aperçu |
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

L'aperçu et l'export PDF partagent **le même rendu via paged.js**.
La preview montre le résultat paginé à l'écran ; l'export pagine la
même chose dans un container caché et appelle `window.print()` —
d'où conformité parfaite preview ↔ PDF (cf. §13.6).

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
annotateSourceLines() (data-line=N pour la sync §14)
   │
   ▼
renderMermaidBlocks / renderMathBlocks / renderMathInlines (en parallèle,
remplissent les placeholders avec les SVG MathJax / Mermaid)
   │
   ▼
keepLabelsWithNext() (regroupe titres + paragraphes-labels avec leur
suivant immédiat dans des `<div class="keep-with-next">`) — appelé
par paginate() / paginateOnce()
   │
   ├─► preview : paginate() → paged.js → DOM paginé écran (.pagedjs_page)
   └─► export  : paginateOnce() → paged.js dans #md2pdf-print-target → window.print()
```

Le pipeline ne tourne **pas** à la frappe — il est déclenché à
chaque toggle vers la preview (sur un doc dirty) ou à un changement
de réglages, jamais en arrière-plan (cf. §4.3 et §13.5). Un compteur
`previewReqId` annule un rendu obsolète si un toggle plus récent
arrive avant la fin du précédent.

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

### 5.3. Tests de régression

Harness `vitest` + `happy-dom` (cf. `vitest.config.ts`). Deux suites
parcourent un **corpus** de fichiers markdown sous `tests/corpus/` et
comparent chaque sortie à un golden checké-in. Modifier le corpus ou
le code de rendu fait dériver les goldens ; `npm run test:update`
régénère, on relit le diff, on commit.

Scripts :

| Commande              | Effet                                         |
| --------------------- | --------------------------------------------- |
| `npm test`            | vérifie les goldens, échoue à la moindre dérive |
| `npm run test:watch`  | re-lance à chaque sauvegarde (dev)             |
| `npm run test:update` | régénère les goldens                           |

Suites :

- `tests/export-latex.test.ts` — pour chaque `<name>.md`, appelle
  `exportLatex(md, TEST_SETTINGS)` et snapshot `<name>.tex`. Si
  le doc contient un mermaid, snapshot aussi `<name>-mermaid-1.svg`
  (le SVG sanitisé qui finirait dans le zip — preuve que la
  sanitisation pour inkscape reste correcte).
- `tests/render-preview.test.ts` — pour chaque `<name>.md`, appelle
  `renderPreview` + `applyPreviewMetadata` sur un `<div>` happy-dom
  et snapshot `<name>.html` (la sortie marked structurelle, sans
  post-processing math / mermaid).

Mocks au niveau module (`vi.mock`) :

- `renderMermaid` → SVG-piège fabriqué exprès pour exercer les six
  branches de `sanitizeSvgForInkscape` (foreignObject, em-unit `dy`
  sur `<text>`, `display:none`, filter, max-width, fill forcing).
- `renderChart` → SVG fixe simple.
- `getImage` → blob PNG fictif.

Ces stubs garantissent que les tests testent **notre** code (parser
markdown, convertisseurs, sanitiseur SVG, application des settings)
sans dépendre d'une version donnée de mermaid ni d'un vrai moteur
de layout. Les goldens restent reproductibles sur toute machine.

Le corpus actuel couvre : titres, formatage inline, listes, blocs de
code (whitelist `language=`), math (back-conversion Unicode +
`align*` pré-emballé), tables (pipe / csv), admonitions (env amsthm
+ tcolorbox), notes de bas de page + def lists, règles d'inférence,
mermaid + chart, plus une copie de `HELP.md` comme cas
« tout-en-un » (~1000 lignes). Couverture étendue au fil des
features ajoutées.

`TEST_SETTINGS` (cf. `tests/fixtures/settings.ts`) fige date, auteur
et organisation : `DEFAULT_SETTINGS` avec `date.custom = '2026-01-01'`
et `author/organization` à `Test Author` / `Test Org`. Sans ce pin,
les goldens divergeraient à chaque jour calendaire ou changement
local des Réglages.

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
tokens et un override du renderer `code` :

- **`mathBlock`** (niveau block) — matche `^\$\$\n([\S\s]+?)\n\$\$`
  avec `$$` seul sur sa ligne d'ouverture comme de fermeture. Sans
  cette contrainte de ligne, des `$$` mentionnés dans des code spans
  ou fenced blocks seraient capturés à tort. Espaces/tabs en fin de
  ligne de délimiteur tolérés.
- **`mathInline`** (niveau inline) — matche
  `\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\d)`. Garde-fous Pandoc-style
  pour ne pas avaler des dollars de prix (« Cost $5 or $7 ») ni des
  `$$`. L'alternative `\\.` à l'intérieur du groupe permet d'écrire
  `\$` (ou tout autre caractère échappé) à l'intérieur de la formule
  sans casser la fermeture.
- **Bloc ```` ```math ```` (alias display)** — override du renderer
  `code` quand `lang === 'math'`. Émet le même placeholder
  `<div class="math-block">` que `$$…$$`. Aligné sur la convention
  GitHub. Évite le piège des `$$` qui doivent être seuls sur leur
  ligne.

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

### 8.4. Bloc ```inference

Override du renderer `code` quand `lang === 'inference'` (avec étiquette
optionnelle entre parenthèses : ```` ```inference (MP) ````). Le
contenu du bloc est découpé sur une **ligne de tirets** (3 ou plus,
seule sur sa ligne) :

- au-dessus : les **prémisses**, séparées par `;` (converti en `\quad`)
  ou réparties sur plusieurs lignes (idem) ;
- en-dessous : la **conclusion**.

Le tout est emballé en `\dfrac{prémisses \quad …}{conclusion}` et
émis comme placeholder `<div class="math-block">`, traité ensuite par
le pipeline math standard. L'étiquette devient `\quad \textsf{(label)}`
à droite de la barre.

**Pas de pré-substitution ASCII → LaTeX** : on s'appuie sur les
ligatures de saisie (§18), qui restent **actives à l'intérieur de
``` ```inference ``` ``` ** (seule exception au comportement « ligatures
off dans les fenced blocks »). L'utilisateur tape `|-`, `->`, `[[`,
`|N` et la source contient déjà `⊢`, `→`, `⟦`, `ℕ` au moment où le
renderer prend la main. MathJax 3 (avec les paquets `textmacros` et
`unicode` dans `AllPackages`) accepte ces caractères Unicode
directement en mode math.

## 9. Réglages PDF

Un panneau **Réglages** (clic sur le bouton dans la toolbar ou
`Cmd/Ctrl + ,`) configure le rendu. Les réglages sont persistés dans
`localStorage`. Les réglages typographiques (tailles + couleurs des
titres, du corps, du code, des citations) s'appliquent aussi à l'aperçu
HTML pour visualiser leur effet sans exporter.

### 9.1. Schéma

```ts
interface TextStyle {
  fontSize: number;
  color: string;
  // Headings (h1-h4) seulement — lus par les rendus preview + paged.
  underline?: boolean; // border-bottom sous le titre
  italic?: boolean;
  weight?: number;     // 300 / 400 / 500 / 600 / 700
}

interface CustomFont {
  name: string; // family CSS, ex. "Tangerine"
  url: string;  // URL Google Fonts complète (css2?family=…)
}

interface PdfSettings {
  pageSize: 'A3' | 'A4' | 'A5' | 'B5' | 'LETTER' | 'LEGAL';
  margins: { top: number; bottom: number; left: number; right: number }; // mm
  justify: boolean;
  lineHeight: number; // multiplier "à la CSS", défaut 1.25
  fonts: { headings: string; body: string; code: string };
  customFonts: CustomFont[]; // §20.6
  author:       { text: string; show: boolean; bold: boolean };
  organization: { text: string; show: boolean; bold: boolean };
  date: { mode: 'none' | 'today' | 'custom'; custom: string };
  styles: {
    h1:    TextStyle; // peut porter underline / italic / weight
    h2:    TextStyle;
    h3:    TextStyle;
    h4:    TextStyle;
    body:  TextStyle; // underline / italic / weight ignorés
    code:  TextStyle;
    quote: TextStyle & { barColor: string };
  };
  // Espacements verticaux, en em (multiple de la taille de l'élément
  // visé). Cf. §9.2.
  headingSpacing: { above: number; below: number };
  paragraphSpacing: number;
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

- **Graisse, italique, trait sous le titre** réglables par niveau h1-h4
  (champ `weight` / `italic` / `underline` de `TextStyle`). Choix dans
  la dropdown de graisse : `300 Light / 400 Regular / 500 Medium /
  600 Semibold / 700 Bold`. Si la police choisie ne fournit pas la
  variante demandée, le navigateur **synthétise** un faux gras /
  italique (rendu moins propre — limitation documentée).
- Le **h1** est traité comme titre du document : toujours **centré**.
- h2..h6 sont toujours alignés à gauche, indépendamment de l'option
  « Justifier le texte ».
- h5 et h6 héritent automatiquement des réglages typographiques de h4.
- **Espacement vertical des titres** (`headingSpacing.above` / `below`,
  en `em` de la taille du titre) appliqué uniformément à h1-h6, plus
  une règle `:first-child` pour ne pas pousser le premier titre du
  document vers le bas.
- **Espacement entre paragraphes** (`paragraphSpacing`, en `em` du
  corps) émis comme marge symétrique sur `<p>`. Les listes,
  blockquotes, blocs de code etc. conservent leurs marges navigateur
  par défaut — collapse de marges en jeu, donc l'espace adjacent à un
  `<ul>` reste à ~1em même si `paragraphSpacing = 0`.
- En sortie paginée (paged.js / PDF), une règle `break-after: avoid`
  est posée sur h1-h6 pour éviter qu'un titre se retrouve seul en bas
  de page. La règle est **non scopée** (sélecteur simple) parce que
  le break-processor de paged.js parse le CSS lui-même et bute sur
  `:where(...)` ; un selector simple le contourne sans effet de bord
  (`break-after` n'a d'effet qu'en contexte paginé).
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

#### Disposition de la fenêtre Réglages

La fenêtre Réglages (détachée par défaut, modale en fallback popup
bloqué) utilise un **CSS grid responsive** : chaque section est une
piste `minmax(30rem, 1fr)` avec `auto-fit`, ce qui donne
automatiquement 1 colonne en dessous de ~1020px, 2 colonnes au-delà,
3 colonnes au-delà de ~1560px. La section historique « Styles » a été
éclatée en trois cartes plus digestes (`Espacement`, `Titres`,
`Corps`) pour mieux saturer la grille — sinon un seul bloc géant
restait coincé tout en haut d'une colonne pendant que les autres
étaient vides. La fenêtre détachée s'ouvre à 1080×820 par défaut,
juste assez pour deux colonnes confortables.

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
| h1-h3 / h4 — trait sous le titre | activé / désactivé              |
| h1-h4 — italique     | désactivé                                    |
| h1-h4 — graisse      | Medium (500)                                 |
| Espace titres (au-dessus / en dessous) | 1.6 / 0.6 em             |
| Espace entre paragraphes | 1.0 em                                   |
| Texte normal         | 11 pt, couleur #000000                       |
| Code                 | 10 pt, couleur #1f2328, fond #f6f8fa (fixe)  |
| Citation             | 11 pt, couleur #57606a, barre #d0d7de        |
| Numéro de page       | bas centre, 9 pt, non italique, #57606a      |
| Polices personnalisées | aucune (liste vide)                        |
| Mermaid (scale max / largeur / hauteur) | 2 / 100 % / 70 %                |

### 9.4. Multi-profil de réglages

Un utilisateur maintient plusieurs jeux de `PdfSettings` (article
scientifique sobre / note de cours aérée / diaporama vertical, etc.)
dans une **bibliothèque de profils nommés**, parallèle à celle des
documents (§19). Un seul profil est actif à la fois et s'applique à
tous les documents.

#### 9.4.1 Modèle de domaine

Un profil est une paire `p = (name, content)` où :

- **`name`** : libellé utilisateur, **unique** dans la bibliothèque.
- **`content`** : un `PdfSettings` (cf. §9.1).

Ces deux dimensions sont **logiquement indépendantes**. La relation
`name → content` est une fonction (un nom mappe vers un unique
contenu), mais `content → name` est un-à-plusieurs (plusieurs
profils peuvent avoir le même contenu — typiquement parce qu'on a
dupliqué pour garder un filet avant de modifier). Il n'y a donc pas
de bijection.

#### 9.4.2 Opérations (API publique)

Chaque opération mute soit le **nom**, soit le **contenu**, soit le
**pointeur courant**, jamais plusieurs dimensions atomiquement. Pour
renommer-et-éditer, l'utilisateur fait deux pas séparés.

| Opération                       | Touche le nom                | Touche le contenu                            | Pointeur courant                       |
| ------------------------------- | ---------------------------- | -------------------------------------------- | -------------------------------------- |
| `switch(name)`                  | —                            | —                                            | `current ← name`                       |
| `rename(oldName, newName)`      | mute (collision auto-renommée) | —                                          | suit si `oldName === current`          |
| `edit(content)`                 | —                            | rewrite du contenu du profil **courant**     | —                                      |
| `reset()`                       | —                            | `edit(DEFAULT_SETTINGS)`                     | —                                      |
| `create(name, content)`         | ajoute (collision auto-renommée) | ajoute                                   | optionnel — l'UI switche typiquement vers le nouveau |
| `duplicate(name)`               | ajoute « Copie de `name` »   | **partage** le contenu du profil source      | optionnel                              |
| `delete(name)`                  | retire ; refuse si dernier   | — (le contenu reste si d'autres noms le référencent) | si `name === current`, retombe sur le plus récent |
| `importJson(json)`              | ajoute (depuis `json.name`)  | ajoute (depuis `json.settings`)              | optionnel                              |
| `exportJson(name)`              | lit                          | lit                                          | —                                      |
| `migrateLegacy()`               | crée une entrée « Par défaut » la première fois | importe `md2pdf:settings`         | la pointe                              |

Trois propriétés qui tombent de cette décomposition :

1. **`edit` n'a pas de paramètre `name`** : le panneau Réglages
   n'affiche qu'un seul profil à la fois (le courant). Pour modifier
   un autre profil, on `switch(name)` puis on `edit(...)`.
2. **`duplicate` partage le contenu** : c'est observable seulement
   comme une optimisation de stockage. Sémantiquement, modifier le
   profil dupliqué n'affecte **pas** le profil d'origine
   (copy-on-write).
3. **Aucune opération ne supprime un contenu directement.** Un
   contenu n'existe que parce qu'au moins un nom le référence ; le
   contenu disparaît implicitement quand son dernier référent est
   supprimé.

#### 9.4.3 Invariants

- L'index contient **au moins un profil** à tout moment (post
  bootstrap). Si le schéma est vide et qu'aucune migration n'est
  possible, on crée un profil « Par défaut » avec
  `DEFAULT_SETTINGS`.
- Le pointeur `current` désigne **toujours** un profil existant.
  Toute opération qui pourrait l'invalider (delete) le ré-affecte
  immédiatement.
- Les `name` sont **uniques** dans la bibliothèque. Toute opération
  qui en ajouterait un en collision auto-renomme (`Mon profil` →
  `Mon profil 2`).

#### 9.4.4 Surface utilisateur

Un dropdown `[<nom du profil courant> ▾]` ancré dans la barre de
titre de la fenêtre Réglages. Pattern **switch-en-un-clic** :

- **En-tête** : un input éditable contenant le nom du profil
  courant. `Enter` = `rename(current, value)` puis fermer. `Esc` =
  annuler sans muter.
- **`+ Nouveau profil`** : `create(« Nouveau profil », currentContent)`
  + `switch(nouveau)`. Amorcer sur le contenu courant économise un
  paramétrage de zéro quand on veut tester une variante.
- **Liste des autres profils** : une ligne par profil, un clic =
  `switch(name)`. Pas de boutons hover, pas d'actions secondaires
  inlinées.
- **Séparateur**, puis trois actions qui s'appliquent au **profil
  courant uniquement** :
  - `Dupliquer` → `duplicate(current)` + `switch(copie)`.
  - `Supprimer` → `delete(current)` (désactivé s'il ne reste qu'un
    profil ; le nouveau courant devient le plus récent restant).
  - `Réinitialiser` → `reset()` (équivalent du bouton historique
    *Réinitialiser*, qu'on supprime du footer).
- **Séparateur**, puis `Importer…` (file picker `.json` →
  `importJson`) et `Exporter…` (`exportJson(current)` + téléchargement
  de `<slug du nom>.json`).

Le pattern doc-menu (actions Renommer / Dupliquer / Supprimer
révélées au hover par ligne) est délibérément abandonné ici : on a
typiquement 3-5 profils, l'action principale est *switcher*, et
agréger les actions du profil courant en bas du menu garde une
seule ligne par profil. Pour agir sur un autre profil, on switche
puis on agit — un clic de plus, mais beaucoup moins de bruit
visuel.

#### 9.4.5 Format d'import / export

Un fichier JSON par profil. Enveloppe versionnée pour permettre des
migrations futures :

```jsonc
{
  "version": 1,
  "name": "Mon profil",
  "settings": { /* PdfSettings inline */ }
}
```

- `version > 1` côté reader → erreur explicite « mise à jour de
  md2pdf nécessaire ».
- `name` ou `settings` manquant → erreur de validation.
- Le `name` à l'import sert d'**indice** ; si une entrée avec ce nom
  existe déjà, l'auto-rename de `create` produit `Mon profil 2`.
  Re-importer un export local crée donc une seconde entrée
  (pointant probablement vers le même contenu de façon transparente —
  cf. §9.4.6) ; à l'utilisateur de supprimer la seconde s'il préfère.

#### 9.4.6 Stockage et dédup (implémentation)

L'API publique ci-dessus ne mentionne ni SHA, ni blob. Sous le
capot, l'implémentation est **content-addressed**, calquée sur
`docs.ts` :

Trois familles de clés `localStorage` :

```
md2pdf:settings-profiles:index       → JSON ProfileEntry[]
md2pdf:settings-profiles:blob:<sha>  → JSON PdfSettings
md2pdf:settings-profiles:current     → uuid
```

```ts
interface ProfileEntry {
  uuid: string;         // handle interne, stable à travers les renommages
  name: string;         // unique dans l'index
  mtime: number;        // ms epoch
  contentSha: string;   // SHA-256 hex du JSON PdfSettings → clé du blob
}
```

Conséquences :

- **`duplicate` ne copie pas le contenu** : c'est une nouvelle entrée
  pointant sur la même SHA. Coût en localStorage = la taille de
  l'entrée (~120 octets), pas la taille du blob.
- **`create` / `importJson` dédupliquent automatiquement** : si la
  SHA du contenu fourni existe déjà, on n'écrit pas le blob une
  seconde fois.
- **`edit` est idempotent** sur no-op : si le contenu produit la
  même SHA que celui d'avant, on ne touche ni au blob ni à `mtime`.
  (Évite que le tri par récence ne flippe en permanence pendant que
  l'utilisateur passe la souris sur une checkbox déjà cochée.)
- **GC** : `gc()` supprime tous les blobs dont la SHA n'est plus
  référencée par aucune entrée. Cheap, idempotent ; on l'invoque au
  bootstrap et après chaque `delete`.

L'`uuid` interne sert à : (a) parler à un profil de façon stable
quand son nom est en cours de mutation, (b) router les callbacks UI
(« la ligne cliquée » → quelle entrée ?). Il n'apparaît jamais dans
l'API publique ni dans le format d'export.

La clé legacy `md2pdf:settings` (mono-profil) est convertie au
premier lancement par `migrateLegacy` en un profil nommé « Par
défaut », puis supprimée. Opération idempotente : si l'index existe
déjà, on n'y touche pas.

#### 9.4.7 Liaison aux documents

V1 : **profil global actif**. Un seul profil actif à la fois,
partagé par tous les documents. Switcher de profil applique
immédiatement les nouveaux réglages à l'aperçu en cours et au
prochain export.

Hors v1 : binding par document (un doc se souvient de son profil),
nécessiterait un champ `settingsProfileId` sur `DocEntry` et une
politique de migration.

## 10. Aide intégrée

- Le tutoriel `src/HELP.md` est bundlé via `import helpMd from './HELP.md?raw'`.
- Au premier lancement (`localStorage` vide), il sert de contenu au
  document « Aide md2pdf » que l'index multi-doc (§19) crée
  d'office. L'utilisateur peut le lire, l'éditer, le sauvegarder ou
  repartir d'une page blanche via *+ Nouveau document*.
- Le **bouton Aide** (jaune pâle, au centre de la toolbar) ouvre une
  **fenêtre browser séparée** rendant le HELP.md **d'origine** en
  HTML, sans toucher au document de l'utilisateur. Chaque bloc de
  code y porte un bouton *Insérer dans le document* qui injecte le
  code à la position du curseur de l'éditeur. La fenêtre est
  single-instance (refocus si déjà ouverte) ; fallback automatique
  sur une modale interne si le popup est bloqué. Cmd/Ctrl+Z et
  Shift+Cmd/Ctrl+Z forwardés vers l'éditeur depuis la fenêtre
  d'aide.

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

L'aperçu simule des pages physiques (A4/A5/Letter…) avec leurs marges,
comme dans Word ou Pages. **WYSIWYG strict** : ce qu'on voit dans la
preview correspond pixel à pixel au PDF généré, parce que les deux
passent par **paged.js** sur le même moteur de rendu navigateur.

L'export PDF (`Exporter .pdf` ou `Cmd/Ctrl + P`) pagine le contenu
**dans un container caché** via paged.js, puis appelle `window.print()`.
L'utilisateur choisit « Enregistrer au format PDF » comme destination
et **« Marges : Aucune »** dans les options du dialogue (cf. §13.7).

### 13.1. Architecture

Module `src/preview-paginated.ts` :
- Lazy-load de [paged.js](https://pagedjs.org/) (~300 KB) au
  premier rendu.
- API : `paginate(htmlEl, settings, renderTo)` — pagine pour l'aperçu,
  gère un `currentPreviewer` au niveau module (le détruit avant chaque
  re-paginate pour libérer les `ResizeObserver` attachés aux Pages).
- API : `paginateOnce(htmlEl, settings, renderTo)` — variante
  one-shot pour le pipeline print, qui ne touche pas au
  `currentPreviewer` (sinon imprimer ferait disparaître l'aperçu) et
  retourne une closure de teardown que l'appelant invoque au cleanup.
- paged.js implémente les standards W3C CSS Paged Media + CSS
  Fragmentation. Il fournit le **moteur** de pagination ; on lui
  fournit la **politique** via du CSS dynamique (§13.2).

Module `src/print-export.ts` :
- API : `exportViaPrint(source, settings, filename)`.
- Construit un sous-arbre DOM auto-suffisant (Markdown → métadonnées
  → mermaid/math/inline-math), le pose dans `#md2pdf-print-target`
  positionné hors-écran avec `visibility: hidden` (paged.js a besoin
  de dimensions mesurables pour fragmenter), **pagine via
  `paginateOnce`**, puis applique un stylesheet `@media print` qui
  affiche le print-target et masque tout le reste.
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
img,
.admonition,
.chart-block { break-inside: avoid; }    /* blocs visuels indivisibles */
p, li, blockquote { orphans: 3; widows: 3; }
.keep-with-next { break-inside: avoid; } /* §13.3 */

/* Images : cap proportionnel à la zone de page pour qu'une portrait
   tienne toujours sur une page. Sans ça, paged.js bouclait sur les
   docs avec image ≥ hauteur page + break-inside: avoid. */
img {
  max-width: 100%;
  max-height: <pageH - margins - 4mm>;
  width: auto; height: auto;
  object-fit: contain;
}
```

Pour le **pipeline print uniquement**, un override surcharge le
`@page margin` à `0` (`!important`). paged.js, à ce moment-là, a déjà
laid-out chaque page comme un `.pagedjs_page` div de la taille papier
exacte avec ses marges internes baked-in. Forcer `@page { margin: 0 }`
empêche Chrome d'ajouter ses propres marges « par défaut » qui
écraseraient les nôtres (cf. §13.7).

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

### 13.5. Performance et déclenchement

- **La pagination ne tourne PAS pendant la frappe.** L'éditeur marque
  le doc `dirty` à chaque modification, mais la re-pagination n'a lieu
  que :
  - au **toggle** vers la preview, si le doc est dirty (cf. §4.2) ;
  - au **changement de réglages**, immédiatement si la preview est
    affichée, sinon différé au prochain toggle.
- Annulation des paginations en cours quand un nouveau toggle survient
  (pattern `previewReqId`).
- Ordre de grandeur : ~100 ms pour un doc de 5 pages, ~1 s pour un
  doc de 50 pages. Pris une fois au toggle, c'est imperceptible.

### 13.6. Pipeline export PDF (print)

L'export PDF **réutilise paged.js** (pas seulement `window.print()`
sur du contenu vierge) :

1. Construire le sous-arbre DOM auto-suffisant (Markdown rendu →
   metadonnées → mermaid/math).
2. Le poser dans `#md2pdf-print-target`, hors-écran et invisible
   (`position:fixed; left:-10000px; visibility:hidden`) mais avec une
   `width: 210mm` pour que paged.js puisse mesurer.
3. `await document.fonts.ready` (les ruptures de ligne dépendent des
   métriques de fonte).
4. `await paginateOnce(content, settings, target)` — paged.js layoute
   chaque page comme un `.pagedjs_page` div à dimensions exactes.
5. Réinitialiser le style inline du target, installer la `<style>`
   `@media print` qui révèle le target et masque le reste de l'app,
   surcharge `@page margin: 0 !important`.
6. `globalThis.print()` ouvre le dialogue.
7. Sur `afterprint` (ou timeout 30 s en fallback Safari), la closure
   de teardown détache les `ResizeObserver` des Pages, le target et
   la `<style>` sont retirés.

Avantage du passage par paged.js plutôt que de laisser le moteur de
print du navigateur paginer : les marges utilisateur sont **baked
dans les `.pagedjs_page` divs**, donc Chrome ne peut pas les écraser
(à condition que l'utilisateur sélectionne « Marges : Aucune », cf.
§13.7).

### 13.7. Notes pratiques sur l'impression

- L'utilisateur doit choisir « Enregistrer au format PDF » (ou
  équivalent) comme destination dans le dialogue d'impression.
- L'utilisateur doit **également** choisir **« Marges : Aucune »** dans
  les options « Plus de paramètres » du dialogue. Sans ça, Chrome
  ajoute ses ~12 mm de marges par-dessus les nôtres, ce qui rétrécit
  la zone imprimable et fait dépasser ou re-scaler les
  `.pagedjs_page` divs (qui font la taille exacte du papier). Cette
  contrainte est documentée dans HELP.md.
- Selon le navigateur, des en-têtes/pieds par défaut (URL, date)
  peuvent apparaître ; ils se décochent dans les options du dialogue.
- Le nom de fichier suggéré reprend le `document.title` que
  `exportViaPrint()` met temporairement à la valeur de la zone
  « Nom » de la toolbar.

### 13.8. paged.js patché (null-derefs)

paged.js 0.4.3 a plusieurs null-derefs dans `findElement`,
`createBreakToken`, `nodeAfter`/`nodeBefore`, `nextSignificantNode`/
`previousSignificantNode`. Les `ResizeObserver` qu'il attache à
chaque `Page` peuvent émettre des `requestAnimationFrame` après que
le pane preview soit passé en `display:none` (ou que la cible
d'impression soit retirée), et la chaîne de walk DOM crashe sur des
nodes null transitoires.

Six null-guards défensifs sont appliqués via `patch-package` :
`patches/pagedjs+0.4.3.patch`, rejoué automatiquement par le
`postinstall` de `package.json`. Tous retournent simplement
undefined / null en amont — paged.js documente que `breakToken is
nullable`, et le walk peut bailer proprement.

## 14. Synchronisation éditeur ↔ aperçu

Le single-pane (§4.1) signifie que les deux vues ne sont jamais
visibles en même temps. La synchronisation n'est **plus** une boucle
permanente entre deux scrollers — c'est un **transfert d'ancre** au
moment précis où l'utilisateur bascule. Quatre points de sync, pas
plus.

### 14.1. Le principe : ancre (ligne, y)

Une **ancre** est une paire `(L, y)` :
- `L` : la ligne source 0-indexée que l'on souhaite « regarder ».
- `y` : la position verticale (en pixels) où elle doit apparaître dans
  le viewport de la vue cible.

Appliquer une ancre à une vue cible = scroller cette vue pour que la
ligne `L` apparaisse au pixel `y` de son viewport.

### 14.2. Cartographie

Comme avant, l'aperçu stamp un `data-line="N"` sur chaque bloc rendu
via `annotateSourceLines()`. paged.js préserve ces attributs lors du
chunking en pages. Pour aller de `L` (ligne source) à un `y` dans le
scroller de l'aperçu, on lit le `getBoundingClientRect()` du bloc
`[data-line=L]` le plus proche et on interpole linéairement entre
deux entrées si la ligne tombe entre deux blocs.

Pour le sens inverse (du `y` d'un clic à la ligne du bloc cliqué),
on remonte du `event.target` au plus proche ancêtre `[data-line]`.

### 14.3. Les quatre points de sync

| Déclencheur | Source | Cible | Quand |
|---|---|---|---|
| `Cmd+Enter` (ou bouton Aperçu) — éditeur → aperçu | curseur de l'éditeur | aperçu | au toggle |
| `Cmd+Enter` — aperçu → éditeur | (rien) | éditeur (pas de re-scroll) | au toggle |
| Click dans l'aperçu sur un bloc | bloc cliqué + position du clic | éditeur | au click |
| Re-paginate alors qu'on est en preview (settings) | curseur de l'éditeur | aperçu | après pagination |

L'ancre **éditeur → aperçu** est lue via
`editorCursorAnchor(view)` : on prend la ligne du curseur et son top
relatif au viewport (`block.top - scrollTop`). On la passe ensuite à
`applyAnchorToPreview(previewEl, anchor)`.

L'ancre **aperçu → éditeur** est lue via `previewClickAnchor(e,
previewEl)` qui remonte au `[data-line]`. Appliquée par
`applyAnchorToEditor(view, anchor)` qui place le curseur en début de
ligne et scrolle.

### 14.4. Pas de boucle, pas d'anti-boucle

Avec le single-pane, **aucune action utilisateur sur une vue ne
modifie l'autre vue de façon visible**. La frappe modifie la source
mais ne touche pas l'aperçu (qui n'est pas affiché de toute façon).
Le scroll dans l'aperçu reste local. Il n'y a donc plus de boucle de
feedback à briser, plus d'echo guard, plus de drapeau de
suppression — le code de sync s'est réduit à quatre fonctions pures
et un click-handler.

### 14.5. Performance

Chaque application d'ancre lit la `LineMap` (un walk
`querySelectorAll('[data-line]')` qui produit une table triée). Pour
un doc de quelques centaines de blocs, c'est imperceptible. La table
est reconstruite **à la demande** à chaque application d'ancre — pas
de cache, pas d'invalidation à gérer.

## 15. Numérotation des sections « par l'exemple »

Module `src/numbering.ts`. Commande exposée dans le menu Style et via
`Cmd/Ctrl + Maj + N`. Réécrit le source en place (un seul transaction,
donc un seul `Cmd+Z` annule tout).

### 15.1. Détection (premier titre = patron)

Pour chaque niveau (h1 → h6), on regarde le **premier** titre apparu
dans le document et on en déduit son style de numérotation. Les
styles reconnus :

| Premier titre | Style appliqué à tous |
|---|---|
| pas de préfixe | `none` (rien à numéroter ; le préfixe éventuel des suivants est retiré) |
| `# 1. X` / `# 1) X` / `# (1) X` | décimal flat avec le suffixe préservé |
| `# A. X` / `# a. X` | lettre majuscule / minuscule (exclut `I`/`i` qui matchent le Roman) |
| `# I. X` / `# i. X` | romain majuscule / minuscule |
| `## 1.1 X` (à un niveau k≥2) | hiérarchique : préfixe = compteurs des ancêtres + propre, séparés par `.` |
| `## 1.1. X` | hiérarchique avec point final |

### 15.2. Cas du titre du document

Convention LaTeX `article` / GitHub README : si le doc contient
**exactement un seul `# heading`** ET que celui-ci est la première
ligne non-vide après une éventuelle frontmatter YAML, alors c'est le
**titre** du document — pas une section. Dans ce cas la numérotation
**décale d'un cran** :

- raw `#` (le titre) : laissé tel quel, jamais préfixé ni dépouillé.
- raw `##` : devient « niveau 1 » logique (premier `##` détermine le
  style appliqué à tous les `##`).
- raw `###` : devient « niveau 2 » logique. Etc.

Plusieurs `#` dans le document (ou un `#` qui n'est pas en première
ligne) → pas de décalage, comportement uniforme.

### 15.3. Renumérotation

Walk linéaire sur les lignes en sautant les fenced code blocks. Pour
chaque heading :
1. compteur du niveau effectif += 1, compteurs plus profonds reset.
2. on strippe le préfixe numéroté existant (s'il y en a un) en
   utilisant la même regex que pour la détection.
3. on génère le nouveau préfixe selon le style stocké pour ce
   niveau et on le préfixe au reste du titre.

Hiérarchique au niveau k : les `k` compteurs des ancêtres (effectifs)
sont joints par `.`, optionnellement suivis d'un point final.

## 16. Graphiques (```chart)

Module `src/chart.ts`. Self-contained : pas de dépendance externe, le
SVG est émis inline dans le DOM rendu, donc imprime crispe et stay
éditable comme un vecteur. Override du renderer `code` pour
`lang === 'chart'`.

### 16.1. Syntaxe

````
```chart <type> [Title]
x-label, y1-label[, y2-label, …]
x1, y1[, y1', …]
…
```
````

`<type>` ∈ `line` / `bar`. Title optionnel, peut être entre guillemets
pour préserver de la ponctuation. Première ligne = en-têtes (label X
+ une série Y par colonne supplémentaire). Lignes suivantes = données.
Multi-séries → palette automatique + légende en haut à droite.

### 16.2. Parsing CSV-like

- **Auto-détection du séparateur** sur la première ligne :
  tab > semicolon > comma.
- **Smart-comma** quand séparateur = `,` : une virgule entre deux
  chiffres sans whitespace n'est PAS un séparateur (regex
  `(?<!\d),|,(?!\d)`). Préserve les nombres FR `3,14`.
- **Parse number** : la virgule est normalisée en point avant
  `parseFloat`. `parseFloat("1,2")` retournerait sinon `1` (s'arrête
  à la virgule), pas NaN — donc le « si NaN, retry » silencieux
  laissait passer toutes les décimales FR.

### 16.3. Trois sortes d'axe X

- **Numérique** — toutes les valeurs parsent comme nombres. Ticks
  « nice » (1 / 2 / 5 × pow10).
- **Date** — toutes les valeurs matchent la regex ISO 8601 stricte
  (`YYYY-MM-DD` avec heure optionnelle). Granularité (jour / mois /
  année) choisie selon l'étendue ; bornes alignées (1er jan / 1er du
  mois / minuit). Les **bar charts** sur un axe date placent un tick
  par barre (au centre de chaque barre, label format date) plutôt
  qu'aux bornes calendaires — sinon les ticks tombent dans le vide
  entre les barres.
- **Catégoriel** — fallback : positions évenly spaced, label = string
  brut.

### 16.4. Bar charts

Padding de l'axe X de **demi-slot** (= la moitié du plus petit écart
entre points consécutifs) sur chaque côté, pour que la première et la
dernière barre aient de l'air et que leurs ticks ne chevauchent pas
l'axe Y. Largeur des barres = 70 % du slot, calculée en pixels via
`xToPx(x0 + slot) - xToPx(x0)` plutôt que par division naïve
`(max-min) / N` (pour respecter le padding qu'on vient d'ajouter).
Multi-séries : groupes de barres centrés sur l'abscisse, partagés
en parts égales.

Y minimum forcé à `min(0, dataMin)` pour que la hauteur d'une barre
soit toujours visuellement proportionnelle à sa valeur depuis 0.

## 17. Notes de bas de page

Module dans `src/marked-config.ts`. Deux extensions marked
(`footnoteDef` block + `footnoteRef` inline) coordonnées via une
registry au niveau module, et des hooks `preprocess` / `postprocess`
pour reset et émettre la section finale.

### 17.1. Registry partagée

```ts
const footnoteDefs = new Map<string, string>();   // id → contenu raw
const footnoteSeen: string[] = [];                // ids dans l'ordre de 1ère référence
let inFootnoteRender = false;                     // garde de réentrance (cf. 17.3)
```

`preprocess` clear ces deux entrées au début de chaque parse.

### 17.2. Tokens

- **`footnoteDef`** (block) : matche `^\[\^([^\]\n]+)\]:[ \t]*(.+)`.
  Single-line en v1. Ne rend rien (output `''`), mais inscrit
  `id → content` dans `footnoteDefs`. Le token est aussi exclu de
  `annotateSourceLines` pour ne pas décaler les `data-line`.
- **`footnoteRef`** (inline) : matche `^\[\^([^\]\n]+)\]`. Ignore les
  références dont l'`id` n'est pas dans `footnoteDefs` (faute de
  frappe → tombent en texte brut). Sinon, ajoute `id` à `footnoteSeen`
  s'il n'y est pas déjà, retourne `<sup class="footnote-ref"><a
  href="#fn-id"[id="fnref-id"]>N</a></sup>` où `N = seen.indexOf(id)
  + 1` et l'attribut `id` n'est mis QUE sur la **première**
  référence (sinon doublons d'ID DOM si l'utilisateur cite plusieurs
  fois).

### 17.3. postprocess et garde de réentrance

`postprocess` itère `footnoteSeen` en ordre, et pour chaque `id` rend
le contenu via `marked.parseInline(footnoteDefs.get(id))`, ce qui
permet **bold / italic / links / math** dans les notes. Mais
`marked.parseInline` re-déclenche les hooks `preprocess` /
`postprocess` (détail non-documenté de marked v14) — sans garde, le
preprocess interne clear la registry à la première itération et
toutes les notes suivantes se rendent vides.

D'où le drapeau `inFootnoteRender` : armé avant l'itération, désarmé
à la fin, court-circuite preprocess/postprocess pendant les
re-entrées.

Le résultat est appendé sous forme `<section class="footnotes"
role="doc-endnotes"><hr><ol>…</ol></section>` à la fin du HTML.

## 18. Ligatures de saisie

Module `src/editor-ligatures.ts`. Extension CodeMirror
`updateListener` qui surveille l'entrée utilisateur (frappe + paste)
et substitue des séquences ASCII en caractères Unicode dans la
**source** (pas seulement à l'affichage — c'est le `.md` qui contient
la version Unicode). Compatible avec les outils externes, copiable,
indexable.

### 18.1. Table

- **Brackets** : `[[` ⟦, `]]` ⟧, `<<` ⟨, `>>` ⟩.
- **Arrows** : `->` →, `<-` ←, `=>` ⇒.
- **Comparisons** : `!=` ≠, `<=` ≤, `>=` ≥.
- **Logic / proof** : `|-` ⊢, `-|` ⊣.
- **Misc** : `+-` ±, `...` …
- **Blackboard bold** : `|A` … `|Z`. Les sept lettres avec un
  codepoint BMP dédié (ℂ ℍ ℕ ℙ ℚ ℝ ℤ) gardent celui-là ; les 19
  autres viennent du bloc Mathematical Alphanumeric Symbols
  (`U+1D538+`).
- **Lettres grecques** : `\alpha` … `\omega`, leurs variantes
  (`\varepsilon`, `\varphi`, `\vartheta`, `\varpi`, `\varrho`,
  `\varsigma`), et les majuscules qui diffèrent du latin (`\Gamma`
  Γ, `\Delta` Δ, `\Theta` Θ, `\Lambda` Λ, `\Xi` Ξ, `\Pi` Π, `\Sigma`
  Σ, `\Upsilon` Υ, `\Phi` Φ, `\Psi` Ψ, `\Omega` Ω). Codepoints alignés
  sur ce que MathJax rend par défaut pour la commande LaTeX (e.g.
  `\epsilon` → ϵ lunate, `\varepsilon` → ε normal).

**Contrainte de design** : aucune clé ne peut être préfixe d'une autre.
Sinon la clé courte tirerait avant que la longue ait pu se former à
la frappe (`<=` matcherait avant qu'on tape la fin de `<=>`). C'est
pourquoi des paires comme `<->` / `<==>` / `==>` / `<=>` ne sont pas
proposées en ligatures dans cette table.

### 18.2. Déclenchement

- **Frappe** (`userEvent: input.type`) : on lit les `MAX_LEN` derniers
  caractères avant le curseur et on cherche une clé qui termine
  exactement par cette queue. Première trouvée = remplacement.
- **Paste** / drop (`userEvent: input.paste` / `input.drop`) : on
  itère chaque insertion de la transaction et on remplace toutes les
  clés présentes dans le texte collé en un walk longest-first
  (`applyLigaturesToString`).
- `setValue()` programmatique (pas d'`userEvent`) : ignoré, sinon
  ouvrir un fichier déclencherait des remplacements parasites.

Le remplacement est dispatché via `queueMicrotask` (CodeMirror
n'autorise pas un dispatch synchrone depuis un updateListener). Un
`Cmd+Z` immédiatement après défait la substitution — escape hatch
standard d'une input method.

### 18.3. Contexte

Skip les substitutions à l'intérieur de `FencedCode`, `CodeBlock`,
`InlineCode` (détectés via `syntaxTree(state).resolveInner(pos, -1)`).
Exception : un `FencedCode` dont l'`info` est `inference`
(`LIGATURE_FRIENDLY_FENCES`) **garde les ligatures actives** — le
contenu sera de toute façon rendu par MathJax qui accepte l'Unicode
math directement.

## 19. Documents multiples

### 19.1. Modèle

Stockage **content-addressed** uniformément : tout ce qui est un
"fichier" — markdown source d'un document, image — est stocké sous
son SHA-256. Les documents tels que vus par l'utilisateur sont une
**enveloppe légère** (uuid stable, nom, métadonnées) qui *pointe*
vers le SHA de son contenu courant.

L'app gère **N documents**. Chaque document a :

- un **UUID** stable (identifiant interne, jamais montré),
- un **nom** affiché (modifiable),
- un **content-sha** (le SHA-256 du markdown courant),
- un **horodatage** de dernière modification.

Stockage `localStorage` :
```
md2pdf:docs:index   = JSON [{ uuid, name, mtime, content-sha }]
md2pdf:blobs:<sha>  = string  (le markdown source d'une version)
md2pdf:current-doc  = uuid    (doc actuellement ouvert)
md2pdf:settings     = inchangé (réglages globaux, pas par doc)
```

Sur autosave : on hash le contenu courant, on écrit
`md2pdf:blobs:<sha>` si nouveau, on met à jour le `content-sha`
dans l'enveloppe du doc. Le blob précédent reste — il sera
collecté à la prochaine passe de GC s'il n'est plus référencé.

Effet collatéral utile : deux documents qui ont strictement le même
contenu partagent un seul blob.

### 19.2. Stockage content-addressed des ressources

Les images sont **content-addressed** par SHA-256 dans IndexedDB
plutôt qu'identifiées par UUID arbitraire. Les références dans les
documents passent de `img://<uuid>` à `img://<sha>`.

Effet : deux documents qui contiennent la même image partagent un
unique blob en stockage. Et il devient mécanique de détecter qu'une
ressource n'est plus utilisée par aucun document.

Schéma IndexedDB :
```
store "blobs"
  key   = sha (string, hex sha-256)
  value = { mime, data: Blob }
```

Insertion d'image :
1. Calculer `sha = SHA256(blob)`.
2. Si `blobs[sha]` n'existe pas, l'écrire.
3. Émettre dans le markdown la référence `img://<sha>`.

Le pipeline d'aperçu / export résout `img://<sha>` en blob URL ou
en data URL exactement comme avant — seule l'identité de la clé
change.

#### Migration depuis le schéma legacy

Au premier lancement de la version multi-doc, l'app détecte le
schéma legacy (`img://<uuid>` sans SHA en IndexedDB). Pour chaque
image existante :
1. Lire le blob, calculer son SHA-256.
2. Stocker à la nouvelle clé `blobs[sha]` (silencieusement
   dédupliqué si deux images étaient en double).
3. Réécrire le doc actuel : remplacer `img://<uuid>` par
   `img://<sha>` partout.
4. Supprimer l'ancienne entrée `img://<uuid>`.

Migration idempotente (relancer ne casse rien).

### 19.3. Garbage collection

Deux pools de blobs sont GC-és par le même algo :

- les blobs de **contenu de document** dans `localStorage`
  (`md2pdf:blobs:<sha>`),
- les blobs de **ressources** dans IndexedDB (`blobs[<sha>]`).

Trigger : à chaque sauvegarde de document, et au démarrage de
l'app.

Algorithme :
1. Construire `referenced-content = { content-sha de chaque doc de
   l'index }`.
2. Pour chaque doc, charger son contenu (via son content-sha) et
   parser pour extraire les SHA cités sous forme `img://<sha>` —
   construire `referenced-resources`.
3. Pour chaque blob de `md2pdf:blobs:*` dont le SHA n'est pas dans
   `referenced-content` : supprimer.
4. Pour chaque blob d'IndexedDB dont le SHA n'est pas dans
   `referenced-resources` : supprimer.

Le walk est en O(N × taille moyenne de doc) — négligeable pour des
collections personnelles.

### 19.4. Toolbar

La toolbar est repensée pour densifier les actions et clarifier les
rôles. Trois groupes séparés visuellement :

```
┌─ Toolbar ─────────────────────────────────────────────────────────────┐
│ [Mon doc ▾] [Importer] [Style ▾]  │  [Aide]  │  [Aperçu] [Exporter ▾] [Réglages ▾] │
└───────────────────────────────────────────────────────────────────────┘
   ──────── édition du doc ────────    aide       ─── sortie / config ───
```

#### Groupe édition

- **[Mon doc ▾]** : combo qui fusionne *sélecteur de document* et
  *nom du doc courant*. Le bouton affiche le nom du doc courant ; le
  caret ▾ indique qu'il ouvre une liste. Click → dropdown (cf.
  ci-dessous). C'est le seul endroit où l'utilisateur voit / modifie
  le nom du doc — le champ central séparé de la version mono-doc
  disparaît.
- **[Importer]** : ex-*Ouvrir*. Renommé pour refléter le nouveau
  comportement multi-doc : *Importer* charge un fichier externe
  (.md / .docx / .txt / .html) **comme nouveau document** dans la
  liste, plutôt que d'écraser le courant.
- **[Style ▾]** : inchangé — menu de mise en forme + commande
  *Numéroter les sections*.

#### Groupe aide

- **[Aide]** : inchangé, fond jaune. Ouvre la fenêtre d'aide
  séparée (§4.2, §help-window).

#### Groupe sortie / config

- **[Aperçu]** : inchangé, toggle éditeur ↔ aperçu paginé.
- **[Exporter ▾]** : fusionne l'ancien *Enregistrer* (.md) et
  l'ancien *Exporter .pdf*. Click → menu déroulant avec trois
  entrées :
  - **.md** — télécharge le doc courant en Markdown (ancien
    *Enregistrer*).
  - **.tex** — produit l'export LaTeX (cf. §21).
  - **.pdf** — pipeline paged.js + window.print() (cf. §13.6).

  Chaque format suggère un nom de fichier dérivé du nom du doc
  (slug-ifié). Raccourcis clavier conservés : `Cmd/Ctrl + S` pour
  .md, `Cmd/Ctrl + P` pour .pdf. Pas de raccourci dédié au .tex
  pour l'instant — accessible uniquement via le menu.
- **[Réglages ▾]** : inchangé.

#### Dropdown Document

```
┌─ Document ─────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────┐  │
│  │ Mon document                                  ⌫  │  │  ← nom courant éditable
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  + Nouveau document                                    │
│ ─────────────────────────────────────────────────────  │
│  Notes de réunion 12/05                  il y a 3 j   │
│      Renommer  Dupliquer  Supprimer  (au survol)       │
│  Article — DAG audio                     il y a 1 sem │
│      Renommer  Dupliquer  Supprimer                    │
│ ─────────────────────────────────────────────────────  │
└────────────────────────────────────────────────────────┘
```

- En haut : un input éditable contenant le nom du **doc courant**.
  Modifier → met à jour l'index immédiatement (et la valeur
  affichée sur le bouton de la toolbar). C'est le seul endroit où
  on renomme le doc actif. Touche Échap = annule l'édition,
  Entrée = valide.
- **+ Nouveau document** : crée un doc vide (nom par défaut
  *Sans titre N* unique), bascule dessus, ferme le dropdown.
- Liste des **autres** documents (le courant n'y figure pas,
  puisqu'il est représenté par l'input du haut). Triés par mtime
  décroissant. Un click sur une ligne ouvre ce doc.
- Au survol d'une ligne, trois actions apparaissent :
  *Renommer* (édition inline du nom), *Dupliquer* (clone immédiat
  avec un nom *Copie de …*), *Supprimer* (avec `confirm()`).

Pas de barre de recherche en v1 — tant qu'il y a moins d'une
vingtaine de docs, c'est inutile.

#### Pourquoi cette refonte

- *Documents* + *nom du doc* étaient deux UI distinctes pour la
  même chose (« quel est mon document courant »). Les fusionner
  réduit la charge cognitive.
- *Ouvrir* en multi-doc est trompeur (suggère « remplace ce que
  j'ai »). *Importer* dit ce qui se passe : un fichier externe
  rentre dans la liste comme nouveau doc.
- *Enregistrer* + *Exporter .pdf* sont deux variantes du même
  geste « sortir le doc dans un fichier ». Avec l'arrivée de
  l'export LaTeX, le pattern devient naturellement un menu.
  Économise un bouton.

### 19.5. Scénarios utilisateur

Workflow normal, du début à la fin.

**S1. Premier lancement** — `localStorage` vide.
1. L'app crée un doc « Aide md2pdf » avec le contenu de HELP.md.
2. Marque comme courant. L'éditeur affiche le tutoriel.
3. L'utilisateur lit, efface tout, écrit son propre contenu.
4. Renomme dans la toolbar centre : « Mon premier document ».
5. Autosave 200 ms après l'arrêt de la frappe (debounce existant).

**S2. Créer un nouveau document.**
1. Click *[Mon doc ▾]* → *+ Nouveau document*.
2. Le doc actuel est sauvegardé (autosave forcé). Mtime du doc
   actuel mis à jour.
3. Création d'un nouveau doc « Sans titre N » (N = plus petit
   entier rendant le nom unique), content-sha pointant sur un blob
   vide (string vide, hashée).
4. Bascule l'éditeur dessus. Page blanche.
5. Mode éditeur si on était en preview (la preview du doc précédent
   est jetée).

**S3. Switcher entre docs.**
1. Click *[Mon doc ▾]* → click sur un doc dans la liste.
2. Doc actuel sauvegardé.
3. Doc cible chargé : lecture du blob `md2pdf:blobs:<content-sha>`,
   `editor.setValue(...)`, mise à jour de `md2pdf:current-doc`.
4. Si on était en preview, on bascule en éditeur (la preview du
   doc précédent ne s'applique plus).

**S4. Importer un fichier externe** (Markdown / DOCX / HTML / TXT).
1. Click *Importer* → file picker.
2. **Pas de confirmation** : l'import en mode multi-doc ne remplace
   plus le doc courant, donc rien à protéger.
3. Création d'un **nouveau doc** dans la liste, nommé d'après le
   fichier source (sans extension).
4. Migration des éventuelles `data:` URLs vers IndexedDB
   content-addressed (identique au pipeline actuel mais clé = SHA).
5. Bascule sur le nouveau doc.

**S5. Dupliquer un doc.**
1. Survol dans la liste, click *Dupliquer*.
2. Création immédiate d'un doc avec le même `content-sha` (le blob
   est partagé puisque le contenu est identique). Nom « Copie de X ».
3. Bascule. Si l'utilisateur modifie, le hash change, un nouveau
   blob apparaît, l'original reste référencé par l'autre doc.

**S6. Renommer.**
- Pour le **doc courant** : ouvrir *[Mon doc ▾]*, taper dans
  l'input du haut, valider avec Entrée (ou Échap pour annuler).
- Pour un **autre doc** : survol dans la liste → *Renommer* →
  édition inline du nom.
- Le rename met à jour l'index, n'affecte pas le contenu ni les
  blobs.

**S7. Supprimer.**
1. Survol → *Supprimer* → `confirm()`.
2. Retire l'entrée de l'index.
3. Si c'était le doc courant : bascule sur le plus récent restant
   (ou crée un nouveau doc vide si la liste devient vide).
4. GC à la passe suivante : le blob de contenu et les images
   référencées uniquement par ce doc sont libérés.

**S8. Export `.md`.**
- *[Exporter ▾]* → *.md* télécharge le doc courant en Markdown
  (data URLs développées en référence, comme aujourd'hui).
- Raccourci `Cmd/Ctrl + S` (préservé).

**S9. Export `.pdf`.**
- *[Exporter ▾]* → *.pdf* paginate via paged.js + `window.print()`.
  Nom de fichier suggéré dérivé du nom du doc.
- Raccourci `Cmd/Ctrl + P` (préservé).

**S10. Export `.tex`.**
- *[Exporter ▾]* → *.tex* lance le pipeline LaTeX (§21). Télécharge
  un `.tex` autosuffisant, ou un `.zip` si le doc référence des
  images / SVG mermaid / chart.
- Pas de raccourci dédié — accessible uniquement via le menu.

**S11. Fermer l'onglet.**
- L'autosave debounced écrit avant fermeture si possible. En
  pratique, `beforeunload` fait un `flush()` synchrone si dirty.
- Au prochain démarrage, `current-doc` rouvre exactement où on en
  était.

### 19.6. État au démarrage

`md2pdf:current-doc` mémorise l'UUID du dernier doc ouvert.

- Index vide → premier run → S1 (créer le doc HELP).
- Index non vide, `current-doc` valide → ouvrir.
- Index non vide, `current-doc` invalide ou absent → ouvrir le plus
  récent (premier de l'index trié par mtime desc).
- Blob `<content-sha>` introuvable pour le doc courant (dégât du
  storage) → on logue, on remplace le content-sha par celui d'un
  blob vide, l'utilisateur récupère un doc vide avec son ancien nom
  (préserver le nom plutôt que de tout perdre).

### 19.7. Concurrence multi-onglets

Hors v1 explicite. Si l'utilisateur ouvre md2pdf dans deux onglets
en parallèle, les `localStorage` writes vont se piétiner — le doc
de l'onglet le plus récemment écrit gagne. Acceptable v1, l'app
n'est pas pensée pour ça.

V2 possible : écouter l'événement `storage` pour détecter les
écritures externes ; afficher un warning « ce doc a été modifié
dans un autre onglet, recharger ? ».

### 19.8. Hors v1

- Versionnage / historique de modifications par doc (snapshots).
- Tags / dossiers pour organiser.
- Recherche full-text.
- Export d'un dossier de docs en bundle zip.
- Synchronisation cloud entre appareils.

## 20. Polices configurables

### 20.1. Surface utilisateur

Trois sélecteurs dans le panneau **Réglages**, sous une section
*Polices* :

- Police des **titres** (h1-h6)
- Police du **corps**
- Police du **code** (inline et blocs)

V1 : trois `<select>` simples filtrés par famille (sans + serif pour
titres/corps, mono pour code). La spec d'origine prévoyait des
combos recherchables — non nécessaire avec ~15 entrées ; à
réintroduire le jour où le catalogue grossit.

La sélection s'applique en direct dans l'aperçu (et dans le PDF, qui
passe par le même pipeline). Combiné à la fenêtre Réglages détachée
(§4.3), l'utilisateur peut poser le panneau à côté de l'aperçu et
voir l'effet en temps réel.

L'éditeur CodeMirror reste en Roboto Condensed / Roboto Mono
indépendamment des choix utilisateur — la cohérence visuelle de
l'éditeur ne doit pas changer à chaque essai de police.

### 20.2. Catalogue

Un fichier statique `src/assets/google-fonts-catalog.json` bundlé au
build contient un sous-ensemble curé de Google Fonts (v1 : 16
entrées — 5 sans + 5 serif + 5 mono + Roboto Condensed bundlé),
typiquement :

```jsonc
[
  { "name": "Inter",          "family": "sans",  "weights": [400, 500, 700] },
  { "name": "Roboto",         "family": "sans",  "weights": [400, 500, 700] },
  { "name": "Source Sans 3",  "family": "sans",  "weights": [400, 600] },
  { "name": "Source Serif 4", "family": "serif", "weights": [400, 600] },
  { "name": "EB Garamond",    "family": "serif", "weights": [400, 700] },
  { "name": "Merriweather",   "family": "serif", "weights": [400, 700] },
  { "name": "JetBrains Mono", "family": "mono",  "weights": [400, 500] },
  { "name": "Fira Code",      "family": "mono",  "weights": [400, 500] },
  …
]
```

Le catalogue est **figé à chaque release** de l'app — pas de fetch
runtime du catalogue, pas de clé API Google. Si l'utilisateur veut
une police absente, on l'ajoute à la prochaine release (issue
GitHub).

Composition v1 : 5 polices par famille, équilibrée entre sans-serif
moderne (Inter, Roboto, Open Sans, Lato, Poppins), serif académique
(Source Serif 4, EB Garamond, Merriweather, Lora, PT Serif),
monospace (JetBrains Mono, Fira Code, Source Code Pro, IBM Plex
Mono, Roboto Mono — ce dernier bundlé). Le catalogue a vocation à
grossir au fil des releases en fonction des retours utilisateurs.

### 20.3. Chargement

#### Polices bundlées localement

Roboto Condensed et Roboto Mono restent embarquées via `@fontsource/`
(comme aujourd'hui — disponibles offline, valeurs par défaut). On
peut bundler 2-3 autres polices populaires si on le souhaite, mais
on évite l'inflation : chaque police bundlée pèse ~30-100 KB par
poids.

#### Polices Google chargées à la demande

À la sélection d'une police non-bundlée :
1. Injecter dynamiquement
   `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=…&display=swap">`
   dans `<head>`.
2. Le navigateur charge les fichiers de police, les met en cache.
3. L'aperçu se redessine dès que `document.fonts.ready` se résout.

Première utilisation = besoin d'une connexion ; chargements suivants
servis depuis le cache navigateur. Pour un usage déconnecté
permanent, l'utilisateur peut rester sur les polices bundlées.

### 20.4. Application

`pagedCss(settings)` génère trois `font-family` (titres / corps /
code) basées sur les choix utilisateur. Ces règles s'appliquent à la
fois à l'aperçu paginé et au pipeline d'export PDF (cf. §13). Le
fallback final reste Roboto Condensed / Roboto Mono pour rester
cohérent si une police chargée n'arrive pas (réseau, etc.).

### 20.5. Hors v1

- Importer une police personnelle (.woff / .otf depuis le disque).
- Configuration par niveau de titre (h1 dans une police, h2 dans
  une autre).
- Catalogue Google complet via API dynamique + clé.
- Réglages de fluidification (line-height, letter-spacing) par
  famille.

### 20.6. Polices Google personnalisées

Pour les familles qui ne sont pas dans notre catalogue, l'utilisateur
peut coller dans Réglages une **URL Google Fonts** complète, par
exemple :

```
https://fonts.googleapis.com/css2?family=Tangerine:wght@400;700&display=swap
```

`parseGoogleFontsUrl` (dans `font-loader.ts`) valide que l'host est
`fonts.googleapis.com` puis extrait chaque paramètre `family=` du
querystring ; le nom CSS est ce qui précède `:` (les `+` deviennent
des espaces). Une seule URL peut déclarer plusieurs familles
(`?family=A&family=B`) ; on crée une entrée par famille, toutes
pointant vers la même URL.

Les entrées sont stockées dans `settings.customFonts` (cf. §9.1) et
exposées via une **chip-list** sous les trois sélecteurs Titres /
Corps / Code dans Réglages (avec une croix pour retirer). Les
familles ajoutées apparaissent **dans les trois sélecteurs**
indépendamment de leur catégorie (sans / serif / mono) — on ne peut
pas déduire de manière fiable la catégorie d'une URL pastée, donc on
laisse l'utilisateur juger.

Côté chargement, `loadGoogleFont(name)` court-circuite la fabrication
d'URL à partir du catalogue quand `name` correspond à une entrée
`customFonts` : on injecte directement l'URL fournie par
l'utilisateur, puis on attend `document.fonts.load('400 16px
"<name>"')` comme pour les autres familles.

L'export LaTeX **ignore** les polices personnalisées (le préambule
généré reste sur DejaVu via `fontspec`, cf. §21.3). C'est documenté
comme une limitation : le `.tex` est un point de départ pour
adapter avec sa propre chaîne TeX, pas un clone du PDF.

#### Hors scope custom fonts v1

- URLs venant d'autres CDN (Adobe Fonts, Bunny, Fontshare…). À
  ouvrir si la demande remonte — le filtrage actuel sur
  `fonts.googleapis.com` empêche d'injecter du CSS arbitraire.
- Mapping vers `\setmainfont{...}` en LaTeX (fragile, la police
  doit aussi être installée sur la machine qui compile).

## 21. Export LaTeX

**Statut** : livré (cf. `src/export-latex.ts`,
`src/latex-math-symbols.ts`).

### 21.1. Surface utilisateur

Item **LaTeX (.tex)** dans le menu *[Exporter ▾]* de la toolbar
(§19.5). Produit un fichier `.tex` auto-suffisant, qui compile avec
`xelatex` (ou `lualatex`) ; **pas pdflatex** — le préambule utilise
`fontspec` et émet l'UTF-8 natif dans les blocs `lstlisting`, deux
choses que pdflatex ne supporte pas. Le commentaire d'en-tête du
`.tex` rappelle la cible.

Quand le doc référence des images (et / ou des SVG mermaid /
chart), le téléchargement est un **zip** contenant le `.tex` + un
dossier `images/` avec les ressources. Sans ressources, on télécharge
le `.tex` seul.

### 21.2. Pipeline

```
markdown source
   │
   ▼
marked.lexer(source)        // tokens, sans rendu HTML
   │
   ▼
walkTokens → emit LaTeX     // notre générateur (src/export-latex.ts)
   │
   ▼
combine avec préambule + closing → fichier .tex
   │
   ▼
collecte des images référencées → bundle zip si > 0
```

On parse via `marked.lexer()` plutôt que `marked.parse()` pour
travailler au niveau token et émettre du LaTeX directement, sans
passer par l'HTML intermédiaire.

### 21.3. Préambule généré

Préambule auto-suffisant taillé pour xelatex / lualatex :

```latex
\documentclass[11pt,a4paper]{article}
\usepackage{fontspec}
\IfFontExistsTF{DejaVu Serif}{\setmainfont{DejaVu Serif}}{}
\IfFontExistsTF{DejaVu Sans}{\setsansfont{DejaVu Sans}}{}
\IfFontExistsTF{DejaVu Sans Mono}{\setmonofont{DejaVu Sans Mono}}{}
\usepackage{svg}                      % uniquement si le doc a un mermaid/chart
\IfFileExists{french.ldf}{\usepackage[french]{babel}}{}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{stmaryrd}                 % \llbracket / \rrbracket
\usepackage{graphicx}
\usepackage[export]{adjustbox}        % `max width=` sur \includegraphics
\usepackage{hyperref}
\usepackage{xcolor}
\usepackage{listings}
\usepackage{enumitem}
\usepackage{booktabs}
\usepackage{tabularx}                 % colonnes wrap-on-overflow
\usepackage[normalem]{ulem}           % \sout pour ~~strikethrough~~
\usepackage[breakable,skins]{tcolorbox}
\usepackage{newunicodechar}           % cf. 21.6

\newunicodechar{⟦}{\ensuremath{\llbracket}}
… (~30 entrées, cf. 21.6)

\newtheorem{theorem}{Théorème}
\newtheorem{lemma}[theorem]{Lemme}
\newtheorem{proposition}[theorem]{Proposition}
\newtheorem{corollary}[theorem]{Corollaire}
\theoremstyle{definition}
\newtheorem{definition}{Définition}
\newtheorem{example}{Exemple}
\newtheorem{remark}{Remarque}

\title{<premier h1 ou vide>}
\author{<settings.author> \\ <settings.organization>}
\date{<settings.date>}

\begin{document}
\maketitle          % omis si le doc n'a pas de h1
…
\end{document}
```

Quelques choix qui méritent une note :

- **Pas d'`inputenc utf8` ni de `fontenc T1`** : xelatex prend
  l'UTF-8 nativement, et `fontenc T1` est incompatible avec
  `fontspec`.
- **DejaVu** plutôt que lmodern : le glyph coverage de DejaVu
  attrape les box-drawing, flèches, et symboles divers qu'on a dans
  le source des docs ; `\IfFontExistsTF` rend l'installation
  optionnelle (sans DejaVu, on retombe sur la police par défaut de
  xelatex et on vit avec quelques *Missing character* warnings).
- **`babel-french` optionnel** : pas dans les installs minimales de
  TeX Live. `\IfFileExists` garde le doc compilable même quand le
  paquet n'est pas là.
- **`svg` conditionnel** : on ne le tire que si le doc contient
  effectivement un `mermaid` / `chart`. Le paquet exige
  `--shell-escape` à la compilation et inkscape sur le `$PATH`,
  donc on évite cette dépendance quand elle n'est pas nécessaire.
- **`lstset` minimal** : `basicstyle=\ttfamily\small`,
  `breaklines=true`, `frame=single`. Pas de table `literate=` —
  xelatex passe l'UTF-8 directement à listings. Le `language=` n'est
  émis que si le langage de la fence est dans la *whitelist*
  `LISTINGS_LANGUAGE_MAP` (les noms exacts attendus par listings,
  pas les alias markdown) ; sinon le bloc est rendu sans coloration
  pour ne pas casser la compilation.

### 21.4. Conversion par élément

| Markdown | LaTeX |
|---|---|
| premier `# Titre` | `\title{Titre}` (et le titre h1 disparaît du flux ; les niveaux suivants sont décalés d'un cran) |
| `# X` (suivants) | `\section*{X}` |
| `## X` | `\section{X}` (ou `\section*` si h1 absent) |
| `### X` | `\subsection{X}` |
| `#### X` | `\subsubsection{X}` |
| `##### X` | `\paragraph{X}` |
| `**x**` | `\textbf{x}` |
| `*x*` | `\emph{x}` |
| `~~x~~` | `\sout{x}` |
| `` `x` `` | `\texttt{<escaped>}` (pas `\verb` — il échoue dans les arguments de macro comme les cellules `tabular`) |
| ` ``` ` block | `\begin{lstlisting}[language=…]…\end{lstlisting}` (`language=` uniquement si le langage est dans la whitelist) |
| `[texte](url)` | `\href{url}{texte}` |
| `<url>` autolink | `\url{url}` |
| `![alt](src)` | `\includegraphics[max width=\textwidth, max totalheight=0.6\textheight]{images/<sha>.<ext>}` (via adjustbox) |
| `- item` | `itemize` |
| `1. item` | `enumerate` |
| `- [ ] item` | `enumitem` avec marker `$\square$` / `$\boxtimes$` |
| `> texte` | `quote` |
| `---` | ligne horizontale (skip + `\hrulefill`) |
| Pipe table | `tabularx` avec `\toprule` / `\midrule` / `\bottomrule` (colonnes `X` pour wrap automatique) |
| `$x$` | `$<mathBodyToLatex(x)>$` |
| `$$..$$` | `\[<mathBodyToLatex(...)>\]` (sauf si le corps contient déjà `\begin{align}`/`equation`/…, auquel cas on émet le corps brut sans double-wrap) |
| ` ```math ` | idem `$$..$$` |
| ` ```mermaid ` | `\includesvg[…]{images/mermaid-<n>.svg}` |
| ` ```chart ` | `\includesvg[…]{images/chart-<n>.svg}` |
| ` ```csv ` | `tabularx` (mêmes options que les pipe tables) |
| ` ```inference ` | `\[\dfrac{prem_1 \quad …}{conc} \quad \textsf{(label)}\]` |
| `[^id]` ref | `\footnote{<def inlinée>}` à la première occurrence ; `\footnotemark[N]` aux suivantes |
| `[^id]: x` def | omis du flux |
| `Term\n: def` | `\begin{description}\item[Term] def\end{description}` |
| `::: theorem` etc. | `\begin{theorem}[titre]…\end{theorem}` (et lemma / proposition / corollary / definition / example / remark) |
| `::: note` / `tip` / `warning` / `important` / `caution` | `\begin{tcolorbox}[breakable,colback=…,colframe=…,title=…]…\end{tcolorbox}` |
| `::: <inconnu>` | `tcolorbox` neutre avec le nom de classe comme titre |

### 21.5. Ressources graphiques

Trois cas, tous bundlés dans `images/` du zip :

1. **Images insérées par l'utilisateur** (`img://<sha>` dans le
   markdown) : blob lu depuis IndexedDB, écrit dans
   `images/<sha>.<ext>`, émis comme
   `\includegraphics[max width=…, max totalheight=…]{images/<sha>.<ext>}`.

2. **Mermaid** : SVG rendu via la pipeline existante, sanitizé pour
   inkscape (cf. 21.5.1), écrit dans `images/mermaid-<n>.svg`,
   émis comme `\includesvg[…]{images/mermaid-<n>.svg}`. Nécessite
   `\usepackage{svg}` + inkscape + compilation avec
   `--shell-escape`.

3. **Chart** : idem mermaid, fichier `images/chart-<n>.svg`.

Les ressources sont préchargées en parallèle (`Promise.all`) avant
que le walker token-par-token ne tourne — le walker reste synchrone
et lit les chemins déjà résolus dans des `Map`s du contexte. Les
images réutilisées (même SHA, ou même source mermaid / chart) ne
produisent qu'**une entrée** dans le zip ; les multiples sites
d'inclusion partagent le même `\includegraphics` / `\includesvg`.

#### 21.5.1. Sanitisation des SVG pour inkscape

Les SVG produits par mermaid s'appuient sur des fonctionnalités
navigateur qu'inkscape n'implémente pas ou n'honore qu'à moitié.
Avant d'écrire le SVG dans le zip on applique :

- **Strip de propriétés CSS** sur `[style]` et dans les blocs
  `<style>` : `max-width`, `background-color`, `display`,
  `visibility`. Particulièrement `display: none` que mermaid pose
  sur un `<text>` de secours quand un `<foreignObject>` porte
  déjà le label — une fois le foreignObject converti (étape
  suivante), le `<text>` redevient le seul label visible.
- **Remplacement des `<foreignObject>`** (étiquettes HTML) par un
  `<text>` centré ajouté en dernier au groupe parent (pour
  s'assurer qu'il rend par-dessus les `<rect>` siblings, sinon les
  labels des acteurs de séquence disparaissent derrière le fond
  de leur boîte).
- **Suppression des `<filter>`** et des attributs `filter=…` :
  inkscape ne les applique pas et émet un warning à chaque
  occurrence.
- **Fill forcé sur `<text>` / `<tspan>`** : `style="fill:#333"`
  inline quand l'élément n'a pas déjà un `fill` explicite, parce
  que la spécificité du combinateur descendant CSS de mermaid
  (`text.actor>tspan{fill:#333}`) n'est pas toujours honorée par
  inkscape ; sans ça les labels héritent du gris-clair des rect
  parents et deviennent invisibles.
- **Résolution des unités `em`** sur les attributs `dy` / `dx`
  (inkscape les traite comme 0). Cas particulier : sur un `<text>`
  (mais pas sur un `<tspan>`), `dy` n'est pas honoré du tout par
  inkscape ; on absorbe le delta dans la coordonnée `y` de base et
  on supprime l'attribut `dy`. Sans ce passage, les labels des
  messages dans les diagrammes de séquence apparaissent
  systématiquement trop haut.

### 21.6. Caractères Unicode

Le source des documents md2pdf contient typiquement des caractères
Unicode mathématiques issus des ligatures (← → ⊢ Γ ℕ ⟦…⟧ etc.).
Deux mécaniques complémentaires les couvrent :

**(a) Zones math — back-conversion vers les commandes LaTeX.** Dans
chaque `$..$` / `\[..\]` / ` ```math ` on remplace les caractères
qu'on connaît par la commande équivalente
(`src/latex-math-symbols.ts`). Les caractères non ASCII qu'on ne
sait pas mapper sont conservés tels quels et listés dans un
commentaire en haut du `.tex` pour que l'utilisateur puisse les
substituer manuellement si la compilation échoue dessus.

| Unicode | LaTeX |
|---|---|
| → ← ⇒ ⇐ ↔ ↦ | `\to` `\leftarrow` `\Rightarrow` `\Leftarrow` `\leftrightarrow` `\mapsto` |
| ⊢ ⊣ ⊨ | `\vdash` `\dashv` `\models` |
| ≤ ≥ ≠ ± × ÷ | `\leq` `\geq` `\neq` `\pm` `\times` `\div` |
| ∀ ∃ ∈ ∉ ⊂ ⊆ ⊃ ⊇ ∪ ∩ ∅ | `\forall` `\exists` `\in` `\notin` `\subset` `\subseteq` `\supset` `\supseteq` `\cup` `\cap` `\emptyset` |
| α β γ … ω | `\alpha` `\beta` `\gamma` … `\omega` |
| Γ Δ … Ω | `\Gamma` `\Delta` … `\Omega` |
| ℕ ℤ ℚ ℝ ℂ ℙ ℍ | `\mathbb{N}` `\mathbb{Z}` `\mathbb{Q}` `\mathbb{R}` `\mathbb{C}` `\mathbb{P}` `\mathbb{H}` |
| 𝔸-𝕐 (le reste) | `\mathbb{A}`-`\mathbb{Y}` |
| ⟦ ⟧ ⟨ ⟩ | `\llbracket` `\rrbracket` `\langle` `\rangle` |
| … | `\ldots` |

**(b) Prose — redirection via `newunicodechar`.** En dehors des
zones math, on laisse les caractères Unicode tels quels mais le
préambule déclare un `\newunicodechar{X}{\ensuremath{\cmd}}` pour
chaque glyph qui manque à DejaVu Serif et qu'on sait rendre via
une commande math (≈ 30 entrées : crochets sémantiques, logique,
ensembles, symboles divers). Sans ça xelatex émet une *Missing
character* warning et le glyph ne sort pas dans le PDF.

### 21.7. Métadonnées

`settings.author`, `settings.organization`, `settings.date`
deviennent `\author{…}` (joints par `\\`) et `\date{…}`. Si
masqués via les toggles `show` dans Settings, on émet `\author{}`
ou `\date{}` vide. Si le doc commence par un `# H1`, le titre
alimente `\title{}` et `\maketitle` est émis ; sinon les deux sont
omis.

### 21.8. Limitations connues v1

- **xelatex / lualatex obligatoires** : pas de support pdflatex
  (fontspec + UTF-8 natif dans listings).
- **Polices** : DejaVu en dur, on ne dérive pas (encore) la
  sélection depuis `settings.fonts`. Si DejaVu n'est pas installé,
  xelatex tombe sur la police par défaut et émet des warnings
  *Missing character* sur tout ce qui sort de l'ASCII étendu.
- **Diagrammes** : `mermaid` / `chart` exigent `\usepackage{svg}` +
  inkscape sur le `$PATH` + compilation avec `--shell-escape`.
- **Pas de bibliographie** : les notes restent des `\footnote` /
  `\footnotemark`.
- **PDF visuellement différent** du natif paged.js : LaTeX flotte
  les figures, hyphène différemment, choisit ses sauts de page —
  c'est attendu, l'export LaTeX est un point de départ pour
  adapter au style d'un journal, pas un clone du PDF.
- **Back-conversion math non exhaustive** : tout caractère non
  mappé est conservé tel quel et listé dans le commentaire d'en-
  tête du `.tex`.

## 22. À décider plus tard

- Recto/verso (marges alternées).
- Mode sombre de l'éditeur.
- Export d'un HTML autonome.
- Coloration syntaxique des blocs de code.
- Notes de bas de page **multi-paragraphes** (continuations 4-espaces
  à la Pandoc).
- Numérotation automatique des admonitions académiques (« Théorème
  1.2 », « Lemme 3 ») avec compteurs CSS ou DOM.
- Citations bibliographiques `[@key]` + bibliographie.
- Préambule MathJax par document via un champ `mathjax-preamble:` en
  frontmatter YAML. Son contenu (typiquement `\newcommand` + ligatures
  `\mathlig`) serait préfixé à chaque source TeX avant `doc.convert()`
  dans `src/math.ts`. Les `\mathlig{X}{Y}` n'étant pas connus de
  MathJax, il faudrait les détecter au parsing du préambule et les
  convertir en pré-substitutions textuelles. Permet à un auteur d'avoir
  ses macros perso (notations sémantique dénotationnelle, théorie des
  catégories, etc.) sans polluer le code de l'app et garde les `.md`
  autonomes.
