# markpage-mcp — local build helpers.
#
# tools.json lives here (the contract is embedded via //go:embed). The two
# authoring docs are the single source of truth elsewhere in the repo, so
# `make sync-docs` copies them in before each build for embedding.

DOCS = AI-AUTHORING.md SYNTAX.md

.PHONY: all sync-docs build probe test clean

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

clean:
	@rm -f markpage-mcp e2e-probe $(DOCS)
	@echo "cleaned"
