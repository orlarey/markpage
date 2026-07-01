# Handoff — convergence pile de documents ⇄ profils (STACK-SPEC §12)

> Note de reprise (pas une spec). But : reprendre le chantier « convergence »
> sur une autre machine sans perdre le contexte. Ce fichier voyage par git ;
> la mémoire `~/.claude` et la conversation Claude Code, elles, restent locales
> à la machine d'origine. **Supprimable une fois la convergence terminée** —
> ce qui est essentiellement le cas, voir plus bas.
>
> Dernière mise à jour : 2026-07-01 · branche `main` · app 0.35.0 · extension 0.1.8.

## TL;DR

Le chantier fait **converger** les deux systèmes d'apparence de markpage vers
un seul : la **pile de documents** (`extends` + clés pointées de front-matter)
**remplace** le système de **profils par-document** (le store sha-blob de
`settings-profiles.ts`). Voir [STACK-SPEC.md](STACK-SPEC.md) §12.

**État : l'Étape 1 est terminée.**
- Round-trip Réglages ⇄ feuille bouclé (lecture + écriture, commits `da4664f`/`93b1cec`).
- `state.settings` dérive de la pile du doc actif à chaque chargement/switch
  (plus de dépendance à un profil global arbitraire).
- Les documents existants ont été migrés (bake du profil actif dans un
  document-style partagé + `extends`).
- La gestion multi-profils (créer/renommer/dupliquer/supprimer/
  importer/exporter/switcher) et son UI ont été retirées.

Deux corrections importantes au plan d'origine, détaillées plus bas : (1) il
n'y avait qu'**un seul profil réel** dans cette install, avec de vraies
personnalisations, migré vers un document-style partagé ; (2) `saveProfileSettings`
**n'a pas été coupé** — il persiste toujours les réglages hors-pile (langue,
auteur, MathJax…) qui n'ont pas d'autre mécanisme de sauvegarde.

Reste, hors du cœur « convergence » : quelques points différés (voir en bas),
et un rough edge mineur noté mais pas corrigé (voir « Pièges »).

## Le problème qu'on résout

Historiquement markpage a **trois** mécanismes d'apparence qui se recouvrent mal :
Réglages, matrice Styles par-élément, et front-matter. Conséquence : un `.md`
**n'est pas autonome** — son rendu dépend du **profil actif** stocké à part
(localStorage, `settings-profiles.ts`). La pile résout ça : un style/template est
**un autre document** ; un doc `extends` son parent ; l'autonomie = **aplatir**
la pile en un `.md` auto-suffisant.

## Ce qui est FAIT

| Commit | Contenu |
|:--|:--|
| `456760d` | STACK-SPEC §12 « Convergence » — table de correspondance, Réglages-as-view, migration, mécanismes retirés |
| `da4664f` | **Lecture** : « Style parent » (`extends`) visible/éditable dans Réglages (item de rail groupe Document) |
| `93b1cec` | **Écriture** : bouger un curseur de Réglages écrit une clé pointée (`styles.h1.color: "#…"`, `page-size`, …) dans la feuille |
| `4f653e2` | **Dérivation** : `state.settings` dérivé de la pile du doc actif à chaque chargement/switch (`deriveSettingsForDoc`) |
| *(à commiter)* | **Migration + retrait UI multi-profils** : voir détail ci-dessous |

### Dérivation au chargement (commit `4f653e2`)

`deriveSettingsForDoc(source, current, resolveByName)` dans `stack-render.ts` :
flatten contre **`DEFAULT_SETTINGS`** (pas le profil actif) — une propriété de
style que la chaîne du doc ne précise pas retombe sur `default.md`, pas sur un
profil arbitraire. Ne touche que le sous-ensemble **style** (`fonts`, `styles`,
`pageSize`, `margins`, `marginMode`, `footer`) ; le reste de `current` (auteur,
langue, MathJax/mermaid…) passe tel quel — ces champs sont hors-scope de la
pile (`ProfilePatch` ne les couvre pas). Aucune feature de pile → retourne
`current` inchangé (fallback pré-migration).

