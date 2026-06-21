---
title: Spécification — Table des matières augmentée (`::: toc+`)
author: Yann Orlarey
version: 0.1 (brouillon)
---

> **Statut :** livré — le bloc `::: toc+` est disponible dans markpage. Spec de
> conception d'origine ; les sections « questions ouvertes » et « plan
> d'implémentation » sont historiques.

**Objet :** un bloc `::: toc+` qui décrit le plan du document — chaque titre
suivi de son **intention** en prose — et qui sert d'abord de spécification (le
plan préexiste au contenu et guide l'IA), puis se replie au rendu en une **table
des matières** classique avec numéros de page.

::: note [Dogfooding]
Ce document applique le construct qu'il définit : le bloc ci-dessous *est* une
`::: toc+`. En mode brouillon, on lit le plan + les intentions ; au rendu final,
ce même bloc deviendrait la table des matières du PDF.
:::

::: toc+
- **Motivation et principes** — pourquoi le plan doit préexister au document et
  rester un artefact distinct ; ce qu'on perd si la TOC n'est qu'une collecte de
  titres dérivée du contenu.
- **Le principe : la redondance sémantique comme preuve par 9** — distinguer la
  redondance *mécanique* (à éliminer) de la redondance *sémantique* (à cultiver) ;
  poser que la divergence plan ↔ contenu est un *signal*, et que sa valeur tient à
  une réconciliation active.
- **Syntaxe source** — la forme du bloc `::: toc+` : liste hiérarchique, titre +
  intention, et correspondance avec les sections du corps (par titre ou `\label`).
- **Les deux états de rendu** — brouillon (TOC augmentée des intentions) vs final
  (TOC simple : titres, leaders, numéros de page) ; introduire la primitive de
  rendu *draft-only*.
- **Réconciliation TOC+ ↔ contenu** — trois mécanismes complémentaires : requête
  IA, diff structurel, et le rendu lui-même comme checksum.
- **Génération de la table au rendu** — numéros de page via paged.js, leaders,
  profondeur, et réutilisation de la numérotation de sections et des renvois
  existants.
- **Interactions et primitives requises** — draft-only, `\label`/`\ref`,
  numérotation « par l'exemple », export LaTeX, placement.
- **Questions ouvertes** — bloc vs frontmatter, profondeur, intentions
  distribuées, emplacement.
- **Plan d'implémentation** — phases incrémentales.
:::

---

## 1. Motivation et principes \label{sec:motivation}

Lorsqu'on rédige une spécification, il est utile — souvent indispensable — de
**commencer par le plan** : écrire la table des matières, l'amender jusqu'à ce
qu'elle soit satisfaisante, *avant* d'écrire le contenu. Ce plan n'est pas
décoratif : c'est la **spécification de la structure** du document. Il porte une
intention par section (« ici je vais argumenter X, puis poser Y »).

Une table des matières classique, en markdown comme ailleurs, est **dérivée** du
contenu : elle collecte les titres après coup. Elle est *descriptive*. Or un plan
est *prescriptif* : il dit ce qui *doit* exister. Si l'on réduit le plan à une TOC
dérivée, on perd exactement sa fonction de spécification — et l'intention, qui ne
tient pas dans un titre, disparaît.

D'où le besoin d'un objet qui soit **les deux à la fois** : un plan-spécification
en amont, et une table des matières en aval. La `::: toc+` est cet objet, vu à
deux moments de son cycle de vie.

## 2. Le principe : la redondance sémantique comme preuve par 9 \label{sec:redondance}

La `::: toc+` introduit volontairement une **redondance** : les titres et les
intentions du plan coexistent avec les sections réelles du corps. Cette redondance
n'est pas un défaut à supprimer — c'est le cœur du dispositif. Il faut distinguer
deux espèces de redondance, que tout oppose :

| | Redondance **mécanique** | Redondance **sémantique** |
| :--- | :--- | :--- |
| Exemple | un fichier copié dans N projets | la `::: toc+` vs le contenu |
| Information | aucune (les copies devraient être identiques) | indépendante (plan *vs* réalisation, à deux altitudes) |
| Une divergence est… | du bruit (une erreur) | un **signal** (à interpréter) |
| Remède | source unique | **réconciliation** |

