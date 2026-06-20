// mcp_server.go : declare one MCP tool per tools.json entry, route each
// invocation either to a local pure handler or, through the bridge, to the
// connected browser tab.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCPServer wraps the SDK Server with our wiring.
//
// All contract tools are registered at construction. Claude Desktop (and
// other clients) freeze their tool catalogue at the start of a conversation,
// so a tools/list_changed notification arriving after the tab connects has no
// effect on the running session. With tools always registered, the catalogue
// is stable and a clear no_webapp error lets the assistant instruct the user
// to open the tab and retry within the same conversation.
type MCPServer struct {
	server         *mcp.Server
	bridge         *Bridge
	contract       *ToolsContract
	validator      *SchemaValidator
	requestTimeout time.Duration
	log            *slog.Logger
}

// NewMCPServer builds the SDK server and declares one tool per contract entry.
func NewMCPServer(contract *ToolsContract, bridge *Bridge, log *slog.Logger, requestTimeout time.Duration) (*MCPServer, error) {
	impl := &mcp.Implementation{
		Name:    "markpage-mcp",
		Title:   "markpage-mcp",
		Version: contract.ContractVersion,
	}
	srv := mcp.NewServer(impl, nil)
	validator, err := NewSchemaValidator(contract)
	if err != nil {
		return nil, fmt.Errorf("compile schemas: %w", err)
	}
	m := &MCPServer{
		server:         srv,
		bridge:         bridge,
		contract:       contract,
		validator:      validator,
		requestTimeout: requestTimeout,
		log:            log,
	}
	log.Info("schemas compiled", "tools", len(contract.Tools))
	for i := range contract.Tools {
		def := contract.Tools[i] // capture by value for the handler closure
		// Inline the contract-wide $defs into each tool's schemas so $ref
		// pointers resolve when MCP clients validate on their side.
		inputWithDefs, err := injectDefs(def.InputSchema, contract.Defs)
		if err != nil {
			return nil, fmt.Errorf("inject $defs into %s.inputSchema: %w", def.Name, err)
		}
		outputWithDefs, err := injectDefs(def.OutputSchema, contract.Defs)
		if err != nil {
			return nil, fmt.Errorf("inject $defs into %s.outputSchema: %w", def.Name, err)
		}
		tool := &mcp.Tool{
			Name:         def.Name,
			Description:  def.Description,
			InputSchema:  inputWithDefs,
			OutputSchema: outputWithDefs,
			Meta:         buildToolMeta(def),
		}
		srv.AddTool(tool, m.makeHandler(def.Name))
	}
	log.Info("mcp tools registered", "count", len(contract.Tools))
	return m, nil
}

// injectDefs copies the contract-wide $defs into the given JSON schema so
// $ref pointers resolve when the schema is published in isolation.
func injectDefs(schema json.RawMessage, defs map[string]json.RawMessage) (json.RawMessage, error) {
	if len(schema) == 0 || len(defs) == 0 {
		return schema, nil
	}
	var asObject map[string]json.RawMessage
	if err := json.Unmarshal(schema, &asObject); err != nil {
		return nil, err
	}
	if _, alreadyHas := asObject["$defs"]; alreadyHas {
		return schema, nil
	}
	defsRaw, err := json.Marshal(defs)
	if err != nil {
		return nil, err
	}
	asObject["$defs"] = defsRaw
	return json.Marshal(asObject)
}

