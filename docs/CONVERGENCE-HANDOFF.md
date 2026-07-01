# Handoff — convergence pile de documents ⇄ profils (STACK-SPEC §12)

> Note de reprise (pas une spec). But : reprendre le chantier « convergence »
> sur une autre machine sans perdre le contexte. Ce fichier voyage par git ;
> la mémoire `~/.claude` et la conversation Claude Code, elles, restent locales
> à la machine d'origine. **Supprimable une fois la convergence terminée.**
>
> Dernière mise à jour : 2026-07-01 · branche `main` · app 0.35.0 · extension 0.1.8
> · dernier commit : dérivation `state.settings` (voir §12.1 ci-dessous, pas encore commité).

## TL;DR

On fait **converger** les deux systèmes d'apparence de markpage vers un seul :
la **pile de documents** (`extends` + clés pointées de front-matter) doit
**remplacer** le système de **profils par-document** (le store sha-blob de
`settings-profiles.ts`). Voir [STACK-SPEC.md](STACK-SPEC.md) §12.

État : le **round-trip Réglages ⇄ feuille est bouclé** (lecture + écriture),
et **`state.settings` dérive maintenant de la pile** à chaque
chargement/switch de doc (Étape 1, sous-étape 1 — voir détail plus bas). Reste
à **couper `saveProfileSettings`** (le store de profils tourne encore en
parallèle) puis **migrer les docs existants** et **retirer l'UI de profils**.

## Le problème qu'on résout

Historiquement markpage a **trois** mécanismes d'apparence qui se recouvrent mal :
Réglages, matrice Styles par-élément, et front-matter. Conséquence : un `.md`
**n'est pas autonome** — son rendu dépend du **profil actif** stocké à part
(localStorage, `settings-profiles.ts`). La pile résout ça : un style/template est
**un autre document** ; un doc `extends` son parent ; l'autonomie = **aplatir**
la pile en un `.md` auto-suffisant. Le profil par-doc devient redondant → on le
retire.

## Ce qui est FAIT

| Commit | Contenu |
|:--|:--|
| `456760d` | STACK-SPEC §12 « Convergence » — table de correspondance, Réglages-as-view, migration, mécanismes retirés |
| `da4664f` | **Lecture** : « Style parent » (`extends`) visible/éditable dans Réglages (item de rail groupe Document) |
| `93b1cec` | **Écriture** : bouger un curseur de Réglages écrit une clé pointée (`styles.h1.color: "#…"`, `page-size`, …) dans la feuille |
| *(non commité)* | **Étape 1, sous-étape 1 — dérivation au chargement** : `state.settings` (donc le panneau Réglages) dérive maintenant de la pile du doc actif à chaque switch/création/suppression/revert/pull, au lieu de suivre le profil global. Détail en §12.1 bis ci-dessous. |

Le **round-trip §12.1 est donc bouclé** :
- Réglages **montre** le parent (`getExtendsFromSource`) et le laisse changer via
  un picker (`changeParentStyle` → `setExtendsInSource`).
- Un changement de contrôle **écrit** dans la feuille (`writeStyleToLeaf` →
  `setFrontmatterKeys`) le delta vs défauts ; un contrôle remis au défaut
  **supprime** sa clé. Vérifié live : h1 → `styles.h1.color: "#cc0044"`, rendu
  cohérent (h1 rendu en `rgb(204,0,68)`).

⚠️ **Transitoire** : le profil par-doc est **toujours sauvé en parallèle**
(`saveProfileSettings` dans `handleSettingsChange`). Les deux concordent (le
patch de pile = le delta du profil), donc pas de bug — mais c'est **la double
source qu'il reste à supprimer** (étape 1 ci-dessous).

### Étape 1, sous-étape 1 — dérivation au chargement (faite, non commitée)

`state.settings` (donc tout ce que Réglages affiche/édite) est maintenant
**dérivé de la pile du document actif** à chaque chargement/switch, plutôt que
de suivre le seul profil global — via une nouvelle fonction
**`deriveSettingsForDoc(source, current, resolveByName)`** dans `stack-render.ts` :

