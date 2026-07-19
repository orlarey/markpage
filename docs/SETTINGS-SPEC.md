---
title: Spécification — Réglages, recettes et frontmatter
author: Yann Orlarey
version: 0.2 (brouillon)
date: 2026-07-17
document-type: tech-note
appearance: technical
---

> **Statut :** spécification normative, cœur livré. Le round-trip, la
> réinitialisation atomique des recettes, undo/redo depuis la fenêtre Réglages
> et le type `letter` sont implémentés. Le regroupement fin des interactions
> continues reste un perfectionnement possible.
>
> Ce document complète [FRONTMATTER-SPEC](FRONTMATTER-SPEC.md), qui décrit les
> clés effectivement reconnues, et [STACK-SPEC](STACK-SPEC.md), qui définit
> l'héritage et l'aplatissement des documents.

::: toc+
**Objet** — définir une seule source de vérité pour le style du document
**Modèle d'état** — distinguer recette, défaut contextuel et variation
**Architecture du dialogue** — rendre visible la séparation type/apparence
**Synchronisation** — garantir l'alignement du dialogue et du frontmatter
**Changement de recette** — réinitialiser le style de manière déterministe
**Historique** — intégrer les Réglages à undo/redo
**Type Lettre** — définir la recette de correspondance
**Métadonnées et style** — séparer contenu éditorial et apparence
**Critères d'acceptation** — rendre les règles testables
:::

# Objet

Le dialogue **Réglages** n'est pas un second magasin de configuration. Il est
une vue structurée et éditable du frontmatter du document courant.

Le système doit présenter peu d'intentions cohérentes, dériver les détails
typographiques et ne conserver dans le document que les écarts volontaires à
une recette connue.

Les objectifs sont :

1. un document portable et auto-descriptif ;
2. un frontmatter minimal ;
3. une interface qui distingue clairement défauts et variations ;
4. des changements de recette déterministes et réversibles ;
5. un historique unique pour le texte et les réglages.

# Modèle d'état

## Recette

Une recette est le couple :

```text
R = (type de document, apparence)
```

Le **type de document** détermine la fonction et la géométrie générale :
format, marges, mesure, recto-verso, pagination, chapitres, alignement et
placement des notes.

L'**apparence** détermine le système typographique coordonné : fontes du corps,
des titres, du code et des mathématiques, graisse des titres, échelle
typographique, densité et autres choix visuels dérivés.

Le type et l'apparence sont orthogonaux. Une apparence ne modifie jamais le
format, les marges, le recto-verso, la pagination ni la structure du document.
Réciproquement, un type ne définit pas une identité graphique particulière.

## Propriété des réglages

| Domaine | Réglages dérivés principaux |
| :-- | :-- |
| Type de document | format, marges, mesure, recto-verso, paragraphes, alignement, pagination, notes, en-têtes et pieds |
| Apparence | fontes, taille du corps, échelle typographique, densité, graisses, couleurs et traitement visuel des éléments |
| Informations | langue, auteur, organisation et date ; hors recette stylistique |

La géométrie de page relève exclusivement du type. Le canon de Van de Graaf,
qui suppose une composition éditoriale en pages en vis-à-vis, n'est le défaut
que du type `book`. Les rapports, articles, notes techniques et lettres
emploient leurs géométries propres, généralement symétriques ; les
présentations emploient une zone de sécurité régulière.

## Défaut contextuel

Pour une recette `R` et un réglage `r`, `d(R, r)` désigne la valeur par défaut
de `r` dans cette recette.

Une valeur par défaut est **implicite** : elle n'est pas écrite dans le
frontmatter. Le dialogue l'affiche avec le badge **« Par défaut »**.

## Variation

Une variation est une valeur explicitement choisie qui diffère du défaut
contextuel :

```text
v ≠ d(R, r)
```

Elle est écrite dans le frontmatter et signalée par le badge **« Variation »**.
Le geste **Réinitialiser** supprime la clé ; il n'écrit jamais la valeur par
défaut.

## Forme canonique

Pour chaque réglage `r` :

```text
clé r absente  ⇔ valeur d(R, r) ⇔ badge « Par défaut »
clé r présente ⇔ variation locale ⇔ badge « Variation »
```

Une clé présente avec une valeur égale au défaut contextuel est redondante. La
normalisation la supprime.

# Architecture du dialogue

Le dialogue **Réglages** doit matérialiser la recette au lieu de présenter une
liste indifférenciée de paramètres.

## Vue Essentiel

La vue Essentiel présente, dans cet ordre :

1. la **recette du document**, avec deux sélecteurs distincts `Type de
   document` et `Apparence` ;
