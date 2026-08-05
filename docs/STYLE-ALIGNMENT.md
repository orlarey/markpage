---
title: Alignement éditeur de style ⇄ markpage — source, compilateur, artefact
author: Yann Orlarey
version: 0.1 (brouillon)
date: 2026-08-04
---

> **Statut :** document de travail, décisions **arrêtées** mais **non implémentées**.
> Compagnon de [STYLE-EDITOR-SPEC](STYLE-EDITOR-SPEC.md) (l'éditeur), de
> [STYLE-SPEC](STYLE-SPEC.md) / [SETTINGS-SPEC](SETTINGS-SPEC.md) (le modèle plat)
> et de [FRONTMATTER-SPEC](FRONTMATTER-SPEC.md) (la sérialisation). S'appuie sur un
> audit du code (trois inventaires : modèle configurable, constantes figées,
> sérialisation).

**Objet :** réconcilier deux idées qui s'opposent en apparence — markpage rend un
style **plat, tout résolu, sans interprétation** ; l'éditeur repose sur des **règles
génératrices**. La réconciliation tient en une phrase :

> l'éditeur a son **propre format source** (génératif) **+ un compilateur** vers le
> **format plat** de markpage. La compilation est **à sens unique**.

::: toc+
- **Le principe** — source → compilateur → artefact, à sens unique.
- **La trichotomie** — document / style / appli, étanche.
- **Les deux formats** — source génératif vs cible plate.
- **La table de compilation** — paquet A (0 changement) vs paquet B (champ plat neuf).
- **Champs plats à ajouter à markpage** — le paquet B, exhaustif.
- **Extension de l'éditeur** — blocs, slides, roster complet.
- **Séquence** — du moins cher au plus lourd.
- **Invariants** — le contrat.
:::

---

## Le principe

::: important [Source → compilateur → artefact]
- **Source (éditeur)** — génératif, ré-éditable, porte l'**intention** (teinte
  maîtresse + angle, base × ratio, canon, règles + exceptions). C'est *son* format,
  on est libres.
- **Compilateur (éditeur)** — résout toutes les règles en **valeurs finales**.
- **Artefact (markpage)** — **plat**, tout résolu ; se distribue et se rend
  **sans l'éditeur**.
:::

La compilation est **lossy à l'envers** : un `#hex` ne « sait » plus qu'il venait de
*famille B, cran s3v2* ; un `27pt` ne sait plus qu'il venait de *base × ratio⁴*.

::: warning [Conséquences directes]
1. L'éditeur **persiste sa propre source** pour rester ré-éditable ; l'artefact
   compilé est la **sortie**, pas le master.
2. On **ne rouvre pas** un style compilé comme éditable (import-pour-rendre
   seulement).
3. markpage ne gagne **jamais** de moteur de règles. Il gagne, au plus, des
   **champs plats** supplémentaires (des *valeurs*).
:::

Ce n'est pas un nouveau paradigme : markpage le fait **déjà** pour la géométrie
(objet *authoring* → `bakePageGeometry` → `PageGeometry` terminal) et l'Atelier
amorce un mini-compile (`color-hue`/`color-crans` → `applyStyleVocabulary` → matrice
plate). On **généralise** ce patron à tout le style.

**Bénéfice distribution** : un designer diffuse le style **compilé** (portable,
rendu partout) sans livrer la **source** ré-éditable. *Ship the artifact, keep the
source.*

---

## La trichotomie

Décision **radicale** : markpage **n'édite plus aucun style**. Il garde l'éditeur de
contenu, une **bibliothèque de styles** et ses préférences d'appli. Trois foyers
**étanches**.

| Foyer | Contenu | Qui l'édite |
| :-- | :-- | :-- |
| **Document** (front-matter, **7 clés**) | `title` · `author` · `organization` · `date` · `mathjax-preamble` · `document-style` · `language` (seul override) | panneau « propriétés du document » |
| **Style** (compilé, **autonome**) | **tout le reste** (voir ci-dessous) | l'**éditeur de style** (externe) |
| **Appli** | bibliothèque de styles (lister · charger un compilé · exporter · supprimer · activer) + préférences d'appli | Réglages markpage |

