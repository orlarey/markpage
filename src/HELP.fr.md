# Bienvenue dans markpage

**markpage** est un éditeur qui produit des PDF prêts à imprimer ou à
partager. Vous écrivez du texte presque normal, et l'app s'occupe de
la mise en forme.

Vous lisez actuellement ce tutoriel **dans l'éditeur** — c'est
lui-même un document markpage. Vous pouvez le modifier librement, ou
repartir d'une page blanche.

Le bouton **Aide** (sur fond jaune) rouvre cette page d'aide à tout
moment, sans toucher à votre document.

## Pour commencer \label{sec:start}

Vous n'avez besoin que de **cinq ou six outils** pour écrire la
plupart des documents. Suivez ce tutoriel pas à pas — l'idée est que
vous écriviez votre premier document tout en lisant.

### Le principe

markpage utilise une convention qui s'appelle **Markdown**. Vous écrivez
du texte presque normal, avec **quelques signes** simples qui indiquent
la mise en forme. Pas de menus à apprendre, pas de raccourcis
obligatoires.

Pour vous donner une idée, ce tutoriel lui-même est écrit en Markdown.
À droite vous voyez la version mise en page (en cliquant sur **Aperçu**),
et ici à gauche vous voyez la "vraie" source. Vous pouvez à tout
moment regarder à gauche pour voir « comment c'est fait ».

### Allez-y, écrivez votre premier document

Sélectionnez tout le contenu de l'éditeur (`Cmd/Ctrl + A`) et
supprimez. La page est blanche. On y va.

### Le titre du document

Tout en haut, tapez ces trois lignes :

```
---
title: Mon premier document
---
```

C'est l'**en-tête** du document : un petit bloc entre deux lignes de
trois tirets, qui dit *ce qu'est* le document plutôt que ce qu'il
contient. La ligne `title:` donne son titre, affiché en tête et centré.

> **À noter** : l'en-tête peut aussi porter l'auteur, l'organisation et
> la date (`author:`, `organization:`, `date:`), affichés sous le
> titre — voir \ref{sec:frontmatter}.

### Une section

Sautez une ligne, puis tapez un dièse (`#`), un espace et le titre de
votre section :

```
# Introduction
```

Le `#` au début de la ligne signifie *« ce qui suit est un titre »*.
Une seule ligne, pas de point final, pas de fermeture — on saute
simplement à la ligne quand on a fini. Inutile de taper des numéros :
selon le style du document, les sections sont numérotées
automatiquement (1, 1.1, 1.1.1…).

### Du texte

Sous le titre, tapez votre paragraphe normalement, comme dans un mail.
Sautez une ligne pour faire un nouveau paragraphe.

### Mettre en valeur : *italique* et **gras**

Pour mettre un mot en *italique*, entourez-le d'**un** astérisque :

```
Le mot *important* est en italique.
```

Pour le **gras**, entourez de **deux** astérisques :

```
Le mot **important** est en gras.
```

> **Astuce** : si les astérisques vous semblent fastidieux à taper,
> sélectionnez le mot et appuyez sur `Cmd/Ctrl + I` pour l'italique
> ou `Cmd/Ctrl + B` pour le gras — comme dans Word. Le résultat
> est exactement le même.

### Une sous-section

Deux dièses pour un titre de niveau plus profond, trois pour le
suivant :

```
## Mes idées principales
```

Vous pouvez descendre jusqu'à six dièses, mais en pratique trois
suffisent pour la plupart des documents.

### Insérer une image

Trois moyens, au choix :

1. **Glisser-déposer** une image depuis le Bureau directement dans
   l'éditeur.
2. **Coller** une capture d'écran (`Cmd/Ctrl + V` après l'avoir
   capturée).
3. Menu **Insérer** → *Image…* (ou *Mur d'images…* pour plusieurs
   photos d'un coup).

L'image est automatiquement redimensionnée et compressée (max 2000 px
de côté), et s'insère à la position du curseur.

### Murs d'images (mosaïque) \label{sec:mosaic}

Pour monter plusieurs photos en un **mur d'images** — une galerie
justifiée, sans espace, façon Flickr — placez une image par ligne dans
un bloc `mosaic` :

````
```mosaic "Sortie du 1er mai"
![](image-1.jpg)
![](image-2.jpg)
![](image-3.jpg)
![](image-4.jpg)
```
````

Les images, **jamais rognées**, sont regroupées en rangées qui
remplissent exactement la largeur du texte ; les hauteurs de rangée
s'ajustent pour former un rectangle net. Options dans l'info-string,
après le titre optionnel :

- `height=<pt>` — hauteur de rangée visée (plus petit ⇒ plus d'images
  par rangée) ;
- `gap=<pt>` — gouttière entre les images (0 par défaut) ;
- `last=natural` — laisse la dernière rangée à sa taille naturelle au
  lieu de l'étirer.

Un titre entre guillemets ajoute une légende numérotée (*Figure N*).

### La toolbar \label{sec:toolbar}

En haut de l'écran, quelques boutons :

- **Fichier ▾** — tout ce qui touche au document : *Nouveau*, *Ouvrir…*,
  *Enregistrer* / *Enregistrer sous…*, *Mettre à la corbeille*,
  l'export (Markdown / PDF / LaTeX) et le partage
  (cf. *Ouvrir, enregistrer, partager* plus bas). Ouvrir un fichier
  externe (`.docx`, `.html`…) se fait **depuis *Ouvrir*** (bouton
  *Ouvrir un fichier…*), pas par une commande séparée.
- **Le nom du document** (au centre) — modifiable pour un document de la
  Bibliothèque ; pour un document lié à un volume, il affiche son nom de
  fichier et une pastille d'origine.
- **Format ▾** — l'apparence du texte : titres, gras, italique, code,
  listes, citation. Chaque entrée affiche son raccourci clavier.
- **Insérer ▾** — tout ce qu'on peut ajouter au document, rangé par
  catégories : image, tableau, encadré, formule, diagramme, code, note
  de bas de page, table des matières, colonnes, en-tête, éléments de
  courrier… Chaque élément arrive **prêt à remplir** : le texte à
  remplacer est déjà sélectionné, il suffit de taper. Si vous avez
  sélectionné du texte avant, il est placé dedans (par exemple, une
  sélection + *Encadré ▸ Note* la met dans un encadré). Pas besoin de
  connaître la syntaxe : regardez ce que le menu écrit, vous
  l'apprendrez en passant.
- **Clic droit** dans l'éditeur — *Couper*, *Copier*, *Coller*, puis
  les menus *Format* et *Insérer*.
- **Style ▾** — l'apparence du document : choisissez un style dans la
  bibliothèque (Note, Article, Rapport, Livre, Lettre, Présentation),
  importez-en ou exportez-en (voir \ref{sec:settings}).
- **Vue ▾** — *Aperçu* (bascule éditeur / rendu paginé), *Présenter*
  (plein écran), *Guides* (overlay de mise en page).
- **?** (jaune) — ouvre ce tutoriel.

### Voir l'aperçu

Vous écrivez en mode **éditeur** (texte brut). Pour voir à quoi votre
document ressemblera dans le PDF, basculez en mode **aperçu** :

- raccourci `Cmd/Ctrl + Enter`
- ou clic sur le bouton **Aperçu**

Vous voyez votre document tel qu'il sera imprimé.

Pour revenir à l'éditeur, **cliquez n'importe où dans l'aperçu** : le
curseur revient pile sur la ligne cliquée. Pratique : si vous voyez
une faute, cliquez dessus, vous arrivez direct au mot dans l'éditeur
pour la corriger. Ou rappuyez sur `Cmd/Ctrl + Enter`.

### Exporter en PDF \label{sec:pdf-export}

Cliquez sur **Fichier ▾** puis **PDF (.pdf)**, ou utilisez le
raccourci `Cmd/Ctrl + P` directement.

Le navigateur ouvre son dialogue d'impression. Choisissez :

