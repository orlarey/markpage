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
| **Document** (front-matter, **6 clés**) | `title` · `author` · `organization` · `date` · `mathjax-preamble` · `document-style` | panneau « propriétés du document » |
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
- **`language`** tombe dans le **style** (markpage la modélise déjà en
  `FUNDAMENTAL_STYLE_KEYS`) — sémantiquement limite (la langue est du contenu), mais
  cohérent avec un front-matter qui la sort du document.
:::

**Conséquence markpage** : le parseur de front-matter tombe à **6 clés** ; on retire
tout le traitement `page-size`/`margins`/`font-*`/`color-*`/`slides`/`page-numbers`
**et** la couche « vocabulaire Atelier en front-matter »
(`color-hue`/`color-crans`/`font-pair`/`font-base`/`math-scale`). Le style n'est plus
décrit dans le `.md` — juste **référencé par son nom**.

---

## Les deux formats

```adt
FormatSource ::= le format PROPRE de l'éditeur     (* génératif, ré-éditable *)
               | porte : teinte+angle, crans A/B, base+ratio+steps,
               |         align·rule·caps·tracking, coverScale, numérotation,
               |         canon+marges libres, appareil (règles), layoutMode

FormatCible  ::= le .mpstyle.json PLAT de markpage  (* résolu, distribuable *)
               | FUNDAMENTAL_STYLE_KEYS + champs neufs du paquet B
               | tout en hex / pt / mm / enum / booléen — AUCUNE règle
```

Le **format source** est libre (c'est l'éditeur qui l'écrit et le relit). Le
**format cible** est l'actuel `FUNDAMENTAL_STYLE` (fichier `.mpstyle.json`, référence
`document-style:`, bibliothèque) — le conteneur le **plus riche et vivant** de
markpage — **étendu** des champs plats du paquet B.

---

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
| `coverScale` / `coverAlign` | couverture | zoom uniforme du bloc de couverture |
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

**À libérer (figé en dur, indépendamment) :** filet de titre `#d0d7de`/1px/solid
(`preview-paginated.ts:41`), encre de couverture auto (`:853`), mots de légende +
`{date}` verrouillés FR (`captions.ts:25`, `page-running.ts:591` → piloter par
`language`).

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

Du moins cher au plus lourd :

1. **Libérer le filet** (couleur/épaisseur/style) — petit, débloque le rendu du
   filet éditeur.
2. Ajouter à `Style` : `smallCaps`, `rule`, `letterSpacing` (+ rendu + clés
   pointées).
3. `coverScale` / `coverAlign`.
4. **Numérotation** (compteurs + strip + ricochets TOC/`\ref`).
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

A3 — **Trois foyers étanches.** Document (6 clés) / Style (compilé autonome) / Appli
(bibliothèque + prefs). Le document n'override rien.

A4 — **markpage ne gagne que des champs plats** (des valeurs), jamais des règles ni
une UI d'édition de style.

A5 — **Le style est autonome et distribuable** — il embarque tout ce dont son rendu
dépend (y compris `@font-face` et `layoutMode`).
