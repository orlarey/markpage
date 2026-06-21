# markpage-mcp — local build helpers.
#
# tools.json lives here (the contract is embedded via //go:embed). The two
# authoring docs are the single source of truth elsewhere in the repo, so
# `make sync-docs` copies them in before each build for embedding.

DOCS = AI-AUTHORING.md SYNTAX.md

# Cross-compile targets for `make release`. Asset names must match what the
# in-app MCP panel (src/mcp/pill.ts) links to and what mcp-release.yml uploads.
PLATFORMS = darwin/arm64 darwin/amd64 linux/amd64 linux/arm64 windows/amd64

.PHONY: all sync-docs build probe test release clean

all: build

sync-docs:
	@cp ../AI-AUTHORING.md AI-AUTHORING.md
	@cp ../packages/blocks/SYNTAX.md SYNTAX.md
	@echo "synced AI-AUTHORING.md + SYNTAX.md"

build: sync-docs
	@go build -o markpage-mcp .
	@ls -lh markpage-mcp

probe: sync-docs
	@go build -o e2e-probe ./cmd/e2e-probe/
	@ls -lh e2e-probe

test: sync-docs
	@go test ./...

# Cross-compile every platform into dist/ for a GitHub Release. Static
# binaries (CGO disabled), stripped (-s -w). Run via `make release` locally
# or through .github/workflows/mcp-release.yml on an `mcp-v*` tag.
release: sync-docs
	@rm -rf dist && mkdir -p dist
	@for p in $(PLATFORMS); do \
	  os=$${p%/*}; arch=$${p#*/}; ext=""; \
	  [ "$$os" = "windows" ] && ext=".exe"; \
	  out=dist/markpage-mcp-$$os-$$arch$$ext; \
	  echo "building $$out"; \
	  CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -ldflags "-s -w" -o $$out . || exit 1; \
	done
	@ls -lh dist

clean:
	@rm -rf dist
	@rm -f markpage-mcp e2e-probe $(DOCS)
	@echo "cleaned"