Câblé dans `main.ts` à tous les points de chargement/switch de doc : boot,
`switchToDoc`, `createNewDoc`, `createNewDocFrom`, `changeParentStyle`,
`deleteAndAdjust`, `revertCurrentDoc`, `applyDiskContent` (chokepoint
pull/reload disque + GitHub + OneDrive), et le handler MCP `createDocument`
(piège trouvé en vérifiant en live : ce handler dupliquait la création de doc
sans passer par `createNewDoc`).

**Hors scope, sans régression** (ces sites ne touchaient déjà pas
`state.settings` avant) : créations de doc depuis un import externe qui ne
passent pas par `applyDiskContent` — partage (main.ts ~L346), import OneDrive
(~L1636), import GitHub (~L1702), import disque (~L1961), coller/style
(~L2117, ~L2737). Réglages y reste désynchronisé jusqu'au prochain switch/reload.

### Migration + retrait UI multi-profils (à commiter)

**Découverte en creusant les données réelles** (via les tools MCP `markpage`) :
il n'y avait **qu'un seul profil** (« Par défaut »), avec de vraies
personnalisations (A5, h1 rouge, police de code…) dont dépendaient **6 docs
sans aucune clé de style à eux**. D'où la migration, puis le retrait de la
gestion multi-profils devenue sans objet (plus qu'un seul profil, jamais
switché).

**Migration** (`planProfileMigration` dans `stack-render.ts`, fonction pure,
testée) : pour chaque profil dont le delta vs `DEFAULT_SETTINGS` est non vide,
crée un document-style (`writeStyleToLeaf('', settings, DEFAULT_SETTINGS)`,
nommé d'après le profil) ; pour chaque doc de la bibliothèque sans style à lui
(`usesStackFeatures` faux), lui donne `extends: <nom du style du profil
actif>`. Idempotent : un doc migré gagne `extends` → skip au run suivant ; un
nom de style déjà pris → réutilisé, jamais recréé. Câblée au boot dans
`main.ts`, même patron que la migration `migrateImagesToOpfs` déjà en place
(boucle `listDocs()` → `loadDocContent` → `saveDocContent`).

**Vérifié live** (MCP `markpage`, app relancée à froid) : les 6 docs ont
`extends: Par défaut` dans leur front-matter, `get_settings` renvoie
exactement les mêmes valeurs qu'avant migration (aucun changement de rendu,
juste de source) ; le document-style « Par défaut » contient le delta attendu.

