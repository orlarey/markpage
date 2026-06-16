---
title: Spécification — Gestion des fichiers et des ressources
author: Yann Orlarey
version: 0.1 (brouillon)
---

**Objet :** refondre la gestion des documents et de leurs ressources (images)
pour retrouver le confort d'une **application locale** — fichiers possédés,
visibles, ouverts/enregistrés explicitement — mais plaqué sur le système de
fichiers du navigateur (OPFS). Cette spec pose le modèle, les invariants, les
surfaces UI et le chemin de migration.

::: toc+
- **Motivation et objectifs** — pourquoi refondre ; les trois coutures actuelles
  (trois substrats, deux schémas de référence d'image, pool global sans
  propriété) ; viser le confort d'une appli locale dans le navigateur.
- **Modèle mental et invariants** — deux lieux : l'**éditeur** (voit le doc
  courant et sa copie de travail) et le **système de fichiers** (ne voit que des
  états *validés*) ; la copie de travail est un concept d'éditeur ; **Save** et
  **Save As** sont les seuls ponts. La règle que tout le reste respecte.
- **Le bundle de document** — un doc = `content.md` + `assets/` ; propriété
  explicite des ressources ; un seul schéma de référence (chemins relatifs
  lisibles) ; la déduplication redevient une optimisation interne invisible.
- **Substrat de stockage : OPFS** — un store hiérarchique unique remplaçant
  localStorage + IndexedDB + mapping ; persistance anti-éviction ; intégrité et
  dédup par SHA en interne ; quota visible.
- **Les surfaces : menu File, Open…, Files…** — le menu File ne porte que les
  verbes du doc courant plus deux portes vers la gestion ; Open… = sélecteur
  léger ; Files… = gestionnaire complet (documents et assets).
- **Save, Save As, Revert** — la mécanique `committed ← dirty` ; Save As crée un
  nouveau doc et l'original redevient propre ; Revert ; indicateur « modifié ».
- **Interop disque réel** — File System Access (Chromium) : ouvrir un fichier,
  lier un dossier (miroir → badge externe), Save vers disque ; divergences ;
  dégradation cross-browser.
- **Ressources et cycle de vie** — propriété des assets par bundle ; remplacer,
  renommer, refs cassées, élaguer ; le local remplace le GC global différé et sa
  course.
- **Import, export, partage** — formats d'import ; export PDF / LaTeX / Markdown /
  Bundle / HTML ; partage lien / e-mail / OneDrive ; le bundle comme unité
  d'échange.
- **Migration depuis l'existant** — convertir docs localStorage + images
  IndexedDB + mapping vers les bundles OPFS, de façon idempotente.
- **Robustesse et cas limites** — crash-safety du dirty, multi-onglets, quota
  dépassé, zéro abandon silencieux.
- **Hors périmètre et phases** — ce qui est différé ; découpage en phases
  livrables.
:::

---

## 1. Motivation et objectifs \label{sec:motivation}

La gestion actuelle des documents et de leurs images « marche », mais son modèle
est confus. En une phrase : **tout est global, rien n'est possédé.** Trois
coutures concrètes :

| Couture | Détail | Conséquence |
| :------ | :----- | :---------- |
| Trois substrats | docs + contenus en `localStorage`, images en IndexedDB, mapping chemins→SHA encore en `localStorage` | quotas et durabilités hétérogènes ; `localStorage` ≈ 5 Mo, fragile |
| Deux schémas de référence | `img://<sha>` (interne) **et** chemins externes `images/foo.png` (mapping global) | comportements d'export divergents (inliné / préservé / abandonné) |
| Pool global sans propriété | images dédupliquées globalement, association doc↔image *recalculée*, **GC global différé au boot** avec course connue | cycle de vie opaque (« quand mon image disparaît ? ») |

S'y ajoutent : pas de hiérarchie (liste plate), pas de vraie notion de *fichier*
qu'on ouvre/enregistre, export = téléchargement éphémère.

**Objectif.** Retrouver le modèle mental d'une application locale — un document
est un fichier qu'on ouvre, modifie, enregistre ; ses ressources lui
appartiennent ; on *voit* l'arborescence — appliqué au système de fichiers du
navigateur. Principe directeur : **la clarté prime sur l'astuce**. La
déduplication reste utile mais ne doit jamais fuiter dans le modèle de
l'utilisateur (cf. \ref{sec:bundle}).

## 2. Modèle mental et invariants \label{sec:invariants}

Toute la refonte tient sur une distinction de **deux lieux** :

- **L'éditeur** — voit le **document courant** et sa **copie de travail** (l'état
  en cours d'édition, éventuellement non sauvegardé).
