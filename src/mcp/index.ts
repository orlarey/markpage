// index.ts — MCP entry point for the markpage webapp. main.ts builds an
// McpContext and calls initMcp(ctx) once, late in startup. We read the
// ?mcp= / ?token= URL params (or a saved URL), show the status pill, and
// auto-connect when a URL is present. Each incoming tool call is dispatched
// to handlers.ts and logged in the pill.

import { connectMcp, disconnect } from './ws-client';
import { dispatch } from './handlers';
import { createMcpPill } from './pill';
import type { McpContext } from './context';

// Must match contractVersion in mcp/tools.json (the Go bridge rejects a major
// mismatch and warns on a minor one).
const CONTRACT_VERSION = '0.1.0';
const DEFAULT_WS_URL = 'ws://127.0.0.1:7878/ws';
const SAVED_URL_KEY = 'markpage-mcp-url';

export function initMcp(ctx: McpContext): void {
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get('mcp');
  const token = params.get('token') ?? undefined;
  const savedUrl = safeGet(SAVED_URL_KEY);
  const initialUrl = urlParam ?? savedUrl ?? DEFAULT_WS_URL;

  const pill = createMcpPill({
    initialUrl,
    onConnect: (url) => {
      safeSet(SAVED_URL_KEY, url);
      doConnect(url);
    },
    onDisconnect: () => {
      disconnect();
      pill.setState('idle');
      pill.logActivity('disconnected by user');
    },
  });

  function doConnect(url: string): void {
    pill.logActivity(`connecting to ${url}`);
    connectMcp({
      url,
      token,
      webappVersion: __APP_VERSION__,
      contractVersion: CONTRACT_VERSION,
      onStateChange: (state, detail) => {
        pill.setState(state, detail);
        if (state === 'ready') pill.logActivity('handshake ok — ready');
        if (state === 'superseded') pill.logActivity('superseded by another tab');
      },
      onReq: async (req) => {
        pill.logActivity(`→ ${req.op}`);
        const outcome = await dispatch(req, ctx);
        pill.logActivity(outcome.ok ? `← ${req.op} ok` : `← ${req.op} ERR ${outcome.error.message}`);
        return outcome;
      },
    });
  }

  // Auto-connect only when a URL was explicitly provided (param or saved
  // preference); a fresh visitor sees an idle pill and connects on demand.
  if (urlParam ?? savedUrl) {
    if (urlParam) safeSet(SAVED_URL_KEY, urlParam);
    doConnect(initialUrl);
  } else {
    pill.setState('idle');
  }
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / disabled storage — non-fatal */
  }
}