**Correction n°2 — `saveProfileSettings` n'a pas été coupé.** `PdfSettings` a
des champs hors-pile (langue, auteur, organisation, date, MathJax, mermaid,
duplex, chapterBreak, measureChars/liveAreaChars, notes) que `writeStyleToLeaf`
ne touche pas — rien d'autre ne les persiste. Couper l'appel (comme prévu à
l'origine) aurait rendu ces réglages non-persistants à chaque reload. Donc
`handleSettingsChange` **est inchangé** : il continue d'appeler
`saveProfileSettings(state.profileId, s)`, qui sert désormais de **blob unique
et implicite** de persistance des réglages hors-pile (`state.profileId` est
fixé une fois pour toutes par `ensureActiveProfile`, plus jamais switché).
Vérifié live : changer l'auteur, recharger la page à froid → la valeur tient.

**UI retirée** : `src/ui/profile-menu.ts` supprimé ; le trigger `[Profil ▾]`
et `SettingsProfileHandlers` retirés de `src/ui/settings-form.ts` ;
`applyProfile`/`profileHandlers` retirés de `main.ts` ; `get_settings` MCP ne
renvoie plus de champ `profile`, `list_profiles` renvoie `[]`, `set_profile`
lève une erreur claire (tools MCP gardés en place mais rendus inertes, pour
qu'un client MCP plus ancien dégrade proprement plutôt que de taper sur un nom
d'outil inconnu). Dans `settings-profiles.ts`, les fonctions devenues
totalement mortes (`renameProfile`, `duplicateProfile`, `deleteProfile`,
`resetProfile`, `exportProfileJson`, `importProfileJson` + types associés)
supprimées ; `createProfile`/`uniqueName`/`gcProfileBlobs`/`setCurrentProfileId`
**gardés** (encore appelés en interne par `ensureActiveProfile`/
`saveProfileSettings`). CSS (`.profile-trigger`/`.profile-menu*`) et clés i18n
(`profile-menu.*`, `profile-import.*`, `default.new-profile-name`) retirées ;
`profile.default-name` gardée (`displayProfileName` toujours utilisée par la
migration).

Tests : `deriveSettingsForDoc` (5 cas) + `planProfileMigration` (4 cas) dans
`tests/stack-render.test.ts`. Suite complète 444 tests + typecheck verts.

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
  si le doc n'utilise **aucune** feature de pile (`usesStackFeatures`, exportée).
- `applyProfilePatch(settings, patch)` : replie un `ProfilePatch` dans `PdfSettings`.
- `deriveSettingsForDoc(source, current, resolveByName)` : `state.settings`
  dérivé de la pile (voir ci-dessus).
- `planProfileMigration(profiles, existingDocNames, docs)` : plan de migration
  (pure, voir ci-dessus) — probablement mort une fois toutes les installs
  migrées, mais inoffensif à garder (idempotent).
- `extractStyleFromSettings` : « Extraire un style » (delta profil actif vs défauts).
- `getExtendsFromSource` / `setExtendsInSource` : lecture/écriture ciblée d'`extends`.
- `setFrontmatterKeys(source, upserts, deletes)` : upsert/delete ciblé de clés
  (pointées incluses) sur le bloc front-matter, corps intact, crée le bloc si absent.
- `writeStyleToLeaf(source, settings, defaults)` : `normalize(settings)` −
  `normalize(defaults)` → upsert les écarts, delete les égalités. `customFonts`
  **exclu** (payload potentiellement lourd, géré par la machinerie des polices).

### Câblage rendu — `src/main.ts`
- `buildPreviewDom` : aplatit d'abord, applique `applyProfilePatch` sur les
  `effectiveSettings`. En mode continu, penser à `applyPreviewStyles(effectiveSettings)`.
- `handleSettingsChange(s)` : `state.settings = s` → `saveProfileSettings`
  (blob unique hors-pile, **volontairement gardé**) → `applyPreviewStyles` →
  `writeStyleToLeaf` + `editor.setValue` (garde `suppressEditorPreview`) →
  rendu ancré.
- `changeParentStyle` : picker `openNewFromModal` → `setExtendsInSource`.

### Précédence
Rendu = pile rootée sur `DEFAULT_SETTINGS` ⊕ chaîne `extends` ⊕ clés-feuille
(enfant gagne, S4). Les champs hors-pile viennent du blob unique de
`settings-profiles.ts`, indépendamment du doc actif.

### Store « profil » (simplifié, gardé) — `src/settings-profiles.ts`
Ce n'est plus un store *multi*-profils géré par l'utilisateur — juste la
persistance sha-blob d'**un seul** entry (créé une fois par `ensureActiveProfile`,
jamais switché) pour les réglages hors-pile. Exports restants :
`loadProfileSettings(uuid)`, `saveProfileSettings`, `ensureActiveProfile`,
`migrateLegacySettingsIfNeeded`, `listProfiles`/`getCurrentProfileId`/
`displayProfileName` (utilisés par la migration dans `main.ts`).

## Différés (notés, non commencés — hors cœur convergence)
- **`default.md` factory** : un vrai document racine éditable (aujourd'hui
  `defaultDoc()` synthétise la racine depuis `DEFAULT_SETTINGS` — cf. commentaire
  « transitional » dans `stack-render.ts`). La racine devrait devenir un doc de
  bibliothèque réel, fixpoint (`extends: default`).
- **Export autonome + assets** : `flatten` à l'export → un `.md` auto-suffisant
  (+ images matérialisées). Lien avec le plan disque `docs`… (File System Access).
- **Extension VS Code** : parité `extends` cross-fichier (aujourd'hui
  `vscode/src/webview/preview.ts` fait `profileFromStack` mais ne résout pas les
  `extends` par nom vers d'autres fichiers du workspace).
- **Partage / catalogue de styles** : cf. mémoire `project_roadmap_styles_sharing`.
- **« Réinitialiser le style du document »** : pas de bouton UI aujourd'hui
  (l'ancien "Réinitialiser" du menu profil retiré n'a pas d'équivalent). Le
  geste existe et est testé : `writeStyleToLeaf(src, DEFAULT_SETTINGS, DEFAULT_SETTINGS)`.

## Comment vérifier (rappels de la boucle de dev)

- **Unit** : `npx vitest run` (444 tests). Les tests de pile :
  `tests/stack.test.ts`, `tests/stack-render.test.ts`. Vitest résout
  `@orlarey/markpage-render` vers `src/` via la condition d'export `development`.
- **Typecheck** : `npm run typecheck`. L'extension/app lisent
  `packages/markpage-render/dist/index.d.ts` → si tu changes le moteur, rebuild :
  `npm run build --workspace @orlarey/markpage-render` (le `dist/` est gitignoré).
- **e2e** : `npx playwright test` (43, webServer auto sur :5173). Contenu éditeur
  via presse-papier (`.cm-content` → Ctrl+a → Ctrl+v), aperçu via bouton « Aperçu ».
- **Live (MCP Playwright, popup Réglages)** : Réglages s'ouvre en **fenêtre
  détachée** (popup = onglet séparé, `about:blank` puis le formulaire) →
  piloter via `browser_tabs` (onglet 1 = popup, onglet 0 = appli). Un contrôle
  **doc** (rail « Titre 1 (h1) » etc.) déclenche `handleSettingsChange` ; un
  contrôle **appli** (interface) non. Vérifier `editor.getValue()` dans l'onglet 0.
- **Live sans passer par la popup Réglages** : le serveur MCP `markpage`
  (`src/mcp/`, tools `mcp__markpage__*`) est plus direct — `get_settings` lit
  `state.settings` tel quel, `create_document`/`open_document`/
  `delete_document`/`revert_document` pilotent la bibliothèque sans clic DOM.
  Piège : `npm run dev` doit tourner (`:5173`) ET l'app être ouverte avec
  `?mcp=ws://127.0.0.1:7878/ws` — si un autre onglet Playwright MCP tourne déjà
  (autre fenêtre Claude Code), la navigation échoue avec « Browser is already
  in use » ; fermer l'autre session avant de retenter.

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
- **Migration liée à un nom, pas un identifiant stable** : `planProfileMigration`
  identifie « déjà migré » par le **nom** du profil (`displayName`). Si le nom
  résolu change entre deux runs (ex. clé i18n cassée puis réparée pendant un
  dev en cours), un nouveau document-style parasite est créé au nom
  différent — rencontré et nettoyé pendant cette session (docs
  `profile.default-name`/`Default` créés par erreur, supprimés). Pas un
  problème en usage normal (le nom est stable), mais à savoir si on retouche
  `planProfileMigration` ou les clés i18n de `profile.default-name`.
- **Redondance bénigne** : `handleSettingsChange` écrit **toujours** le delta
  complet de style sur la feuille active (`writeStyleToLeaf`), même si elle
  `extends` déjà un parent qui fournit la même valeur — donc toucher N'IMPORTE
  QUEL contrôle Réglages (même un champ hors-pile comme l'auteur) peut dupliquer
  des clés déjà héritées sur le doc ouvert. Harmless (valeurs identiques,
  juste du bruit dans le front-matter) — comportement voulu et documenté (S4 :
  la feuille gagne), pas quelque chose à corriger.
- **Commits** : finir par `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` ;
  corps de PR par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Point d'entrée à la reprise

L'Étape 1 (convergence pile ⇄ profils) est **fonctionnellement terminée** :
round-trip, dérivation, migration, retrait UI — tout vérifié live. Reste :

1. **Commiter** ce lot (migration + retrait UI) si ce n'est pas déjà fait.
2. Éventuellement attaquer un des points « Différés » ci-dessus si utile
   (aucun n'est bloquant ni urgent).
3. Ce fichier peut être supprimé une fois le commit passé — la convergence
   proprement dite n'a plus d'étape en attente.
