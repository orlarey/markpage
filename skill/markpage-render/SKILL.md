---
name: markpage-render
description: À utiliser après avoir écrit ou modifié un document Markdown au format markpage (front matter avec `document-style:`, blocs `::: …`, fences `ebnf`, `inference`, `adt`, `tsv`, `mermaid`…), ou quand l'utilisateur demande de voir, rendre, afficher, vérifier ou exporter en PDF un tel document. Vérifie le document avec `markpage check`, corrige ce qui relève du document, puis montre le rendu paginé (`markpage html`) ou produit le PDF (`markpage pdf`).
---

# Vérifier et montrer un document markpage

La commande `markpage` (paquet npm `@orlarey/markpage`) rend un document avec
la mise en page de markpage.org — style nommé, formules, diagrammes,
pagination — dans un Chromium sans interface. Trois sous-commandes :

```sh
npx -y @orlarey/markpage check note.md     # le document est-il sain ?
npx -y @orlarey/markpage html  note.md     # → note.html, une page autonome
npx -y @orlarey/markpage pdf   note.md     # → note.pdf
```

Compter 10 à 20 secondes par commande pour une note de 25 pages.

## 1. Vérifier, toujours, avant de montrer

Lancer `check` après avoir écrit ou modifié le document. Le code de sortie
est 1 au moindre défaut ; le rapport dit lequel, pour chaque densité d'écran
(1 et 2 : les coupures de page diffèrent). Recommencer jusqu'à « conservé ».

Les défauts **du document**, à corriger dans le Markdown :

bloc en erreur
:   Une fence mal écrite (`ebnf`, `inference`, `category`, `adt`, `chart`…).
    Le message donne la ligne et ce qui était attendu. Corriger la syntaxe
    d'après AI-AUTHORING.md ; ne pas remplacer le bloc par du texte.

entrée du sommaire sans section
:   Une ligne du bloc `::: toc+` dont le titre ne correspond à aucun titre du
    document. Aligner le texte de l'entrée sur celui du titre.

sommaire vide
:   Le bloc `::: toc+` ne contient aucune entrée : il disparaît du rendu. Il
    doit contenir une **liste**, une entrée par section
    (`- **Titre** — de quoi il s'agit.`, les sous-sections en sous-liste), et
    non des paragraphes.

Les défauts **de la mise en page**, à signaler tels quels à l'utilisateur :

texte perdu, texte ajouté ou doublé, bloc posé deux fois, notes différentes, formules en trop ou en moins, texte hors de la zone, page presque vide avant la suite
:   La pagination a perdu, répété ou mal placé du contenu. Ce n'est pas une
    faute du document : ne pas réécrire le texte pour masquer le défaut.
    Rapporter la ligne du rapport (elle cite le passage et la page).

erreur de rendu
:   Le rendu a échoué. Rapporter le message.

`--json` donne le rapport complet ; `--scale 2` limite à une densité.

## 2. Montrer le rendu

`markpage html note.md -o <sortie>.html` écrit **une** page HTML autonome :
les pages déjà mises en page, sans script, lisible hors ligne (1 à 2 Mo).
`--continuous` donne la vue continue au lieu des pages.

Montrer ce fichier avec le moyen de la session, sans coller de HTML dans la
conversation :

- session avec envoi de fichiers ou pages publiées : envoyer le fichier
  `.html` pour affichage ;
- terminal local : `open <sortie>.html` (macOS) ou `xdg-open` (Linux).

Écrire le `.html` et le `.pdf` hors du dépôt (dossier temporaire de la
session), sauf si l'utilisateur les veut dans le dépôt : ce sont des
produits, pas des sources.

## 3. Le PDF, sur demande

`markpage pdf note.md -o <sortie>.pdf` imprime ces mêmes pages, au format du
style, polices incorporées.

## Si la commande ne trouve pas de navigateur

Elle essaie, dans l'ordre : `--chrome <chemin>`, `$MARKPAGE_CHROME`, le
Chromium de Playwright, celui des sessions Claude Code dans le nuage, puis
Google Chrome. S'il n'y en a aucun : `npx playwright install chromium`.
