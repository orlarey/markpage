// pure.go — tools served entirely by the Go binary, without a browser tab.
//
// These are the analogue of faustcode's Faust-doc tools: static reference
// material an AI needs while authoring. AI-AUTHORING.md and SYNTAX.md are
// copied into mcp/ by `make sync-docs` and embedded at build time, so the
// guide is always available even when no markpage tab is connected.
package main

import (
	_ "embed"
	"encoding/json"
)

//go:embed AI-AUTHORING.md
var authoringGuide []byte

//go:embed SYNTAX.md
var fenceSyntax []byte

// pureHandlers maps a tool name to a function producing its result locally.
// Ops listed here are answered by the binary and never bridged to the webapp.
var pureHandlers = map[string]func() (json.RawMessage, error){
	"get_authoring_guide": func() (json.RawMessage, error) {
		return markdownResult(authoringGuide)
	},
	"get_fence_syntax": func() (json.RawMessage, error) {
		return markdownResult(fenceSyntax)
	},
}

// markdownResult wraps a blob as {"markdown": "..."}.
func markdownResult(blob []byte) (json.RawMessage, error) {
	return json.Marshal(map[string]string{"markdown": string(blob)})
}
