// handlers.ts — maps each MCP tool name to a handler that drives the app
// through the McpContext. The dispatcher is called by the WS client for every
// incoming `req`. A handler returns a plain object (→ resp.result) or throws
// (→ resp.error with code op_unknown).

import { renderBlock, blockNames, hasBlock } from '@orlarey/blocks';
import type { McpContext, ViewName } from './context';
import type { ToolReq, ToolOutcome } from './ws-client';

type Args = Record<string, unknown>;
type Handler = (args: Args, ctx: McpContext) => Promise<unknown> | unknown;

// Fence error blocks emitted by the renderers (math is reported separately).
const FENCE_ERROR_SELECTOR =
  '.chart-error, .bda-error, .category-error, .adt-error, .mermaid-error, .tree-error, .diff-error';

// Block containers, by requested type. 'any' unions them all.
const BLOCK_SELECTORS: Record<string, string> = {
  chart: '.chart-svg',
  bda: '.bda-svg',
  category: '.category-svg',
  mermaid: '.mermaid-block',
  tree: '.tree-svg, .tree-block',
};
const ANY_BLOCK_SELECTOR = Object.values(BLOCK_SELECTORS).join(', ');

const HANDLERS: Record<string, Handler> = {
  // --- A. current document ---
  get_document: (_a, ctx) => {
    const d = ctx.getDocument();
    return { markdown: d.markdown, uuid: d.uuid, name: d.name };
  },
  set_document: (a, ctx) => ctx.setDocument(str(a, 'markdown')),
  insert_text: (a, ctx) => ctx.insertText(str(a, 'text')),

  // --- B. library ---
  list_documents: async (a, ctx) => ({
    documents: await ctx.listDocuments(bool(a, 'trash', false)),
  }),
  open_document: async (a, ctx) => ({ document: await ctx.openDocument(str(a, 'uuid')) }),
  create_document: async (a, ctx) => ({
    document: await ctx.createDocument(optStr(a, 'name'), optStr(a, 'markdown') ?? ''),
  }),
  rename_document: async (a, ctx) => ({
    document: await ctx.renameDocument(str(a, 'uuid'), str(a, 'name')),
  }),
  delete_document: async (a, ctx) => {
    const uuid = str(a, 'uuid');
    await ctx.deleteDocument(uuid);
    return { uuid };
  },
  restore_document: async (a, ctx) => ({ document: await ctx.restoreDocument(str(a, 'uuid')) }),
  save_document: async (_a, ctx) => ({ document: await ctx.saveDocument() }),
  revert_document: async (_a, ctx) => ({ document: await ctx.revertDocument() }),
  get_state: (_a, ctx) => ctx.getState(),

  // --- C. views, render & errors ---
  set_view: (a, ctx) => ctx.setView(view(a)),
  get_page_count: async (_a, ctx) => {
    const root = await ctx.ensurePreview();
    return { pageCount: countPages(root) };
  },
  get_render_errors: async (_a, ctx) => {
    const root = await ctx.ensurePreview();
    return { errors: collectErrors(root), pageCount: countPages(root) };
  },
  get_block_svg: async (a, ctx) => {
    const root = await ctx.ensurePreview();
    const type = optStr(a, 'type') ?? 'any';
    const index = int(a, 'index', 0);
    const selector = type === 'any' ? ANY_BLOCK_SELECTOR : (BLOCK_SELECTORS[type] ?? ANY_BLOCK_SELECTOR);
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (nodes.length === 0) throw new Error(`no blocks matching type=${type}`);
    if (index < 0 || index >= nodes.length) {
      throw new Error(`index ${index} out of range (0..${nodes.length - 1})`);
    }
    const node = nodes[index]!;
    const svg = node.querySelector('svg')?.outerHTML ?? node.outerHTML;
    return { svg, type, count: nodes.length };
  },

  // --- D. export ---
  export_markdown: (_a, ctx) => ctx.exportMarkdown(),
  export_latex: async (_a, ctx) => {
    const art = await ctx.exportLatex();
    // The Go bridge writes the bytes to a temp file and replaces these
    // underscore-prefixed fields with a `path` — the base64 never enters
    // the AI context.
    return {
      _artifact_payload_base64: art.base64,
      _artifact_filename_hint: art.filenameHint,
      resources: art.resources,
    };
  },
  export_pdf: (_a, ctx) => ctx.exportPdf(),

  // --- E. settings ---
  get_settings: (_a, ctx) => ctx.getSettings(),
  list_profiles: (_a, ctx) => ({ profiles: ctx.listProfiles() }),
  set_profile: (a, ctx) => ctx.setProfile(str(a, 'uuid')),

  // --- F. authoring (validate is the only tab-side authoring tool;
  //         get_authoring_guide / get_fence_syntax are served by the binary) ---
  validate_fence: (a) => {
    const name = str(a, 'name');
    const body = str(a, 'body');
    const info = optStr(a, 'info') ?? name;
    if (!hasBlock(name)) {
      return { ok: false, error: `unknown fence "${name}"`, knownFences: blockNames() };
    }
    try {
      const html = renderBlock(name, body, info);
      if (html == null) return { ok: false, error: `renderer returned null for "${name}"` };
      // Renderers emit a red *-error block on parse failure rather than
      // throwing; treat that as a validation failure.
      if (/class="[a-z]+-error"/.test(html)) {
        return { ok: false, error: extractErrorText(html) ?? 'fence render error' };
      }
      return { ok: true, svg: html };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

/** Dispatch one tool call. Returns a ToolOutcome for the WS client. */
export async function dispatch(req: ToolReq, ctx: McpContext): Promise<ToolOutcome> {
  const handler = HANDLERS[req.op];
  if (!handler) {
    return { ok: false, error: { code: 'op_unknown', message: `unknown tool: ${req.op}` } };
  }
  try {
    const result = await handler((req.args as Args) ?? {}, ctx);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: { code: 'op_unknown', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---- DOM scanning helpers ------------------------------------------------

function countPages(root: HTMLElement): number {
  return root.querySelectorAll('.pagedjs_page').length;
}

interface RenderErr {
  kind: 'math' | 'xref' | 'fence' | 'image' | 'overflow';
  message: string;
  context?: string;
}

function collectErrors(root: HTMLElement): RenderErr[] {
  const errors: RenderErr[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.math-error')) {
    errors.push({ kind: 'math', message: msgOf(el, 'math-error-msg') });
  }
  for (const el of root.querySelectorAll<HTMLElement>('.xref-broken')) {
    errors.push({ kind: 'xref', message: el.getAttribute('title') ?? 'broken cross-reference' });
  }
  for (const el of root.querySelectorAll<HTMLElement>(FENCE_ERROR_SELECTOR)) {
    const cls = Array.from(el.classList).find((c) => c.endsWith('-error')) ?? 'fence';
    errors.push({ kind: 'fence', message: msgOf(el, `${cls}-msg`), context: cls.replace('-error', '') });
  }
  for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
    const src = img.getAttribute('src') ?? '';
    const missing = src.startsWith('img:') || src === '' || (img.complete && img.naturalWidth === 0);
    if (missing) errors.push({ kind: 'image', message: 'missing image', context: src.slice(0, 80) });
  }
  return errors;
}

// Prefer the dedicated *-error-msg child's text; fall back to title / text.
function msgOf(el: HTMLElement, msgClass: string): string {
  const msg = el.querySelector(`.${msgClass}`)?.textContent?.trim();
  if (msg) return msg;
  return (el.getAttribute('title') ?? el.textContent ?? '').trim().slice(0, 200) || 'render error';
}

function extractErrorText(html: string): string | null {
  const m = html.match(/-error-msg"[^>]*>([^<]+)</);
  return m ? m[1]!.trim() : null;
}

// ---- arg coercion --------------------------------------------------------

function str(a: Args, key: string): string {
  const v = a[key];
  if (typeof v !== 'string') throw new Error(`missing or non-string arg "${key}"`);
  return v;
}
function optStr(a: Args, key: string): string | undefined {
  const v = a[key];
  return typeof v === 'string' ? v : undefined;
}
function bool(a: Args, key: string, dflt: boolean): boolean {
  const v = a[key];
  return typeof v === 'boolean' ? v : dflt;
}
function int(a: Args, key: string, dflt: number): number {
  const v = a[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : dflt;
}
function view(a: Args): ViewName {
  const v = a['view'];
  if (v === 'editor' || v === 'preview' || v === 'presentation') return v;
  throw new Error(`invalid view "${String(v)}"`);
}