- **Le système de fichiers** — la bibliothèque, le disque, et toutes les
  opérations de gestion. Il ne voit que des **états validés** (sauvegardés).

::: important
**Invariant fondateur.** La copie de travail (*dirty*) est un concept de
l'éditeur seul. Le système de fichiers ne voit jamais que des états *validés*.
**Save** et **Save As** sont les **seuls ponts** entre les deux mondes.
:::

Conséquences que le reste de la spec respecte :

- **Save** valide la copie de travail (écrase le fichier courant) ; **Save As**
  la valide dans un *nouveau* fichier (cf. \ref{sec:save}).
- Toute opération de gestion — Duplicate, Delete, Move, Import, Export d'un
  fichier de la bibliothèque — travaille sur le **validé**, jamais sur le dirty.
- C'est précisément pourquoi **Duplicate ≠ Save As** : Duplicate est une
  opération *fichier* (copie le sauvegardé, n'importe quel doc, on reste) ; Save
  As est une opération *éditeur* (embarque le dirty du doc courant, on bascule).
  Même geste apparent, deux mondes.

## 3. Le bundle de document \label{sec:bundle}

Un document n'est plus une entrée dans un pool global mais un **bundle** —
un petit dossier auto-contenu :

```
Mon doc/
├── content.md
└── assets/
    ├── schema.png
    └── photo.jpg
```

- **Propriété explicite.** Les assets d'un doc vivent *dans* son bundle.
  Supprimer le doc supprime ses assets — plus de GC global à l'aveugle, plus de
  course cut-paste (cf. \ref{sec:resources}).
- **Un seul schéma de référence.** Dans `content.md`, on référence par **chemin
  relatif** : implémenté en Phase 1 sous la forme **sha-nommée**
  `![](assets/<sha>.<ext>)` ; les **noms lisibles** `![](assets/schema.png)` (via
  un manifeste par-doc `nom → sha`) sont un **enhancement différé**. Le scheme
  `img://<sha>` n'est plus émis (mais reste reconnu en lecture pour la
  rétro-compat). Idiome dépôt git, relatif et portable.
- **Déduplication cachée** *(décidé)*. Un **magasin de blobs interne adressé par
  SHA, référence-compté**, partagé entre bundles : un octet partagé n'est stocké
  qu'une fois, et un blob n'est physiquement supprimé que lorsque plus aucun
  bundle ne le référence. Cette optimisation **ne fuite jamais** dans le modèle
  de l'utilisateur : lui ne voit que des fichiers dans des dossiers.
- **Unité de portabilité.** Exporter = zipper le bundle ; importer = le
  dézipper ; partager un gros doc = envoyer le bundle (cf. \ref{sec:io}).

## 4. Substrat de stockage : OPFS \label{sec:opfs}

Le socle unique est l'**Origin Private File System** (`navigator.storage
.getDirectory()`) — un vrai système de fichiers hiérarchique, privé à l'origine,
à large quota, supporté par les navigateurs récents (Chromium, Firefox, Safari).

- **Un seul store.** OPFS remplace les trois substrats actuels (localStorage docs
  + IndexedDB images + mapping localStorage). Layout retenu :

```
library/
├── index.json     # index des documents + arbre de dossiers + métadonnées :
│                   #   uuid → nom affiché, mtime, committedSha, dirtySha,
│                   #   dossier, lien disque éventuel (handle + base de synchro)
├── <uuid>/        # un bundle par document, nommé par UUID
│   ├── content.md
│   └── assets/…
├── .store/        # magasin de blobs interne, fichiers nommés par SHA
│                   #   (référence-compté, partagé entre bundles)
└── .trash/        # bundles supprimés, restaurables
```

  **Nommage** *(au mieux)*. Les dossiers-bundles sont nommés par **uuid** :
  identité stable, aucune collision, le renommage ne touche que `index.json`. Le
  **nom affiché** (et son assainissement pour un système de fichiers) ne sert
  qu'à l'**export** et au dossier disque lié (\ref{sec:disk}).
- **Persistance.** Appeler `navigator.storage.persist()` pour passer le stockage
  en « persistant » et éviter l'éviction silencieuse sous pression disque.
- **Quota visible.** `navigator.storage.estimate()` alimente l'écran *Storage &
  quota* (cf. \ref{sec:surfaces}).
- **Intégrité.** Le SHA-256 reste l'outil interne d'intégrité et de
  déduplication ; il n'apparaît plus dans les références du document.

::: note
OPFS est le socle **universel** (marche partout). L'accès au disque réel
(\ref{sec:disk}) est une couche optionnelle, pas le socle.
:::

## 5. Les surfaces : menu File, Open…, Files… \label{sec:surfaces}

L'UI matérialise les deux lieux de \ref{sec:invariants} en deux surfaces
distinctes. Le menu `File` ne porte que les verbes du **document courant**, plus
deux portes vers la gestion.

```
File ▾
 New document          ⌘N
 Open…                 ⌘O      → sélecteur (§5.1)
 Files…               ⇧⌘O      → gestionnaire (§5.2)
 ──────────────
 Save                  ⌘S
 Save As…             ⇧⌘S
 Revert to saved
 ──────────────
 Rename…                       (le courant)
 Manage assets…                → Files… focalisé sur les assets du courant
 Export            ▸           (le courant)
 Share             ▸           (le courant)
 Print…                ⌘P
