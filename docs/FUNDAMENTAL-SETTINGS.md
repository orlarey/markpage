# Réglages fondamentaux

> État : **brouillon de travail** — à amender avant tout code.
> Diagramme de la géométrie : voir l'artefact *Géométrie fondamentale de la page*
> (`scratchpad/geometrie-fondamentale.html`).

## Le principe

On sépare **deux mondes** que le modèle actuel (`PdfSettings`) mélange :

- **Réglages fondamentaux** — les valeurs **terminales**, *non-interprétables*, que le
  rendu consomme **telles quelles** (aperçu paginé *et* continu). « Presque du CSS » :
  une taille en `pt`, une couleur en `#hex`, une famille, des marges résolues en `mm`.
  Le moteur ne fait que les écrire (avec au plus un suffixe d'unité).
- **Production** — tout ce qui **calcule/interprète** pour aboutir aux fondamentaux :
  les recettes (`document-type`), le vocabulaire de l'atelier, et **le canon**.

Règle de tri : si le rendu doit **calculer** ou **choisir** une valeur qui pourrait être
différente, ce n'est pas fondamental. Un suffixe d'unité (`pt`/`mm`/`em`), un
`bool → mot-clé CSS`, ou l'assemblage d'une pile de repli `font-family` **ne sont pas**
de l'interprétation → ça reste au rendu.

L'audit des deux rendus (`pagedCss` paginé, `applyPreviewStyles` continu) montre que le
modèle est **déjà ~95 % fondamental**. La seule vraie fuite architecturale est **le
canon** (voir plus bas).

---

## Cible d'architecture

À terme, **markpage ne connaît QUE les réglages fondamentaux**. Il *rend*, point — plus de
recette, plus de canon, plus de vocabulaire, plus de menu Réglages *à l'intérieur*. Toute
l'interprétation vit dans des **producteurs externes** qui *fabriquent* un style fondamental.

```text
OUTILS EXTERNES (producteurs)            MARKPAGE (consommateur)
─────────────────────────────           ───────────────────────
atelier · matrice couleurs      ──▶      style fondamental
galerie templates · paires      style    (text.*, running.*, styles,
recettes (document-type)        file       fonts, notes, cover, …)
canon (measureChars → text.*)                     │
vocabulaire                                       ▼
                                          RENDU — écrit du CSS verbatim,
                                          aucune interprétation
```

Le **document** = contenu markdown + un style fondamental (embarqué via le bloc
`markpage-style`, ou référencé). Le menu Réglages **disparaît** : on *charge / applique* un
style produit ailleurs. Le format d'export/import du style fondamental (§ ci-dessous et
`src/fundamental-style.ts`) **est** le contrat entre producteurs et cœur.

### Chemin de migration (incrémental, chaque phase livrable seule)

1. **Figer l'interface** — le style fondamental comme unique porteur de style (bloc
   `markpage-style`). *✅ amorcé (export/import) — à raffiner : lisibilité, autonomie.*
2. **Purifier la géométrie** — canon → producteur de `text.*` résolu ; sortir
   `measureChars` / `liveAreaChars` / `marginMode` du cœur. *✅ fait — `PageGeometry`
   terminal, `bakePageGeometry` producteur, objet `authoring` distinct (voir
   « Résolution 2d »).*
3. **Rendu 100 % fondamental** — retirer recette/vocabulaire/canon de `buildPreviewDom` /
   `deriveSettingsForDoc` ; le rendu lit le style résolu directement.
4. **Extraire les producteurs** — recette/vocabulaire/atelier/canon → couche « authoring »
   séparée (potentiellement un paquet/outil à part) qui **émet** un style fondamental.
5. **Supprimer le menu Réglages** — remplacé par « charger/appliquer un style » + producteurs.

---

## Inventaire des réglages fondamentaux

### 1. Géométrie de page (paginé) — *à résoudre*

Tous les nombres en **mm** que le CSS écrit littéralement (cf. diagramme).

#### a) Cadre de page

| Réglage | Rôle |
| --- | --- |
| `page.w`, `page.h` | feuille physique |
| `text.top`, `text.bottom` | marges haute / basse du bloc de texte |
| `text.inner`, `text.outer` | marges reliure / tranche du bloc (swap recto/verso) |