// makeHandler returns a ToolHandler that serves `op` locally if it is a pure
// tool, otherwise dispatches it through the bridge to the browser tab.
func (m *MCPServer) makeHandler(op string) mcp.ToolHandler {
	return func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.Params.Arguments
		if len(args) == 0 {
			args = json.RawMessage(`{}`)
		}
		if err := m.validator.ValidateInput(op, args); err != nil {
			m.log.Warn("input schema validation failed", "op", op, "err", err)
			return mcpToolError(ErrCodeBadResponse, err.Error()), nil
		}

		// Pure tools (authoring guide, fence syntax) are served by the
		// binary — no browser tab required.
		if pure, ok := pureHandlers[op]; ok {
			result, err := pure()
			if err != nil {
				return mcpToolError(ErrCodeBadResponse, err.Error()), nil
			}
			if err := m.validator.ValidateOutput(op, result); err != nil {
				m.log.Warn("output schema validation failed", "op", op, "err", err)
				return mcpToolError(ErrCodeBadResponse, err.Error()), nil
			}
			return mcpToolSuccess(result), nil
		}

		// Tab tools: register a pending call, send over WS, await the resp.
		id := uuid.NewString()
		ch, err := m.bridge.register(id)
		if err != nil {
			if errors.Is(err, errNoWebapp) {
				return mcpToolError(ErrCodeNoWebapp, "markpage tab not connected. "+reconnectHint), nil
			}
			return nil, err
		}
		defer m.bridge.unregister(id)

		if err := m.bridge.Send(WsReq{Kind: KindReq, ID: id, Op: op, Args: args}); err != nil {
			return mcpToolError(ErrCodeNoWebapp, err.Error()), nil
		}

		select {
		case resp := <-ch:
			if !resp.OK {
				if resp.Error != nil {
					return mcpToolError(resp.Error.Code, resp.Error.Message), nil
				}
				return mcpToolError(ErrCodeBadResponse, "unsuccessful response without error payload"), nil
			}
			// Intercept large artifact payloads (export_latex) before
			// schema validation: write the bytes to a temp file and
			// substitute a `path` so the MCP client never sees base64.
			result := resp.Result
			if opsWithArtifact[op] {
				rewritten, err := processArtifact(result)
				if err != nil {
					m.log.Warn("artifact payload handling failed", "op", op, "err", err)
					return mcpToolError(ErrCodeBadResponse, err.Error()), nil
				}
				result = rewritten
			}
			if err := m.validator.ValidateOutput(op, result); err != nil {
				m.log.Warn("output schema validation failed", "op", op, "err", err)
				return mcpToolError(ErrCodeBadResponse, err.Error()), nil
			}
			return mcpToolSuccess(result), nil

		case <-time.After(m.requestTimeout):
			return mcpToolError(ErrCodeTimeout, fmt.Sprintf("no response within %s", m.requestTimeout)), nil

		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

// Run starts the MCP server on stdio and blocks until the client disconnects.
func (m *MCPServer) Run(ctx context.Context) error {
	transport := &mcp.StdioTransport{}
	return m.server.Run(ctx, transport)
}

// mcpToolSuccess packs the result into a CallToolResult, populating both
// StructuredContent (parsed JSON for LLMs) and a text fallback.
func mcpToolSuccess(result json.RawMessage) *mcp.CallToolResult {
	var structured any
	if len(result) > 0 {
		_ = json.Unmarshal(result, &structured)
	}
	text := string(result)
	if text == "" {
		text = "{}"
	}
	return &mcp.CallToolResult{
		Content:           []mcp.Content{&mcp.TextContent{Text: text}},
		StructuredContent: structured,
	}
}

// buildToolMeta surfaces tools.json's per-tool annotations inside Tool.Meta.
func buildToolMeta(def ToolDef) mcp.Meta {
	if def.Stability == "" && !def.Deprecated {
		return nil
	}
	meta := mcp.Meta{}
	if def.Stability != "" {
		meta["markpage.stability"] = def.Stability
	}
	if def.Deprecated {
		meta["markpage.deprecated"] = true
	}
	return meta
}

// mcpToolError builds a CallToolResult with IsError=true and a machine-
// readable error code in the structured content.
func mcpToolError(code, message string) *mcp.CallToolResult {
	body := map[string]any{"code": code, "message": message}
	raw, _ := json.Marshal(body)
	return &mcp.CallToolResult{
		Content:           []mcp.Content{&mcp.TextContent{Text: string(raw)}},
		StructuredContent: body,
		IsError:           true,
	}
}
