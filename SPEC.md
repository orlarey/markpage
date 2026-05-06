# md2pdf — Spécifications

## 1. Objectif

Application web statique permettant de convertir un document Markdown en PDF,
**entièrement côté client** (aucun backend), déployée automatiquement sur
GitHub Pages.

## 2. Contraintes techniques

| Élément              | Choix                                       |
| -------------------- | ------------------------------------------- |
| Langage              | TypeScript (vanilla, pas de framework UI)   |
| Build                | Vite                                        |
| Parser Markdown      | [`marked`](https://github.com/markedjs/marked) |
| Générateur PDF       | [`pdfmake`](https://github.com/bpampuch/pdfmake) |
| Éditeur de texte     | [CodeMirror 6](https://codemirror.net/)     |
| Hébergement          | GitHub Pages                                |
| CI/CD                | GitHub Actions (build + deploy)             |
| Pas de serveur       | tout s'exécute dans le navigateur           |

## 3. Périmètre fonctionnel — MVP

### 3.1. Éléments Markdown supportés (CommonMark de base)

- [x] Titres `#` à `######` (h1 → h6)
- [x] Paragraphes
- [x] **Gras** (`**...**`) et *italique* (`*...*`)
- [x] Code inline `` `...` ``
- [x] Blocs de code (```` ``` ````), sans coloration syntaxique au MVP
- [x] Listes à puces (`-`, `*`)
- [x] Listes numérotées (`1.`)
- [x] Citations `>`
- [x] Liens `[texte](url)` — rendus comme texte cliquable dans le PDF
- [x] Règles horizontales `---`

### 3.2. Hors périmètre du MVP (à évaluer plus tard)

- Tableaux GFM
- Coloration syntaxique du code
- Images (locales et distantes)
- Formules mathématiques (KaTeX/MathJax)
- Listes de tâches `- [ ]`
- Notes de bas de page
- HTML brut dans le Markdown

## 4. Interface utilisateur

Layout en deux panneaux côte à côte :

```
┌────────────────────────────┬────────────────────────────┐
│                            │                            │
│   Éditeur (CodeMirror)     │   Aperçu HTML              │
│                            │                            │
│                            │                            │
└────────────────────────────┴────────────────────────────┘
[ Ouvrir .md ]  [ Exporter .pdf ]   [ Nom du fichier ]
```

### 4.1. Comportements

- L'aperçu HTML se met à jour en quasi temps réel (debounce ~200 ms).
- Le bouton **Exporter .pdf** déclenche la génération via pdfmake et
  propose le téléchargement du fichier.
- Le bouton **Ouvrir .md** ouvre un fichier local et l'injecte dans l'éditeur.
- Le contenu de l'éditeur est persisté dans `localStorage` pour ne pas perdre
  le travail entre les sessions.

## 5. Architecture

```
src/
  main.ts              point d'entrée, montage de l'UI
  editor.ts            initialisation CodeMirror
  preview.ts           Markdown → HTML (marked) pour l'aperçu
  pdf/
    convert.ts         Markdown → docDefinition pdfmake
    styles.ts          styles pdfmake (h1, h2, code, etc.)
  ui/
    layout.ts          structure HTML, splitter
    toolbar.ts         boutons charger/télécharger
  storage.ts           lecture/écriture localStorage
index.html
vite.config.ts
```

### 5.1. Pipeline de conversion PDF

```
Markdown source
   │
   ▼
marked.lexer()  ──►  AST de tokens marked
   │
   ▼
convert.ts      ──►  docDefinition pdfmake (arbre JSON)
   │
   ▼
pdfMake.createPdf(docDefinition).download()
```

> On utilise `marked.lexer()` (et non `marked.parse()`) pour récupérer l'AST
> de tokens et le mapper vers la structure de pdfmake, plutôt que de passer
> par du HTML intermédiaire.

## 6. Déploiement

- Workflow `.github/workflows/deploy.yml`.
- Déclenché sur `push` vers `main`.
- Étapes : checkout → install (npm ci) → build (vite build) → upload artifact
  → deploy to GitHub Pages (via `actions/deploy-pages`).
- L'application doit fonctionner servie depuis un sous-chemin (ex.
  `https://user.github.io/md2pdf/`) → `base` configuré dans `vite.config.ts`.

## 7. Critères d'acceptation du MVP

1. `npm run dev` lance l'application localement.
2. Coller un Markdown couvrant tous les éléments de §3.1 produit un aperçu
   HTML correct.
3. Cliquer sur **Exporter .pdf** produit un PDF lisible reflétant
   fidèlement les éléments de §3.1.
4. Le push sur `main` publie automatiquement la nouvelle version sur
   GitHub Pages.
5. L'application charge et fonctionne sans connexion réseau une fois servie.

## 8. Réglages PDF

Un panneau **Réglages** (bouton dans la toolbar) permet de configurer le
rendu PDF. Les réglages sont persistés dans `localStorage`. Les réglages
typographiques (tailles + couleurs des titres et du corps) s'appliquent
aussi à l'aperçu HTML pour visualiser leur effet sans exporter.

### 8.1. Schéma

```ts
interface PdfSettings {
  pageSize: 'A3' | 'A4' | 'A5' | 'B5' | 'LETTER' | 'LEGAL';
  margins: { top: number; bottom: number; left: number; right: number }; // mm
  justify: boolean;
  lineHeight: number; // multiplier, default 1.3
  author: { text: string; show: boolean; bold: boolean };
  organization: { text: string; show: boolean; bold: boolean };
  date: { mode: 'none' | 'today' | 'custom'; custom: string };
  styles: {
    h1: { fontSize: number; color: string };
    h2: { fontSize: number; color: string };
    h3: { fontSize: number; color: string };
    h4: { fontSize: number; color: string };
    body: { fontSize: number; color: string };
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

### 8.2. Comportements

- Les titres sont **toujours en gras** (Roboto Medium 500), choix non
  exposé dans l'UI.
- Le **h1** est traité comme titre du document : **toujours centré**.
- h2..h6 sont **toujours alignés à gauche**, indépendamment de l'option
  « Justifier le texte ».
- Le **bloc métadonnées** (auteur / organisation / date) est centré et
  inséré juste après le premier h1 du document (ou en tête si pas de h1).
  Il n'apparaît que pour les éléments dont la case « Afficher » est cochée
  (auteur, organisation) ou si le mode date n'est pas « Pas de date ».
- Le mode **« Date du jour »** affiche la date courante au format français
  long (ex. *6 mai 2026*), recalculée à chaque export / ré-affichage.
- Le mode **« Date personnalisée »** affiche le texte saisi tel quel.
- L'option **Justifier le texte** s'applique aux paragraphes, listes et
  citations, dans le PDF comme dans l'aperçu HTML. Activée par défaut.
- h5 et h6 héritent automatiquement des réglages de h4.
- Le numéro de page apparaît **dès la page 1**, à mi-hauteur de la marge
  haute ou basse selon la position choisie.
- Le format du numéro est juste l'entier (ex. « 12 »).
- Bouton **Réinitialiser** pour revenir aux valeurs par défaut.

### 8.3. Valeurs par défaut

| Réglage              | Valeur                                  |
| -------------------- | --------------------------------------- |
| Format               | A4                                      |
| Marges               | haut/bas 25 mm, gauche/droite 35 mm     |
| Justifier le texte   | activé                                  |
| Interligne           | 1.25                                    |
| Auteur               | « Prénom Nom », affiché, gras           |
| Organisation         | « Mon organisation », affichée, grasse  |
| Date                 | Date du jour                            |
| h1 / h2 / h3 / h4    | 24 / 20 / 16 / 14 pt, couleur #09438b   |
| Texte normal         | 11 pt, couleur #000000                  |
| Numéro de page       | bas centre, 9 pt, non italique, #57606a |

## 9. À décider plus tard

- Recto/verso (marges alternées).
- Choix d'une ou plusieurs polices embarquées (Roboto par défaut ;
  OpenSans/autres possibles).
- Mode sombre de l'éditeur.
- Export d'autres formats (HTML autonome ?).
- Sauvegarde/chargement de plusieurs documents.
- Synchronisation du scroll entre éditeur et aperçu.
