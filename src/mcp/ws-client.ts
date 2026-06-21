// ws-client.ts — WebSocket client that connects the markpage tab to the
// markpage-mcp bridge. Faithful TS port of faustcode's ws-client.js.
//
// Protocol: the bridge sends `hello`; we reply `ready` (with the optional
// shared token); then it sends `req` (tool calls) which we dispatch via
// onReq and answer with `resp`; `ping` is answered with `pong`. A close
// with code 4001 means another tab took the seat — we stop reconnecting.

export type McpConnState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'ready'
  | 'close'
  | 'error'
  | 'reconnecting'
  | 'superseded';

export interface ToolReq {
  id: string;
  op: string;
  args?: unknown;
}

export type ToolOutcome =
  | { ok: true; result?: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface ConnectOpts {
  url: string;
  webappVersion: string;
  contractVersion: string;
  token?: string;
  onStateChange: (state: McpConnState, detail?: unknown) => void;
  onReq: (req: ToolReq) => Promise<ToolOutcome>;
}

const WS_CLOSE_SUPERSEDED_BY_NEW_TAB = 4001;
const BACKOFF_MS = [250, 500, 1000, 2000, 4000, 8000, 16000, 30000];

let ws: WebSocket | null = null;
let intentionalDisconnect = false;
let attemptIndex = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let currentOpts: ConnectOpts | null = null;

/** Open (or replace) the connection to the bridge. */
export function connectMcp(opts: ConnectOpts): void {
  currentOpts = opts;
  intentionalDisconnect = false;
  openSocket();
}

/** Close the connection on purpose and stop the retry loop. */
export function disconnect(): void {
  intentionalDisconnect = true;
  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (ws) {
    try {
      ws.close(1000, 'client-disconnect');
    } catch {
      /* already closing */
    }
  }
  ws = null;
}

function openSocket(): void {
  const opts = currentOpts;
  if (!opts) return;
  opts.onStateChange('connecting');
  let sock: WebSocket;
  try {
    sock = new WebSocket(opts.url);
  } catch (err) {
    opts.onStateChange('error', String(err));
    scheduleReconnect();
    return;
  }
  ws = sock;

  sock.addEventListener('open', () => {
    opts.onStateChange('open');
  });

  sock.addEventListener('error', (ev) => {
    opts.onStateChange('error', ev);
  });

  sock.addEventListener('close', (ev) => {
    ws = null;
    if (ev.code === WS_CLOSE_SUPERSEDED_BY_NEW_TAB) {
      intentionalDisconnect = true; // another tab owns the seat now
      opts.onStateChange('superseded', ev.reason || 'superseded-by-new-tab');
      return;
    }
    opts.onStateChange('close', ev.reason);
    if (!intentionalDisconnect) scheduleReconnect();
  });

  sock.addEventListener('message', (ev) => {
    void handleMessage(sock, opts, ev.data);
  });
}

async function handleMessage(
  sock: WebSocket,
  opts: ConnectOpts,
  data: unknown,
): Promise<void> {
  let msg: { kind?: string; [k: string]: unknown };
  try {
    msg = JSON.parse(typeof data === 'string' ? data : String(data));
  } catch {
    return;
  }
  switch (msg.kind) {
    case 'hello': {
      const ready: Record<string, unknown> = {
        kind: 'ready',
        webappVersion: opts.webappVersion,
        contractVersion: opts.contractVersion,
      };
      if (opts.token) ready.token = opts.token;
      send(sock, ready);
      attemptIndex = 0; // a successful handshake resets the backoff
      opts.onStateChange('ready', {
        mcpVersion: msg.mcpVersion,
        contractVersion: msg.contractVersion,
      });
      break;
    }
    case 'ping': {
      send(sock, { kind: 'pong', at: msg.at });
      break;
    }
    case 'req': {
      const req = msg as unknown as ToolReq;
      let outcome: ToolOutcome;
      try {
        outcome = await opts.onReq(req);
      } catch (err) {
        outcome = {
          ok: false,
          error: { code: 'op_unknown', message: stringifyErr(err) },
        };
      }
      send(sock, {
        kind: 'resp',
        id: req.id,
        ok: outcome.ok,
        result: outcome.ok ? (outcome.result ?? null) : undefined,
        error: outcome.ok ? undefined : outcome.error,
      });
      break;
    }
    default:
      break;
  }
}

function send(sock: WebSocket, obj: unknown): void {
  if (sock.readyState === WebSocket.OPEN) {
    sock.send(JSON.stringify(obj));
  }
}

function scheduleReconnect(): void {
  if (intentionalDisconnect || !currentOpts) return;
  const delay = BACKOFF_MS[Math.min(attemptIndex, BACKOFF_MS.length - 1)];
  attemptIndex += 1;
  currentOpts.onStateChange('reconnecting', { delay });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    openSocket();
  }, delay);
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