- **Destination** : *Enregistrer au format PDF*
- **Marges** : ⚠ **Aucune** (voir l'encadré ci-dessous)

Cliquez sur **Enregistrer**, donnez un nom au fichier, c'est fait.

> **⚠ Important — sélectionnez "Marges : Aucune"**
>
> Dans le dialogue d'impression, ouvrez « Plus de paramètres » et
> sélectionnez **« Marges : Aucune »**. Sinon, le navigateur ajoute
> ses propres marges par-dessus celles déjà gérées par markpage, ce
> qui rétrécit la zone imprimable et fait dépasser le contenu. Les
> marges visibles dans le PDF sont **toujours** celles du style du
> document, jamais celles du dialogue d'impression.

### Et voilà

Vous savez écrire un document avec markpage. La majorité des notes,
comptes-rendus, articles courts ne demandent rien de plus que ces
quelques outils.

Si vous avez besoin d'autre chose — listes, citations, tableaux,
formules mathématiques, diagrammes, encadrés, notes de bas de page,
graphiques — la suite documente toutes les fonctions avancées. Lisez
à votre rythme, ou retournez écrire votre document maintenant et
revenez plus tard.

---

## Pour aller plus loin \label{sec:further}

Tout ce qui suit est **optionnel**. Picorez selon vos besoins. Chaque
section est indépendante. Cette partie regroupe ce qui sert à
**rédiger un document riche** : plus d'éléments Markdown, encadrés,
notes de bas de page, tableaux, graphiques. Pour la **typographie
scientifique** (formules math, ligatures, règles d'inférence) et les
**diagrammes Mermaid**, voir la partie suivante *Pour aller encore
plus loin*.

### Encore d'autres éléments Markdown

#### Listes

**Listes à puces** : un tiret (`-`) ou un astérisque (`*`) en début de
ligne :

```
- Première idée
- Deuxième idée
- Troisième idée
```

**Listes numérotées** : un nombre suivi d'un point :

```
1. Première étape
2. Deuxième étape
3. Troisième étape
```

(Les numéros que vous tapez n'ont pas d'importance — Markdown
renumérote ; vous pouvez tout taper en `1.`)

**Listes imbriquées** : indentez de quatre espaces ou d'une
tabulation pour une sous-liste :

```
- Idée principale
    - Sous-idée
    - Autre sous-idée
- Deuxième idée
```

#### Citations

Un chevron (`>`) en début de ligne :

```
> Ce qui se conçoit bien s'énonce clairement.
> — Boileau
```

#### Liens

```
Visitez [le site de Boileau](https://exemple.fr).
```

Le texte entre crochets devient cliquable, vers l'URL entre
parenthèses. Raccourci : sélectionnez le texte, `Cmd/Ctrl + K`,
collez l'URL.

#### Lignes horizontales

Trois tirets sur une ligne seule :

```
---
```

#### Code en ligne et blocs de code

Pour du code **en ligne** dans un paragraphe, entourez-le d'accents
graves : `` `let x = 42` `` donne `let x = 42`.

Pour un **bloc de code** entier, entourez de trois accents graves
chacune sur sa propre ligne :

````
```
function add(a, b) {
    return a + b;
}
```
````

#### Listes de tâches

Une checklist : un tiret, un espace, puis `[ ]` (à faire) ou `[x]`
(fait) :

```
- [x] Écrire le brouillon
- [x] Relire
- [ ] Envoyer au comité
- [ ] Préparer la version finale
```

Les cases sont **purement visuelles** : pour cocher / décocher,
modifiez le `[ ]` en `[x]` directement dans le markdown.

#### Tableaux simples

Markdown classique pour de petits tableaux :

```
| Nom    | Âge |
|--------|-----|
| Alice  | 32  |
| Bob    | 27  |
```

(Pour les **tableaux de données denses**, voir la section *Tableaux
de données (CSV / TSV)* plus bas.)

#### Diffs (texte comparé) \label{sec:diff}

Pour afficher un patch (avant / après) ou un extrait de revue de
code, utilisez la fence `diff` : chaque ligne est colorisée selon son
premier caractère (`+` ajouté en vert, `-` retiré en rouge, `@@` en
en-tête de hunk, le reste en contexte).

````
```diff
@@ exemple ligne 12 @@
 function hello(name) {
-  console.log('Bonjour ' + name);
+  console.log(`Bonjour ${name}`);
 }
```
````

Aucune option : tout est dans le contenu.

#### Arbres (Unicode ou SVG) \label{sec:tree}

La fence `tree` transforme une **outline indentée** en arbre. Par
défaut, rendu Unicode avec connecteurs `├──` / `└──` (idéal pour les
arborescences de fichiers ou de code) ; ajoutez l'argument `svg`
pour un diagramme top-down (utile pour les arbres syntaxiques).

````
```tree
src/
  preview.ts
  preview-paginated.ts
  ui/
    settings-form.ts
    help-window.ts
```
````

Rendu Unicode (par défaut) :

```
src/
├── preview.ts
├── preview-paginated.ts
└── ui/
    ├── settings-form.ts
    └── help-window.ts
```

Pour un arbre syntaxique en SVG :

````
```tree svg
S
  NP
    Det "le"
    N "chat"
  VP
    V "mange"
```
````

L'unité d'indentation est détectée automatiquement (la première ligne
indentée donne le pas). Les blocs `tree` sont captionnables comme une
figure : `` ```tree "Mon arbre" `` ``.

#### Algorithmes (pseudo-code) \label{sec:algorithm}

La fence `algorithm` rend un pseudo-code style *algorithm2e* : numéros
de ligne à gauche, mots-clés (`for`, `while`, `if`, `then`, `else`,
`return`, `Input`, `Output`, `Require`…) en gras, indentation
préservée.

````markdown
```algorithm "Tri à bulles"
Input: tableau A de n entiers
Output: A trié en ordre croissant
for i = 1 to n-1 do
  for j = 0 to n-i-1 do
    if A[j] > A[j+1] then
      swap A[j] and A[j+1]
return A
```
````

La caption entre guillemets est optionnelle ; combinée avec
`\label{alg:tri}` après la caption, l'algorithme devient numéroté et
référençable via `\ref{alg:tri}` (voir *Références croisées* plus bas).

#### Démos pédagogiques (source + rendu côte à côte) \label{sec:demo}

La fence `demo` affiche **côte à côte** la source markdown et son
rendu — pratique pour les slides de cours ou pour montrer une syntaxe
au lecteur sans avoir à recopier deux fois.

````markdown
```demo
**Gras**, *italique*, [un lien](https://example.com).

> Une citation pour illustrer.
```
````

Argument optionnel : `zoom=auto` (défaut, ajuste à la hauteur de la
slide en mode slides), `zoom=0.7` (facteur explicite entre 0.1 et
2.0). Caption + label fonctionnent comme partout
(`` ```demo "Listes" \label{fig:listes} ``).

### Ouvrir, enregistrer, partager \label{sec:multi-doc}

markpage gère vos documents comme une **application de bureau** — un
seul *Ouvrir*, des dossiers, des fichiers — mais **sans installation
ni serveur**. Tout passe par le menu **Fichier ▾**.

#### Un seul « Ouvrir », plusieurs sources

**Fichier ▸ Ouvrir…** (`Cmd/Ctrl + O`) ouvre un **navigateur de
fichiers** unique. À sa racine, vos **volumes** — les endroits où
vivent vos documents :

| Volume | Ce que c'est | Disponibilité |
|---|---|---|
| **Bibliothèque** | vos documents stockés dans le navigateur — privés, hors-ligne, toujours là | partout |
| **Dossier** | un vrai dossier de votre machine | Chrome / Edge |
| **Dépôt GitHub** | un dépôt git, pour éditer un même document depuis plusieurs appareils | avec un jeton (voir plus bas) |
| **OneDrive** | votre dossier `Apps/markpage/` | après connexion Microsoft |

Entrez dans un volume, naviguez les dossiers, cliquez un `.md` pour
l'ouvrir. En bas du navigateur : **Monter un dossier…**, **Monter un
dépôt…**, **Connecter OneDrive…** ajoutent un volume (un `⏏` à côté
d'un volume le retire ; il n'est jamais effacé du disque ou du dépôt).

Un nouveau document (*Fichier ▸ Nouveau*) naît dans la **Bibliothèque**.
Ouvrir un `.md` depuis un autre volume l'édite **en place** : à chaque
Save, il y est republié.

Le navigateur s'ouvre **là où vous étiez** : dans le dossier d'où vient
le document en cours, sinon dans le dernier dossier visité. Le bouton
**Nom / Date** trie les fichiers (par date : les plus récents d'abord),
et l'entrée **Récents** liste les derniers documents ouverts, tous
volumes confondus.

> **À garder en tête.** markpage **publie et reprend** des fichiers — ce
> n'est **pas** de l'édition à plusieurs en temps réel (type Google Docs).
> Chaque *Save* synchronise **un fichier** ; si deux versions divergent,
> le conflit est géré **sans rien perdre** (voir GitHub et OneDrive plus
> bas). Et « partager » ne veut pas dire la même chose partout : un
> **droit d'accès** au dépôt (GitHub), un **lien/dossier** de compte
> (OneDrive), ou une **copie figée** sans compte (lien de partage).

#### Le nom et l'origine du document

Le titre, au centre de la barre, est **modifiable** pour un document de
la Bibliothèque. Pour un document **lié** à un volume, le titre montre
son **nom de fichier** (non modifiable) et une **pastille** rappelle son
origine : `🐙 dépôt ▸ dossier/`, le dossier sur le disque, ou
`☁️ OneDrive`.

#### Un document par onglet

Chaque document ouvert (ou créé) a **son propre onglet** — ouvrez-en
plusieurs côte à côte. Seul un onglet vide et encore intact est
réutilisé. Si le document est **déjà ouvert** dans un autre onglet,
markpage vous le signale au lieu de l'ouvrir deux fois.

Un même document ouvert dans un second onglet (onglet dupliqué, lien
recopié) y est en **lecture seule** : il suit ce que l'autre onglet
enregistre, sans jamais rien écrire. Le bouton **Le modifier ici** le
reprend : il devient modifiable ici et passe en lecture seule là-bas.

#### Ouvrir un document depuis une URL

Dans **Ouvrir**, le bouton **Ouvrir une URL…** lit un `.md` publié sur
le web — un fichier brut GitHub (une page `github.com/…/blob/…` est
convertie toute seule), un gist, GitHub Pages… On peut aussi donner
l'adresse directement : `markpage.org/?url=https://…/doc.md`.

Le document devient une **copie dans la Bibliothèque** qui se souvient
de son origine (pastille `🌐 site ▸ dossier/`) ; ses images relatives
sont lues à côté de lui. Rouvrir la même URL **retrouve cette copie** :
mise à jour si vous n'y avez pas touché, **gardée** telle quelle si vous
l'avez modifiée (markpage vous le dit). **Recharger** récupère la
dernière version en ligne ; **Enregistrer** n'écrit que la copie locale.

> **Limite du navigateur.** Une page web ne peut lire une adresse que si
> le site l'y autorise (CORS). Les fichiers bruts GitHub, les gists et la
> plupart des hébergements statiques le font ; sinon markpage le dit.

**Depuis VS Code.** Avec l'extension markpage, la commande **Open in
markpage.org** ouvre le fichier sur lequel vous travaillez, avec ses
modifications non enregistrées, et l'édite **en place** (pastille
`🔗 VS Code ▸ dossier/`). **Enregistrer** écrit le fichier, via VS Code ;
ce que vous modifiez dans VS Code apparaît dans markpage. Si le fichier a
changé des deux côtés, rien n'est écrasé : la pastille ⛓️‍💥 vous laisse
choisir. Cela marche tant que VS Code est ouvert.

Un lien `markpage.org/?open=<volume>/<chemin>` ouvre un fichier d'un
**volume déjà monté** (par exemple `?open=Mes notes/2026/rapport.md`).
Pour un dossier du disque, le navigateur redemande l'accès une fois :
un clic sur **Autoriser**.

#### Enregistrer et publier

- **Enregistrer** (`Cmd/Ctrl + S`) — sauvegarde le document ; s'il est
  lié à un volume, il y est aussi republié.
- **Enregistrer sous…** — choisit **un volume + un dossier + un nom**.
  C'est ainsi qu'on **publie** un document de la Bibliothèque vers
  GitHub, le disque ou OneDrive. Pour un document déjà lié, le dialogue
  s'ouvre **dans son dossier d'origine**, le nom pré-rempli : il suffit
  de le retoucher.

#### Supprimer : la Corbeille

**Fichier ▸ Mettre à la corbeille…** envoie le document courant à la
**Corbeille** — une suppression douce, **réversible**. La Corbeille est
un dossier de la Bibliothèque dans le navigateur : on y **restaure** ou
**supprime définitivement** chaque document, et on peut la **vider**.

#### Ouvrir un fichier de l'appareil

Dans **Ouvrir**, le bouton **Ouvrir un fichier…** (en bas du dialogue)
choisit un fichier sur votre machine, sans monter de volume. Formats :
`.md`, `.markdown`, `.txt`, `.html`, `.docx` (Word). Le sort du fichier
**découle de son format** :

- un **`.md`** s'**ouvre en place** (sur Chrome/Edge, il reste lié au
  fichier sur le disque — *Enregistrer* y réécrit directement) ;
- un **format étranger** (`.docx`, `.html`, `.txt`) est **converti** et
  ajouté comme **nouveau document** dans la Bibliothèque (une copie).

> **À noter pour les fichiers Word** : à l'ouverture d'un `.docx`, le
> texte, les titres, les listes, le gras/italique, les liens et les
> citations sont récupérés, mais **pas les images**. Si votre
> document Word contenait des photos, vous devrez les réinsérer
> manuellement.

#### Travailler avec GitHub

Un **dépôt GitHub** vous permet d'éditer le **même document** depuis
plusieurs appareils (portable, bureau, autre navigateur), versionné,
**sans serveur**.

1. **Le jeton.** À la première connexion, markpage vous demande un
   *jeton personnel fine-grained* (permission **Contents : lecture et
   écriture**) et vous donne le lien pour le créer sur GitHub. Le jeton
   reste **sur cet appareil**.
2. **Monter le dépôt** depuis le navigateur (*Monter un dépôt…*), puis
   ouvrez un `.md`. Il s'édite en place ; **Save** le republie.
3. Sur un autre appareil : même jeton, *Monter un dépôt…*, ouvrez le
   même fichier — vous reprenez votre travail. **Recharger** (menu
   Fichier) récupère la dernière version distante.

> **Jamais d'écrasement.** Si le dépôt **et** votre copie ont changé
> depuis la dernière synchro, markpage ne tranche pas à votre place et
> ne perd rien : au Save, votre version est enregistrée dans un fichier
> **frère** `foo-<sha>.md` ; `foo.md` garde la version du dépôt. Vous
> fusionnez les deux quand vous voulez, puis supprimez le doublon.

#### Travailler avec OneDrive

**Connecter OneDrive…** ouvre une connexion Microsoft (la page se
recharge une fois). markpage n'accède qu'à votre dossier privé
`Apps/markpage/` (scope `Files.ReadWrite.AppFolder`), pas au reste de
votre Drive. Ensuite, parcourez / ouvrez / enregistrez comme pour les
autres volumes. Si le fichier a changé sur OneDrive depuis votre
dernière synchro, markpage **vous demande** avant d'écraser.

#### Exporter et partager

Le menu **Fichier ▾** propose aussi :

| Option | Raccourci | Effet |
|---|---|---|
| **Markdown (.md)** | `Cmd/Ctrl + S` | Télécharge le document au format Markdown |
| **PDF (.pdf)** | `Cmd/Ctrl + P` | Produit le PDF final |
| **LaTeX (.tex)** | — | Produit un source LaTeX compilable avec `xelatex` |
| **Copier le lien de partage** | — | Encode le document dans une URL `?import=…` à coller dans Slack / email / SMS |
| **Envoyer par email** | — | Même URL, ouverte dans votre client mail |

Le format **Markdown** (`.md`) est un format texte ouvert, lisible
partout — envoyez-le à quelqu'un qui n'utilise pas markpage, il
l'ouvrira dans n'importe quel éditeur.

Le format **LaTeX** (`.tex`) sert à retoucher finement la mise en page
avec un compilateur LaTeX, ou à soumettre à un journal. Si le document
contient des images ou des diagrammes (mermaid, chart), le
téléchargement est un **`.zip`** (le `.tex` + un dossier `images/`).
Compilez avec :

```
xelatex --shell-escape votre-document.tex
```

(`--shell-escape` n'est nécessaire qu'avec des diagrammes, et exige
qu'`inkscape` soit installé.)

**Le lien de partage** est une URL auto-portante : tout le document
(texte + images en base64) est gzip-compressé puis encodé dans l'URL.
Aucun serveur, aucun compte. Le destinataire ouvre le lien et le
document est importé comme un nouveau document local dans son markpage.
Limite : ~8 Ko de payload (≈ 5-10 pages) — au-delà, passez par un
volume (GitHub / OneDrive).

Votre travail est **automatiquement sauvegardé** dans le navigateur,
donc si vous fermez l'onglet par accident, tout est récupéré à la
prochaine ouverture.

### Choisir le style du document \label{sec:settings}

Dans markpage, **l'apparence d'un document est son style** : format de
page, marges, polices et tailles, couleurs, numérotation des titres,
en-tête et pied de page, placement des notes, couverture. Le document,
lui, ne contient que son texte et sa carte d'identité (titre, auteur,
date… — voir \ref{sec:frontmatter}).

Le menu **Style ▾** de la toolbar liste les styles disponibles.
Choisissez-en un : markpage écrit une ligne dans l'en-tête du document,

```yaml
---
title: Rapport d'activité
document-style: rapport-a4
---
```

et l'aperçu comme le PDF suivent immédiatement. Vous pouvez aussi
taper cette ligne vous-même. Un document **sans** `document-style:`
(ou qui nomme un style inconnu) prend le style par défaut, **Note A4**.

Les styles livrés avec markpage, chacun en **A4** et en **Letter**
(`note-a4`, `note-letter`…) :

| Style | Pour | Caractéristiques |
| :-- | :-- | :-- |
| **Note** | notes, comptes-rendus, documents courts | recto seul, sections numérotées |
| **Article** | article, papier académique | recto seul, titre du document en en-tête, sections numérotées |
| **Rapport** | rapport, mémoire | couverture, recto-verso, chapitres sur page de droite |
| **Livre** | livre, polycopié long | couverture, recto-verso, chapitres sur page de droite |
| **Lettre** | courrier | recto seul, pas de numérotation, blocs `sender` / `recipient` / `signature` |
| **Présentation 16:9** | diapositives | une diapositive par section `##` (voir \ref{sec:slides}) |

**Vos propres styles.** Un style est un fichier `.mpstyle.json`,
fabriqué avec l'**éditeur de style** (un outil à part : on y règle
visuellement les couleurs, les polices et la page). Dans le menu
**Style ▾** :