2. **Type et mise en page**, pour les réglages dont le défaut provient du type ;
3. **Apparence**, pour les réglages dont le défaut provient de l'apparence ;
4. **Informations du document**, pour la langue et les métadonnées qui ne
   relèvent d'aucun des deux domaines.

La recette est résumée sous la forme :

```text
Livre + Classique · 3 variations
```

Chaque valeur implicite porte un badge qui précise sa provenance :

```text
Défaut du type · Livre
Défaut d'apparence · Classique
```

Une valeur explicite porte le badge `Variation` et propose l'action de retour
au défaut. La provenance n'est pas une donnée supplémentaire : elle est
calculée depuis la propriété normative des réglages et la recette active.

## Vue Avancé

La vue Avancé s'ouvre sur une page **Recette du document**. Elle reprend les
deux sélecteurs de la vue Essentiel, résume le nombre de variations et explique
les responsabilités respectives du type et de l'apparence avant d'exposer la
matrice détaillée.

Sa navigation reprend la même taxonomie :

- **Type et mise en page** pour la page et sa structure ;
- **Apparence typographique** pour les fontes et styles détaillés ;
- **Éléments graphiques** pour les mathématiques, diagrammes et encadrés ;
- les informations du document restent séparées.

Chaque panneau détaillé commence par un rappel contextuel : soit
`Mise en page héritée du type « … »`, soit `Apparence héritée de « … »`. Le
panneau des informations précise au contraire que ses valeurs ne sont pas
réinitialisées lors d'un changement de recette.

Les vues Essentiel et Avancé ne constituent pas deux modèles de réglages. Elles
éditent le même état et appliquent les mêmes règles de synchronisation.

# Synchronisation

Le dialogue, le texte du frontmatter et le rendu sont trois vues du même état.
Ils doivent rester alignés dans les deux directions.

## Du dialogue vers le frontmatter

Lorsqu'un utilisateur modifie `r` :

- si la nouvelle valeur est `d(R, r)`, la clé `r` est supprimée ;
- sinon, `r: v` est ajoutée ou remplacée ;
- le rendu est recalculé depuis le document obtenu ;
- le champ affiche immédiatement le bon badge.

## Du frontmatter vers le dialogue

Lorsqu'un utilisateur modifie le frontmatter à la main :

- ajouter `r: v` affiche `v` et le badge « Variation » ;
- modifier `r: v` actualise le champ et le rendu ;
- supprimer `r` restaure `d(R, r)` et le badge « Par défaut » ;
- écrire explicitement `r: d(R, r)` est accepté puis normalisé par suppression
  de la clé redondante.

## Absence d'état stylistique parallèle

Le dialogue ne possède pas de copie stylistique durable indépendante du
document. Un profil applicatif historique ne doit ni masquer ni contredire les
valeurs résolues depuis le frontmatter et sa pile `extends`.

# Changement de recette

Changer le type de document ou l'apparence est une opération de niveau
supérieur. Elle ne tente pas d'interpréter les anciennes variations dans la
nouvelle recette.

## Règle normative

> Changer le type de document ou l'apparence réinitialise tous les réglages de
> style aux valeurs par défaut de la nouvelle recette.

L'opération :

1. choisit le nouveau type ou la nouvelle apparence ;
2. conserve l'autre composante de la recette ;
3. supprime toutes les variations essentielles et avancées de la feuille ;
4. applique les défauts de la nouvelle combinaison ;
5. conserve seulement `document-type` et `appearance` lorsqu'ils diffèrent des
   défauts globaux ;
6. rafraîchit le dialogue et le rendu.

Après l'opération, tous les champs stylistiques portent le badge « Par défaut ».

Cette règle est volontairement destructive pour les variations, mais
entièrement réversible par l'historique. Elle évite les résultats hybrides et
les dépendances implicites à la recette précédente.

Le dialogue doit annoncer cette conséquence à proximité des deux sélecteurs :

> Changer le type ou l'apparence réinitialise les variations de style.

# Historique

Les modifications effectuées dans Réglages sont des modifications du document.
Elles appartiennent donc au même historique que l'édition Markdown.

## Historique unique

- une modification discrète d'un réglage produit une étape d'historique ;
- une réinitialisation produit une étape ;
- un changement de type ou d'apparence, y compris la suppression de toutes les
  variations, produit **une seule étape atomique** ;
- une modification manuelle équivalente du frontmatter suit le même historique ;
- `Annuler` et `Rétablir` actualisent le texte, le dialogue et le rendu.

## Fenêtre Réglages

Quand le focus se trouve dans la fenêtre Réglages :

- `Cmd/Ctrl + Z` déclenche l'annulation dans l'éditeur du document ;
- `Cmd/Ctrl + Shift + Z` déclenche le rétablissement ;
- les boutons ou commandes d'annulation et de rétablissement ciblent le même
  historique CodeMirror.

