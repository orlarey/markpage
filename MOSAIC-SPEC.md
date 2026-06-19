---
title: "Fence `mosaic` — mur d'images (galerie justifiée)"
author: Yann Orlarey
date: 2026-06-18
---

# Fence `mosaic` — mur d'images

::: toc+
- **Intention** — le manque que comble la fence et son cas d'usage.
- **Syntaxe** — info-string, corps, exemple.
- **Options** — `height`, `gap`, `last`.
- **Algorithme de pavage** — rangées justifiées, formule et greedy.
- **Mesure des ratios** — phase de rendu asynchrone.
- **Rendu et pagination** — DOM/CSS émis, coupures paged.js.
- **Légende et références** — `Figure N`, `\label`/`\ref`.
- **Erreurs** — bloc rouge, cas dégénérés.
- **Hors périmètre** — ce que v1 ne fait pas.
- **Plan d'implémentation** — fichiers touchés.
:::

## 1. Intention \label{sec:intent}

Markdown sait poser des images **les unes après les autres**, jamais les
**monter**. Quand on documente un événement (manifestation, chantier,
conférence) avec une dizaine de photos, on veut un **mur d'images** : un bloc
rectangulaire, sans espace, où les photos pavent la largeur du texte.

La fence `mosaic` produit exactement ça : une **galerie justifiée** (style
Flickr / Google Photos). Les images sont regroupées en rangées ; chaque rangée
est mise à l'échelle pour remplir **exactement** la largeur du texte ; les
hauteurs de rangée varient ; aucune image n'est rognée.

::: note [Pourquoi pas du Markdown ou du CSS pur]
Des `![]()` consécutifs se posent au fil du texte sans montage. Une grille CSS
`flex-wrap` ne justifie pas proprement chaque rangée à la largeur exacte (le
dernier élément d'une rangée ne s'étire pas). Le pavage justifié demande de
**décider les rangées en fonction des ratios réels** des images — donc un calcul,
pas seulement de la mise en forme déclarative.
:::

`mosaic` rejoint la famille des fences-figures de markpage (`chart`, `bda`,
`category`, `mermaid`) : info-string avec titre optionnel + options `key=value`,
légende `Figure N` auto-numérotée, bloc d'erreur rouge en cas de problème.

## 2. Syntaxe \label{sec:syntax}

Une image Markdown standard **par ligne** dans le corps ; les lignes vides sont
ignorées. Les références réutilisent le schéma d'images existant (sha-nommé
`assets/<sha>.<ext>`, `img://<sha>` reconnu en rétro-compat), donc une image déjà
importée dans le document est utilisable telle quelle.

````
```mosaic "Manifestation du 1er mai" height=160 gap=2
![](assets/a1b2c3….jpg)
![](assets/d4e5f6….jpg)
![](assets/0789ab….png)
![](assets/cdef01….jpg)
![](assets/234567….jpg)
```
````

- Le premier mot après `mosaic` n'est **pas** un type (contrairement à `chart`) :
  `mosaic` n'a qu'un mode. L'info-string ne porte que le titre `"…"` et les
  options.
- Le `alt` d'une image (`![alt](…)`) est conservé comme attribut `alt` sur la
  balise rendue (accessibilité), mais n'est **pas** affiché (pas de légende par
  image — c'est un mur).
- Toute ligne du corps qui n'est pas une image Markdown valide est ignorée pour
  le pavage (et signalée, voir \ref{sec:errors}).

## 3. Options \label{sec:options}

Après le titre optionnel, des options `key=value` (toutes optionnelles) :

| Option         | Défaut                        | Effet                                                        |
| :------------- | :---------------------------- | :----------------------------------------------------------- |
| `height=<pt>`  | auto (≈ 1/5 de la hauteur utile) | hauteur de rangée **cible** ; plus elle est petite, plus il y a d'images par rangée |
| `gap=<pt>`     | `0`                           | gouttière entre images **et** entre rangées                  |
| `last=natural` | (dernière rangée justifiée)   | laisse la **dernière** rangée à sa hauteur naturelle (cible), ferrée à gauche, au lieu de l'étirer |

::: tip [Choix de `last`]
Par défaut la dernière rangée est justifiée comme les autres → **rectangle
parfait, bord bas plat**. Le revers : une dernière rangée à **une seule image**
l'agrandit beaucoup. `last=natural` évite ce gonflement au prix d'un bord bas
potentiellement irrégulier. Recommander le défaut, sauf galeries dont le nombre
d'images tombe mal.
:::