- **Importer un style…** — ajoute un fichier `.mpstyle.json` à votre
  bibliothèque et l'applique au document. Il apparaît dans la liste
  avec la mention *perso*, et peut être supprimé de la bibliothèque.
- **Exporter le style courant…** — télécharge le style du document en
  `.mpstyle.json`, pour le partager ou le retoucher dans l'éditeur.

> **Partager un document.** Le style n'est **pas** dans le document,
> seulement son nom. Si vous envoyez un `.md` qui utilise un style
> *perso*, envoyez aussi le fichier du style ; sans lui, le
> destinataire verra le document avec le style par défaut.

**Retouches locales.** Pour un réglage ponctuel — un titre de
couverture coloré, une légende centrée — utilisez un bloc
`::: style` (voir \ref{sec:style}) : il agit sur un passage sans
toucher au style du document.

> **💡 Aperçu visuel de la page** — le menu **Vue ▾ → Guides** (ou
> `Cmd/Ctrl + Shift + G`) superpose à chaque page son contour, la zone
> de l'en-tête et du pied de page, le bloc de texte et les diagonales
> de la page. Pratique pour voir où se logent en-têtes, pieds de page
> et notes. Recommencez pour masquer.

#### En-tête et pied de page \label{sec:running}

L'en-tête et le pied de page (numéro de page, titre, date…) viennent
du **style**. Pour en changer dans un document, écrivez un fence
` ```header ` ou ` ```footer ` : il **remplace la bande
correspondante du style** (l'en-tête, ou le pied), l'autre bande
restant celle du style. Il prend effet à partir de sa position dans la
source jusqu'à la fin du document (ou jusqu'au prochain fence du même
type). Trois emplacements, séparés par des `|` :

````markdown
```header
gauche | centre | droite
```
````

Exemple : un en-tête avec le titre du chapitre à droite, et un pied de
page avec la date à gauche et le numéro de page à droite :

````markdown
```header
 |  | {title}
```

```footer
{date} |  | page {page} / {pages}
```
````

**Variables disponibles** dans les emplacements :

- `{page}` — numéro de page courant.
- `{pages}` — nombre total de pages.
- `{title}` — texte du dernier `# titre` croisé (utile pour rappeler
  le chapitre courant en haut de page).
- `{date}` — date du jour.

**Mise en forme inline** dans les emplacements :

- `**texte**` — gras.
- `*texte*` — italique.
- `***texte***` — gras italique.

Vous pouvez mélanger texte fixe et variables :
`Bienvenue dans **markpage** | | {page} / {pages}`. La police, la
taille et la couleur des en-têtes et pieds de page sont celles du
style.

> ⚠ Limitation : un emplacement qui combine **à la fois** une variable
> (`{page}`) **et** une emphase au milieu (`Page **{page}**`) rend
> les astérisques littéralement. Pour mettre le numéro en gras,
> entourez **tout** l'emplacement d'astérisques (`**{page}**`).

#### Notes : bas de page, en marge, fin de document \label{sec:notes-modes}

Le **style** décide où atterrissent les notes Pandoc (`[^id]` +
définition, voir \ref{sec:footnotes} pour la syntaxe) :

- *Bas de page* (tous les styles livrés) — chaque note est placée
  **automatiquement au pied de la page** où se trouve son appel, comme
  dans un livre imprimé.
- *En marge* — chaque note glisse dans la marge extérieure, à la
  hauteur de son appel (à la Tufte). Le numéro apparaît à la fois en
  exposant dans le corps et au début de la note. Demande un style dont
  la page réserve une colonne de marge ; sinon les notes restent en fin
  de document.
- *Fin de document* — toutes les notes sont rassemblées à la fin, dans
  une section *Notes* numérotée.

La syntaxe est la même dans les trois cas : changer de style suffit à
passer de l'un à l'autre.

#### Figures en marge \label{sec:margin-figures}

Avec un style qui réserve une colonne de marge, vous pouvez placer une
figure dans la marge avec la syntaxe d'attribut Pandoc :

```
![Schéma](mon-schema.png){.margin}
```

L'image s'aligne dans la marge extérieure (droite sur une page de
droite, gauche sur une page de gauche en recto-verso), à la hauteur du
paragraphe qui la contient. Sa largeur est limitée à celle de la
colonne pour ne pas déborder. La classe `.margin` n'affecte que ce
placement — vous pouvez la combiner avec une légende :
`![alt](url "ma légende"){.margin}`.

### Mode slides (présentation 16:9) \label{sec:slides}

markpage sait produire un **PDF de présentation à la Beamer** : page
au format paysage 16:9, et **chaque `## titre de section` démarre une
nouvelle diapositive**. Il suffit de choisir le style **Présentation
16:9** :

````markdown
---
title: Algèbres de blocs-diagrammes
document-style: presentation-16x9
---

## Motivation

Le langage Faust repose sur 5 opérateurs binaires…

## Les opérateurs

- `~` récursion
- `,` parallèle
- `:` séquentiel
- `<:` split
- `:>` merge

## Démo
```bda
1 : +~_
```
````

Quatre diapositives : le titre, puis Motivation, Les opérateurs, Démo.

**Tout le reste fonctionne** comme dans un document classique :
légendes, références croisées, formules MathJax, blocs `mermaid`,
`category`, `bda`, `chart`, etc. — vous bénéficiez du même rendu
typographique sur les diapositives. Le menu **Vue ▾ → Présenter**
affiche le résultat en plein écran, une diapositive à la fois.

**Bloc `demo`** : pour des diapositives pédagogiques, le fence
`demo` affiche côte à côte la source markdown et son rendu. Le zoom
automatique adapte les deux panneaux pour qu'ils tiennent dans la
diapositive. Quand l'exemple contient lui-même un bloc de code (trois
accents graves), ouvrez et fermez le `demo` avec **quatre** accents
graves :