## Regroupement des interactions continues

Une interaction continue ne doit pas saturer l'historique :

- une saisie textuelle peut être regroupée selon les règles ordinaires de
  CodeMirror ;
- le déplacement continu d'un sélecteur ou d'une couleur constitue une seule
  intention tant que l'interaction n'est pas terminée ;
- la valeur finale est la borne de l'étape d'historique.

## Exemple

État initial :

````yaml
---
document-type: report
appearance: modern
body-size: 9
accent: "#7a1f5c"
---
````

L'utilisateur choisit **Livre**. Markpage applique la recette
`book + modern` et supprime `body-size` et `accent`.

`Annuler` restaure en une fois `report + modern`, `body-size: 9` et la couleur
d'accent. `Rétablir` revient en une fois à `book + modern` sans variations.

# Type Lettre

Le catalogue des types de document doit inclure :

```yaml
document-type: letter
```

Le libellé français est **« Lettre »**. Le mot **Courier** n'est pas utilisé
pour ce type, car il désigne aussi une famille de caractères.

## Recette par défaut

Le type `letter` définit au minimum :

| Propriété | Défaut |
| :-- | :-- |
| Format | A4 |
| Recto-verso | non |
| Marges | adaptées à la correspondance |
| Mesure | confortable, sur une colonne |
| Alignement | gauche |
| Paragraphes | espacement, sans retrait |
| Pagination | aucune par défaut |
| Notes | aucune présentation privilégiée ; `end` si des notes existent |
| Chapitres | aucun saut automatique |
| Titres | hiérarchie discrète |

L'apparence reste orthogonale. Les combinaisons `letter + classic`,
`letter + modern`, `letter + academic` et `letter + technical` sont valides.
Une apparence « Administrative » n'est pas introduite tant qu'un besoin
typographique distinct n'est pas établi.

## Structure de correspondance

Le type `letter` s'appuie sur les blocs Markpage existants `sender`,
`recipient` et `signature`. Ces blocs doivent apparaître au début du corps afin
de respecter leur positionnement.

Les informations propres au destinataire relèvent du contenu ou de métadonnées
éditoriales, jamais des variations de style. Une extension future du
frontmatter pourra formaliser :

````yaml
recipient: Jeanne Dupont
recipient-organization: Exemple SA
recipient-address: |
  12 rue des Lilas
  75000 Paris
subject: Objet de la lettre
````

Ces clés ne font pas partie de la première livraison du type `letter` tant que
leur interaction avec les blocs `recipient` et les templates n'est pas
spécifiée.

# Métadonnées et style

La réinitialisation d'une recette concerne uniquement le style et la mise en
page. Elle ne supprime pas :

- le titre et le sous-titre ;
- l'auteur et l'organisation ;
- la date et la langue ;
- le destinataire, l'adresse, l'objet ou la signature ;
- les références, le préambule mathématique et les autres données de contenu ;
- `extends`, qui définit la pile du document.

La liste exacte des clés stylistiques supprimées doit être centralisée dans le
code. Elle ne doit pas être reconstruite séparément par le dialogue, le writer
du frontmatter et le moteur d'historique.

# Critères d'acceptation

## Défaut et variation

1. Ouvrir un document sans clé stylistique affiche les valeurs contextuelles
   avec « Par défaut ».
2. Modifier un champ écrit une clé et affiche « Variation ».
3. Réinitialiser le champ supprime la clé.
4. Supprimer la clé dans l'éditeur rétablit le défaut dans le dialogue.
5. Une clé égale au défaut est normalisée par suppression.

## Changement de recette

1. Créer plusieurs variations essentielles et avancées.
2. Changer le type : toutes les variations stylistiques disparaissent.
3. Recréer des variations, puis changer l'apparence : même résultat.
4. Vérifier que les métadonnées éditoriales et `extends` sont conservés.
5. Vérifier que tous les champs stylistiques affichent « Par défaut ».

## Undo/redo

1. Modifier un réglage, puis annuler depuis l'éditeur.
2. Refaire l'opération depuis la fenêtre Réglages.
3. Changer de recette avec plusieurs variations, puis annuler une fois.
4. Vérifier que la recette et toutes les variations antérieures reviennent.
5. Rétablir une fois et vérifier la réinitialisation complète.

## Lettre

1. Choisir « Lettre » et vérifier le format A4 sans pagination.
2. Vérifier l'alignement à gauche et la séparation des paragraphes par
   espacement.
3. Changer d'apparence sans changer la structure de correspondance.
4. Rendre une lettre utilisant `sender`, `recipient` et `signature`.
