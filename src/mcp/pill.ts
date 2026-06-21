// pill.ts — a floating status chip (bottom-right) that doubles as the
// "Connexion IA (MCP)" panel: an install guide (platform-detected binary
// download + the `claude mcp add` command to copy) plus the live connection
// controls and activity log. Self-contained and inline-styled so it touches
// neither style.css nor the toolbar, and never lands inside the paginated
// preview (snapshot-safe). Bilingual via the app's current UI language.

import { getLanguage } from '../i18n/locale';
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

// Prebuilt binaries are published as GitHub Release assets. The download
// button points at the rolling "latest" release so the panel never needs a
// version bump. See mcp/Makefile `release` + .github/workflows/mcp-release.yml.
const RELEASE_BASE =
  'https://github.com/orlarey/markpage/releases/latest/download';

interface Asset {
  id: string;
  label: string;
  file: string;
  windows?: boolean;
}
const ASSETS: Asset[] = [
  { id: 'darwin-arm64', label: 'macOS (Apple Silicon)', file: 'markpage-mcp-darwin-arm64' },
  { id: 'darwin-amd64', label: 'macOS (Intel)', file: 'markpage-mcp-darwin-amd64' },
  { id: 'linux-amd64', label: 'Linux (x64)', file: 'markpage-mcp-linux-amd64' },
  { id: 'linux-arm64', label: 'Linux (ARM64)', file: 'markpage-mcp-linux-arm64' },
  { id: 'windows-amd64', label: 'Windows (x64)', file: 'markpage-mcp-windows-amd64.exe', windows: true },
];

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

const FR = getLanguage() === 'fr';
const L = {
  title: FR ? 'Connexion IA (MCP)' : 'AI connection (MCP)',
  install: FR ? 'Installation du pont' : 'Install the bridge',
  intro: FR
    ? 'Pour piloter markpage depuis Claude, installez le pont MCP (un petit binaire local), une seule fois :'
    : 'To drive markpage from Claude, install the MCP bridge (a small local binary) — once:',
  platform: FR ? 'Plateforme' : 'Platform',
  step1: FR ? '1. Télécharger le binaire' : '1. Download the binary',
  download: FR ? '⬇ Télécharger' : '⬇ Download',
  step2: FR ? '2. L’enregistrer auprès de Claude (à coller dans un terminal)' : '2. Register it with Claude (paste in a terminal)',
  copy: FR ? 'Copier' : 'Copy',
  copied: FR ? 'Copié ✓' : 'Copied ✓',
  step3: FR
    ? '3. Relancer Claude Code (nouveau chat, ou « Developer: Reload Window » dans VS Code).'
    : '3. Restart Claude Code (new chat, or “Developer: Reload Window” in VS Code).',
  connection: FR ? 'Connexion' : 'Connection',
  connect: FR ? 'Connecter' : 'Connect',
  disconnect: FR ? 'Déconnecter' : 'Disconnect',
  activity: FR ? 'Activité' : 'Activity',
};