L'info-string est parsée **quote-aware** (un titre peut contenir des espaces, et
on veut pouvoir ajouter plus tard une option à valeur entre guillemets sans
ambiguïté) — même approche que le parseur d'options de `chart`.

## 4. Algorithme de pavage \label{sec:packing}

On raisonne par **ratio** $r_i = w_i / h_i$ (largeur sur hauteur) de chaque image.
À une hauteur de rangée $h$, l'image $i$ occupe une largeur $r_i\,h$. Pour qu'une
rangée de $n$ images, séparées par une gouttière $G$, remplisse **exactement** la
largeur de contenu $C$, sa hauteur est fixée :

```math
h = \frac{C - G\,(n-1)}{\displaystyle\sum_{i=1}^{n} r_i}, \qquad w_i = r_i\, h
```

La hauteur d'une rangée **décroît** quand on lui ajoute des images (le
dénominateur grandit). On remplit donc gloutonnement jusqu'à ce que la hauteur
nécessaire pour tenir la largeur **retombe sous** la hauteur cible $H_t$ : la
rangée est alors « assez pleine », on la fige.

```algorithm "Pavage en rangées justifiées"
Input: ratios r[1..N], content width C, target height Ht, gap G
Output: rows, each with a height h and per-image widths
row ← [];  sumR ← 0
for i from 1 to N do
  append i to row;  sumR ← sumR + r[i]
  n ← length(row)
  h ← (C - G * (n - 1)) / sumR        // height that makes this row fill C
  if h <= Ht then                      // row is full enough
    emit(row, h)                       // each image width = r * h
    row ← [];  sumR ← 0
  end
end
if row is not empty then                // leftover: the last, partial row
  n ← length(row);  h ← (C - G * (n - 1)) / sumR
  if last = natural and h > Ht then
    emit(row, Ht)                        // natural height, left-aligned
  else
    emit(row, h)                         // justified to full width
  end
end
return rows
```