Le point décisif : une table des matières *dérivée* du contenu ne peut, par
construction, jamais signaler que « le contenu ne dit pas ce qui était prévu » —
puisqu'elle *est* le contenu. Il n'y a rien contre quoi vérifier. **La redondance
est le fondement de la détection d'erreur.** La `::: toc+` joue le rôle d'un
*checksum du document* : deux expressions indépendantes de la même intention dont
on exige qu'elles concordent — exactement la preuve par 9, la comptabilité en
partie double, ou le couple test ↔ code.

::: important
La valeur de la redondance tient *entièrement* à la réconciliation (voir
\ref{sec:reconciliation}). Une `::: toc+` jamais vérifiée pourrit en silence et
devient trompeuse. La spécification doit donc rendre la réconciliation **facile et
routinière**, pas optionnelle.
:::

## 3. Syntaxe source \label{sec:syntaxe}

Le plan est un *fenced div* `::: toc+` (réutilisant la syntaxe Pandoc déjà en
place pour les callouts). Son corps est une **liste imbriquée** : la profondeur de
la liste mappe la profondeur des titres (niveau 1 → `#`/`##`, niveau 2 →
sous-section, etc.). Chaque entrée porte un **titre** et son **intention** en
prose, séparés par un tiret cadratin :

```
::: toc+
- **Modèle de menace** — poser les actifs, les attaquants, les hypothèses de
  confiance avant toute contre-mesure.
  - **Surface d'attaque** — énumérer les points d'entrée externes.
- **Contre-mesures** — relier chaque mesure à une menace de la section
  précédente ; pas de mesure orpheline.
:::
```

Le **titre** d'une entrée (le texte en gras, par convention) est la clé de
correspondance avec une section du corps. Deux modes de liaison :

- **Par titre** (défaut) — l'entrée correspond au heading dont le texte est égal
  (après normalisation). Simple, lisible, mais fragile au renommage.
- **Par label** (robuste) — l'entrée porte `\label{sec:clé}` et le heading du
  corps aussi ; on réutilise le registre de renvois existant. Recommandé pour les
  documents longs.

L'intention est de la prose markdown libre (emphase, `\ref` vers d'autres
sections, etc.). Elle n'apparaît **jamais** dans le rendu final (voir
\ref{sec:rendu}).

## 4. Les deux états de rendu \label{sec:rendu}

La `::: toc+` a deux projections, pilotées par un mode **brouillon / final** :

- **Brouillon** (aperçu, par défaut pendant la rédaction) — le bloc s'affiche en
  entier : titres **et** intentions, stylé comme un plan de travail. C'est la
  spécification vivante, lisible par l'humain et par l'IA.
- **Final** (export PDF/LaTeX, ou `draft: false`) — le bloc se replie en **table
  des matières simple** : titres seuls, indentés par niveau, avec leaders en
  pointillés et **numéros de page** (voir \ref{sec:generation}). Les intentions
  sont **retirées**.