`````markdown
````demo
```bda "Accumulateur"
1 : +~_
```
````
`````

*Caveat* : évitez qu'un bloc `demo` commence par une phrase de
prose suivie d'un bloc rigide (code, diagramme, équation
displayed). Le layout doit alors composer entre un élément qui
peut wrapper et un élément qui ne le peut pas, et le résultat est
moins propre. Mettez directement le bloc à présenter en première
position.

### Caractères spéciaux et symboles

Les flèches (→, ←, ↑, ↓), les opérateurs mathématiques (≤, ≥, ≠), les
symboles divers (★, ♥, ✓) sont gérés correctement, à l'écran comme
dans le PDF.

### Numérotation des sections \label{sec:numbering}

Pour numéroter les titres d'un long document sans configurer de menu,
il suffit de **donner l'exemple sur le premier titre de chaque
niveau** : la commande **Numéroter les sections**
(`Cmd/Ctrl + Maj + N`, ou bien **Format** ▸ *Tout le document* ▸
*Numéroter les sections*) détecte le style de numérotation que vous avez écrit, puis
l'applique à tous les autres titres du même niveau.

Exemple. Vous écrivez :

```
# 1. Introduction

## 1.1 Contexte

## Objectifs

# Méthode

## Données

# Résultats
```

…vous lancez la commande, et le document devient :

```
# 1. Introduction

## 1.1 Contexte

## 1.2 Objectifs

# 2. Méthode

## 2.1 Données

# 3. Résultats
```

Le premier `#` (h1) annonce un style décimal plat (`1.`) ; le premier
`##` (h2) annonce un style hiérarchique (`1.1`). La commande retient
et applique. Si votre premier titre n'a aucune numérotation, ce
niveau ne sera pas numéroté du tout, et tout préfixe numérique
éventuel des titres suivants à ce niveau sera retiré (mise au propre).

**Styles reconnus** par niveau :

| Premier titre | Style appliqué |
|---|---|
| `# 1. Foo` | `1.`, `2.`, `3.`, … |
| `# 1) Foo` | `1)`, `2)`, `3)`, … |
| `# (1) Foo` | `(1)`, `(2)`, `(3)`, … |
| `# A. Foo` | `A.`, `B.`, …, `Z.`, `AA.` |
| `# a. Foo` | `a.`, `b.`, … |
| `# I. Foo` | `I.`, `II.`, `III.`, … |
| `# i. Foo` | `i.`, `ii.`, … |
| `## 1.1 Foo` | hiérarchique : `1.1`, `1.2`, `2.1`, … |
| `## 1.1. Foo` | hiérarchique avec point final |
| (sans préfixe) | aucune numérotation pour ce niveau |

La numérotation hiérarchique a besoin que tous les niveaux parents
soient eux-mêmes numérotés.

### Tableaux de données (CSV / TSV)

Pour un tableau dense, écrire la syntaxe pipe-style à la main est
fastidieux. Vous pouvez à la place coller un **CSV** ou un **TSV**
dans un *fenced block* :

````
```csv
Note, Concert pitch (Hz), MIDI
A4,    440.00, 69
A#4,   466.16, 70
B4,    493.88, 71
```
````

Le **séparateur** est la virgule pour `csv`, la tabulation pour `tsv`.
La **première ligne** devient l'en-tête du tableau, les suivantes les
données.

Si l'une de vos cellules contient le séparateur (par exemple une
virgule dans un nom), entourez-la de guillemets doubles :

````
```csv
Nom, Description
"Doe, John", "Auteur, fondateur"
```
````

Pour insérer un guillemet littéral dans une cellule entre guillemets,
doublez-le : `""`.

### Listes de définitions

Pour une liste de **termes avec leur définition** (glossaire,
notation, dictionnaire), utilisez la syntaxe Pandoc : un terme sur
une ligne, puis sa définition sur la ligne suivante préfixée par
`:` et au moins une espace.

```
DAG
:   Directed Acyclic Graph — un graphe orienté sans cycle.

FFT
:   Fast Fourier Transform, l'algorithme en $O(n \log n)$ de
    Cooley & Tukey.
```

Plusieurs définitions pour le même terme : ajoutez d'autres lignes
`:` à la suite.

```
Polynôme
:   Une expression de la forme $a_0 + a_1 x + \dots + a_n x^n$.
:   Un objet du langage Faust qui représente la même chose.
```

À l'intérieur des termes et des définitions vous pouvez utiliser du
Markdown inline (gras, italique, code, formules, liens).

### Notes de bas de page \label{sec:footnotes}

Vous pouvez ajouter une **note de bas de page** avec la syntaxe
Pandoc : un appel de note `[^id]` dans le texte, et la définition
`[^id]: contenu` n'importe où dans le document (généralement à la
fin).

```
La transformée de Fourier discrète[^dft] est l'outil de base pour
analyser un signal numérique.

[^dft]: Voir Cooley & Tukey (1965) pour l'algorithme rapide.
```