```

La toolbar se simplifie d'autant : les actuels `Mon doc ▾` / Importer / Exporter
fusionnent ici ; il ne reste qu'un **titre de document éditable** (clic =
renommer) à côté du menu.

### 5.1 Open… (sélecteur) \label{sec:open}

Intention : **ouvrir un document pour l'éditer.** Un mini-navigateur de la
bibliothèque — arbre des documents + recherche — où l'on sélectionne et où l'on
ouvre (double-clic ou bouton *Open*). **Aucun verbe de gestion** : pas de
renommer, supprimer, déplacer. C'est cette pureté qui le distingue de Files…
(c'est l'équivalent du panneau *Open* du système d'exploitation).

### 5.2 Files… (gestionnaire) \label{sec:files}

Intention : **gérer les fichiers et ressources**, comme le Finder. Un navigateur
complet de l'arborescence OPFS — documents **et**, en descendant dans un bundle,
ses `assets/`.

```
┌ Files ─────────────────────────────────────────┐
│ [New] [New folder] [Import…]        🔎 search    │
│ ▾ Specs/                                         │
│     Mon doc        ● (modifié)  ⟂ (externe)      │
│     Autre doc                                    │
│ ▾ Lettres/                                       │
│ ── Trash ▸  (restaurer)                          │
│                                                  │
│  clic droit sur un fichier →                     │
│    Open · Rename · Duplicate · Move to ·         │
│    Export · Share · Delete                       │
└──────────────────────────────────────────────────┘
```

- **Barre d'actions** : New, New folder, Import, recherche.
- **Menu contextuel** par fichier : Open, Rename, Duplicate, Move to, Export,
  Share, Delete.
- **Corbeille** avec restauration (cf. \ref{sec:robust}).
- **Badge « externe » (⟂)** sur un doc lié au disque (cf. \ref{sec:disk}) ;
  pastille « modifié » (●) si le doc a une copie de travail non validée.
- **`Manage assets…`** (du menu File) est un **raccourci** qui ouvre Files…
  directement sur les `assets/` du document courant — pas une modale séparée.

Les verbes à **double porte** (Rename, Duplicate, Export, Share, Delete) sont
invocables sur le courant via `File` *et* sur n'importe quel fichier via Files… ;
les deux respectent l'invariant (ils opèrent sur le validé), seul Save As
embarque le dirty.

## 6. Save, Save As, Revert \label{sec:save}

Le modèle **copie de travail** réifie l'invariant de \ref{sec:invariants}. Chaque
document a deux pointeurs de contenu :

```
DocEntry { committedSha, dirtySha? }   // dirty absent / = committed ⇒ doc propre
```

- **Autosave** écrit un blob et met à jour `dirtySha` — **jamais** `committedSha`.
  La version de départ reste donc intacte tant qu'on ne sauvegarde pas.
- **Save** : `committedSha ← dirtySha`. Pour un doc lié au disque, Save écrit
  aussi le bundle dans le dossier (cf. \ref{sec:disk}).
- **Save As** (option « je déplace mon travail ») : le contenu courant (dirty
  inclus) part dans un **nouveau** document B ; l'original A **redevient propre**
  (sa version validée intacte) ; on édite désormais B.
- **Revert to saved** : `dirtySha` est jeté, retour à `committedSha`.
- **Indicateur « modifié »** : `dirtySha && dirtySha !== committedSha`. `Save` et
  `Revert` ne sont actifs que dans cet état.

::: tip
Aucun pop-up « enregistrer avant de fermer ». Comme le dirty est auto-persisté,
on peut quitter et rouvrir : on retrouve la copie de travail avec l'indicateur.
Sémantique d'un Save explicite, **sans risque de perte ni nag**.
:::

## 7. Interop disque réel \label{sec:disk}

Couche optionnelle pour le vrai feeling « appli locale » : éditer des fichiers
que l'utilisateur voit dans son explorateur et versionne en git.

- **API** : File System Access (`showOpenFilePicker`, `showDirectoryPicker`,
  `showSaveFilePicker`). Les *handles* obtenus sont persistés (en OPFS/IndexedDB)
  pour survivre aux rechargements ; une **ré-autorisation** peut être demandée
  par le navigateur.
- **Verbes** : *Open from disk…* (ouvrir un `.md`/bundle du disque), *Link to a
  folder…* (lier un doc à un dossier — il devient un **miroir**), *Save to disk*
  (implicite dans Save pour un doc lié).
- **Miroir et divergences (façon git, résolution manuelle)** *(décidé)*. Un doc
  lié porte le **badge « externe »** ; markpage mémorise un *base* = le hash de la
  dernière synchro. Un **état** est calculé et **indiqué**, et l'utilisateur
  synchronise lui-même (markpage n'est pas un outil de fusion) :

  | État | Détection | Action |
  | :--- | :--- | :--- |
  | À jour | biblio = disque = base | — |
  | Local en avance ↑ | biblio ≠ base, disque = base | **Push** (Save écrit sur disque) |
  | Disque en avance ↓ | disque ≠ base, biblio = base | **Pull** (recharger du disque) |
  | Divergé ⚠ | les deux ≠ base | *prendre le disque* · *garder le mien* · *garder les deux* (dupliquer), avec un diff textuel pour aider |

  Pas de fusion 3-voies automatique en v1 : détection git-like, résolution
  manuelle.
- **Dégradation cross-browser.** Ces *pickers* sont **Chromium-only** ; sur
  Safari/Firefox les items disque sont **masqués**, OPFS restant le socle.

## 8. Ressources et cycle de vie \label{sec:resources}

La propriété par bundle (\ref{sec:bundle}) change radicalement le cycle de vie
des assets.

- **Opérations** (dans la vue assets de Files…, ou via `Manage assets…`) :
  lister (avec tailles), **remplacer**, **renommer**, repérer les **références
  cassées**, **élaguer** les assets inutilisés du bundle.
- **Cycle de vie local.** Un asset appartient à son bundle ; supprimer le
  document supprime ses assets. Plus de **GC global différé au boot**, plus de
  **course cut-paste / undo** : pendant l'édition, les refs vivent dans la copie
  de travail ; un asset n'est candidat à l'élagage que s'il n'est référencé ni
  par le `committed` ni par le `dirty` du bundle.
- **Déduplication.** Si le magasin de blobs interne est partagé entre bundles, il
  est **référence-compté** : un blob n'est physiquement supprimé que lorsque plus
  aucun bundle ne le référence. Invisible pour l'utilisateur.

## 9. Import, export, partage \label{sec:io}

- **Import** : `.md`, `.txt`, `.html`, `.docx`, **bundle `.zip`**. Pour un `.md`
  aux images relatives manquantes, conserver le prompt de résolution
  (multi-fichiers) ; pour un bundle, tout est déjà inclus. *Décidé* : **importer
  les images des `.docx`** — Mammoth les inline déjà en data-URI par défaut et le
  pipeline les hisse via `extractDataUrlsToStore` ; c'est donc quasi gratuit (le
  commentaire « dropped (MVP) » de `import.ts` est vraisemblablement périmé — à
  vérifier).
- **Export** : PDF (auto-contenu), LaTeX (`.zip` + `images/`), Markdown (un
  fichier, images en data-URL), **Bundle `.zip`** (`content.md` + `assets/`),
  HTML.
- **Partage** : lien (gzip+base64, **plafonné** ≈ 8 ko → au-delà, proposer le
  bundle), e-mail (`mailto:` avec le lien), OneDrive (upload du bundle / `.md`).

Le **bundle** devient l'unité d'échange auto-contenue de référence ; le lien
reste pour les petits documents.

## 10. Migration depuis l'existant \label{sec:migration}

Au premier démarrage sur la nouvelle version, convertir l'existant vers OPFS, de
façon **idempotente** (sur le modèle de la migration multi-docs §19 déjà faite) :

1. Pour chaque `DocEntry` (localStorage), créer un bundle OPFS
   `<nom>/content.md`.
2. Réécrire les références du contenu :
   - `img://<sha>` → copier le blob IndexedDB dans `assets/<nom>.<ext>` et
     référencer `assets/<nom>.<ext>` ;
   - chemins externes mappés → idem via le mapping `markpage:resources:mapping`.