- Flatten contre **`DEFAULT_SETTINGS`** (pas `current`) : une propriété de
  style que la chaîne du doc ne précise pas retombe sur `default.md`, pas sur
  le profil actif arbitraire — c'est le cœur du fix. Vérifié live (MCP
  Playwright) : un doc `extends: Style-A` avec un seul `styles.h1.color`
  personnalisé montre bien `h2` = la couleur d'usine, pas celle (différente)
  du profil « Par défaut » alors actif.
- Aucune feature de pile (`extends`/clé pointée) → retourne `current`
  inchangé — fallback pré-migration (§12.2, toujours pas fait).
- Ne touche que le sous-ensemble **style** (`fonts`, `styles`, `pageSize`,
  `margins`, `marginMode`, `footer`) ; tout le reste de `current` (auteur,
  langue, réglages MathJax/mermaid…) passe tel quel — ces champs ne font pas
  partie de la pile (hors scope §12, `ProfilePatch` ne les couvre pas).
- Erreur de flatten (cycle, parent manquant) → fallback `current` +
  `console.warn`, même style que `buildPreviewDom`.

Câblé dans `main.ts` à **tous les points de chargement/switch de doc** : boot,
`switchToDoc`, `createNewDoc`, `createNewDocFrom`, `changeParentStyle`,
`deleteAndAdjust`, `revertCurrentDoc`, `applyDiskContent` (chokepoint
pull/reload disque + GitHub + OneDrive), et le handler MCP `createDocument`
(**piège trouvé en vérifiant en live** : ce handler duplique la création de
doc sans passer par `createNewDoc` — il a fallu le patcher séparément).
`refreshSettingsForm?.()` ajouté partout où il manquait, pour qu'un Réglages
ouvert se resynchronise sur le nouveau doc.

**Hors scope de ce lot** (pas de régression — ces sites ne touchaient déjà pas
`state.settings` avant) : les créations de doc depuis un import externe qui ne
passent pas par `applyDiskContent` — partage (main.ts ~L346), import OneDrive
(~L1636), import GitHub (~L1702), import disque (~L1961), coller/style
(~L2117, ~L2737). Réglages y reste temporairement désynchronisé jusqu'au
prochain switch/reload.

Tests : `deriveSettingsForDoc` dans `tests/stack-render.test.ts` (5 cas :
fallback sans pile, root=défauts pas profil actif, champs non-style
préservés, héritage via `extends`, fallback sur chaîne cassée). Suite complète
440 tests + typecheck verts.

## Architecture actuelle (pour comprendre avant de toucher)

