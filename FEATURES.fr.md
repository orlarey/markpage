# markpage — fonctionnalités

*English: [FEATURES.md](FEATURES.md). Pour apprendre à **écrire** du Markdown
markpage, voir [AI-AUTHORING.md](AI-AUTHORING.md) ; pour la présentation du
projet, le [README](README.md).*

**markpage** est un éditeur **Markdown → PDF** qui tourne entièrement dans le
navigateur : appli statique Vite/TypeScript, **sans serveur, sans installation**,
les données restent chez l'utilisateur. Source à gauche, aperçu paginé (paged.js)
à droite, export PDF de qualité typographique. Bilingue **FR/EN**.

## Blocs délimités (```` ``` ````)

Liste exhaustive, par famille :

### Maths & sciences

- `math` — formules LaTeX (MathJax), bloc centré
- `inference` — règles d'inférence (prémisses séparées par `;`, barre `---`)
- `category` — diagrammes commutatifs (DSL dédié, **SVG natif** par défaut,
  fallback Mermaid)
- `adt` — types algébriques de données
- `ebnf` — grammaires EBNF → **railroad diagrams** (une par production)
- `algorithm` — pseudo-code (mots-clés `if`/`elif`/`while`/`Input`/`Output`/
  `Require`/`Ensure`…)

### Données & graphiques

- `csv` / `tsv` — tableaux (séparateur auto-détecté pour csv, guillemets
  RFC-4180)
- `chart` — graphiques `line` / `bar`, générateur SVG maison (options `y-min`/
  `y-max`/`y-ref`/`log-y`…)
- `tree` — arbres (`tree svg`)
- `diff` — diff coloré

### Diagrammes

- `mermaid` — toute la syntaxe Mermaid → SVG (post-traité)
- `bda` — Block-Diagram Algebra (Faust) : opérateurs `~ , : <: :>`, option
  `delays` (alias `faust`)

### Images & courrier

- `mosaic` — galerie d'images justifiée (`height` / `gap` / `last=natural`)
- `sender` / `recipient` / `signature` — blocs en-tête de lettre/facture (flex
  côte à côte)
- `header` / `footer` — en-têtes/pieds de page courants (running headers)

### Autres

- `demo` — bloc de démo interactif (zoom)
- blocs de code classiques avec **coloration syntaxique** (31 langages
  highlight.js + une grammaire **Faust** personnalisée)

> Les renderers `chart`, `bda`, `category`, `adt`, `diff`, `tree` sont aussi
> publiés comme packages npm autonomes (`@orlarey/blocks`).

## Markdown étendu (hors blocs)

- **Callouts** `::: classe [Titre]` : `note`, `tip`, `warning`, `caution`,
  `important` + style « théorème » : `theorem`, `lemma`, `proposition`,
  `corollary`, `definition`, `proof`, `example`, `remark`
- `::: toc+` — table des matières augmentée (avec plan)
- `::: columns` — mise en colonnes
- **Notes de bas de page** `[^id]`, **citations** Pandoc-lite `[@clé]`, **listes
  de définitions**
- **Figures en marge** `{.margin}`, légendes de figures, `\label` / `\ref`
  (références croisées numérotées)
- **Frontmatter YAML** : `title`, `author`, `date`, `slides`, `mathjax-preamble`
  (macros TeX par document)
- **Ligatures de saisie** : `\commande␣` → symbole Unicode (table unique
  partagée avec l'export LaTeX), séquences `->` `<=` `[[`, indices/exposants
  `_N`/`^N`, blackboard `|N`→ℕ

## Mise en page & styles

- **Presets de mise en page** : Note technique, Rapport, Article scientifique,
  Livre relié, **Édition critique** (+ Personnalisé)
- **Vue comparée** de styles : Classic / Manuscript
- **Notes** : en pied (`foot`) ou **en marge type Tufte** (`side`)
- **Marges** : physiques ou **dérivées** (mesure en caractères, zone vivante)
- **Numérotation des sections** automatique (par l'exemple), duplex/recto-verso,
  sauts de chapitre
- **Mode présentation / slides** (`slides: true` → 16:9, façon Beamer)
- **Polices** : packs Fira & STIX Two, police d'éditeur réglable
- **Maths** : 5 jeux de polices MathJax (`newcm`, `fira`, `stix2`, `asana`,
  `tex`), préambule TeX par document
- **Réglages** persistés + **profils** importables/exportables (JSON)

## Fichiers & volumes (système de fichiers unifié, 0.32.0)

Un seul **Ouvrir**, une racine, **4 volumes montés** :

- **Bibliothèque** — le système de fichiers privé du navigateur (OPFS), toujours
  là, hors-ligne
- **Disque** — un dossier local (File System Access, Chromium)
- **Dépôt GitHub** — `owner/repo@branche` via un PAT, **sync R1–R4** (commit
  atomique via la Git Data API, détection de divergence → **fork non destructif**
  `foo-<sha>.md`)
- **OneDrive** — app-folder Microsoft Graph (eTag + détection de conflit)

Plus : **Corbeille** (suppression douce), Enregistrer / Enregistrer sous /
Recharger / Délier, indicateur d'origine.

## Export & partage

- **PDF** (impression vectorielle), **LaTeX** `.tex` (xelatex `--shell-escape`),
  **Markdown** (bundle texte + images)
- **Lien de partage** (document encodé dans l'URL, ~8 Ko) et partage par
  **e-mail**
- Export direct vers OneDrive

## Import

- **.docx** (mammoth), **.html** (turndown), **.md** — formats étrangers
  convertis en copie Bibliothèque

## Intégration IA — MCP (livré v0.29.0)

Un pont **MCP** (Go ↔ WebSocket ↔ onglet) expose markpage comme outils à un
assistant (créer/ouvrir/éditer/exporter un document, lire le guide d'écriture,
valider une fence…).