Plus deux bascules : `duplex` (bool — miroir + planche) et `chapterBreak`
(`none`/`next-page`/`next-recto` → `h1 { break-before: … }`).

Et une mesure d'**ouverture de chapitre** : `chapter.drop` (mm) — l'**enfoncement** du titre
sur la première page d'un chapitre. Le titre se pose à `text.top + chapter.drop`, le corps
suit ; `drop = 0` sur les pages courantes. N'existe pas aujourd'hui — à ajouter.

> **Déredondance.** Plus de `margin.*` ni `gutter.*` : le bloc de texte est posé
> **directement** (`text.*`) et chaque accessoire (fente, note) est ancré indépendamment
> (§1b, §1c). La « gouttière intérieure » n'hébergeait rien (artefact du canon à deux
> rectangles) ; la « gouttière extérieure » est remplacée par `sidenote.gap`/`.width`. Le
> CSS traduit tout ça en `@page { margin }` + paddings, mais ce sont des **sorties du
> producteur**, pas des fondamentaux. Le recto/verso est le swap mécanique
> `@page :left`/`:right` (inner↔outer), pas un réglage.

#### b) Ancres du contenu courant (en-tête / pied)

En-tête et pied partagent **un seul empan de colonnes** (décision n°6 → *partagé*) : 6
fentes, mais 4 nombres.

| Réglage | Rôle |
| --- | --- |
| `running.inner`, `running.outer` | empan des colonnes, **partagé** en-tête + pied (abscisses) |
| `header.top` | ordonnée des 3 fentes d'en-tête (depuis le haut de page) |
| `footer.bottom` | ordonnée des 3 fentes de pied (depuis le bas de page) |

La colonne **`center` est dérivée** (milieu de l'empan). Plus la **justification par fente**
(`start` / `center` / `end`) — comment le gabarit s'aligne à son ancre. Défaut `inner→start`,
`center→center`, `outer→end`, mais c'est un réglage (6 valeurs, `text-align`).

L'empan `running` est **indépendant de `text.*`** : il peut être plus large (le folio `outer`
tombe alors dans la marge, au-delà de `text.outer` — cas classique). Recto/verso reflète
inner↔outer. *Aujourd'hui* déduit des marges + du pavage des margin-boxes → à rendre explicite.

#### c) Placement des notes

- **Notes de bas de page** (`notes.position: foot`) : leur **bas est sur la ligne du bas
  du bloc de texte** (`page.h − text.bottom`) et elles **croissent vers le haut**, au-dessus
  de la bande de pied. Largeur = bloc de texte. Placement par le **flux** → *aucun mm en
  plus* ; seuls le style de l'élément `footnote` (§2) et un éventuel filet séparateur comptent.
- **Notes de côté** (`notes.position: side`) : **côté extérieur uniquement** (jamais
  reliure), alignées verticalement sur **la ligne de leur appel** (vertical = contenu, pas
  un réglage). Deux fondamentaux en mm :
  - `sidenote.gap` — du **bord extérieur du texte** au **bord intérieur de la note** ;
  - `sidenote.width` — largeur de la colonne de note.

  Donc `note.inner = text.outer + sidenote.gap`, `note.outer = note.inner + sidenote.width`.
  La note vit dans le **blanc au-delà de `text.outer`** (côté tranche). *Aujourd'hui* `gap`
  et `width` sont dérivés du canon → à rendre explicites. Verso : miroir.

#### d) Couverture / page de titre

