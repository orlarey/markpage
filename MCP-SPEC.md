# markpage MCP — specification

> **Statut :** livré (v0.29.0) · contrat `mcp/tools.json` `contractVersion` **0.1.0**

Cette spec décrit l'extension **MCP** (Model Context Protocol) de markpage :
un moyen pour une IA (Claude Desktop / Claude Code) de **piloter l'application
markpage qui tourne dans le navigateur de l'utilisateur** — lire et écrire le
document courant, basculer les vues, lister les erreurs de rendu, gérer la
bibliothèque, exporter, et consulter le guide de rédaction.

Elle s'inspire fidèlement de l'architecture éprouvée de **faustcode**
(`../faustcode`, `MCP-SPEC.md`) : un **pont Go** parle MCP en stdio au client et
expose un **serveur WebSocket local** auquel **un onglet vivant** de la webapp se
connecte. Le pont relaie chaque appel d'outil à l'onglet, qui l'exécute dans la
page et renvoie le résultat.

## Règle d'or

> **Pour chaque action qu'un humain peut faire dans la webapp markpage, quel
> outil MCP permet à une IA de produire le même effet ?**

Tout outil doit correspondre à une capacité réelle de l'app (un bouton, un menu,
un raccourci, un état observable). On n'invente pas de capacités côté pont ;
on **expose** celles de la webapp.

## Architecture

```
 ┌────────────────┐   stdio (JSON-RPC / MCP)   ┌──────────────────┐   WebSocket    ┌────────────────────┐
 │  Client MCP    │ ─────────────────────────▶ │  Pont Go         │ ◀────ws://────▶ │  Onglet markpage    │
 │ (Claude …)     │ ◀───────────────────────── │  markpage-mcp    │  127.0.0.1:7878 │  (navigateur)       │
 └────────────────┘   tools/list · tools/call  └──────────────────┘   1 onglet =    └────────────────────┘
                                                  embarque tools.json   « la place »    exécute dans la page
```

- **Pont Go** (`mcp/`, binaire `markpage-mcp`) : serveur MCP stdio (SDK Go
  `github.com/modelcontextprotocol/go-sdk`) + serveur WS sur `127.0.0.1:7878`
  (loopback uniquement). Embarque `tools.json` (`//go:embed`) — tous les outils
  sont déclarés au démarrage (le catalogue MCP est figé à l'ouverture de la
  conversation). Valide entrées/sorties contre les schémas JSON du contrat.
- **Onglet markpage** : un client WS (`src/mcp/ws-client.ts`) + un répartiteur
  (`src/mcp/handlers.ts`) qui appelle directement les fonctions de l'app via un
  **contexte MCP** (`McpContext`) que `main.ts` peuple au démarrage.
- **Une seule place** : si un nouvel onglet se connecte, l'ancien reçoit une
  trame de fermeture WS code **4001** `superseded-by-new-tab` et cesse de se
  reconnecter.

### Pourquoi pas d'`api-shim` ni de `pollState` (différence avec faustcode)

faustcode avait un *shim* `fetch('/api/*')` et une boucle `pollState` (~1,5 s)
parce que sa webapp parlait à l'origine à un **serveur**. markpage n'a pas cette
couche : les handlers MCP appellent **directement** les fonctions de l'app
(`editor.setValue`, `setViewMode`, `listDocs`, …) via le `McpContext`, puis
déclenchent le re-rendu. L'UI est donc synchronisée sans polling. Le `McpContext`
est l'unique point de couplage entre `src/mcp/` et le reste de l'app.

### Flux d'un appel d'outil

1. Client MCP → `tools/call {name, arguments}` (stdio).
2. Pont Go valide `arguments` contre `inputSchema`, génère un `id` (UUID), envoie
   `WsReq {kind:"req", id, op, args}` à l'onglet.
3. Onglet : `dispatch(req)` → handler → fonction de l'app → résultat.
4. Onglet → `WsResp {kind:"resp", id, ok, result|error}`.
5. Pont corréle par `id`, valide `result` contre `outputSchema`, répond au client.

