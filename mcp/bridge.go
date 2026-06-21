// bridge.go : in-memory registry of pending tool invocations.
//
// The bridge is the rendezvous point between the MCP server (which calls a
// handler from a goroutine handling an MCP tool call) and the WebSocket
// server (which sends WsReq to the webapp and routes the matching WsResp
// back to the caller).
//
// Invariants:
//   - Exactly one response (or one error) per invocation.
//   - Correlation by ID, no ordering assumption.
//   - On WS disconnect, every inflight call receives ErrCodeWebappDisconnected.
package main

import (
	"encoding/json"
	"errors"
	"sync"
)

// pendingCall is the slot held while waiting for a WsResp.
type pendingCall struct {
	ch chan WsResp // buffered(1) — never block the WS reader
}

// Bridge couples MCP-side invocations with WS-side responses.
type Bridge struct {
	mu       sync.Mutex
	inflight map[string]*pendingCall
	send     func(msg any) error // injected at WS connect time
}

// NewBridge constructs a bridge with no active WS connection.
func NewBridge() *Bridge {
	return &Bridge{inflight: make(map[string]*pendingCall)}
}

const reconnectHint = "Please open markpage in a browser with " +
	"?mcp=ws://127.0.0.1:7878/ws (e.g. http://localhost:5173/?mcp=ws://127.0.0.1:7878/ws " +
	"in dev, or your deployed markpage), then retry."

// AttachSender plugs the WS write callback. Pass nil on disconnect to flush
// the inflight registry (every pending call receives a disconnected error).
func (b *Bridge) AttachSender(send func(msg any) error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if send == nil {
		for id, p := range b.inflight {
			p.ch <- WsResp{
				Kind: KindResp,
				ID:   id,
				OK:   false,
				Error: &WsErrorPayload{
					Code:    ErrCodeWebappDisconnected,
					Message: "markpage tab disconnected mid-call. " + reconnectHint,
				},
			}
		}
		b.inflight = make(map[string]*pendingCall)
	}
	b.send = send
}

// register reserves a slot for the given id and returns the channel to wait on.
func (b *Bridge) register(id string) (chan WsResp, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.send == nil {
		return nil, errNoWebapp
	}
	p := &pendingCall{ch: make(chan WsResp, 1)}
	b.inflight[id] = p
	return p.ch, nil
}

// unregister removes a pending call (used both after success and on timeout).
func (b *Bridge) unregister(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.inflight, id)
}

// DispatchResp is called by the WS reader on every incoming "resp" message.
func (b *Bridge) DispatchResp(resp WsResp) {
	b.mu.Lock()
	p, ok := b.inflight[resp.ID]
	b.mu.Unlock()
	if !ok {
		return // late or duplicate response — drop silently
	}
	select {
	case p.ch <- resp:
	default:
	}
}

// Send forwards an arbitrary outgoing message (hello, req, ping) to the WS.
func (b *Bridge) Send(msg any) error {
	b.mu.Lock()
	send := b.send
	b.mu.Unlock()
	if send == nil {
		return errNoWebapp
	}
	return send(msg)
}

var errNoWebapp = errors.New("no webapp connected")

// MarshalSend marshals `msg` to JSON (sanity check) and forwards via Send.
func (b *Bridge) MarshalSend(msg any) error {
	if _, err := json.Marshal(msg); err != nil {
		return err
	}
	return b.Send(msg)
}