Une page de titre a sa **propre mise en page** (elle n'utilise pas `text.*`). Mesures
fondamentales :

| Réglage | Rôle |
| --- | --- |
| `cover.margin` | cadre horizontal (symétrique — pas de reliure sur une page seule) |
| `cover.title.top` | ancre verticale du bloc titre (depuis le haut) |
| `cover.foot.bottom` | ancre verticale du bloc adresse (depuis le bas) |
| `cover.align` | `center` / `left` / `right` |

Le **style** des textes (éléments `title`, `metadata`, §2) et le **fond**
(`coverBackground`, §5) sont déjà fondamentaux. Contenu : titre, **sous-titre** (à ajouter),
`author`/`organization`/`date` (existent, avec `show`), *(optionnel)* logo/image + ancrage.
*Aujourd'hui* : un simple bloc centré.

### 2. Styles par élément (les deux aperçus)

Les **18 éléments** : `body, title, h1, h2, h3, h4, code-inline, inline-link, metadata,
code-block, quote, math-block, mermaid, callout, table, caption, footnote, running-content`.

Pour chacun, attributs **déjà terminaux** (écrits tels quels, suffixe d'unité seul) :
`family` · `fontSize` (pt) · `color` (#hex) · `weight` · `italic` · `underline` ·
`align` · `marginAbove`/`marginBelow` (em) · `firstLineIndent` (em) · `lineHeight` ·
`padding` (em) · `background` · `borderTop/Right/Bottom/Left` · `borderColor` ·
`borderWidth` (px) · `borderRadius` (px).

*Non-fuites tolérées au rendu :* `italic → font-style`, `underline → text-decoration /
border-bottom`, assemblage du raccourci `border`, `?? défaut`.

### 3. Polices globales

`fonts.{headings, body, code}` (familles) · `customFonts` (registre à charger) ·
`mathFontSet` (enum) · `mathScale` (multiplicateur → `em` sur les wrappers MathJax).

*Non-fuite :* la pile `font-family` (nom + repli de catégorie + Noto) est un détail de
rendu fixe ; le **nom** est le fondamental.

### 4. Contenu courant & notes (paginé)

Les **positions** des 6 fentes sont la géométrie (§1b). Ici, leur **contenu** :

- **6 gabarits** (un par fente `@top/@bottom × inner/center/outer`) : texte + tokens
  `{page}`/`{pages}`/`{title}`/`{date}` + emphase `**gras**`/`*ital*`. Les tokens se
  substituent forcément au rendu (le numéro de page n'existe qu'après pagination) — c'est
  un gabarit, pas de l'interprétation.
- Le **folio** = le gabarit d'une fente (souvent `footer.outer`), **produit par la
  recette** (`pagination → footer`).
- ⚠️ *Aujourd'hui* stocké en **deux chaînes** `header`/`footer` (`gauche | centre | droite`)
  que le rendu **parse** au `|`. Sortir le parsing → stocker les **6 gabarits résolus**
  (voir « À trancher » 5).
- `notes.position` (`foot`/`side`/`end`).

**Contenu courant par type de page.** Les positions sont partagées (§1b) ; ce qui varie,
c'est **quelles fentes sont actives** et **leur contenu**, selon le type de page :

| Type de page | en-tête | pied | folio | drop |
| --- | --- | --- | --- | --- |
| couverture / titre | ✗ | ✗ | ✗ | — |
| ouverture de chapitre | ✗ | ✗ | ✓ | `chapter.drop` |
| courante | ✓ | ✓ | ✓ | 0 |
| blanche (filler duplex) | ✗ | ✗ | ✗ | — |

*Aujourd'hui* seule la couverture est traitée (fentes vidées) ; l'ouverture de chapitre et
la page blanche restent à modéliser (→ un profil de fentes par type de page).

### 5. Fonds & langue (les deux aperçus)

`pageBackground`, `coverBackground` (#hex, déjà résolus) · `language` (`fr`/`en`).

### 6. Couverture / métadonnées (paginé)

`author`, `organization`, `date` (+ titre du doc). Petite substitution `Intl` pour la date.

### 7. Contraintes figures (les deux)

`mermaidMaxScale`, `mermaidMaxWidthPct`, `mermaidMaxHeightPct`.

**Applicabilité :** le continu n'utilise que 2, 3, 5, 7 + largeur de page ; 1, 4, 6 sont
paginé-seul.

---

## La seule fuite : le canon → géométrie

Aujourd'hui, dans `pagedCss` (`preview-paginated.ts`), quand `marginMode === 'derived'` :

1. `measureAverageCharWidth(body, size)` — mesure canvas de la largeur moyenne d'un caractère ;
2. `computeCanonicalMargins(w, h, measureChars, charW)` — rectangle Van de Graaf (bloc de texte) ;
3. idem avec `liveAreaChars` (zone vivante) ;
4. `centerCanonicalHorizontally`, swap recto/verso, `effMargins`, paddings, bandes des
   margin-boxes, custom-props… → **@page margins + body padding**.

**Cible :** une fonction pure de la couche production —

```text
resolveGeometry(page, bodyFont, measureChars, liveAreaChars, duplex)
  → { page:{w,h}, text:{top,bottom,inner,outer},
      running:{inner,outer}, header:{top}, footer:{bottom},
      sidenote:{gap,width} }
```

appelée **une fois** avant le rendu. Le moteur ne lit plus que le résultat.

**Effets de bord positifs** (aujourd'hui, ces chemins *rappellent* le canon — ils
liront la géométrie résolue) :

- `atomicPageGeometryPx` (mise à l'échelle des blocs atomiques trop grands) ;
- positionnement des **sidenotes** (`sidenote.gap`/`.width`, relatives à `text.outer`) ;
- `letterheadCss` (lettre) ;
- `img { max-height }`.

**Restent au rendu** (layout dépendant du **contenu**, pas des réglages — ils mesurent
les images/blocs réels ; ils consommeront la géométrie résolue) :

- zoom auto des démos de slides, `slidesFigureCss`, `slidesDemoBleedMm`, groupement de figures ;
- ajustement des blocs atomiques surdimensionnés.

### Résolution 2d (implémentée)

Le canon est **sorti du cœur** et devient un producteur pur dans la couche de
préparation :

```text
bakePageGeometry(authoring, pageMm, bodyFont, duplex) → PageGeometry
  authoring = { marginMode, margins, measureChars, liveAreaChars }   // objet distinct
  PageGeometry = { text{top,bottom,inner,outer}, running{inner,outer},
                   header{top}, footer{bottom}, sidenote{gap,width} } // fondamental, mm
```

- **derived** : deux rectangles Van de Graaf (canon), gouttières > 0.
- **manual** : `text = running = margins`, `header.top = margins.top`,
  `footer.bottom = margins.bottom`, gouttières = 0 → aucune bande, sidenotes masquées.

La géométrie est **toujours présente** (plus de `null`). Le producteur tourne à la
préparation ; `preview-paginated` ne lit QUE `pageGeometry` — il n'importe plus
`computeCanonicalMargins` / `measureAverageCharWidth`, et ne connaît plus
`marginMode` / `measureChars` / `liveAreaChars`. L'export du style fondamental
(`markpage-style`) porte `pageGeometry` résolu, jamais les inputs du canon.

---

## À trancher

1. ✅ **Résolu — gouttières supprimées** : le bloc de texte est posé directement (`text.*`),
   les gouttières `margin`/`gutter` disparaissent (§1a).
2. **`pageSize`** : on garde l'enum (lookup trivial → mm) ou on stocke `page.{w,h}` en mm ?
3. ✅ **Résolu (2d)** — les inputs de production géométriques (`measureChars`,
   `liveAreaChars`, `marginMode`, `margins` manuels) vivent dans un **objet authoring
   distinct**, persisté à côté du style fondamental (via la pile / le frontmatter),
   jamais dans l'objet fondamental ni dans son export. Le canon les lit → cuit la
   géométrie.
4. ✅ **Résolu (2d)** — un `PageGeometry` **terminal** rejoint les fondamentaux :
   `{ text{top,bottom,inner,outer}, running{inner,outer}, header{top}, footer{bottom},
   sidenote{gap,width} }` (dimensions de `text` dérivées de `pageSize`). L'ancien
   `Margins {top,right,bottom,left}` quitte le type fondamental (il devient un input
   authoring du producteur manuel). Le rendu ne lit QUE `pageGeometry` ; il déduit les
   bandes canoniques de la géométrie elle-même (bandes ⟺ `header.top < text.top` ;
   colonne de sidenotes ⟺ `gutter.outer > 0`), donc plus aucun signal `mode` au rendu.
5. **Stockage des fentes** : les **6 gabarits résolus** directement, ou les 2 chaînes
   `header`/`footer` parsées au `|` (statu quo) ?
6. ✅ **Résolu — colonnes partagées** : en-tête et pied partagent l'empan
   `running.{inner,outer}` (centre dérivé) → 2 abscisses au lieu de 6 (§1b).
7. **Largeur du blanc extérieur** (où logent les sidenotes) : `text.outer` étroit ou large
   (façon Tufte) ? C'est `text.outer` + `sidenote.gap`/`.width` qui le règlent maintenant.
