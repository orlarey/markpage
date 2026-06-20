# markpage — command index.
#
# `make` (or `make help`) lists every target. The build / test / lint
# commands are thin wrappers over the npm scripts (which stay the source of
# truth); the skill + publish targets are make-only conveniences.

SKILL_NAME := markpage-specs
SKILL_DIR  := $(HOME)/.claude/skills/$(SKILL_NAME)
DOC        := $(abspath AI-AUTHORING.md)
STUB       := $(abspath skill/SKILL.md)

.DEFAULT_GOAL := help

.PHONY: help dev build packages preview typecheck test test-watch test-snap \
        e2e e2e-headed e2e-report check clean publish install uninstall

help: ## List the available commands
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

## ---- Develop ----------------------------------------------------------
dev: ## Start the Vite dev server (http://localhost:5173)
	npm run dev

preview: ## Serve the production build locally
	npm run preview

## ---- Build ------------------------------------------------------------
build: ## Build the @orlarey/* packages then the app (production)
	npm run build

packages: ## Build only the @orlarey/* packages to dist (.js + .d.ts)
	npm run build:packages

## ---- Quality ----------------------------------------------------------
typecheck: ## Type-check the whole workspace (tsc --noEmit)
	npm run typecheck

test: ## Run the unit tests (vitest)
	npm test

test-watch: ## Run the unit tests in watch mode
	npm run test:watch

test-snap: ## Update the vitest snapshots (e.g. the block gallery)
	npm run test:update

e2e: ## Run the end-to-end tests (Playwright, boots the dev server)
	npm run test:e2e

e2e-headed: ## Run the e2e tests with a visible browser
	npm run test:e2e:headed

e2e-report: ## Open the last Playwright HTML report
	npm run test:e2e:report

check: typecheck test build ## Full local gate: typecheck + unit tests + build

clean: ## Remove build artifacts (dist, package dist, vite cache)
	@rm -rf dist packages/blocks/dist packages/marked/dist node_modules/.vite
	@echo "Cleaned dist / packages/*/dist / node_modules/.vite"

## ---- Publish (@orlarey/* to npm — needs `npm login`) -----------------
publish: ## Publish @orlarey/blocks then @orlarey/marked (runs the build)
	npm publish -w @orlarey/blocks
	npm publish -w @orlarey/marked

## ---- Claude skill (markpage-specs) ------------------------------------
install: ## Install/refresh the markpage-specs Claude skill (copies AI-AUTHORING.md)
	@mkdir -p "$(SKILL_DIR)"
	@rm -f "$(SKILL_DIR)/SKILL.md" "$(SKILL_DIR)/AI-AUTHORING.md"
	@cp "$(STUB)" "$(SKILL_DIR)/SKILL.md"
	@cp "$(DOC)" "$(SKILL_DIR)/AI-AUTHORING.md"
	@echo "Installed '$(SKILL_NAME)' -> $(SKILL_DIR)"
	@echo "  SKILL.md        copied from skill/SKILL.md"
	@echo "  AI-AUTHORING.md copied from $(DOC)"
	@echo "Restart your Claude Code session to pick up the new skill."

uninstall: ## Remove the markpage-specs Claude skill
	@rm -rf "$(SKILL_DIR)"
	@echo "Removed $(SKILL_DIR)"