export function createMcpPill(opts: PillOpts): PillControl {
  const root = el('div', { id: 'mcp-pill' }, {
    position: 'fixed', right: '12px', bottom: '12px', zIndex: '2147483000',
    fontFamily: 'system-ui, sans-serif', fontSize: '12px',
  });

  // --- the chip ---
  const chip = el('button', {}, {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px',
    border: '1px solid rgba(0,0,0,0.15)', borderRadius: '999px', background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)', cursor: 'pointer', color: '#222',
  });
  const dot = el('span', {}, { width: '9px', height: '9px', borderRadius: '50%', background: COLORS.idle });
  const label = el('span', {}, {});
  label.textContent = 'MCP';
  chip.append(dot, label);

  // --- the panel ---
  const panel = el('div', {}, {
    display: 'none', marginBottom: '8px', width: '340px', maxHeight: '70vh',
    overflowY: 'auto', padding: '12px', border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '10px', background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
    color: '#1f2328', lineHeight: '1.4',
  });

  const titleEl = el('div', {}, { fontWeight: '700', fontSize: '13px', marginBottom: '8px' });
  titleEl.textContent = L.title;

  const status = el('div', {}, {
    marginBottom: '10px', padding: '4px 8px', borderRadius: '6px',
    background: '#f6f7f9', color: '#444', fontWeight: '600',
  });
  status.textContent = 'idle';

  // Declared before the section builders run (they're called inside the
  // panel.append below and buildLogSection closes over logBox/log).
  const log: string[] = [];
  const logBox = el('div', {}, {
    maxHeight: '110px', overflow: 'auto', padding: '6px', background: '#f6f7f9',
    borderRadius: '4px', fontFamily: 'ui-monospace, monospace', fontSize: '10px',
    color: '#333', whiteSpace: 'pre-wrap',
  });

  panel.append(titleEl, status, buildInstallSection(), buildConnectionSection(), buildLogSection());
  root.append(panel, chip);
  document.body.appendChild(root);

  chip.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  // ---- install section ----
  function buildInstallSection(): HTMLElement {
    const sec = section(L.install);
    const intro = el('div', {}, { marginBottom: '8px', color: '#444' });
    intro.textContent = L.intro;

    // platform picker (default-detected, full list selectable)
    const row = el('div', {}, { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' });
    const platLabel = el('label', {}, { color: '#57606a', whiteSpace: 'nowrap' });
    platLabel.textContent = L.platform + ' :';
    const select = document.createElement('select');
    Object.assign(select.style, { flex: '1', padding: '3px 4px', fontSize: '11px' } satisfies Partial<CSSStyleDeclaration>);
    for (const a of ASSETS) {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.label;
      select.append(o);
    }
    select.value = detectAssetId();
    row.append(platLabel, select);

    const step1 = stepLabel(L.step1);
    const dl = document.createElement('a');
    dl.textContent = L.download;
    dl.target = '_blank';
    dl.rel = 'noopener';
    Object.assign(dl.style, {
      display: 'inline-block', margin: '2px 0 10px', padding: '5px 12px',
      background: '#0969da', color: '#fff', borderRadius: '6px',
      textDecoration: 'none', fontWeight: '600',
    } satisfies Partial<CSSStyleDeclaration>);

    const step2 = stepLabel(L.step2);
    const cmd = el('code', {}, {
      display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      padding: '6px 8px', background: '#0d1117', color: '#e6edf3',
      borderRadius: '6px', fontFamily: 'ui-monospace, monospace', fontSize: '10.5px',
    });
    const copyBtn = mkButton(L.copy);
    Object.assign(copyBtn.style, { marginTop: '4px', flex: '0 0 auto', padding: '3px 10px' });
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(cmd.textContent ?? '').then(() => {
        const prev = copyBtn.textContent;
        copyBtn.textContent = L.copied;
        setTimeout(() => { copyBtn.textContent = prev; }, 1200);
      });
    });

    const step3 = el('div', {}, { marginTop: '10px', color: '#444' });
    step3.textContent = L.step3;

    const sync = (): void => {
      const a = ASSETS.find((x) => x.id === select.value) ?? ASSETS[0]!;
      dl.href = `${RELEASE_BASE}/${a.file}`;
      cmd.textContent = installCommand(a);
    };
    select.addEventListener('change', sync);
    sync();

    sec.append(intro, row, step1, dl, step2, cmd, copyBtn, step3);
    return sec;
  }

  // ---- connection section ----
  function buildConnectionSection(): HTMLElement {
    const sec = section(L.connection);
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.value = opts.initialUrl;
    urlInput.spellcheck = false;
    Object.assign(urlInput.style, {
      width: '100%', boxSizing: 'border-box', marginBottom: '6px', padding: '4px 6px',
      border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'ui-monospace, monospace', fontSize: '11px',
    } satisfies Partial<CSSStyleDeclaration>);
    const btnRow = el('div', {}, { display: 'flex', gap: '6px' });
    const connectBtn = mkButton(L.connect);
    const disconnectBtn = mkButton(L.disconnect);
    btnRow.append(connectBtn, disconnectBtn);
    connectBtn.addEventListener('click', () => opts.onConnect(urlInput.value.trim()));
    disconnectBtn.addEventListener('click', () => opts.onDisconnect());
    sec.append(urlInput, btnRow);
    return sec;
  }

  function buildLogSection(): HTMLElement {
    const sec = section(L.activity);
    sec.append(logBox);
    return sec;
  }

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

// ---- helpers -------------------------------------------------------------

function installCommand(a: Asset): string {
  if (a.windows) {
    return `claude mcp add markpage %USERPROFILE%\\Downloads\\${a.file}`;
  }
  return `chmod +x ~/Downloads/${a.file}\nclaude mcp add markpage ~/Downloads/${a.file}`;
}

// Best-effort platform default; the user can override via the picker.
function detectAssetId(): string {
  const ua = navigator.userAgent;
  const plat = navigator.platform || '';
  if (/Win/i.test(plat) || /Windows/i.test(ua)) return 'windows-amd64';
  if (/Mac/i.test(plat) || /Mac OS X/i.test(ua)) {
    // Apple Silicon isn't reliably exposed; default to arm64 (most new Macs).
    return 'darwin-arm64';
  }
  if (/Linux|X11/i.test(plat) || /Linux/i.test(ua)) {
    return /arm|aarch64/i.test(ua) ? 'linux-arm64' : 'linux-amd64';
  }
  return 'darwin-arm64';
}

function section(title: string): HTMLElement {
  const sec = el('div', {}, { marginBottom: '12px' });
  const h = el('div', {}, {
    fontWeight: '700', fontSize: '11px', textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#8a8f98', margin: '0 0 6px',
  });
  h.textContent = title;
  sec.append(h);
  return sec;
}

function stepLabel(text: string): HTMLElement {
  const d = el('div', {}, { margin: '6px 0 2px', fontWeight: '600', color: '#333' });
  d.textContent = text;
  return d;
}

function mkButton(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  Object.assign(b.style, {
    flex: '1', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px',
    background: '#fafafa', cursor: 'pointer', fontSize: '11px',
  } satisfies Partial<CSSStyleDeclaration>);
  return b;
}

function el(
  tag: string,
  attrs: Record<string, string>,
  style: Partial<CSSStyleDeclaration>,
): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  Object.assign(e.style, style);
  return e;
}