L'identifiant `id` peut être un nombre, un mot, ou un libellé court —
il sert seulement à relier l'appel à sa définition, et n'apparaît
nulle part dans le rendu. Les notes sont **numérotées
automatiquement** dans l'ordre où elles apparaissent dans le texte
(pas dans l'ordre des définitions).

**Le placement** dépend du réglage *Notes* (carte *Mise en page*) :
*bas de page* (défaut, chaque note en pied de la page où se trouve
son appel), *en marge* (gouttière extérieure, à la hauteur de
l'appel — style Tufte), ou *fin de document*. Voir la section
*Notes : bas de page, en marge, fin de document* plus haut pour le
détail des trois modes.

À l'intérieur d'une note vous pouvez utiliser **`gras`**, *italique*,
`code inline`, des liens, ou même `$math$`. Une même note peut être
référencée plusieurs fois — toutes les occurrences pointent vers la
même entrée.

Cliquer sur l'appel `¹` saute à la note ; cliquer sur le `↩` à la
fin de la note revient à l'appel.

### Citations bibliographiques \label{sec:citations}

Pour citer un article ou un livre, utilisez la **syntaxe
Pandoc-lite** : `[@key]` dans le texte, avec la définition
`[@key]: texte de la référence` en bas de document.

```
Quicksort tourne en $O(n \log n)$ en moyenne[@hoare1962], mais
dégénère à $O(n^2)$ sur une entrée déjà triée sans pivot
aléatoire[@sedgewick1978].

[@hoare1962]: Hoare, C. A. R. (1962). *Quicksort*. The Computer Journal 5(1), 10-16.
[@sedgewick1978]: Sedgewick, R. (1978). *Implementing Quicksort programs*. CACM 21(10), 847-857.
```

Le rendu : chaque appel devient `[1]`, `[2]`, … numéroté dans
l'ordre d'apparition (une référence réutilisée garde son numéro).
Une section **References** est générée en fin de document avec les
définitions, dans l'ordre des appels, chacune avec un back-link
`↩` qui ramène à l'appel.

Les clés acceptent lettres, chiffres et `_:.-` (compatibles
BibTeX). Une référence à une clé non définie reste en texte
littéral dans le rendu — ça évite les `[N]` blancs sur typo.

Le texte de la référence est écrit en Markdown : vous gardez la
main sur le format (italique pour le titre, gras pour l'auteur,
…). Pas de formatage CSL / APA / IEEE automatique.

### Références croisées \label{sec:xrefs}

Pour écrire « voir la section sur les \ref{sec:math} » ou « cf.
l'algorithme 1 » sans recopier de numéro à la main, attachez un
**`\label{clé}`** à votre cible et référencez-la depuis n'importe où
dans le document avec **`\ref{clé}`** :

- sur un **titre** : `## Méthode \label{sec:methode}`
- sur un **bloc captionné** (figure, tableau, algorithme, listing) :
  `\label{}` après la caption — ` ```algorithm "Tri à bulles" \label{alg:tri} `
- sur une **équation** en bloc : `\label{}` à l'intérieur du
  `$$ … $$` — déclenche automatiquement la numérotation à droite
  (style `amsmath`)

Le rendu de `\ref{clé}` s'adapte au type de cible :

- **Section** → le titre de la section, précédé de son numéro quand le
  style numérote ce niveau de titre. Exemple : `voir la \ref{sec:math}`
  donne « voir la \ref{sec:math} », cliquable.
- **Figure / tableau / algorithme / listing / équation** → le numéro
  attribué par leur caption ou leur `\tag` (toujours visible à côté
  de la cible). Exemple : `algorithme \ref{alg:tri}` → « algorithme
  2 ».

C'est vous qui écrivez le **mot d'introduction** (« voir la »,
« algorithme », « équation », …) — le moteur fournit seulement le
numéro ou le titre, ce qui laisse la grammaire naturelle.

> **Conventions de clés.** Tout est libre, mais le préfixe `sec:`,
> `fig:`, `tab:`, `alg:`, `lst:`, `eq:` est l'usage LaTeX classique :
> ça permet de retrouver une référence d'un coup d'œil et garde les
> noms uniques entre les types de cibles.

**Référence cassée.** Une `\ref{clé-inexistante}` rend un `[?]` en
rouge avec un *tooltip* (« référence inconnue : … ») — vous repérez
le typo immédiatement, sans qu'il passe en silence dans le PDF.

> **Cette page d'aide elle-même.** Toutes les sections importantes
> sont étiquetées : `sec:start`, `sec:toolbar`, `sec:settings`,
> `sec:math`, `sec:mermaid`, etc. Vous pouvez donc renvoyer vers
> elles depuis vos propres documents si vous souhaitez faire
> référence à un point de la documentation.

### Encadrés (notes, théorèmes…) \label{sec:callouts}

Vous pouvez mettre en valeur un passage avec un **encadré** : ouvrez
avec `:::` suivi du nom de l'encadré, écrivez votre contenu, fermez
avec `:::` seul sur une ligne. C'est la syntaxe Pandoc des *fenced
divs*.

```
::: warning
Attention, cette opération est irréversible.
:::
```

Les noms d'encadrés reconnus se rangent en deux familles :

- **Génériques** (cadre coloré, fond teinté) :
  `note` (bleu), `tip` (vert), `warning` (orange), `caution` (rouge),
  `important` (violet).
- **Académiques** (cadre sobre, titre en italique, façon LaTeX) :
  `theorem`, `lemma`, `proposition`, `corollary`, `definition`,
  `proof`, `example`, `remark`.

Vous pouvez ajouter un **titre** entre crochets après le nom :

```
::: theorem [Pythagore]
Dans un triangle rectangle, le carré de l'hypoténuse est égal à
la somme des carrés des deux autres côtés.
:::
```

…s'affiche avec le titre **« Théorème — Pythagore »**.

Si vous écrivez un encadré avec un nom qui n'est pas dans la liste
ci-dessus (par exemple `::: aside`), il sera rendu avec un cadre
neutre — utile pour vos propres conventions.

L'intérieur d'un encadré est du Markdown comme le reste : texte mis
en forme, listes, formules, voire des tableaux.

### Colonnes \label{sec:columns}

Pour disposer du contenu **côte à côte**, utilisez un *fenced div*
`::: columns` et séparez les colonnes par une ligne `---`. Chaque
segment devient une colonne de largeur égale — pratique sur une slide
pour un avant/après ou un découpage texte-et-figure.

```
::: columns
**Avant**

- lent
- verbeux

---

**Après**

- rapide
- concis
:::
```

Deux `---` donnent trois colonnes, et ainsi de suite. Chaque colonne
est du Markdown normal (texte, listes, images, formules…). Cela
fonctionne en mode paginé comme en mode slides ; le bloc reste sur une
seule page, donc gardez-le assez court pour tenir (sur une slide c'est
automatique). À l'export LaTeX, les colonnes sont empilées.

### Style local (`::: style`) \label{sec:style}

La typographie vient du **style du document** (voir
\ref{sec:settings}), qui s'applique à *tous* les éléments d'un même
type. Pour un réglage local — un grand titre coloré sur une couverture,
une légende centrée — enveloppez le contenu dans un bloc `::: style` :

```
::: style color=#0b3d91 size=22pt align=center weight=700
Un titre bleu, 22 points, centré, gras
:::
```

Les paramètres (une liste fixe et sûre — pas de CSS ni HTML arbitraire) :

- `color=` — `#rrggbb` ou un nom de couleur CSS (`teal`, `navy`…)
- `size=` — taille en points (`28pt`, ou simplement `28`)
- `font=` — une famille (`font="Source Serif 4"`)
- `weight=` — graisse, 100–900
- `align=` — `left` / `center` / `right` / `justify`
- `italic`, `underline` — seuls (sans `=`)
- `line-height=` — multiplicateur d'interligne (`1.3`)

L'intérieur est du Markdown ordinaire, et le style s'applique à tout —
il surcharge le style localement, même la taille d'un titre ou
l'alignement d'un paragraphe. Imbriquez un `::: style` dans un autre
pour un réglage plus fin ; l'interne l'emporte.

### Fonds de page (`::: background`) \label{sec:background}

Un bloc `::: background` place du contenu **derrière** la page — pour
une couverture, une affiche, ou un gabarit de slide récurrent. Chaque
bloc est une petite « minipage » Markdown dessinée sur le fond de la
page ; votre document se rend par-dessus.

```
::: background fill=#0b1f3a
:::
::: background at=0.5,0.4 size=0.7
Un bloc titre centré
:::
```

- **`fill=`** — une couleur de fond. *Sans* `size`, le bloc remplit
  **toute la page** ; *avec* `size`, c'est une minipage positionnée.
- **`at=x,y`** — où le placer, en fractions de `0` à `1` (`0,0` = coin
  haut-gauche de la feuille, `1,1` = bas-droite). Le même point de la
  minipage rejoint ce point de la page : `0,0` se cale dans le coin,
  `0.5,0.5` au centre, `1,1` en bas à droite.
- **`size=`** — la largeur de la minipage, en fraction de la page (la
  hauteur s'adapte au contenu).
- **`first`** — cette page seulement (une couverture distincte). Sinon
  le fond **se reporte sur les pages suivantes** (comme un en-tête /
  pied) jusqu'à un nouveau `::: background` ; un `::: background`
  **vide** l'efface.

L'ordre source est l'ordre d'empilement — écrivez le `fill` *avant* ce
qui se pose dessus. Pour un titre clair sur un fond sombre, mettez un
`::: style` *dans* un fond ; comme un bloc `:::` se ferme à la ligne
`:::` suivante, donnez **quatre deux-points** à celui de
**l'extérieur** :

```
:::: background first at=0.5,0.4 size=0.8
::: style color=#ffffff align=center size=34pt
Rapport annuel
:::
::::
```

Les fonds apparaissent dans l'**aperçu paginé** et le PDF (pas dans la
vue d'édition continue).

### Graphiques \label{sec:charts}

Pour tracer une courbe ou un diagramme à partir de données, utilisez
un *fenced block* `chart` :

````
```chart line "Latence par taille de buffer"
buffer, latence (ms)
64,  12
128,  8
256,  5
512,  3
1024, 2
```
````

Les types disponibles sont **`line`** (courbe) et **`bar`**
(histogramme). Le titre entre guillemets après le type est
facultatif.

La **première ligne** donne les en-têtes : la première colonne
devient le label de l'axe X, les colonnes suivantes deviennent autant
de **séries de données** (chacune sa couleur, et une légende
automatique si plus d'une série).

Les **lignes de données** suivantes contiennent les valeurs. Si la
première colonne est numérique, l'axe X est continu ; si elle
contient des labels textuels (mois, catégories…), l'axe X est
catégorique.

#### Format CSV : virgules françaises

Le séparateur de champ est **détecté automatiquement** sur la
première ligne :

- s'il y a une tabulation → séparateur = tabulation,
- sinon s'il y a un point-virgule → séparateur = `;`,
- sinon → séparateur = `,`.

Quand le séparateur est `,`, les **virgules entre deux chiffres**
(sans espace autour) sont reconnues comme **virgules décimales**,
donc `3,14` reste un seul nombre. La virgule séparatrice s'écrit
alors suivie d'un espace : `foo, 3,14` donne deux cellules `foo` et
`3,14`.

Pour les rares cas ambigus (`1,2,3,4` compact), passez en `;` ou en
TSV — ou ajoutez des espaces : `1, 2, 3, 4`.

Les nombres dans les cellules acceptent les deux formats (point ou
virgule décimale) — `3.14` et `3,14` sont équivalents.

#### Séries chronologiques

Si la première colonne contient des **dates au format ISO 8601**
(`YYYY-MM-DD`, éventuellement avec heure), l'axe X est traité comme
une échelle temporelle. L'app choisit automatiquement les graduations
appropriées (jour, mois ou année selon l'étendue) :

````
```chart line "Téléchargements"
date, total
2025-01-15, 120
2025-02-15, 180
2025-03-15, 245
2025-04-15, 310
```
````

Les formats ambigus (FR `15/01/2025` et US `01/15/2025`) ne sont
**pas** reconnus — utilisez toujours ISO 8601, qui est sans
ambiguïté.

#### Plusieurs séries

````
```chart bar "Comparaison de codecs"
Codec, Taille (Ko), Temps (ms)
MP3, 4200, 120
Opus, 3800, 95
FLAC, 12500, 280
```
````

Deux barres côte à côte par catégorie, avec une légende en haut à
droite identifiant chaque série.

---

## Pour aller encore plus loin \label{sec:expert}

Cette dernière partie regroupe les outils **plus spécialisés** :
ligatures de saisie qui rendent l'Unicode mathématique confortable à
taper, formules en LaTeX, règles d'inférence, et diagrammes Mermaid
(flowcharts, séquences, états, etc., chacun avec sa propre syntaxe).
Si vous écrivez un article de recherche, un cours, une spec
d'algorithme, ou de la documentation technique, vous y trouverez votre
compte. Sinon vous pouvez sauter directement aux Crédits.

### Frontmatter YAML \label{sec:frontmatter}

En tête de document, un **bloc YAML** (entre deux lignes de `---`)
donne la carte d'identité du document — ce qu'il *est*, pas à quoi il
*ressemble* :

```yaml
---
title: Une étude des automates finis
subtitle: Notes de cours
author: Alice Dupont
organization: Université de Lyon
date: 21 mai 2026
language: fr
document-style: article-a4
mathjax-preamble: |
  \newcommand{\R}{\mathbb{R}}
  \newcommand{\sem}[1]{\llbracket #1 \rrbracket}
---
```

Les clés reconnues :

- **`title`** — le titre du document, affiché en tête (sur la
  couverture si le style en a une). C'est la seule façon de donner un
  titre au document : les `# titres` du corps sont toujours des
  sections.
- **`subtitle`** — un sous-titre, sous le titre.
- **`author`**, **`organization`**, **`date`** — affichés sous le
  titre, dans cet ordre. `date:` est du texte libre, recopié tel quel.
- **`language`** — `fr` ou `en` : la langue du texte, pour la césure
  des mots et le format des dates. Par défaut, la langue de
  l'interface.
- **`document-style`** — le nom du style (voir \ref{sec:settings}).
  Sans cette clé, le style par défaut *Note A4*.
- **`mathjax-preamble`** — du code TeX (multi-ligne avec `|`)
  collé avant **chaque** formule MathJax du document. Idéal pour
  définir une fois `\newcommand{\R}{\mathbb{R}}` et l'utiliser dans
  toutes les formules sans répéter la définition.

Toutes les clés sont optionnelles. Une clé inconnue est ignorée — en
particulier, **aucune clé ne modifie l'apparence** : marges, polices,
couleurs et format viennent du style. Pour changer d'apparence, on
change de style.

### Ligatures de saisie

Pour vous éviter de chercher chaque symbole Unicode dans une table de
caractères, l'éditeur **remplace au vol** certaines séquences ASCII
par leur équivalent mathématique. Deux mécaniques cohabitent :

Les **séquences courtes de symboles** sont remplacées dès qu'elles
sont complètes :

| Tapez | Obtenez | Tapez | Obtenez |
|---|---|---|---|
| `[[` | ⟦ | `]]` | ⟧ |
| `->` | → | `<-` | ← |
| `=>` | ⇒ | | |
| `<=` | ≤ | `>=` | ≥ |
| `!=` | ≠ | `+-` | ± |
| `\|-` | ⊢ | `-\|` | ⊣ |
| `...` | … | | |

> Les **chevrons** `⟨` et `⟩` (angle brackets) s'obtiennent uniquement
> via `\langle` et `\rangle` (cf. ci-dessous). Pas de ligature `<<` /
> `>>` — celles-ci restent disponibles littéralement (utile par
> exemple pour les opérateurs de décalage de bits dans du code).

Les **commandes LaTeX** (`\xxx`) attendent un **caractère terminateur**
(espace, ponctuation, opérateur, retour à la ligne) avant de se
substituer. Vous tapez `\alpha` puis un espace : l'espace reste, et
`\alpha` est remplacé par α. Cette règle permet à des noms qui se
chevauchent (`\in`, `\int`, `\infty` ; `\subset`, `\subseteq`) de
coexister sans qu'un préfixe ne court-circuite un nom plus long.

> **La règle, en une phrase.** Tout symbole mathématique possède une
> forme Unicode et une forme `\commande` équivalentes, reliées par une
> table unique : l'éditeur convertit `\commande␣` en symbole Unicode,
> et l'export LaTeX fait exactement l'inverse — sauf les échappements
> (`\#`), les accents et le texte (`\sqrt`, `\text{}`) et les macros à
> argument (`\mathbb{N}`), qui ne sont pas des symboles. Donc **tout**
> symbole connu de l'export PDF/LaTeX est aussi une ligature. Les
> listes ci-dessous sont une visite guidée, pas un catalogue exhaustif.

**Lettres grecques** :

| Tapez | Obtenez | Tapez | Obtenez | Tapez | Obtenez |
|---|---|---|---|---|---|
| `\alpha` | α | `\iota` | ι | `\rho` | ρ |
| `\beta` | β | `\kappa` | κ | `\sigma` | σ |
| `\gamma` | γ | `\lambda` | λ | `\tau` | τ |
| `\delta` | δ | `\mu` | μ | `\upsilon` | υ |
| `\epsilon` | ϵ | `\nu` | ν | `\phi` | ϕ |
| `\zeta` | ζ | `\xi` | ξ | `\chi` | χ |
| `\eta` | η | `\omicron` | ο | `\psi` | ψ |
| `\theta` | θ | `\pi` | π | `\omega` | ω |

Variantes typographiques :
`\varepsilon` ε, `\varphi` φ, `\vartheta` ϑ, `\varpi` ϖ, `\varrho` ϱ,
`\varsigma` ς.

Majuscules (seulement celles qui diffèrent du latin) :
`\Gamma` Γ, `\Delta` Δ, `\Theta` Θ, `\Lambda` Λ, `\Xi` Ξ, `\Pi` Π,
`\Sigma` Σ, `\Upsilon` Υ, `\Phi` Φ, `\Psi` Ψ, `\Omega` Ω.

**Théorie des ensembles & quantificateurs** :
`\in` ∈, `\notin` ∉, `\subset` ⊂, `\supset` ⊃, `\subseteq` ⊆,
`\supseteq` ⊇, `\cup` ∪, `\cap` ∩, `\emptyset` ∅, `\forall` ∀,
`\exists` ∃.

**Logique** : `\wedge` ∧, `\vee` ∨, `\neg` ¬.

**Relations** : `\approx` ≈, `\equiv` ≡, `\cong` ≅, `\sim` ∼,
`\propto` ∝, `\perp` ⊥, `\parallel` ∥.

**Opérateurs** : `\oplus` ⊕, `\otimes` ⊗, `\circ` ∘, `\bullet` •,
`\cdot` ⋅, `\times` ×, `\div` ÷.

**Analyse** : `\partial` ∂, `\nabla` ∇, `\infty` ∞, `\sum` ∑,
`\prod` ∏, `\int` ∫, `\oint` ∮.

**Constantes** : `\aleph` ℵ, `\hbar` ℏ.

**Points de suspension** : `\cdots` ⋯, `\vdots` ⋮, `\ddots` ⋱,
`\ldots` …

**Grandes flèches** : `\mapsto` ↦, `\Leftarrow` ⇐, `\Rightarrow` ⇒,
`\Leftrightarrow` ⇔.

**Chevrons** : `\langle` ⟨, `\rangle` ⟩.

**Indices et exposants** (chiffres uniquement) : `_0`…`_9` deviennent
₀…₉ et `^0`…`^9` deviennent ⁰…⁹. La forme négative `^-1`…`^-9` donne
⁻¹…⁻⁹ (utile pour les inverses). Exemples : `\pi_1` → π₁, `x_1` →
x₁, `f^-1` → f⁻¹, `e^2` → e². Pour éviter une ligature dans le rare
cas d'un mot italique terminé par un chiffre (`_label_1_`), préférer
les astérisques (`*label_1*`).

> Pour écrire une commande **littéralement** dans la prose (par
> exemple pour documenter `\alpha`), doublez le backslash :
> `\\alpha` reste tel quel dans la source — et rend comme `\alpha`
> en Markdown, qui interprète `\\` comme un backslash échappé. À
> l'intérieur d'un bloc code, les ligatures sont également
> désactivées.

Pour les **lettres "blackboard bold"** (ensembles), `|` suivi de
n'importe quelle lettre majuscule donne sa version doublée :

| Tapez | Obtenez | Tapez | Obtenez | Tapez | Obtenez |
|---|---|---|---|---|---|
| `\|A` | 𝔸 | `\|J` | 𝕁 | `\|S` | 𝕊 |
| `\|B` | 𝔹 | `\|K` | 𝕂 | `\|T` | 𝕋 |
| `\|C` | ℂ | `\|L` | 𝕃 | `\|U` | 𝕌 |
| `\|D` | 𝔻 | `\|M` | 𝕄 | `\|V` | 𝕍 |
| `\|E` | 𝔼 | `\|N` | ℕ | `\|W` | 𝕎 |
| `\|F` | 𝔽 | `\|O` | 𝕆 | `\|X` | 𝕏 |
| `\|G` | 𝔾 | `\|P` | ℙ | `\|Y` | 𝕐 |
| `\|H` | ℍ | `\|Q` | ℚ | `\|Z` | ℤ |
| `\|I` | 𝕀 | `\|R` | ℝ | | |

Le remplacement modifie le **source** du document (pas seulement
l'affichage), donc les caractères Unicode sont là si vous copiez le
texte ailleurs.

Pour annuler une ligature qui s'est déclenchée alors que vous vouliez
le texte littéral, faites `Cmd/Ctrl + Z` immédiatement après — la
substitution se défait, le texte ASCII est restauré.

### Formules mathématiques \label{sec:math}

Vous pouvez inclure des **formules en LaTeX**, soit **en bloc** entre
`$$ … $$` (la formule s'affiche centrée sur sa propre ligne), soit
**inline** entre `$ … $` au milieu d'une phrase. Le rendu utilise
[MathJax](https://www.mathjax.org/) et produit un PDF de qualité
typographique professionnelle.

Pour les blocs, vous pouvez aussi utiliser un *fenced block* avec le
langage `math` — c'est la convention GitHub et ça évite le piège des
`$$` qui doivent être seuls sur leur ligne :

````
```math
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
```
````

Le rendu est strictement identique à `$$ … $$`.

#### Exemples utiles

**Sommes et intégrales**

```
$$
\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}
\qquad
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
```

$$
\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}
\qquad
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

**Matrice**

```
$$
A = \begin{pmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{pmatrix}
$$
```

$$
A = \begin{pmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{pmatrix}
$$

**Système d'équations alignées**

```
$$
\begin{align*}
f(x)   &= ax^2 + bx + c \\
f'(x)  &= 2ax + b \\
f''(x) &= 2a
\end{align*}
$$
```

$$
\begin{align*}
f(x)   &= ax^2 + bx + c \\
f'(x)  &= 2ax + b \\
f''(x) &= 2a
\end{align*}
$$

**Formule inline** : tapez par exemple
`Soit $\epsilon > 0$ tel que…` et vous obtenez :

Soit $\epsilon > 0$ tel que…

#### À savoir

- La taille des formules s'aligne sur la taille du texte courant (celle
  que fixe le style) : un style à gros corps donne de grosses
  formules.
- Si une formule est plus large que la zone de texte de la page, elle
  est automatiquement réduite pour tenir.
- Les commandes LaTeX usuelles fonctionnent : `\frac`, `\sqrt`,
  `\sum`, `\int`, `\lim`, `\vec`, `\partial`, lettres grecques
  (`\alpha`, `\beta`, …), opérateurs (`\pm`, `\times`, `\le`),
  flèches (`\to`, `\Rightarrow`), environnements `pmatrix` /
  `bmatrix` / `align*`, etc.

### Règles d'inférence \label{sec:inference}

Pour écrire une **règle d'inférence** (déduction logique, sémantique
opérationnelle, etc.), utilisez un *fenced block* avec le langage
`inference` :

````
```inference (MP)
Γ ⊢ A; Γ ⊢ A → B
-------------------
Γ ⊢ B
```
````

Le bloc est rendu en LaTeX `\dfrac{prémisses}{conclusion}` via
MathJax. Une **ligne de tirets** (3 tirets ou plus, seule sur sa
ligne) sépare les prémisses de la conclusion. Les prémisses sont
séparées par `;` ou réparties sur plusieurs lignes. L'**étiquette**
facultative entre parenthèses après le `inference` (ici `(MP)` pour
modus ponens) apparaît à droite de la barre.

À l'intérieur d'un bloc `inference`, les **ligatures de saisie**
restent actives — vous pouvez taper `|-`, `->`, `[[`, `|N`, etc. et
obtenir directement les caractères Unicode (⊢, →, ⟦, ℕ, …) que
MathJax sait rendre tels quels en mode math. C'est la seule
exception au comportement habituel "ligatures désactivées dans les
blocs de code".

Pour les commandes LaTeX qui n'ont pas d'équivalent Unicode dans nos
ligatures (par exemple `\Gamma`, `\forall`, `\exists`, `\Rightarrow`,
`\leq`), tapez-les directement.

### Diagrammes catégoriques déclaratifs \label{sec:category}

Pour les **diagrammes commutatifs** (carrés, triangles, pullbacks,
equalizers, propriétés universelles), le fence ` ```category ` offre
une syntaxe **déclarative** simple : chaque ligne décrit un morphisme
dans la convention CS / mathématique standard `f : A -> B`, et le
moteur calcule le layout automatiquement.

Triangle commutatif :

````
```category
f : A -> B
g : B -> C
h : A -> C = g . f
```
````

Le suffixe `= g . f` déclare `h` comme raccourci pour la composition
`g ∘ f` — le typechecker valide la commutativité avant le rendu, et la
flèche `h` est dessinée comme arête secondaire.

**Pullback** (cône au-dessus d'un cospan) :

````
```category "Propriété universelle du pullback"
f  : A -> C
g  : B -> C
p1 : P -> A
p2 : P -> B
h  : X -> A
k  : X -> B
u  : X -> P by (h, k)

f . p1 = g . p2
p1 . u = h
p2 . u = k
```
````

La clause **`by (h, k)`** marque `u` comme **flèche universelle** :
elle existe et est unique grâce aux deux morphismes `h` et `k`. Le
moteur la dessine **en pointillé** (convention textbook pour les
factorisations universelles). Les équations qui suivent expriment la
commutativité du cône.

**Mots-clés** :

| Forme | Sens |
| --- | --- |
| `f : A -> B` | morphisme |
| `f : A -> B (mono)` | monomorphisme (label suffixé `↣`) |
| `f : A -> B (epi)` | épimorphisme (label suffixé `↠`) |
| `f : A -> B (iso)` | isomorphisme (label suffixé `≅`) |
| `h : A -> B = g . f` | morphisme + équation de raccourci |
| `u : X -> P by (f, g)` | morphisme induit (rendu pointillé) |
| `g . f = h . k` | équation autonome (commutativité) |
| `direction: TB` | force la direction du layout (`TB`, `BT`, `LR`, `RL`) |
| `objects: T, X` | déclaration optionnelle (objets isolés ou détection stricte des typos) |

**Ce que le moteur fait pour vous** :

- **Inférence des objets** depuis les endpoints des morphismes — pas
  besoin de les lister.
- **Typechecking** : compositions mal typées (`f . g` quand
  `cod(g) ≠ dom(f)`) et équations dont les deux côtés n'ont pas les
  mêmes domaine/codomaine sont rejetées avant le rendu, avec un
  diagnostic positionnel.
- **Layout automatique** : algorithme à deux passes, optimise pour
  flèches horizontales / verticales en premier, puis bascule sur un
  repère élargi (45° + expansion) si la topologie l'exige (pullback,
  pushout…). Étiquettes positionnées à l'extérieur de la figure.
- **Captions et cross-refs** comme tout bloc captionnable : `"Titre"
  \label{fig:xxx}` après `category` numérote en `Figure N` et permet
  `\ref{fig:xxx}` ailleurs dans le document.

Les **ligatures de saisie** (\pi → π, indices chiffrés) sont actives
dans le bloc — `\pi_1` tapé devient `π₁` et le parser accepte les
identifiants Unicode (lettres grecques, indices, exposants).

> **Spec complète** dans `docs/CATEGORY-SPEC.md` —
> grammaire EBNF, sémantique de typage, stratégie de rendu, corpus
> canonique de dix diagrammes (triangle, produit, coproduit, carré
> de naturalité, pullback, pushout, égaliseur, coégaliseur,
> fonctorialité, objet terminal).

### Diagrammes en blocs à la Faust (BDA) \label{sec:bda}

Pour les **schémas en blocs interconnectés** style Faust, le fence
` ```bda ` accepte une expression algébrique (la *Block-Diagram
Algebra* qui est à la base du langage Faust) et la dessine
automatiquement, en lisant de gauche à droite.

Une expression combine des **primitives** (boîtes) via **cinq
opérateurs binaires** de composition :

| Op | Composition | Priorité | Associativité | Contrainte |
| --- | --- | --- | --- | --- |
| `~` | récursion (boucle de feedback) | 4 (forte) | droite | `inputs(A) ≥ outputs(B)` et `outputs(A) ≥ inputs(B)` |
| `,` | parallèle | 3 | gauche | aucune |
| `:` | séquentiel | 2 | gauche | `outputs(A) = inputs(B)` |
| `<:` | split (fan-out) | 1 | gauche | `inputs(B)` multiple positif de `outputs(A)` |
| `:>` | merge (fan-in) | 1 | gauche | `outputs(A)` multiple positif de `inputs(B)` |

Une **primitive** est caractérisée par son nombre d'entrées et de
sorties `(n, m)`. Le fence accepte :

- **Identifiants** (`Foo`, `gain`, `Γ`…) — par défaut `(1, 1)`, sinon
  annotés avec `Foo[n, m]`.
- **Labels entre guillemets** pour les noms avec espaces ou caractères
  spéciaux : `"my filter"[2, 1]`.
- **Nombres** (`0`, `42`, `3.14`) — arité `(0, 1)`.
- **Opérateurs arithmétiques et de comparaison** `+ - * / % ^ < > <= >= == != & |` — arité `(2, 1)`.
- **Fonctions math 1-arg** `sin cos tan asin acos atan sinh cosh tanh exp log log10 sqrt abs floor ceil rint` — arité `(1, 1)`.
- **Fonctions math 2-arg** `min max pow atan2` — arité `(2, 1)`.
- **Primitives structurelles** : `_` (identité, fil qui passe `(1, 1)`)
  et `!` (cut, absorbe le signal `(1, 0)`).

L'**accumulateur** est l'exemple canonique — un compteur qui
s'incrémente à chaque échantillon, équivalent Faust `1 : + ~ _` :

````
```bda
1 : +~_
```
````

Le `+ ~ _` ré-injecte la sortie de `+` (via le fil `_`) dans sa
deuxième entrée ; le `1` constant alimente la première à chaque tour.

**Récursion multi-fils** : pour `A ~ B`, le typechecker exige
`inputs(A) ≥ outputs(B)` et `outputs(A) ≥ inputs(B)` ; le bloc `B`
est dessiné **rotation 180°** au-dessus de `A` (convention Faust), ce
qui permet aux fils de feedback de s'imbriquer concentriquement sans
se croiser.

**Cross — un grand classique** : on permute deux signaux en
exploitant le modulo du split, les copies redondantes finissent dans
les `!` (qui sont rendus invisibles) :

````
```bda
_,_ <: !,_,_,!
```
````

**Marqueurs `z⁻¹`** : l'option `delays` (alias `faust`) place un
petit carré blanc à la bifurcation de chaque fil A→B, matérialisant
le délai unitaire implicite du `~` :

````
```bda delays "Accumulateur Faust"
1 : +~_
```
````

**Captions et cross-refs** comme tout bloc captionnable : `"Titre"
\label{fig:xxx}` après `bda` (et avant ou après les options comme
`delays`) numérote en `Figure N`, et `\ref{fig:xxx}` y renvoie
ailleurs dans le document.

### Diagrammes Mermaid \label{sec:mermaid}

[Mermaid](https://mermaid.js.org/) permet de décrire un diagramme avec
quelques lignes de texte. Placez votre code dans un bloc dont le
langage est `mermaid` :

````
```mermaid
flowchart LR
    A[Idée] --> B[Brouillon]
    B --> C[Document final]
    C --> D[PDF]
```
````

…et vous obtenez :

```mermaid
flowchart LR
    A[Idée] --> B[Brouillon]
    B --> C[Document final]
    C --> D[PDF]
```

Le diagramme est rendu en **SVG**, dans l'aperçu **et** dans le PDF
(qualité vectorielle, sans pixellisation à l'impression).

> 💡 **Étiquettes multi-lignes** : utilisez `<br>` pour casser une
> étiquette de nœud sur plusieurs lignes. Les deux formes
> `A[Ligne 1<br>Ligne 2]` (sans guillemets) et `A["Ligne 1<br>Ligne 2"]`
> (avec guillemets) fonctionnent, dans les flowcharts comme dans les
> diagrammes de classes. `<br/>` et `<br>` sont équivalents.

#### Quelques exemples

**Diagramme de séquence** (échange entre deux acteurs) :

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant S as Serveur
    U->>S: Requête GET /data
    S-->>U: 200 OK + JSON
```

**Diagramme de classes** :

```mermaid
classDiagram
    class Animal {
        +String nom
        +manger()
    }
    class Chien {
        +aboyer()
    }
    Animal <|-- Chien
```

**Camembert** :

```mermaid
pie title Répartition
    "Travail" : 40
    "Loisir" : 30
    "Sommeil" : 30
```

Autres types reconnus : `stateDiagram`, `gantt`, `mindmap`, etc. — voir
la [documentation Mermaid](https://mermaid.js.org/) pour la liste
complète.

### Grammaires EBNF \label{sec:ebnf}

La fence `ebnf` rend des productions [EBNF style
W3C](https://www.w3.org/TR/xml/#sec-notation) sous forme de
**diagrammes en rails** (railroad / syntax diagrams) — un SVG par
production. Idéal pour documenter une syntaxe de langage ou un
format de fichier.

````markdown
```ebnf
expression = terme, { ("+" | "-"), terme };
terme = nombre | "(", expression, ")";
nombre = chiffre, { chiffre };
chiffre = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
```
````

Une erreur de parse produit un bloc rouge avec le message — pas
d'export bloquant. Sous le capot,
[ebnf2railroad](https://github.com/matthijsgroen/ebnf2railroad) fait
le rendu. Chaque production s'écrit `nom = … ;` ; la virgule `,`
enchaîne, `|` offre une alternative, `{ … }` répète (zéro fois ou
plus), `[ … ]` rend optionnel, `( … )` groupe ; les mots du langage
s'écrivent entre guillemets.

### Types algébriques (ADT) \label{sec:adt}

Pour définir des structures de données algébriques en notation
BNF-ish, la fence `adt` rend chaque définition sous forme de **grille
alignée** : nom du type à gauche, suivi de `::=` puis des
constructeurs séparés par `|`. Les commentaires entre `(* … *)`
s'alignent en marge.

````markdown
```adt
Expr ::= Num(value)        (* littéral entier *)
       | Add(left, right)  (* somme *)
       | Mul(left, right)  (* produit *)
       | Var(name)         (* variable libre *)

Stmt ::= Assign(name, expr)
       | If(cond, then_branch, else_branch)
       | While(cond, body)
```
````

Plusieurs définitions dans le même bloc s'enchaînent ; les lignes
qui ne parsent pas sont signalées dans un panneau d'avertissement
sous le rendu (visible mais non bloquant).

### Lettres et correspondance \label{sec:letters}

Pour les courriers, devis, factures, propositions commerciales,
markpage fournit trois fences spécifiques : `sender` (émetteur),
`recipient` (destinataire) et `signature` (bloc de fin). Chacune
émet un bloc `<div class="letterhead letterhead-…">` avec les
lignes du corps jointes par `<br>` et le formatage inline
(`**gras**`, `*italique*`, `[lien](url)`) géré directement.

````markdown
```sender
**Marie Dupont**
*Étude Dupont & Associés*
12 rue de la Paix
75002 Paris
contact@dupont-asso.fr
```

```recipient
Jean Martin
Société Acme
8 boulevard Voltaire
75011 Paris
```
````

**Positionnement** :

- `sender` reste dans le flux flex (colonne gauche).
- `recipient` est par défaut **positionné fenêtre DL** (absolu,
  calibré pour l'enveloppe DL française à fenêtre). Ajoutez
  l'argument `flow` pour le faire revenir en flex (colonne droite,
  utile sans enveloppe à fenêtre).
- `signature` est aligné à droite en fin de document : typiquement
  une image + nom + qualité, protégé contre les coupures de page.

````markdown
```signature
![](signature-marie.png)

**Marie Dupont**
*Directrice associée*
```
````

Lorsqu'un `sender` et un `recipient flow` sont placés côte à côte,
markpage les groupe automatiquement dans une rangée flex pour qu'ils
se présentent comme deux blocs adresse en haut de la lettre.

---

## Piloter markpage avec une IA (MCP) \label{sec:mcp}

markpage peut être **piloté par une IA** (Claude Desktop / Claude Code) via un
petit pont local, le *MCP bridge*. L'IA peut alors lire et écrire votre
document, basculer les vues, lister les erreurs de rendu — et même apprendre la
syntaxe markpage toute seule, pour rédiger à quatre mains.

**Installation (une seule fois).** Cliquez sur la pastille **MCP** en bas à
droite de l'écran : elle détecte votre plateforme, propose le **téléchargement**
du pont et la commande `claude mcp add markpage …` à coller dans un terminal.
Relancez ensuite votre client IA.

**Connexion.** Ouvrez markpage avec `?mcp=ws://127.0.0.1:7878/ws` (ou via la
pastille). Quand elle passe au **vert**, l'IA est reliée à *cet* onglet.

::: note
Tout reste **local** : le pont n'écoute que sur `127.0.0.1`, rien ne part sur
Internet. Deux outils (le guide de rédaction et la syntaxe des fences)
fonctionnent même sans onglet ouvert, pour que l'IA sache écrire du markpage.
:::

Détails et liste complète des outils : `docs/MCP-SPEC.md` dans le dépôt.

---

## Aide-mémoire des fences \label{sec:fences-cheatsheet}

Markpage reconnaît une vingtaine de **fences spécialisées** au-delà
du Markdown standard. La table ci-dessous les liste, puis chaque
fence est illustrée par un exemple minimal avec un lien vers la
section détaillée quand il y en a une.

**Caption + label** : toutes les fences qui produisent un bloc
captionnable (figure, algorithme, tableau, listing) acceptent une
caption entre guillemets et un `\label{…}` pour la référence
croisée :

````markdown
```algorithm "Tri à bulles" \label{alg:tri}
```
````

| Fence       | Effet                                                                       |
|-------------|-----------------------------------------------------------------------------|
| `math`      | Bloc mathématique (équivalent `$$…$$`)                                      |
| `csv`       | Tableau de données dense (virgule séparateur). `tsv` pour tabulation.       |
| `inference` | Règle d'inférence (prémisses / conclusion)                                  |
| `chart`     | Graphique (courbes, barres, etc.) à partir de données                       |
| `ebnf`      | Diagrammes de syntaxe (railroad) pour grammaires                            |
| `category`  | Diagrammes catégoriques déclaratifs                                         |
| `bda`       | Diagrammes en blocs à la Faust                                              |
| `adt`       | Types algébriques (grille BNF)                                              |
| `diff`      | Texte diff unifié colorisé                                                  |
| `tree`      | Arbre Unicode depuis une outline indentée. `tree svg` pour un rendu SVG.    |
| `algorithm` | Pseudo-code numéroté à la algorithm2e                                       |
| `demo`      | Source markdown + rendu côte à côte                                         |
| `sender`    | Bloc émetteur d'une lettre (haut gauche). Voir aussi `recipient`.           |
| `recipient` | Bloc destinataire (positionnement fenêtre DL par défaut, `flow` pour flex)  |
| `signature` | Bloc de signature en fin de lettre (image + nom, aligné à droite)           |
| `header`    | En-tête de page (3 slots, voir *En-tête et pied de page*). Idem `footer`.   |
| `mermaid`   | Diagrammes Mermaid (séquence, flowchart, classes, etc.)                     |

### `adt` — types algébriques

````markdown
```adt
Expr ::= Num(value) | Add(left, right) | Mul(left, right)
```
````

Définitions BNF-ish en grille alignée. Voir *Types algébriques (ADT)*.

### `algorithm` — pseudo-code

````markdown
```algorithm "Tri à bulles"
for i = 1 to n-1 do
  for j = 0 to n-i-1 do
    if A[j] > A[j+1] then
      swap A[j] and A[j+1]
return A
```
````

Numéros de ligne, mots-clés en gras. Voir *Algorithmes
(pseudo-code)*.

### `bda` — diagrammes en blocs (Faust)

````markdown
```bda
1 : +~_
```
````

Algèbre des blocs à la Faust : opérateurs `:`, `,`, `<:`, `:>`, `~`.
Voir *Diagrammes en blocs à la Faust (BDA)*.

### `category` — diagrammes commutatifs

````markdown
```category
f : A -> B
g : B -> C
h : A -> C

h = g . f
```
````

DSL déclaratif pour diagrammes commutatifs. Voir *Diagrammes
catégoriques déclaratifs*.

### `chart` — graphiques

````markdown
```chart line
x, sin, cos
0, 0, 1
1.57, 1, 0
3.14, 0, -1
```
````

Tracé de courbes (`line`), barres (`bar`), etc. à partir d'un CSV
embarqué. Voir *Graphiques*.

### `csv` / `tsv` — tableaux de données denses

````markdown
```csv
Nom, Âge, Ville
Alice, 32, Paris
Bob, 27, Lyon
```
````

Tableau dense à partir d'un séparateur virgule (`csv`) ou tabulation
(`tsv`). Voir *Tableaux de données (CSV / TSV)*.

### `demo` — source markdown + rendu

````markdown
```demo
**Gras**, *italique*, [un lien](https://example.com).
```
````

Side-by-side source + rendu, utile pour les slides pédagogiques.
Voir *Démos pédagogiques*.

### `diff` — texte diff colorisé

````markdown
```diff
@@ exemple ligne 12 @@
 function hello(name) {
-  console.log('Bonjour ' + name);
+  console.log(`Bonjour ${name}`);
 }
```
````

Coloration vert / rouge des `+` / `-`. Voir *Diffs*.

### `ebnf` — grammaires en rails

````markdown
```ebnf
nombre = chiffre, { chiffre };
chiffre = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
```
````

Productions EBNF rendues en railroad diagrams (un SVG par
production). Voir *Grammaires EBNF*.

### `header` / `footer` — en-tête et pied de page

````markdown
```header
{title} |  | {page}
```
````

3 slots `gauche | centre | droite`. Variables `{page}`, `{pages}`,
`{title}`, `{date}`. Emphase inline `**gras**` / `*italique*`.
Remplace la bande correspondante du style. Voir
*En-tête et pied de page*.

### `inference` — règles d'inférence

````markdown
```inference
\Gamma \vdash e_1 : \tau_1 \to \tau_2
\Gamma \vdash e_2 : \tau_1
---
\Gamma \vdash e_1\,e_2 : \tau_2
```
````

Une barre horizontale (3+ tirets) sépare les prémisses (au-dessus)
de la conclusion (en dessous). Rendu en LaTeX `\dfrac{…}{…}`. Voir
*Règles d'inférence*.

### `math` — bloc mathématique

````markdown
```math
\int_0^\infty e^{-x^2} \, dx = \frac{\sqrt{\pi}}{2}
```
````

Équivalent de `$$…$$`. Accepte `\label{eq:…}` pour la référence
croisée. Voir *Formules mathématiques*.

### `mermaid` — diagrammes Mermaid

````markdown
```mermaid
graph LR
  A[Idée] --> B[Brouillon]
  B --> C[Document final]
```
````

Diagrammes de séquence, flowcharts, gantt, classes, état, etc. Voir
*Diagrammes Mermaid*.

### `sender` / `recipient` / `signature` — courriers

````markdown
```sender
**Marie Dupont**
12 rue de la Paix
75002 Paris
```

```recipient
Jean Martin
Société Acme
8 boulevard Voltaire
75011 Paris
```

```signature
**Marie Dupont**
*Directrice associée*
```
````

`sender` reste à gauche (flex), `recipient` se positionne en fenêtre
DL (ajoutez `flow` pour le mettre en flex à droite), `signature`
s'aligne à droite en fin de doc. Voir *Lettres et correspondance*.

### `tree` — arbre Unicode ou SVG

````markdown
```tree
src/
  preview.ts
  ui/
    settings-form.ts
```
````

Outline indentée → arbre Unicode (`├──`, `└──`). Ajoutez `svg` après
`tree` pour un diagramme SVG top-down. Voir *Arbres (Unicode ou
SVG)*.

---

## Galerie de blocs (rendus) \label{sec:gallery}

Là où l'aide-mémoire ci-dessus montre la **syntaxe**, cette galerie
**rend** chaque type de bloc en direct. C'est un aperçu visuel pratique
— et un test : si un bloc s'affiche de travers ici, c'est le signe d'une
régression du rendu.

### Équation

```math
e^{i\pi} + 1 = 0
```

### Règle d'inférence

```inference (MP)
\Gamma \vdash f : A \to B; \Gamma \vdash x : A
---
\Gamma \vdash f\,x : B
```

### Diagramme commutatif

```category
f : A -> B
g : B -> C
h : A -> C = g . f
```

### Circuit Faust (bda)

```bda "Accumulateur"
1 : +~_
```

### Graphique en courbe

```chart line "Latence par buffer" y-min=0
buffer, ms
64, 1.3
128, 2.7
256, 5.3
512, 10.7
```

### Histogramme

```chart bar "Comparaison de codecs"
codec, ms
opus, 21
aac, 35
mp3, 29
```

### Table CSV

```csv
Note, Fréquence (Hz), MIDI
A4, 440.00, 69
B4, 493.88, 71
```

### Type de données algébrique

```adt
Expr ::= Const(c)            (* c ∈ ℝ *)
       | Vec(v)
       | Op(o, Expr, Expr)
```

### Grammaire (railroad)

```ebnf
chiffre = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
```

### Arbre Unicode

```tree
projet
  src
    main.ts
  tests
    corpus
```

### Arbre SVG

```tree svg
Expr
  Op
    Add
    Sub
```

### Diff

```diff
 contexte inchangé
-ancienne ligne
+nouvelle ligne
```

### Diagramme Mermaid

```mermaid
flowchart LR
  A[Entrée] --> B{Choix}
  B -->|oui| C[Suite]
  B -->|non| D[Fin]
```

### Encadré

::: tip [Astuce]
Les encadrés mettent en valeur une remarque sans interrompre le fil.
:::

---

## Crédits

markpage est un projet open source assemblé à partir de logiciels libres.
Merci à toutes les personnes qui maintiennent ces projets :

- **Édition et rendu** :
  [CodeMirror](https://codemirror.net/) pour l'éditeur,
  [marked](https://marked.js.org/) pour le parser Markdown,
  [Vivliostyle](https://vivliostyle.org/) pour la mise en page paginée
  (l'aperçu et le PDF passent par le moteur d'impression du
  navigateur sur ce même rendu).
- **Diagrammes et formules** :
  [Mermaid](https://mermaid.js.org/) pour les flowcharts et
  diagrammes de séquence,
  [MathJax](https://www.mathjax.org/) pour les formules LaTeX,
  [ebnf2railroad](https://github.com/matthijsgroen/ebnf2railroad) et
  [railroad-diagrams](https://github.com/tabatkins/railroad-diagrams)
  pour les diagrammes syntaxiques EBNF.
- **Coloration syntaxique** :
  [highlight.js](https://highlightjs.org/) pour les blocs de code.
- **Imports** :
  [Mammoth.js](https://github.com/mwilliamson/mammoth.js) pour
  l'import Word (`.docx`),
  [Turndown](https://github.com/mixmark-io/turndown) pour la conversion
  HTML → Markdown.
- **Polices** :
  [Roboto Condensed](https://fonts.google.com/specimen/Roboto+Condensed) et
  [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono)
  (Christian Robertson, Google),
  [Noto Sans Math](https://fonts.google.com/noto/specimen/Noto+Sans+Math) et
  [Noto Sans Symbols](https://fonts.google.com/noto/specimen/Noto+Sans+Symbols)
  (Google) pour les caractères mathématiques et les symboles.
- **Outils de build** :
  [Vite](https://vitejs.dev/) et [TypeScript](https://www.typescriptlang.org/).

Le code source de markpage est sur
[GitHub](https://github.com/orlarey/markpage).

---

C'est tout. Vous pouvez maintenant :

- Effacer ce contenu et commencer à rédiger votre propre document
- L'enregistrer pour le retrouver plus tard
- Cliquer sur **Aide** à tout moment pour revoir ce tutoriel

Bonne écriture.