**Dégradations** (codes d'erreur renvoyés au client) :

| code                  | quand                                                        |
| :-------------------- | :---------------------------------------------------------- |
| `no_webapp`           | aucun onglet connecté → inviter à ouvrir markpage puis réessayer |
| `webapp_disconnected` | l'onglet s'est fermé pendant l'appel                        |
| `timeout`             | pas de réponse sous 60 s                                    |
| `op_unknown`          | outil non implémenté côté onglet / handler a levé           |
| `bad_response`        | la réponse de l'onglet échoue la validation de schéma       |
| `contract_mismatch`   | token invalide ou major de contrat incompatible             |

### Protocole WS (résumé)

`hello` (pont→onglet) → `ready` (onglet→pont, avec `token?`) → puis `req`/`resp`
corrélés par `id`, plus `ping`/`pong`. Identique à faustcode (voir son
`SPECIFICATION.md`). Paramètres d'URL de la webapp : `?mcp=ws://127.0.0.1:7878/ws`
(auto-connexion) et `?token=…` (secret partagé optionnel, passé à `-token` du pont).

## Outils (v1, périmètre complet A–F)

📺 = nécessite l'onglet vivant · 🧩 = pur (servi par le binaire Go, sans onglet)

### A. Document courant 📺

| Outil              | Effet                                              | Fonction app (réf.) |
| :----------------- | :------------------------------------------------- | :------------------ |
| `get_document`     | markdown courant (copie de travail)                | `editor.getValue()` / `loadDocContent` (docs.ts:371) |
| `set_document`     | remplace tout le markdown + re-rendu               | `editor.setValue` (editor.ts:226) + `saveDraft` + `updatePreview` |
| `insert_text`      | insère au curseur (ou en fin si pas de sélection)  | `editor.view.dispatch` (transaction CM6) |

### B. Bibliothèque 📺

| Outil              | Effet                                | Fonction app |
| :----------------- | :----------------------------------- | :----------- |
| `list_documents`   | docs actifs (+ corbeille via `trash`)| `listDocs` / `listTrash` (docs.ts:314/321) |
| `open_document`    | ouvre un doc (uuid) dans l'éditeur   | `setCurrentDocId` + chargement (docs.ts:334) |
| `create_document`  | nouveau doc (nom, contenu initial)   | `createDoc` (docs.ts:518) |
| `rename_document`  | renomme                              | `renameDoc` (docs.ts:542) |
| `delete_document`  | corbeille (soft-delete)              | `deleteDoc` (docs.ts:567) |
| `restore_document` | restaure depuis la corbeille         | `restoreDoc` (docs.ts:589) |
| `save_document`    | commit la copie de travail           | `commitDoc` (docs.ts:433) |
| `revert_document`  | annule les modifs non commitées      | `revertDoc` (docs.ts:467) |
| `get_state`        | doc actif, vue, nb pages, `isModified`, lien disque | `resolveCurrentDoc`, view, `isModified` (docs.ts:78) |

### C. Vues, rendu & erreurs 📺 (cœur de valeur)

| Outil               | Effet                                          | Fonction app |
| :------------------ | :--------------------------------------------- | :----------- |
| `set_view`          | `editor` \| `preview` \| `presentation`        | `enterEditor`/`enterPreview`/`enterPresentation` (main.ts:540/522/672) |
| `get_render_errors` | liste les erreurs après rendu (voir ci-dessous)| scan DOM du `#preview-pane` |
| `get_page_count`    | nombre de pages paginées                       | `querySelectorAll('.pagedjs_page').length` |
| `get_block_svg`     | SVG d'un bloc rendu par index/type             | `.chart-svg`/`.bda-svg`/`.category-svg`/… (preview-paginated.ts:1476+) |

**`get_render_errors`** agrège, après pagination, les marqueurs DOM :

- maths invalides : `.math-error` (+ `.math-error-msg`) — preview.ts:175/259
- références croisées cassées : `span.xref-broken` (`[?]`) — marked-config.ts:1016
- blocs de fence en erreur : bloc rouge (chart/bda/category/mermaid/…)
- images manquantes : `img` dont le `img://<sha>` n'a pas de blob
- débordement de page : page dont le contenu dépasse (heuristique paged.js)

Chaque erreur : `{ kind, message, context? }`. Une liste vide = document propre.

### D. Export 📺

| Outil              | Effet                                            | Fonction app |
| :----------------- | :----------------------------------------------- | :----------- |
| `export_markdown`  | markdown autonome (refs image → data: URLs)      | `refifyImageUrls`→`expandRefsToDataUrls` (image.ts:592/390) → renvoyé en texte |
| `export_latex`     | `.tex` (+ ressources) écrit en fichier → `path`  | `exportLatex` (export-latex.ts:43) → écrit dans `$TMPDIR` par le pont, renvoie `path` (motif `render_audio`) |
| `export_pdf`       | déclenche l'export PDF (dialogue d'impression)   | `exportViaPrint` (print-export.ts:36) — **semi-manuel** : ouvre le dialogue système ; renvoie `{ started: true }` |