3. Alimenter le magasin de blobs interne (référence-compté) à partir d'IndexedDB.
4. Marquer la migration faite ; ne plus relire les anciennes clés.

Les anciennes clés `localStorage` / la base IndexedDB sont conservées en filet de
sécurité, puis nettoyées seulement quand **les deux** conditions sont réunies :
≥ 7 jours depuis la migration **et** ≥ 2 démarrages réussis sur la nouvelle
version.

## 11. Robustesse et cas limites \label{sec:robust}

- **Crash-safety** : le `dirty` étant auto-persisté en OPFS, fermeture/onglet
  tué ⇒ on retrouve la copie de travail.
- **Multi-onglets** : deux onglets sur le même doc risquent de s'écraser.
  *Défaut retenu* : **détecter + avertir** (le second onglet passe en lecture
  seule) — minimum de code, zéro perte. Alternatives possibles plus tard : verrou
  (Web Locks API) ou synchro live (`BroadcastChannel`).
- **Quota dépassé** : intercepter l'erreur d'écriture OPFS, prévenir
  l'utilisateur, pointer vers *Storage & quota* (élaguer / vider la corbeille).
- **Zéro abandon silencieux** : signaler ce qui n'est pas porté (images `.docx`
  à l'import, chemins externes à l'export LaTeX) plutôt que de les perdre sans
  trace.