::: remark [Optimalité]
Le greedy par hauteur cible est l'algorithme standard des galeries justifiées :
simple, déterministe, $O(N)$. Une partition optimale (programmation dynamique
minimisant l'écart des hauteurs à $H_t$) existe mais n'apporte qu'un gain
cosmétique marginal — **hors périmètre** v1.
:::

La hauteur cible auto vaut environ **un cinquième de la hauteur utile** de la
page (la zone de texte), bornée à un intervalle raisonnable, de sorte qu'un mur
« par défaut » tienne en ~3–5 rangées. `height=<pt>` écrase cette valeur.

## 5. Mesure des ratios \label{sec:measure}

Le pavage exige le ratio **réel** de chaque image, donc ses dimensions
intrinsèques — une information **asynchrone** (il faut charger le binaire). Le
rendu de `mosaic` s'inscrit donc dans la **passe asynchrone** déjà existante de
`updatePreview` (celle qui rend MathJax et Mermaid), et non dans le rendu
synchrone initial.

Déroulé :

1. Le rendu synchrone émet un **placeholder** `mosaic` portant la liste ordonnée
   des `sha` (et le `alt`) + les options parsées.
2. La passe async résout chaque `sha` en blob (via le store d'images), lit
   `naturalWidth / naturalHeight`, calcule les ratios.
3. Elle exécute le pavage (\ref{sec:packing}) avec la largeur de contenu mesurée,
   puis remplace le placeholder par le DOM des rangées (\ref{sec:render}).

::: warning [Image manquante / illisible]
Un `sha` introuvable, ou une image dont les dimensions ne se lisent pas, prend un
**ratio de repli 3:2** et un cadre marqueur (bordure pointillée) — le montage ne
casse pas, et le trou est visible à la relecture. Le décompte d'images reste
correct.
:::

Comme MathJax/Mermaid, la passe doit respecter le **jeton de requête**
(`previewReqId`) : si l'utilisateur réédite pendant la mesure async, le rendu
obsolète est abandonné sans repeindre.

## 6. Rendu et pagination \label{sec:render}

Le placeholder est remplacé par un conteneur `.mosaic-block` contenant une suite
de `.mosaic-row`. Chaque rangée est une boîte de **hauteur fixe** (en px,
calculée) ; chaque image y a une **largeur fixe** (px) et `height: 100%`,
`object-fit: cover` (sans effet de rognage puisque la boîte a le ratio exact de
l'image — `cover` ne sert que de garde-fou anti-débordement d'un demi-pixel).

- **Largeur de référence** : la largeur de la colonne de texte (le `.mosaic-block`
  occupe 100 % de la largeur de contenu).
- **Gouttière** : `gap=<pt>` pose le même espacement horizontal (entre images
  d'une rangée) et vertical (entre rangées). `0` par défaut → mur jointif.
- **Pagination paged.js** : la **rangée** est l'unité insécable
  (`break-inside: avoid`) ; le mur peut se couper **entre** rangées d'une page à
  l'autre. (Voir aussi le correctif `text-align-last` des conteneurs justifiés
  coupés — sans objet ici car les rangées ne sont pas du texte justifié.)
- **Fidélité PDF** : tout est en boîtes pixel déterministes calculées au rendu →
  impression nette, identique écran/PDF.

::: caution [Largeur en mode dérivé / slides]
La largeur de contenu n'est pas constante (marges dérivées du canon, mode slides
16:9, notes en marge). Le pavage doit lire la largeur **effective** au moment de
la passe async, pas une constante. Un changement de réglage de page invalide le
rendu et relance la mesure (déjà le cas pour MathJax/Mermaid).
:::

## 7. Légende et références \label{sec:caption}

Le titre `"…"` de l'info-string passe par le mécanisme `captions.ts` commun :
légende **`Figure N: …`** sous le bloc, compteur partagé avec les autres figures.
Un `\label{key}` sur l'info-string rend le mur référençable par `\ref{key}` —
strictement comme `chart` / `mermaid` / `category`.

````
```mosaic "Chantier, semaine 12" \label{fig:chantier}
![](assets/….jpg)
![](assets/….jpg)
```
````

Sans titre, pas de légende ni de numéro (le mur reste un bloc nu) — règle
« ne pas sur-légender » d'AI-AUTHORING.

## 8. Erreurs \label{sec:errors}

Cohérent avec les autres fences :

- **Corps sans aucune image valide** → bloc rouge `mosaic-error` (« Aucune image
  dans le mur »).
- **Ligne non reconnue** (ni image, ni vide) → ignorée pour le pavage ; on peut
  l'agréger en un avertissement discret plutôt que faire échouer tout le bloc.
- **Image individuelle manquante** → repli 3:2 + cadre marqueur (\ref{sec:measure}),
  pas une erreur bloquante.

## 9. Hors périmètre (v1) \label{sec:scope}

Différé, à rouvrir si le besoin émerge :

- **Mosaïque tailles-mixtes** (certaines images en 2×2, mise en avant) — autre
  algorithme ; écarté au profit des rangées justifiées.
- **Grille rognée** (cases uniformes, `object-fit: cover` avec perte) — écartée
  (on ne rogne pas).
- **Légende par image / lightbox / liens** — un mur est un bloc figé pour le PDF.
- **Réordonnancement automatique** des images pour « mieux » remplir — on respecte
  l'ordre source.
- **Partition optimale** (DP) — le greedy suffit (\ref{sec:packing}).

## 10. Plan d'implémentation \label{sec:impl}

```tree "Fichiers touchés"
markpage
  src
    mosaic.ts          (nouveau : parse info-string + corps, pavage, émission DOM)
    marked-config.ts   (branche ```mosaic → placeholder + caption)
    main.ts            (passe async dans updatePreview : mesure ratios + pavage)
    image-store.ts     (réutilisé : résolution sha → blob)
    captions.ts        (réutilisé : Figure N + \label)
    style.css          (.mosaic-block / .mosaic-row / .mosaic-item / .mosaic-error)
  tests
    mosaic.test.ts     (parseur d'info-string + pavage pur, données de ratios mockées)
  AI-AUTHORING.md      (section « Image walls (mosaic) » + entrée dans la table)
```

Séquençage proposé :

1. **Parties pures** (testables sans DOM) : parseur d'info-string (titre +
   options, quote-aware) ; fonction de pavage `packRows(ratios, C, Ht, G, last)`
   → rangées. Tests unitaires sur ratios mockés.
2. **Branche marked-config** : émettre le placeholder + légende.
3. **Passe async main.ts** : mesure des ratios via le store, appel du pavage,
   remplacement du placeholder ; respect de `previewReqId`.
4. **CSS** + cas dégénérés (image manquante, corps vide).
5. **Doc AI-AUTHORING** + `make install`.
6. **Smoke Playwright** : un mur de N images se rend en rangées pleine largeur,
   se coupe entre rangées sur deux pages.
