# markpage-mcp

Local MCP bridge that lets an AI client (Claude Desktop / Claude Code) drive the
**markpage** webapp running in your browser. See [../MCP-SPEC.md](../MCP-SPEC.md)
for the full design.

```
 Claude  ──stdio(MCP)──▶  markpage-mcp  ──ws://127.0.0.1:7878/ws──▶  markpage tab
```

The binary speaks MCP over stdio to the client and exposes a WebSocket server on
`127.0.0.1:7878`. One markpage browser tab connects to it and executes each tool
call in-page. Two tools (`get_authoring_guide`, `get_fence_syntax`) are answered
by the binary itself from embedded docs — they work without a tab.

## Build

```sh
make build        # → ./markpage-mcp  (embeds tools.json + the authoring docs)
make probe        # build the e2e smoke probe
./e2e-probe       # full round-trip: MCP client ↔ bridge ↔ fake webapp
make test         # go unit tests
```

`make` copies `../AI-AUTHORING.md` and `../packages/blocks/SYNTAX.md` into this
directory (gitignored) so `//go:embed` can compile them in. `tools.json` lives
here and is the single source of truth for the contract.

## Install with Claude

### For users — from the app

Open markpage and click the **MCP pill** (bottom-right) → **Connexion IA (MCP)**.
The panel detects your platform, offers a one-click **download** of the prebuilt
binary, and shows the exact `claude mcp add markpage …` command to paste. Then
restart Claude Code. The binaries it links to are the GitHub Release assets
produced by `make release` (see below).

### For developers — from source

```sh
make build
claude mcp add markpage "$(pwd)/markpage-mcp"
```

Then open markpage with the auto-connect URL, e.g. in dev:

```
http://localhost:5173/?mcp=ws://127.0.0.1:7878/ws
```

or click the MCP pill in the app and connect manually. Add `&token=…` (and pass
`-token …` to the binary) to require a shared secret.

## Releasing prebuilt binaries

```sh
make release        # cross-compiles dist/markpage-mcp-<os>-<arch>[.exe] for all platforms
```

Platforms: `darwin-arm64`, `darwin-amd64`, `linux-amd64`, `linux-arm64`,
`windows-amd64`. To publish them as GitHub Release assets (which the in-app
panel downloads from `/releases/latest/download/<asset>`), push a tag:

```sh
git tag mcp-v0.1.0 && git push origin mcp-v0.1.0
```

`.github/workflows/mcp-release.yml` cross-compiles and uploads the assets. The
asset names must stay in sync with `ASSETS` in `src/mcp/pill.ts`.

## Flags

| flag                | default              | meaning                                   |
| :------------------ | :------------------- | :---------------------------------------- |
| `-ws-addr`          | `127.0.0.1:7878`     | WebSocket listen address (loopback only)  |
| `-token`            | _(none)_             | shared secret the tab must echo           |
| `-request-timeout`  | `60s`                | per-call timeout                          |
| `-contract`         | _(embedded)_         | override tools.json from disk (dev)       |
| `-debug`            | `false`              | debug logging on stderr                   |