> `export_pdf` ne peut pas être pleinement automatisé (dialogue d'impression
> natif). L'outil lance le flux et le signale ; pour un PDF programmatique,
> préférer `export_latex` (chaîne LaTeX) ou laisser l'utilisateur valider le
> dialogue.

### E. Réglages 📺

| Outil           | Effet                                  | Fonction app |
| :-------------- | :------------------------------------- | :----------- |
| `get_settings`  | profil actif + `PdfSettings` résolus   | `resolveCurrentProfile` + `loadProfileSettings` (settings-profiles.ts:175/300) |
| `list_profiles` | profils de style disponibles           | `listProfiles` (settings-profiles.ts:106) |
| `set_profile`   | active un profil (uuid)                | `setCurrentProfileId` (settings-profiles.ts:166) + re-rendu |

### F. Authoring 🧩 (pur — analogue des outils « doc Faust »)

| Outil                 | Effet                                          | Source |
| :-------------------- | :--------------------------------------------- | :----- |
| `get_authoring_guide` | renvoie AI-AUTHORING.md (guide de rédaction)   | embarqué dans le binaire (`//go:embed`) |
| `get_fence_syntax`    | renvoie SYNTAX.md (`@orlarey/blocks`)          | embarqué dans le binaire |
| `validate_fence` 📺   | rend un bloc via `@orlarey/blocks` ; OK/erreur | `renderBlock` (packages/blocks/registry.ts:41) — exécuté dans l'onglet |

> `get_authoring_guide` / `get_fence_syntax` sont **purs** : le binaire embarque
> les fichiers et répond sans onglet (comme les outils de doc Faust). Seul
> `validate_fence` a besoin de l'onglet (il exécute le renderer JS).

## Contrat `tools.json`

```jsonc
{
  "contractVersion": "0.1.0",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": { /* Uuid, View, DocEntry, RenderError, … */ },
  "tools": [
    { "name": "get_document", "description": "…",
      "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
      "outputSchema": { "type": "object", "properties": { "markdown": {"type":"string"}, "uuid": {"$ref":"#/$defs/Uuid"} }, "required": ["markdown"] } },
    /* … */
  ]
}
```

Source unique : `mcp/tools.json` (embarqué). `$defs` partagés injectés dans
chaque schéma avant compilation (résolution des `$ref`).

## Sécurité

- WS lié à **127.0.0.1** uniquement (pas `0.0.0.0`) — pas de contrôle d'origine.
- `-token` optionnel : secret partagé, comparé au champ `token` du `ready`.
- Gros artefacts (`.tex`/zip) : écrits dans `$TMPDIR/markpage-mcp/`, renvoyés
  par **chemin** (jamais en base64 dans le contexte de l'IA) — motif
  `render_audio` de faustcode.
- Le pont fait confiance à l'onglet (pas d'isolation type CORS).

## Build & distribution

- `mcp/Makefile` : `make build` → `markpage-mcp` ; `make test` ; `make probe`
  (e2e : faux onglet + binaire + client MCP). `tools.json` synchronisé/embarqué.
- Install côté utilisateur : `claude mcp add markpage /chemin/markpage-mcp`,
  puis ouvrir `…/markpage/?mcp=ws://127.0.0.1:7878/ws` dans Chrome.

## Hors périmètre (différé)

Lien disque piloté par MCP (Phase 4 reste manuelle) ; édition multi-document
simultanée ; observation temps réel ; rendu PDF 100 % automatique (dialogue
d'impression natif).