Cela suppose une primitive nouvelle dans markpage : le **rendu *draft-only***
(contenu présent dans la source, visible en aperçu, retiré à l'export). Elle est
réutilisable au-delà de la `::: toc+` (annotations, `todo`, notes internes) — voir
\ref{sec:interactions}.

## 5. Réconciliation TOC+ ↔ contenu \label{sec:reconciliation}

C'est l'opération qui donne sa valeur à la redondance de \ref{sec:redondance}.
Trois mécanismes complémentaires, du plus souple au plus automatique :

1. **Requête IA** (flux principal) — « la `::: toc+` et le contenu sont-ils
   synchro ? sinon, propose. » L'IA compare l'arbre prescrit (titres + intentions)
   à l'arbre réalisé (titres + sections) et liste les écarts dans les deux sens :
   section prévue mais absente, section présente mais hors plan, contenu qui
   n'honore pas son intention.
2. **Diff structurel** (outil éditeur) — sans IA, markpage peut lister
   mécaniquement : entrées `::: toc+` sans heading correspondant, et headings sans
   entrée. Affiché dans un panneau, ou via les guides de l'aperçu.
3. **Le rendu comme checksum** (gratuit) — pour afficher un numéro de page, chaque
   entrée doit pointer vers une vraie section. Une entrée **non résolue** ne peut
   pas obtenir de numéro : elle est rendue avec un marqueur visible
   (« — section manquante »). Symétriquement, un heading absent du plan peut être
   signalé en mode brouillon.

::: tip
Le mécanisme 3 est remarquable : les deux objectifs — *une belle table des
matières* et *une vérification de cohérence* — sont **le même mécanisme**. La
contrainte « tout numéro de page suppose une section » fait du rendu lui-même la
preuve par 9.
:::

## 6. Génération de la table au rendu \label{sec:generation}

Au rendu final, markpage transforme la `::: toc+` en une liste d'entrées
`<a href="#sec-clé">`, indentées par niveau. Les **numéros de page** s'obtiennent
côté paged.js via `target-counter(attr(href url), page)` ; les **leaders** via une
règle `content: leader('.') target-counter(...)` sur un pseudo-élément. La
profondeur affichée est bornée par une option (voir \ref{sec:questions}).

Réutilisations :

- **Numérotation « par l'exemple »** (SPEC §15) — si les sections sont numérotées,
  la table reprend les numéros *déjà inscrits dans la source* (cohérent avec le
  principe markpage « tout est du texte brut »), pas un compteur parallèle.
- **Renvois** (`\label`/`\ref`) — la liaison par label de \ref{sec:syntaxe}
  s'appuie sur le registre existant ; chaque entrée résolue est donc cliquable et
  partage l'identité de la section.

## 7. Interactions et primitives requises \label{sec:interactions}

- **Rendu draft-only** (nouveau) — primitive transverse ; pilote le repli
  intentions → TOC. À spécifier indépendamment (candidat : une classe de blocs
  retirés à l'export, ou un drapeau `draft` en frontmatter).
- **Export LaTeX** — la `::: toc+` finale se mappe naturellement sur
  `\tableofcontents` ; les intentions sont omises ; les entries à label deviennent
  des renvois standard.
- **Letterhead / running content** (SPEC §25, §26) — la table se place après la
  page de titre / le bloc de métadonnées ; à articuler avec la pagination.
- **Numérotation des sections** (SPEC §15) — voir \ref{sec:generation}.

## 8. Questions ouvertes \label{sec:questions}

- **Bloc `::: toc+` vs région frontmatter `toc:`** — le bloc est recommandé : son
  contenu est de la prose riche, il vit dans le corps, et il est visible en
  brouillon. Le frontmatter conviendrait à une simple TOC dérivée, sans intentions.
- **Profondeur** — option `toc-depth` (par défaut : 2 ou 3 niveaux).
- **Intentions distribuées en complément** — faut-il *aussi* autoriser un
  `::: intent` sous chaque heading du corps (intention co-localisée), en plus de
  la `::: toc+` centralisée ? Les deux sont des projections du même arbre ; la
  `::: toc+` centralisée est le choix primaire (cf. \ref{sec:motivation}).
- **Emplacement** — directive explicite de position, ou convention (juste après le
  titre).

## 9. Plan d'implémentation \label{sec:plan}

Par phases incrémentales, chacune livrable seule :

1. **Parsing + TOC simple** — reconnaître `::: toc+` ; rendu final = table des
   matières (titres, hiérarchie, ancres cliquables). Pas encore de numéros de page.
2. **Numéros de page + leaders** — `target-counter` paged.js et leaders en
   pointillés.
3. **Réconciliation** — diff structurel (mécanisme 2) + marqueurs de rendu
   (mécanisme 3) ; le mécanisme 1 (IA) est déjà disponible via le skill
   `markpage-specs`.
4. **Brouillon / final** — primitive draft-only : affichage des intentions en
   aperçu, repli à l'export ; mapping LaTeX `\tableofcontents`.