### Moteur pur — `packages/markpage-render/src/stack.ts`
Fonctions clés : `parseStackDoc` / `serializeStackDoc`, `resolveChainAsync`,
`mergeFrontmatter` (merge plat, enfant gagne, + passe de reset), `foldBodies`
(insertion via ` ```insert `), `flatten`, `resolveTokens` (`var(--x)`),
`normalizeProfile(json)` → `Map<cléPointée, scalaireYAML>` et son inverse
`denormalizeProfile(fm)` → `ProfilePatch`. `ROOT_NAME = 'default'`.
Le front-matter interne est un `Map<string,string>` (valeurs = scalaires YAML
**déjà sérialisés** : chaînes entre guillemets via `quoteScalar`, nombres/bools
bruts, `margins` = `"t r b l"`).

### Glue appli — `src/stack-render.ts`
- `flattenForRender(source, {settings, resolveByName})` → `{md, patch}` ou `null`
  si le doc n'utilise **aucune** feature de pile (`usesStackFeatures` : gate qui
  garantit un rendu byte-identique aux docs sans pile).
- `applyProfilePatch(settings, patch)` : replie un `ProfilePatch` dans `PdfSettings`.
- `extractStyleFromSettings` : « Extraire un style » (delta profil actif vs défauts).
- `getExtendsFromSource` / `setExtendsInSource` : lecture/écriture ciblée d'`extends`.
- **`setFrontmatterKeys(source, upserts, deletes)`** : upsert/delete ciblé de clés
  (pointées incluses) sur le bloc front-matter, corps intact, crée le bloc si absent.
- **`writeStyleToLeaf(source, settings, defaults)`** : `normalize(settings)` −
  `normalize(defaults)` → upsert les écarts, delete les égalités. `customFonts`
  **exclu** (payload potentiellement lourd, géré par la machinerie des polices).

### Câblage rendu — `src/main.ts`
- `buildPreviewDom` : aplatit d'abord, applique `applyProfilePatch` sur les
  `effectiveSettings`. En mode continu, penser à `applyPreviewStyles(effectiveSettings)`.
- `handleSettingsChange(s)` (~ligne 2015) : `state.settings = s` →
  `saveProfileSettings` (transitoire) → `applyPreviewStyles` → **`writeStyleToLeaf`
  + `editor.setValue`** (garde `suppressEditorPreview` pour éviter le double
  rendu) → rendu ancré.
- `changeParentStyle` (~ligne 1150) : picker `openNewFromModal` → `setExtendsInSource`.

### Précédence (important)
Rendu = `profil (base)` ⊕ `patch de pile`. Dans le patch, **enfant gagne** sur
parent (S4). Donc aujourd'hui, ordre effectif : **clés-feuille > parent(`extends`)
> profil**. Après retrait du profil (étape 1), la feuille devient la base ET le
sommet → cohérent avec la spec (enfant gagne). Pour un doc **sans `extends`**,
écrire les clés-feuille est **neutre au rendu** (clés-feuille = profil). Seul un
doc **avec `extends`** voit une clé partagée passer de *parent-gagne* à
*feuille-gagne* — c'est **voulu** (S4).

### Store de profils (à retirer) — `src/settings-profiles.ts`
Profils nommés, stockage sha-blob (`markpage:settings-profiles:index` /
`:blob:<sha>` / `:current`). Exports : `loadProfileSettings(uuid)`,
`saveProfileSettings`, `listProfiles`, `getCurrentProfileId`/`setCurrentProfileId`,
`resolveCurrentProfile`, `renameProfile`, `duplicateProfile`, `deleteProfile`,
`gcProfileBlobs`, `exportProfileJson`, `displayProfileName`.
Points de contact dans `src/main.ts` : `409` (chargement au boot),
`2026` (save dans handleSettingsChange), `2316-2317` (switch de profil),
`2327` (`getCurrentProfileId`), `2357-2397` (UI profils : reset/export/rename).
`state.settings` = le profil du doc ; `state.profileId` = son uuid.

## Ce qui RESTE (dans l'ordre)

### Étape 1, sous-étape 2 — couper `saveProfileSettings`
La dérivation au chargement est faite et vérifiée live (ci-dessus). Reste :
- `handleSettingsChange` (main.ts, cherche `saveProfileSettings`) n'appelle
  **plus** `saveProfileSettings` ; seul `writeStyleToLeaf` persiste (déjà en
  place, inchangé).
- Avant de couper : s'assurer que **tout doc encore stylé uniquement via le
  profil** (jamais passé par Réglages depuis qu'il existe) a été **migré**
  (Étape 2 ci-dessous) — sinon son style disparaît au premier chargement après
  la coupe (plus de fallback `loadProfileSettings` dans `deriveSettingsForDoc`
  une fois le store retiré). C'est le **garde-fou** : migrer avant de couper,
  pas l'inverse.
- **UI** : neutraliser/retirer le sélecteur de profils (rail « Application » ?),
  reset/export/rename profil (`profileHandlers` dans main.ts, ~L2330-2410) —
  décider ce qui devient « réinitialiser le style du document » (= effacer les
  clés pointées de la feuille via
  `writeStyleToLeaf(src, DEFAULT_SETTINGS, DEFAULT_SETTINGS)`, déjà testé).
- **Risque** : élevé — touche la sauvegarde de TOUT doc, et retirer l'UI est
  visible pour l'utilisateur. Vérifier live avant de commiter.

### Étape 2 — Migrer les docs existants
Les docs actuels ont leur style **uniquement** dans le profil sha-blob, pas dans
le `.md`. Avant de couper le store : au chargement d'un doc **sans clés de style
dans son front-matter**, appliquer `writeStyleToLeaf(contenu,
loadProfileSettings(uuid), DEFAULT_SETTINGS)` une fois (bake du profil dans la
feuille), puis marquer migré. Idempotent (la 2e fois, delta = ∅). Voir STACK-SPEC
§12.2.

### Différés (notés, non commencés)
- **`default.md` factory** : un vrai document racine éditable (aujourd'hui
  `defaultDoc()` synthétise la racine depuis les settings actifs — cf. commentaire
  « transitional » dans `stack-render.ts` ~ligne 85). La racine devrait devenir un
  doc de bibliothèque réel, fixpoint (`extends: default`).
- **Export autonome + assets** : `flatten` à l'export → un `.md` auto-suffisant
  (+ images matérialisées). Lien avec le plan disque `docs`… (File System Access).
- **Extension VS Code** : parité `extends` cross-fichier (aujourd'hui
  `vscode/src/webview/preview.ts` fait `profileFromStack` mais ne résout pas les
  `extends` par nom vers d'autres fichiers du workspace).
- **Partage / catalogue de styles** : cf. mémoire `project_roadmap_styles_sharing`.

## Comment vérifier (rappels de la boucle de dev)

- **Unit** : `npx vitest run` (440 tests). Les tests de pile :
  `tests/stack.test.ts`, `tests/stack-render.test.ts`. Vitest résout
  `@orlarey/markpage-render` vers `src/` via la condition d'export `development`.
- **Typecheck** : `npm run typecheck`. L'extension/app lisent
  `packages/markpage-render/dist/index.d.ts` → si tu changes le moteur, rebuild :
  `npm run build --workspace @orlarey/markpage-render` (le `dist/` est gitignoré).
- **e2e** : `npx playwright test` (43, webServer auto sur :5173). Contenu éditeur
  via presse-papier (`.cm-content` → Ctrl+a → Ctrl+v), aperçu via bouton « Aperçu ».
- **Live (MCP Playwright)** : Réglages s'ouvre en **fenêtre détachée** (popup =
  onglet séparé, `about:blank` puis le formulaire) → piloter via `browser_tabs`
  (onglet 1 = popup, onglet 0 = appli). Un contrôle **doc** (rail « Titre 1 (h1) »
  etc.) déclenche `handleSettingsChange` ; un contrôle **appli** (interface) non.
  Vérifier ensuite `editor.getValue()` dans l'onglet 0.
- **Live sans passer par la popup Réglages** : le serveur MCP `markpage`
  (`src/mcp/`, tools `mcp__markpage__*`) est plus direct pour vérifier
  `state.settings` — `get_settings` le lit tel quel (`ctx.getSettings()` dans
  main.ts). `create_document`/`open_document`/`delete_document` pilotent la
  bibliothèque sans clic DOM. Piège : `npm run dev` doit tourner (`:5173`) ET
  l'app être ouverte avec `?mcp=ws://127.0.0.1:7878/ws` — si un autre onglet
  Playwright MCP tourne déjà (autre fenêtre Claude Code), la navigation échoue
  avec « Browser is already in use » ; fermer l'autre session avant de retenter.

## Pièges connus (déjà rencontrés)

- **YAML `#`** : une couleur `#rrggbb` **doit** être entre guillemets
  (`color: "#fff"`), sinon `#` = commentaire → valeur `null`. `normalizeProfile`
  s'en charge (`quoteScalar`).
- **marked-core** : deux fences inline ` ```x ` dans un même paragraphe cassent
  l'emphase — dans la prose, écrire les noms de fence **nus** (`insert`, pas
  ` ```insert `). Règle notée dans `AI-AUTHORING.md`.
- **Bridge MCP markpage** : nécessite d'ouvrir l'appli avec
  `?mcp=ws://127.0.0.1:7878/ws` (sinon `no_webapp`).
- **i18n** : `EN: Record<keyof typeof FR, string>` — toute clé FR doit exister en EN
  (`src/i18n/strings.ts`).
- **Commits** : finir par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` ;
  corps de PR par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Point d'entrée à la reprise

1. Relire STACK-SPEC §12 et la section « Étape 1, sous-étape 1 » ci-dessus
   (dérivation au chargement — faite, non commitée).
2. **Commiter** la sous-étape 1 si ce n'est pas déjà fait (relire le diff de
   `src/stack-render.ts` / `src/main.ts` / `tests/stack-render.test.ts` d'abord).
3. Vérifier qu'il n'existe pas de doc réel encore stylé **uniquement** via le
   profil (jamais passé par Réglages) — sinon migrer (Étape 2) avant de couper
   `saveProfileSettings` (sous-étape 2), sous peine de perte de style silencieuse.
4. Attaquer la **sous-étape 2** (couper `saveProfileSettings` + UI de profils),
   en vérifiant live à chaque étape comme pour la sous-étape 1.
