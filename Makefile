# markpage — install the "markpage-specs" Claude Code skill.
#
# Like `make install` for a binary, but the target is the user's global
# Claude skills dir (~/.claude/skills) instead of ~/.local/bin. After
# install, asking any project to "rédiger des spécifications" loads
# AI-AUTHORING.md (this repo's authoring guide) and follows it — no more
# copying the doc into every project.
#
# Both files are COPIED (snapshot), not symlinked: the installed skill is
# frozen at the version you last installed, so you can edit / experiment
# on AI-AUTHORING.md in this repo without affecting any project. Re-run
# `make install` to promote the current repo version. `make uninstall`
# removes it.

SKILL_NAME := markpage-specs
SKILL_DIR  := $(HOME)/.claude/skills/$(SKILL_NAME)
DOC        := $(abspath AI-AUTHORING.md)
STUB       := $(abspath skill/SKILL.md)

.PHONY: install uninstall

install:
	@mkdir -p "$(SKILL_DIR)"
	@rm -f "$(SKILL_DIR)/SKILL.md" "$(SKILL_DIR)/AI-AUTHORING.md"
	@cp "$(STUB)" "$(SKILL_DIR)/SKILL.md"
	@cp "$(DOC)" "$(SKILL_DIR)/AI-AUTHORING.md"
	@echo "Installed '$(SKILL_NAME)' -> $(SKILL_DIR)"
	@echo "  SKILL.md        copied from skill/SKILL.md"
	@echo "  AI-AUTHORING.md copied from $(DOC)"
	@echo "Restart your Claude Code session to pick up the new skill."

uninstall:
	@rm -rf "$(SKILL_DIR)"
	@echo "Removed $(SKILL_DIR)"