::: important [Le document n'override rien]
Le front-matter ne porte **aucun** réglage d'apparence — ni `page-size`, ni
`margins`, ni fontes, ni couleurs, ni `slides`. Un document = **contenu + identité +
un nom de style**. Portable à 100 % : donne-lui n'importe quel style, il se rend.
Compromis assumé : un réglage ponctuel impose de **forker un style** (forker est bon
marché).
:::

Le **style** contient donc : format/taille de page, **mode de mise en page**
(paginé / **slides 16:9**), géométrie/canon/marges/miroir, sauts de chapitre,
position des notes, fontes (**+ `@font-face` embarqués**), couleurs, la **matrice
`styles.*` complète** (texte **et blocs**), l'**appareil** (en-tête/pied),
la **numérotation**, les maths, les garde-fous Mermaid, la **langue/locale**, plus
les **axes neufs** (capitales, filet, tracking, coverScale, 2ᵉ teinte).

::: note [Deux cas tranchés]
- **`slides` disparaît** comme drapeau : les slides deviennent un **style** (format
  16:9 + gabarit slide). Pour faire des slides on **choisit le style**.
- **`language` quitte le style** *(révisé)* : c'est du **contenu**, pas de l'apparence
  (le même style sert un texte fr ou en). Elle rejoint donc les métadonnées de
  document et devient la **7ᵉ clé de front-matter — la seule qui override** le style
  résolu (`applyLanguageOverride`). Retirée de `FUNDAMENTAL_STYLE_KEYS`.
:::

**Conséquence markpage** : le parseur de front-matter tient en **7 clés** (identité +
`document-style` + `language`) ; on retire
tout le traitement `page-size`/`margins`/`font-*`/`color-*`/`slides`/`page-numbers`
**et** la couche « vocabulaire Atelier en front-matter »
(`color-hue`/`color-crans`/`font-pair`/`font-base`/`math-scale`). Le style n'est plus
décrit dans le `.md` — juste **référencé par son nom**.

---

## Les deux formats

```adt
FormatSource ::= le format PROPRE de l'éditeur     (* génératif, ré-éditable *)
               | fichier : <slug>.mpstyle-src.json
               | marqueur "markpage-style-src":1, meta, state (l'état S entier)
               | porte : teinte+angle, crans A/B, base+ratio+steps,
               |         align·rule·caps·tracking, coverScale, numérotation,
               |         canon+marges libres, appareil (règles), layoutMode

FormatCible  ::= le .mpstyle.json PLAT de markpage  (* résolu, distribuable *)
               | fichier : <slug>.mpstyle.json
               | marqueur "markpage-style-file":1, name, key, [meta], style
               | FUNDAMENTAL_STYLE_KEYS + champs neufs du paquet B
               | tout en hex / pt / mm / enum / booléen — AUCUNE règle
```

Le **format source** est libre (c'est l'éditeur qui l'écrit et le relit) : il
sérialise l'**état génératif entier** ; *Ouvrir…* le **réhydrate** pour reprendre
l'édition. Le **format cible** est l'actuel `FUNDAMENTAL_STYLE` (fichier
`.mpstyle.json`, référence `document-style:`, bibliothèque) — le conteneur le
**plus riche et vivant** de markpage — **étendu** des champs plats du paquet B.

### Identité du style et distribution

Un style destiné à **circuler** porte une **identité** : `name`, `author`,
`version`, `date`. Ces clés décrivent le style, **pas** son rendu — elles ne sont
donc **pas** dans `FUNDAMENTAL_STYLE` (rien à peindre), mais dans le **conteneur**
de chaque fichier.

- **Nom de fichier lisible** — dérivé du nom via un `slug` (accents dépliés) :
  « Rapport Élégant A4 » → `rapport-elegant-a4.mpstyle.json`. Plus de code opaque.
- **Attribution qui voyage** — `author`/`version`/`date` sont émis au **niveau
  haut** du conteneur compilé (là où l'éditeur les écrit) ; markpage les **relit**
  (`NamedStyle.meta`), les **conserve** en bibliothèque, et les **ré-émet** à
  l'export — de sorte que l'attribution survit **même quand seul le compilé
  circule**. Le format source reste le chemin de préservation intégrale ; le
  compilé n'en préserve que l'identité.

::: note [Où vit quoi]
Le rendu est **plat** dans `style` (FUNDAMENTAL_STYLE). L'**identité** est dans le
conteneur (`name`/`key`/`meta`). L'**état génératif** ré-éditable n'existe que dans
le **fichier source**, jamais dans le compilé.
:::

---

## Le round-trip — contrat de bijection

Le fichier compilé est le **pivot**. On veut une **bijection** entre le style que
le fichier décrit et le style interne dont markpage se sert pour rendre. Deux
round-trips, tous deux **idempotents** :

RT-markpage — *point fixe*
:   `parse → applyFundamentalStyle → serializeFundamentalStyle → serializeStyleFile`
    **redonne le fichier d'entrée**. Importer un style puis le ré-exporter donne un
    fichier **identique** (au sens byte).

RT-éditeur — *isomorphisme*
:   `compileStyle()` produit un fichier **isomorphe** à ce que markpage consomme —
    **aucun champ omis ni figé** : chaque clé et chaque élément est **dérivé** de
    l'état modélisé de l'éditeur.

### La forme canonique

::: important [Un fichier canonique est complet]
Un style compilé **canonique** est celui dont l'objet `style` :

- **C1** — porte exactement les clés de `FUNDAMENTAL_STYLE_KEYS` que le style
  *définit* (ni plus, ni moins) ;
- **C2** — porte une **matrice `styles` complète** : les **18** `ELEMENT_KEYS`, chacun
  un `Style` résolu ;
- **C3** — n'a que des **valeurs terminales** (hex / pt / mm / enum / booléen), zéro
  règle ;
- **C4** — clés en ordre `FUNDAMENTAL_STYLE_KEYS`, éléments en ordre `ELEMENT_KEYS`
  (byte-identité, pas seulement égalité structurelle).
:::

### Pourquoi ça suffit

`serializeFundamentalStyle` **n'émet que les clés définies** ; `applyFundamentalStyle`
**pose les présentes, efface les absentes**. Ces deux-là sont donc **déjà bijectifs
pour toute clé** — présence↔présence, absence↔absence. **Une seule** clé fait
exception : `styles`, dont l'import **complète** les éléments absents par des défauts
(absent→présent). D'où :

> Un fichier **canonique** (matrice complète) est un **point fixe** de
> `apply∘serialize` — le seul mécanisme non-idempotent (la complétion de la matrice)
> ne s'y déclenche pas. markpage **normalise** tout fichier **partiel** vers le
> canonique **au premier import**, et le canonique est stable ensuite.

### Conditions du « pleinement satisfaisant »

1. **L'éditeur émet du canonique** — les 18 éléments (dont `inline-link`, `mermaid`,
   `table`, dérivés par règle de la palette/échelle), en ordre canonique. *(fait —
   `compileStyle`.)*
2. **markpage est un point fixe sur le canonique** — vérifié : `serialize == apply∘
   serialize`, byte à byte (`tests/style-roundtrip.test.ts`).
3. **Aucune clé n'apparaît/disparaît au rendu** — le snapshot ré-exporté ne gagne
   aucune clé *bakée* que le fichier importé n'avait pas. **Résolu** : le seul risque
   était `pageGeometry` (le rendu la bake depuis l'`authoring` retenu, cf. l'enquête
   sur le chemin d'export) ; l'éditeur **émet désormais une `pageGeometry` résolue**,
   donc `applyFundamentalStyle` **abandonne l'`authoring`** et `withBakedGeometry`
   devient un no-op — pas de fuite. Vérifié bout-en-bout sur les **modules réels** :
   `parse → apply → withBakedGeometry → serialize` du fichier de l'éditeur redonne un
   `style` **byte-à-byte identique** (0 clé ajoutée/retirée).
4. **Rien de figé côté éditeur** — chaque champ qui est un *vrai choix* est piloté
   par l'état modélisé : `pageGeometry` (instrument géométrie). `language` n'est plus
   dans le style (override document). Ne reste qu'une constante, **honnête** :
   `customFonts: []` — ce style n'embarque aucune fonte (familles système
   uniquement) ; ce sera un vrai réglage le jour où l'embarquement de fontes existera.

   ::: note [`mermaidMax*` retirés du modèle]
   Les trois plafonds `mermaidMaxScale/WidthPct/HeightPct` étaient **vestigiaux** :
   présents dans le modèle et l'ancien formulaire, mais **jamais lus au rendu** (la
   taille des diagrammes est codée en dur — `max-width: 100%` de la colonne,
   `max-height` = hauteur de texte de la page). Les exposer aurait créé des **boutons
   fantômes**. Ils ont donc été **supprimés** de `PdfSettings`,
   `FUNDAMENTAL_STYLE_KEYS`, des défauts et des styles fournis, plutôt que déguisés en
   réglages. Un vrai réglage « figures » (dont le débordement en marge d'un diagramme,
   colonne étroite oblige) reste une **feature à part** : il faudra d'abord **câbler**
   le rendu, pas seulement ajouter un curseur.
   :::

## La table de compilation

Deux paquets, selon que l'axe se résout dans un **slot plat existant** ou exige un
**champ plat neuf** + du rendu.

**Paquet A — compile dans l'existant, 0 changement markpage :**

| Axe éditeur | Compile vers (plat existant) |
| :-- | :-- |
| teinte A **+ famille B (angle)** + crans A/B | `styles.*.color` / `pageBackground` / `coverBackground` — **hex résolus** |
| base × ratio + steps + surcharges | `styles.*.fontSize` (**pt**) |
| graisses · alignement · justification | `styles.*.weight` / `.align` |
| interligne (global éditeur → par élément) | `styles.*.lineHeight` |
| jeu + échelle maths | `mathFontSet` / `mathScale` |
| paires / familles | `fonts.*` (+ `customFonts` embarqués) |
| format/taille de page · canon/marges libres | `pageSize` / `pageGeometry` (terminal baké) |
| recto-verso · sauts de chapitre · notes | `duplex` / `chapterBreak` / `notes.position` |
| styling de blocs (fonds, bordures, padding, italique, souligné, marges, retrait 1ʳᵉ ligne) | `styles.<bloc>.{background,border*,padding,italic,underline,margin*,firstLineIndent}` |
| **`coverScale` / `coverAlign`** | `title`/`metadata` sont **cover-only** → zoom **baké** dans `styles.title.fontSize` / `styles.metadata.fontSize` ; align → `styles.{title,metadata}.align`. **0 champ markpage.** |

**Paquet B — exige un champ plat neuf + rendu :** voir section suivante.

---

## Champs plats à ajouter à markpage (paquet B)

Uniquement des **valeurs résolues**, jamais des règles. C'est le travail
d'implémentation côté markpage.

| Champ plat neuf | Porté par | Rendu à ajouter |
| :-- | :-- | :-- |
| `styles.*.smallCaps` : `none \| small \| all` | chaque élément texte | `font-variant: small-caps` / `text-transform: uppercase` |
| `styles.*.rule` : `{ position: none\|below\|above, color, width }` | titres · running-content | filet horizontal (remplace/élargit l'`underline` figé `#d0d7de` 1px) |
| `styles.*.letterSpacing` : em | éléments à capitales | `letter-spacing` |
| **numérotation** : directive résolue `{ on, depth, chapterFormat, … }` + couleurs/tailles **déjà résolues** par élément | global + `n° chap` | `counter()` sur h1–hN + **strip** des numéros tapés + ricochets **TOC / `\ref`** |
| **appareil** : modèle résolu en-tête/pied **verso/recto explicite** + piles | remplace les chaînes à 3 slots | rendu des margin-boxes depuis le modèle (tokens `section`/`chapter`/`author`/**folio romain**/`text`) |
| `layoutMode` : `paged \| slides` (+ params slide) | global | bascule le moteur slides (déjà présent) depuis le **style** au lieu de `slides:` |

::: caution [Le plus gros : numérotation et appareil]
- **Numérotation** n'est pas cosmétique : c'est un **système** (compteur + strip +
  TOC + `\ref`). markpage n'a aujourd'hui qu'un « renuméroter par l'exemple » qui
  **réécrit le source**.
- **Appareil** : le modèle actuel (chaînes `left|center|right`, auto-swap en duplex)
  ne sait pas exprimer un **contenu verso≠recto explicite** ni des **piles**. Champ
  plat plus riche à concevoir.
:::

**À libérer (figé en dur, indépendamment) :** ~~filet de titre `#d0d7de`/1px/solid~~
**fait** (`Style.rule`), encre de couverture auto (`:853`), mots de légende +
`{date}` verrouillés FR (`captions.ts:25`, `page-running.ts:591` → piloter par
`language`).

::: note [Manque réel côté couverture : le sous-titre]
`coverScale`/`coverAlign` ne demandent rien à markpage (paquet A). Mais l'éditeur
affiche un **sous-titre de couverture** que markpage **ne rend pas** (pas d'élément
`subtitle` sur la couverture ; le `subtitle:` front-matter n'est pas parsé). C'est un
manque **document/front-matter** (le *texte* du sous-titre n'a pas de foyer dans les
clés reconnues) **et** style (l'élément `subtitle`). À trancher avec l'étape
*front-matter minimal* — distinct de `coverScale`.
:::

---

## Les styles par défaut — origine unique (O1)

Les built-ins de markpage ne sont plus maintenus à la main : ils sont **générés
depuis des sources d'éditeur**, seule origine. C'est le principe *source →
compilateur → artefact*, appliqué au catalogue lui-même.

```adt
archétype (spec compacte)  ──▶  archetypes/<nom>.mpstyle-src.json   (* galerie éditeur *)
                           └─▶  src/assets/builtin-styles.json      (* compilé, par format *)
```

**Variante B′ (intérimaire).** Le build **pilote le `compileStyle` du prototype**
en Chromium headless (`scripts/build-builtin-styles.mjs`, `npm run build:styles`) :
le prototype **est** le compilateur, donc **zéro dérive** entre ce qu'un designer
produit et ce que markpage livre. Pas d'extraction de module (**B**) tant que
l'éditeur reste une maquette — on la fera à la productisation.

**Un axe format, pas un produit cartésien.** Une source est *agnostique au format* ;
le build **re-bake le canon pour chaque taille cible**. Une source → A4 **et** Letter,
sans duplication. La **langue** ne multiplie rien (override document). Suffixe format
**systématique**.

| Archétype | Formats | Couv. | R°/V° | Chapitres | Appareil |
| --- | --- | --- | --- | --- | --- |
| **note** *(défaut)* | A4, Letter | — | — | — | folio en pied |
| **lettre** | A4, Letter | — | — | — | vierge |
| **rapport** | A4, Letter | ✓ | ✓ | — | savant (folio + titres) |
| **livre** | A4, Letter | ✓ | ✓ | nouveau recto | savant |
| **présentation** | 16:9 | ✓ | — | — | vierge |

→ **9 built-ins** (`note-a4`, `rapport-letter`, `presentation-16x9`, …), canoniques
(matrice 18/18 + `pageGeometry` par format), chacun avec un `meta`
(`author: markpage`, `version`). `DEFAULT_STYLE_KEY = note-a4`. Les **mêmes sources**
alimentent la **galerie de départ** de l'éditeur (« Nouveau depuis… »).

---

## Extension de l'éditeur

Puisque **tout** le style migre dans l'éditeur (décision B) :

- **Facette « Blocs »** (nouvelle) — couvre les `ElementKey` de bloc que l'éditeur
  ne touche pas encore : `code-block`, `quote`, `callout`, `table`, `math-block`,
  `mermaid`, `inline-link` — avec fonds, bordures (4 côtés + épaisseur + rayon),
  padding, italique/souligné, marges, retrait de 1ʳᵉ ligne.
- **Mode de mise en page** — la facette Pages gagne `layoutMode` : `paginé` /
  `slides 16:9`, avec en mode slides ses réglages (marges clampées, plafond de
  figure, `##` = nouvelle slide). Compile en directive plate.
- **Roster complet** — l'éditeur adopte l'ensemble des `ElementKey` de markpage.

---

## Séquence

Du moins cher au plus lourd (✅ = fait) :

1. ✅ **Libérer le filet** — `Style.rule` (position/couleur/épaisseur/style),
   émetteur partagé `filetCss`, repli legacy `underline`.
2. ✅ **`smallCaps` + `letterSpacing`** — `Style.smallCaps`/`.letterSpacing`,
   émetteur partagé `capsCss` (inline + heading + running-content).
3. ✅ **`coverScale` / `coverAlign`** — **paquet A, 0 changement markpage** :
   `title`/`metadata` étant cover-only, le zoom se bake dans leurs `fontSize` et
   l'align va sur `.align`. Travail **côté éditeur** (compilateur).
4. ✅ **Numérotation** — champ plat `numbering`, passe `numberForRender` sur une
   copie dans `renderPreview` (strip-toujours, H1≠titre) ; `\ref` hérite du numéro
   dans le texte ; **TOC** préfixé (`linkTocPlus`) ; **grand numéral de chapitre**
   (`markChapterNumerals` + `.chapter-num`). Reste : câbler le compilateur éditeur
   qui *pose* `numbering` (dormant tant qu'aucun style ne le porte).
5. **Deux familles de teinte** — note : compile en **hex**, donc **0 changement
   markpage** ; l'effort est **côté éditeur** (source + compilateur).
6. **Appareil** — nouveau modèle résolu en-tête/pied.
7. **Front-matter minimal** + retrait des overrides et du vocabulaire en
   front-matter ; slides → style (`layoutMode`).
8. **Facette Blocs** dans l'éditeur.

---

## Invariants

A1 — **markpage rend du plat, tout résolu, sans interprétation.** Aucun moteur de
règles au rendu ; jamais.

A2 — **Compilation à sens unique.** L'éditeur garde sa source ; le compilé ne se
rouvre pas comme éditable.

A3 — **Trois foyers étanches.** Document (7 clés, dont `language` en seul override) / Style (compilé autonome) / Appli
(bibliothèque + prefs). Le document n'override rien.

A4 — **markpage ne gagne que des champs plats** (des valeurs), jamais des règles ni
une UI d'édition de style.

A5 — **Le style est autonome et distribuable** — il embarque tout ce dont son rendu
dépend (y compris `@font-face` et `layoutMode`).

A6 — **Identité ≠ rendu.** `name`/`author`/`version`/`date` vivent dans le
**conteneur** du fichier, jamais dans `FUNDAMENTAL_STYLE`. Le nom de fichier dérive
du nom (slug) ; l'attribution est relue, conservée et ré-émise par markpage, donc
elle **voyage avec le compilé**. La ré-édition intégrale, elle, n'existe que dans le
**format source**.
