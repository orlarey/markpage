---
title: Spécification — l'atelier de style (couleur × format × polices)
author: Yann Orlarey
version: 0.1 (brouillon)
date: 2026-07-28
---

> **Statut :** **design exploratoire V1, non figé** — méthodo **pilotée par
> invariants** (I1–I7, §9), comme [STACK-SPEC](STACK-SPEC.md) /
> [VOLUMES-SPEC](VOLUMES-SPEC.md). **Compagnon** de
> [SETTINGS-SPEC](SETTINGS-SPEC.md) (qu'il remplace à terme côté UI),
> [STACK-SPEC](STACK-SPEC.md) (sérialisation) et [STYLE-SPEC](STYLE-SPEC.md).
> Rien n'est implémenté ; on **spécifie**. Cinq maquettes interactives
> accompagnent ce document (§ liens en fin). Implémentation partagée appli ↔
> extension VS Code via [`@orlarey/markpage-render`](../packages/markpage-render/).

**Objet :** remplacer le système de réglages actuel — jugé **trop complexe**, sa
double vue *Essentiel / Avancé* ne fonctionnant pas en termes d'UX — par un
**atelier de style** reposant sur **peu de primitives** et des **règles
algorithmiques**. Le résultat tient en une phrase :

> un **style** = une **carte de couleurs** × un choix de **galerie-formats** × un
> choix de **galerie-polices**.

::: toc+
- **Le problème** — pourquoi la double vision échoue, et le vrai axe de découpe.
- **Principe directeur** — deux surfaces, deux archétypes d'interaction.
- **Définition du style** — trois choix composables.
- **Axe couleur — la carte** — teinte, crans saturation × valeur, neutres, fonds.
- **Axe format — la galerie de documents** — gabarits, fixé vs ajustable.
- **Axe polices — la galerie de paires** — paires curées, taille de base.
- **L'atelier** — sélection partagée, aperçu unifié, nommage du style.
- **Sérialisation** — branchement sur la pile de documents.
- **Invariants** — I1–I7, le contrat.
- **À trancher / hors V1** — paramètres ouverts.
:::

---

## Le problème

Le système actuel fait ~3 700 lignes sur trois fichiers et empile **trois
modèles mentaux** pour la même chose :

| Couche | Nature | Coût cognitif |
| :-- | :-- | :-- |
| **Essentiel** | déclarer une *intention* (type + apparence + quelques dials) qui se **déploie** en réglages concrets | modèle sémantique, descendant |
| **Avancé** | un rail de ~15 rubriques réglant **chaque** bouton (h1–h4 séparément, code, citation, math…) | modèle impératif, exhaustif |
| **Provenance** | par-dessus : chaque champ affiche s'il vient du type, de l'apparence, ou s'il est *surchargé* (↶) | troisième couche |

Le décompte des degrés de liberté est le vrai coupable : **18 éléments × ~9
attributs ≈ 150 boutons individuels**. Régler `h1`, `h2`, `h3`, `h4` et le titre
*séparément*, c'est cinq décisions là où une échelle typographique en donnerait
une.

::: important [Le diagnostic central]
Le basculement *Essentiel ⇄ Avancé* échoue parce que **les deux vues n'ont pas
la même forme** : l'une parle intention, l'autre parle boutons. On perd le
contexte en passant de l'une à l'autre, et on ne sait jamais laquelle fait
autorité. Le mauvais axe de découpe était **simple / avancé**. Le bon axe est
**contenu / style**.
:::

---

## Principe directeur

### Deux surfaces, séparées par l'axe contenu / style

L'édition du **contenu** et la conception du **style** deviennent deux outils
distincts.

::: columns
**L'éditeur (contenu)**

On écrit du Markdown. Le seul contrôle de style est **un menu : choisir un style
par son nom**. Zéro bouton de style. Degrés de liberté côté rédaction : **1**.

---

**L'atelier (style)**

Un **contenu figé** (un spécimen montrant toutes les constructions). On **clique
un élément** pour régler ses propriétés en direct. Toute la richesse vit ici,
isolée, sur du contenu figé, utilisée de temps en temps.
:::

L'infrastructure existe déjà à moitié : un style **est** un document nommé
([STACK-SPEC](STACK-SPEC.md) — `extends: <nom>`), avec les commandes *Extraire un
style* / *Nouveau à partir de…*. « Choisir un style » = choisir ce qu'on
`extends`. C'est une **re-façade**, pas une réécriture.

### Deux archétypes d'interaction, pas un moule unique

Découverte structurante : la métaphore « carte + crans » n'est **la** bonne
réponse que pour la **couleur** — le seul axe vraiment *continu et relationnel*.
**Presque tout le reste se sert mieux d'une galerie** de choix raisonnables.

| Archétype | Pour | Pourquoi |
| :-- | :-- | :-- |
| **La carte** | couleur | espace continu : familles de tons, rotation de teinte, contraste géométrique |
| **La galerie** | format, polices | choix **discrets et corrélés** qu'on reconnaît d'un coup d'œil |

::: note
Ne pas forcer l'uniformité entre axes est *précisément* ce qui rend l'atelier
simple. Chaque axe réduit les degrés de liberté à sa manière : la couleur par
**regroupement**, les polices et le format par **choix dans un catalogue**, les
tailles (quand elles restent réglables) par **règle générative**.
:::

---

## Définition du style

::: definition [Style]
Un **style** est le triplet composable

$$\text{style} = (\text{couleur},\; \text{format},\; \text{polices})$$

où *couleur* est une configuration de la carte, *format* un choix dans la
galerie-documents, *polices* un choix dans la galerie-paires. Les trois se
choisissent **indépendamment** et se **combinent** dans un aperçu unique.
:::

L'architecture d'ensemble :

```mermaid
flowchart TB
    subgraph editor["Éditeur — contenu"]
        MD["Markdown"] --> pick["Choisir un style<br>(par son nom)"]
    end
    subgraph atelier["Atelier — style"]
        col["Carte couleur"]
        fmt["Galerie formats"]
        fnt["Galerie polices"]
        col --> preview["Aperçu unifié"]
        fmt --> preview
        fnt --> preview
        preview --> named["Style nommé"]
    end
    pick -. refere .-> named
    named -->|extends| stack["Pile de documents"]
```

Le côté contenu prend **un** style par son nom ; ce nom **encapsule** les trois.
L'atelier est là où ce style se **compose** à partir des trois sélecteurs.

---

## Axe couleur — la carte

C'est le seul axe *carte*. Un **bac** fixe une **teinte** (hue) ; à l'intérieur,
un élément se pose sur un **cran** de la carte **saturation × valeur**.

### Crans, pas continuum

::: definition [Cran]
Une position **discrète et aimantée** dans un espace de réglage. La carte
couleur en présente une grille **6 × 6** (saturation × valeur) **plus une
colonne de neutres** ; une icône d'élément glissée **saute** de cran en cran,
elle ne prend jamais une valeur libre.
:::

La taille **6 × 6 + gris** est **figée** (I3) : assez de nuances pour une famille
riche, assez peu pour ne pas rouvrir les degrés de liberté.

L'aimantation est ce qui empêche de rouvrir les 150 degrés de liberté sous une
forme spatiale : on ne fixe pas « saturation 34 % », on pose l'élément sur *le*
cran.

### Neutres et fonds

- Une **colonne de gris** (saturation 0, blanc → noir pur) borde la palette à
  gauche, **même largeur** que les colonnes teintées. Elle donne les **neutres
  purs** que la carte à teinte fixe ne peut pas produire (encre noire franche,
  filets gris, blanc pur). Un élément déposé là **ignore la teinte** et ne bouge
  plus quand on la fait tourner.
- Deux éléments sont des **fonds** : `page` et `cover`. Ils sont cerclés sur la
  carte. Tout texte doit **contraster** avec le fond sous lequel il s'affiche —
  et comme le contraste vient de l'axe **valeur** (vertical), il est
  **géométrique** : `page` en haut (clair), l'encre en bas (sombre).

### Coordination et couture

Faire tourner la teinte d'un bac fait **pivoter toute la famille** en gardant ses
écarts de saturation et de valeur. Les rapports survivent, la cohérence est
mécanique.

::: warning [La seule couture entre axes]
`cover` est le **point de contact** entre la carte-couleur et la galerie-formats :
la **galerie** décide *s'il y a* une couverture, la **carte** décide *de sa
couleur*. C'est la seule entorse à l'orthogonalité des trois axes ; on la
**nomme** plutôt que de prétendre à l'étanchéité totale.
:::

Éléments portés par la carte (V1) :

```adt
Fond    ::= page | cover
Texte   ::= titre | h1 | h2 | h3 | h4
          | corps | notes | légende | code | en-tête
Couleur ::= Teinté(sat, val)      (* sur la palette, suit la teinte *)
          | Neutre(val)           (* colonne de gris, hors teinte *)
```

---

## Axe format — la galerie de documents

Le format de page n'est **pas** un espace de réglages fins : c'est un choix
**structurel** (couverture, recto-verso, canon, marges, folio…) dont les
décisions vont **ensemble** et dessinent un *genre de document*. Une **galerie
de vignettes** — on reconnaît la forme d'un coup d'œil — remplace les cases à
cocher. Ces gabarits **sont** les types de document markpage.

### Fixé par le gabarit vs ajustable

::: important [La ligne de partage]
La quasi-totalité du format vient **avec le gabarit** et n'est **jamais** réglée
à la main. Ne restent ajustables que les points **circonstanciels et
portables**.
:::

| Fixé par le gabarit (= le type) | Ajustable (portable / circonstanciel) |
| :-- | :-- |
| recto-verso, canon, marges & miroir, bandes en-tête / pied, folio, sauts de chapitre | **taille physique** (A4 / Letter / A5 / B5) |
| | **couverture** on/off (sauf lettre, déduite du contenu) |

Régler *canon ou pas* ou *les marges header/footer* à la main rouvrirait le piège
des 150 boutons sur l'axe le moins fait pour ça : le canon **dérive** ces valeurs
(voir [SETTINGS-SPEC](SETTINGS-SPEC.md), mode *derived*). Le gabarit les fixe.

### Les gabarits (V1)

| Gabarit | Recto-verso | Canon | En-tête | Folio | Couverture |
| :-- | :-: | :-: | :-: | :-- | :-: |
| Note technique | — | — | ✓ | centré | — |
| Rapport | — | ✓ | — | centré | ✓ |
| Article | — | ✓ | — | centré | — |
| Livre | ✓ | ✓ | ✓ | extérieur | ✓ |
| Lettre | — | — | — | — | — (verrouillé) |
| Diapos | — | — | — | — | — (16:9) |

La **couverture de la lettre** est verrouillée à *non* : son émetteur est dans le
bloc `sender` (voir [AI-AUTHORING](../AI-AUTHORING.md), *Letterhead*) — une
couverture la répéterait. Décision **déduite du contenu**, pas offerte comme
réglage.

---

## Axe polices — la galerie de paires

Choisir une police est un choix **discret et corrélé** : la paire
**titres / corps / code** va ensemble et porte un caractère. On la reconnaît en
la **lisant** — pas en composant une échelle. Donc une **galerie**, où chaque
carte est un **mini-spécimen** dans ses vraies polices.

::: important [Pas de carte taille × graisse]
Une première piste — une carte 2D où l'on pré-positionne les rôles par une règle
générative (taille = ancre × ratio^niveau) — a été **écartée** : elle demande à
l'utilisateur de *composer une échelle typographique*, un travail de designer que
la galerie lui épargne. **L'échelle (ratio) et les graisses sont bakées dans
chaque paire.**
:::

Il ne reste **qu'une poignée globale** : la **taille de base** (le corps). Titres,
notes, code en découlent par le ratio de la paire.

### Paires (V1, indicatives)

Une paire fixe **quatre rôles** : titres, corps, code (toujours monospace), et
**maths** (voir ci-dessous). La colonne *Maths* nomme le jeu de fontes MathJax
qui **s'harmonise** avec le texte.

| Paire | Titres | Corps | Maths | Caractère |
| :-- | :-- | :-- | :-- | :-- |
| Moderne | sans | sans | Fira Math | humaniste, neutre |
| Classique | serif | serif | New CM | serif de livre, sobre |
| Éditorial | grotesque | serif | STIX Two | titres tranchés, corps lisible |
| Élégant | serif ancienne | serif ancienne | New CM | raffiné |
| Technique | condensé | sans | Fira Math | dense, façon rapport |
| Contraste | grotesque | serif ancienne | STIX Two | fort écart titre / corps |

### La police mathématique

Les maths (MathJax) sont un **quatrième rôle** de la paire, **pas** un axe à part
ni un réglage exposé : elle doit **s'accorder** au texte — un corps serif appelle
des maths serif (New CM, STIX Two), un corps sans appelle des maths sans (Fira
Math). Le rôle *maths* est donc **baké dans la paire**, comme l'échelle et les
graisses. Jeux MathJax candidats : **New CM**, **Fira Math**, **STIX Two**,
**Asana**, **TeX**.

La **seule poignée** propre aux maths est `mathScale` — le corps des formules
**relatif** au corps du texte — qui **existe déjà** dans markpage (les maths
paraissent souvent trop petites ou trop grosses selon la fonte). Elle vit à côté
de la taille de base.

::: caution [Dépendances fontes — texte ET maths]
Deux limites à porter en implémentation. **(1) Texte :** les paires supposent des
fontes **disponibles** ; markpage embarque déjà Roboto Condensed / Mono, mais
des paires curées (Palatino, une didone…) posent la question **bundler vs
charger** (feuille de route *catalogue de polices*). Une paire ne doit jamais
retomber silencieusement sur un générique en production. **(2) Maths :** le
**sélecteur de jeu de fontes MathJax** était différé en attendant la stabilité de
`mathjax-full@4` (seul `mathScale` a été livré). V1 pourra donc n'harmoniser que
sur un **sous-ensemble** disponible, quitte à compléter quand v4 se stabilise.
:::

---

## L'atelier

L'atelier réunit les trois sélecteurs sur le **même document figé**, reliés par
deux mécanismes :

Sélection partagée
:   Cliquer un élément sur **une** carte le met en évidence sur les autres et
    affiche sa fiche complète (couleur, police, taille). C'est la **colle** qui
    fait d'un tas de sélecteurs un atelier cohérent — toute carte future
    (espacement, blocs) s'y branche pareil.

Aperçu unifié
:   Un seul aperçu applique **les trois axes d'un coup** : couverture colorée si
    le format en a une, polices de la paire à la taille de base, couleurs de la
    carte, mobilier de page (bande d'en-tête, folio) selon le gabarit. Un bandeau
    en pied **nomme** le style résultant (« *Rapport · Classique · 10,5 pt ·
    teinte 213° · avec couverture* »).

Présentation retenue : **trois onglets** (Format / Polices / Couleur) et un
aperçu **persistant** à droite.

---

## Sérialisation

Un style se **sérialise** sur le modèle de la pile
([STACK-SPEC](STACK-SPEC.md)) : un document-style porte, en clés de front-matter
ou dérivées,

```yaml
document-type: report        # choix galerie-formats
page-size: A4                # ajustable circonstanciel
cover: true                  # ajustable circonstanciel
font-pair: classique         # choix galerie-polices (fixe titres/corps/code/maths)
font-base: 10.5              # la poignée globale
math-scale: 1.0              # corps des maths, relatif au texte
color-hue: 213               # LE bac — une seule teinte (I : un seul bac)
color-crans: "page:n0 cover:4,4 titre:4,4 h1:4,3 h2:3,2 corps:n4 notes:n3 code:n4 en-tete:n2"
```

Un document contenu fait `extends: <ce-style>` ; l'aplatissement
([STACK-SPEC](STACK-SPEC.md), moteur `extends` + `insert`) produit le `.md`
autonome rendu *in fine*.

### La table des crans (le cœur de l'intégration)

::: important [Stocker le cran, pas la couleur]
Chaque élément a une **position** sur la carte, pas un hexadécimal. On sérialise
**le cran**, pas la couleur résolue — sinon la coordination « une seule teinte,
toute la famille pivote » (§4) ne survivrait pas à la sauvegarde. `color-crans`
encode la table `{élément → cran}` : `4,3` = saturation-cran 4, valeur-cran 3
(teinté) ; `n4` = neutre cran 4 (hors teinte). La couleur finale est **dérivée**
de `color-hue` + le cran au rendu.
:::

Contrainte réelle : le front-matter markpage est un **sous-ensemble plat de
YAML** — paires scalaires, **pas** de listes ni de dictionnaires imbriqués
([FRONTMATTER-SPEC](FRONTMATTER-SPEC.md)). La table ne peut donc pas être un dict
YAML. **Forme retenue : une chaîne scalaire compacte**, une seule clé
`color-crans` listant toutes les positions :

```yaml
color-hue: 213
color-crans: "page:n0 cover:4,4 titre:4,4 h1:4,3 h2:3,2 corps:n4 notes:n3 code:n4 en-tete:n2"
```

Une clé, dense, portable ; un petit **parseur maison** la relit (jetons
`élément:cran`, `cran` = `s,v` teinté ou `n<i>` neutre). Écarté : une clé plate
par élément (`color-h1: 4,3`…), plus lisible mais verbeuse et bruyante dans le
front-matter.

C'est **ça, « figer le vocabulaire de pile »** : la forme est arrêtée, reste à
écrire le code qui la lit et la dérive en couleurs. Les clés existantes
(`page-size`, `margins`, `font-*`) restent le vocabulaire ; ce qui s'ajoute
(`color-hue`, `color-crans`, `font-pair`, `font-base`, `math-scale`) est le vrai
**premier chantier** d'intégration.

::: warning [Le piège de dérivation, déjà rencontré]
Les réglages sont dérivés au rendu d'un **patch de pile**, pas du type de
document en direct. Le `document-type` est développé en clés concrètes **à
l'écriture**. Ajouter un drapeau au modèle d'un type **ne l'atteint pas** au
rendu — il faut l'inscrire au vocabulaire de la pile. Vérifié à la sonde lors du
correctif « lettre sans couverture ».
:::

---

## Invariants

Le contrat que toute implémentation doit préserver.

I1 — **Style = (couleur, format, polices)**
:   Trois choix composables et indépendants ; leur combinaison, plus rien
    d'autre, définit le style.

I2 — **Deux archétypes seulement**
:   La *carte* pour la couleur ; la *galerie* pour le format et les polices. Pas
    de troisième métaphore, pas d'uniformisation forcée.

I3 — **Aimantation, jamais de valeur libre par élément**
:   Sur la carte, une icône saute de cran en cran. Aucune saisie de valeur
    continue par élément dans le flux courant.

I4 — **Le gabarit fixe le genre ; seul le circonstanciel est ajustable**
:   Recto-verso, canon, marges, bandes, folio viennent avec le gabarit. Taille
    physique et couverture sont les seules exceptions ajustables.

I5 — **`page` et `cover` sont les fonds ; tout texte contraste**
:   Le contraste est géométrique (axe valeur). Un titre de couverture
    auto-contraste avec sa couverture.

I6 — **Un style est sérialisable et se branche sur la pile**
:   Il s'exprime en front-matter / clés de pile et se rend via `extends` +
    aplatissement. Aucun style ne vit uniquement dans l'appli.

I7 — **Côté rédaction, un seul degré de liberté**
:   Choisir un style par son nom. Toute la richesse est dans l'atelier, jamais
    dans l'éditeur de contenu.

---

## Tranché

- **Nombre de crans** de la carte couleur : **6 × 6 + colonne de gris**, figé
  (§4, I3).
- **Un seul bac couleur** : une teinte + les neutres. Pas de second bac en V1 —
  la colonne de gris couvre déjà les besoins d'accent neutre.
- **Police mathématique** : quatrième rôle **baké dans la paire**, harmonisé au
  texte ; seule poignée propre = `math-scale` (§6).
- **Sérialisation de la couleur** : **une chaîne scalaire compacte** unique
  (`color-crans: "…"`), pas une clé par élément (§8).

## À trancher / hors V1

- **Jeu de fontes MathJax** : quels jeux réellement disponibles en V1 (dépend de
  la stabilité `mathjax-full@4`) et lesquels associer à chaque paire.
- **Catalogue de polices** : quoi bundler vs charger (feuille de route
  *catalogue de polices*).
- **Échappatoire fine** : la fiche d'élément de l'atelier est le lieu naturel
  pour saisir une valeur exacte sur un cas récalcitrant, **sans** polluer les
  cartes — à spécifier si le besoin se confirme.
- **Autres axes possibles** en galeries (espacement / densité, habillage des
  blocs) — à dérouler après V1 s'ils se justifient.

---

## Maquettes de référence

Cinq prototypes interactifs matérialisent cette spec :

- **Carte couleur** (teinte, crans, neutres, `page` + `cover`) —
  <https://claude.ai/code/artifact/f5cfa593-c49a-4218-89d9-92a5404433ca>
- **Galerie de formats** —
  <https://claude.ai/code/artifact/130ee92b-59ae-41b2-bae9-d060d4f64583>
- **Galerie de polices** —
  <https://claude.ai/code/artifact/ba08606f-7622-4e1e-ad95-b6cbbf884d80>
- **Atelier complet** (les trois axes + aperçu unifié) —
  <https://claude.ai/code/artifact/fdf65c95-d2fd-42c7-a30f-554e9e3c80b3>