## 12. Hors périmètre et phases \label{sec:phases}

**Différé** : dossiers/tags riches (recherche plein-texte, tri manuel), miroir
disque temps réel (observation des changements externes), **fusion automatique
(3-voies)** des divergences disque (la détection git-like + résolution manuelle,
elle, est dans le périmètre — \ref{sec:disk}), partage collaboratif.

**Phases livrables** (chacune utile seule) :

1. **Socle OPFS + bundles + migration** — modèle de stockage, conversion de
   l'existant, références relatives. Pas de changement d'UI visible majeur.
   **✅ Fait (v0.21.0).** Images dans `library/.store/<sha>`, docs en bundles
   `library/<uuid>/content.md` + `index.json`, migrations IDB→OPFS et
   localStorage→OPFS idempotentes (ancien stockage gardé en filet), refs
   relatives `assets/<sha>.<ext>` (sha-nommées ; noms lisibles différés ;
   `img://` reconnu en rétro-compat), API docs async + repli localStorage.
2. **Copie de travail** — `committed`/`dirty`, Save / Save As / Revert,
   indicateur « modifié ». **✅ Fait (v0.22.0).** `DocEntry.dirtySha` +
   `<uuid>/draft.md` ; autosave → draft (le validé reste intact) ; Save = commit
   (`Cmd/Ctrl+S`), Revert, Save As (option a) ; pastille `●` sur le titre ;
   Save/Save As/Revert provisoirement dans le doc-menu (→ menu File en Phase 3).
3. **Surfaces** — menu `File` remanié, `Open…` (sélecteur), `Files…`
   (gestionnaire) + corbeille, `Manage assets…` en raccourci.
   **✅ Fait (v0.23.0).** Toolbar consolidée : `File ▾` + titre de doc éditable
   (remplace Mon doc / Importer / Exporter) ; `Open…` (`Cmd/Ctrl+O`) ; `Files…`
   (`Cmd/Ctrl+Shift+O`) gérant documents + **corbeille** (soft-delete /
   restaurer / supprimer définitivement / vider) ; le GC préserve les docs
   trashés. **Différés** : dossiers/hiérarchie et la **vue assets d'un doc**
   (`Manage assets…`).
4. **Interop disque** — Open from disk / Link to a folder / Save to disk
   (Chromium), badge externe. **✅ Fait (v0.24.0).** File System Access
   (`fsAccessAvailable` → items masqués hors Chromium) : `Open from disk…`
   (import one-shot d'un `.md`), `Link to a folder…` (écrit le bundle
   `content.md` + `assets/<sha>.<ext>` dans un dossier ; confirmation
   d'écrasement si non vide), **Save → push** vers le dossier lié,
   `Reload from disk…` (pull = commit propre du contenu disque), `Unlink`.
   Handle `FileSystemDirectoryHandle` persisté en IndexedDB (`markpage-fs`),
   permission RW re-demandée au premier Save/Reload après un reload d'onglet ;
   badge « externe » `⟂` sur le titre et dans `Files…`. **Différé (périmètre
   C)** : détection/fusion auto des divergences disque↔biblio (« façon git »),
   lien vers un fichier unique, noms d'assets lisibles, observation temps réel.
5. **Échange** — Import/Export bundle, partage par bundle.
