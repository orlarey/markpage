// artifact_writer.go — sink for tool results that carry a large binary
// payload (currently export_latex: the .tex or a .zip bundle of resources).
//
// The webapp ships the bytes base64-encoded inside the WS resp.result under
// `_artifact_payload_base64`, with a filename hint in `_artifact_filename_hint`.
// We decode them, write to disk under TempDir/markpage-mcp/, and rewrite the
// result so the MCP client sees only the file `path`. The base64 never leaves
// the binary process (and never enters the AI context).
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	artifactDirName = "markpage-mcp"
	// Files older than this at startup are pruned. Re-export and the file
	// reappears; we do not need long-term persistence.
	artifactTTL = 1 * time.Hour
)

// opsWithArtifact lists the tool names whose result may carry a payload.
var opsWithArtifact = map[string]bool{
	"export_latex": true,
}

// artifactDir returns the directory we write exported artifacts to.
func artifactDir() string {
	return filepath.Join(os.TempDir(), artifactDirName)
}

// setupArtifactDir creates the artifact directory if missing and prunes any
// stale file older than artifactTTL. Errors are logged and swallowed.
func setupArtifactDir() error {
	dir := artifactDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("artifact dir mkdir: %w", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil // best-effort prune
	}
	cutoff := time.Now().Add(-artifactTTL)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
	return nil
}

// processArtifact detects an underscore-prefixed payload in a tool result,
// writes the bytes to disk, and returns a result where the payload fields are
// replaced by a `path` field. Results without `_artifact_payload_base64` pass
// through unchanged.
func processArtifact(result json.RawMessage) (json.RawMessage, error) {
	if len(result) == 0 {
		return result, nil
	}
	var asMap map[string]json.RawMessage
	if err := json.Unmarshal(result, &asMap); err != nil {
		return result, nil // not an object → can't carry a payload
	}
	payloadRaw, hasPayload := asMap["_artifact_payload_base64"]
	if !hasPayload {
		return result, nil
	}
	var payloadB64 string
	if err := json.Unmarshal(payloadRaw, &payloadB64); err != nil {
		return nil, fmt.Errorf("artifact: _artifact_payload_base64 is not a string: %w", err)
	}
	data, err := base64.StdEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, fmt.Errorf("artifact: base64 decode failed: %w", err)
	}

	hintRaw, ok := asMap["_artifact_filename_hint"]
	if !ok {
		return nil, errors.New("artifact: missing _artifact_filename_hint")
	}
	var hint string
	if err := json.Unmarshal(hintRaw, &hint); err != nil {
		return nil, fmt.Errorf("artifact: _artifact_filename_hint not a string: %w", err)
	}
	hint = sanitizeFilename(hint)
	if hint == "" {
		return nil, errors.New("artifact: empty filename hint after sanitization")
	}

	if err := os.MkdirAll(artifactDir(), 0o755); err != nil {
		return nil, fmt.Errorf("artifact: mkdir: %w", err)
	}
	path := filepath.Join(artifactDir(), hint)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return nil, fmt.Errorf("artifact: write file: %w", err)
	}

	delete(asMap, "_artifact_payload_base64")
	delete(asMap, "_artifact_filename_hint")
	pathRaw, _ := json.Marshal(path)
	asMap["path"] = pathRaw
	return json.Marshal(asMap)
}

// sanitizeFilename strips path traversal and anything that is not a-z A-Z 0-9
// dot dash underscore. Keeps the basename and its extension. Defence in depth:
// the webapp builds the hint from the document name, which we do not trust
// implicitly.
func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '-', r == '_', r == '.':
			b.WriteRune(r)
		}
	}
	out := strings.TrimLeft(b.String(), ".")
	if out == "" {
		return ""
	}
	if !strings.Contains(out, ".") {
		out += ".bin"
	}
	return out
}
