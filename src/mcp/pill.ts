// pill.ts — a small floating status chip (bottom-right) showing the MCP
// connection and a panel to connect/disconnect + a short activity log. Kept
// self-contained with inline styles so it touches neither style.css nor the
// toolbar, and never lands inside the paginated preview (snapshot-safe).

import type { McpConnState } from './ws-client';

export interface PillOpts {
  initialUrl: string;
  onConnect: (url: string) => void;
  onDisconnect: () => void;
}

export interface PillControl {
  setState: (state: McpConnState, detail?: unknown) => void;
  logActivity: (line: string) => void;
}

const COLORS: Record<McpConnState, string> = {
  idle: '#9aa0a6',
  connecting: '#f5a623',
  open: '#f5a623',
  ready: '#2ecc71',
  reconnecting: '#f5a623',
  close: '#9aa0a6',
  error: '#e74c3c',
  superseded: '#9aa0a6',
};

export function createMcpPill(opts: PillOpts): PillControl {
  const root = document.createElement('div');
  root.id = 'mcp-pill';
  Object.assign(root.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    zIndex: '2147483000',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
  } satisfies Partial<CSSStyleDeclaration>);

  const chip = document.createElement('button');
  Object.assign(chip.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '999px',
    background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    cursor: 'pointer',
    color: '#222',
  } satisfies Partial<CSSStyleDeclaration>);
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    background: COLORS.idle,
  } satisfies Partial<CSSStyleDeclaration>);
  const label = document.createElement('span');
  label.textContent = 'MCP';
  chip.append(dot, label);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    display: 'none',
    marginBottom: '8px',
    width: '300px',
    padding: '10px',
    border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '8px',
    background: '#fff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  } satisfies Partial<CSSStyleDeclaration>);

  const status = document.createElement('div');
  status.textContent = 'idle';
  Object.assign(status.style, { marginBottom: '6px', color: '#444', fontWeight: '600' });

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = opts.initialUrl;
  urlInput.spellcheck = false;
  Object.assign(urlInput.style, {
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '6px',
    padding: '4px 6px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '11px',
  } satisfies Partial<CSSStyleDeclaration>);

  const btnRow = document.createElement('div');
  Object.assign(btnRow.style, { display: 'flex', gap: '6px', marginBottom: '8px' });
  const connectBtn = mkButton('Connect');
  const disconnectBtn = mkButton('Disconnect');
  btnRow.append(connectBtn, disconnectBtn);

  const logBox = document.createElement('div');
  Object.assign(logBox.style, {
    maxHeight: '120px',
    overflow: 'auto',
    padding: '6px',
    background: '#f6f7f9',
    borderRadius: '4px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '10px',
    color: '#333',
    whiteSpace: 'pre-wrap',
  } satisfies Partial<CSSStyleDeclaration>);

  panel.append(status, urlInput, btnRow, logBox);
  root.append(panel, chip);
  document.body.appendChild(root);

  chip.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  connectBtn.addEventListener('click', () => opts.onConnect(urlInput.value.trim()));
  disconnectBtn.addEventListener('click', () => opts.onDisconnect());

  const log: string[] = [];
  return {
    setState(state, detail) {
      dot.style.background = COLORS[state] ?? COLORS.idle;
      const extra = typeof detail === 'string' ? ` (${detail})` : '';
      status.textContent = state + extra;
      label.textContent = state === 'ready' ? 'MCP ✓' : 'MCP';
    },
    logActivity(line) {
      log.push(line);
      if (log.length > 50) log.shift();
      logBox.textContent = log.join('\n');
      logBox.scrollTop = logBox.scrollHeight;
    },
  };
}

function mkButton(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  Object.assign(b.style, {
    flex: '1',
    padding: '4px 8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    background: '#fafafa',
    cursor: 'pointer',
    fontSize: '11px',
  } satisfies Partial<CSSStyleDeclaration>);
  return b;
}
