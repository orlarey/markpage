// context.ts — the single coupling point between the MCP layer (src/mcp/) and
// the rest of the app. main.ts builds an McpContext from its closure (editor,
// currentDoc, view functions, settings…) and hands it to initMcp(). The
// dispatcher in handlers.ts calls these methods to satisfy each tool.

export type ViewName = 'editor' | 'preview' | 'presentation';

export interface DocSummary {
  uuid: string;
  name: string;
  mtime: number;
  modified?: boolean;
  linked?: boolean;
}

export interface ProfileSummary {
  uuid: string;
  name: string;
  active?: boolean;
}

export interface StateInfo {
  document?: DocSummary;
  view: ViewName;
  pageCount?: number;
  modified?: boolean;
}

// A LaTeX export ready to be written to disk by the Go bridge. The payload is
// base64; the bridge writes it under $TMPDIR and substitutes a `path`.
export interface LatexArtifact {
  filenameHint: string; // e.g. "doc.tex" or "doc.zip"
  base64: string;
  resources: number;
}

export interface McpContext {
  // --- A. current document ---
  getDocument(): DocSummary & { markdown: string };
  setDocument(markdown: string): Promise<{ uuid: string; bytes: number }>;
  insertText(text: string): { uuid: string; cursor: number };

  // --- B. library ---
  listDocuments(trash: boolean): Promise<DocSummary[]>;
  openDocument(uuid: string): Promise<DocSummary>;
  createDocument(name: string | undefined, markdown: string): Promise<DocSummary>;
  renameDocument(uuid: string, name: string): Promise<DocSummary>;
  deleteDocument(uuid: string): Promise<void>;
  restoreDocument(uuid: string): Promise<DocSummary>;
  saveDocument(): Promise<DocSummary>;
  revertDocument(): Promise<DocSummary>;
  getState(): Promise<StateInfo>;

  // --- C. views, render & errors ---
  setView(view: ViewName): Promise<{ view: ViewName; pageCount?: number }>;
  /**
   * Ensure the current document is paginated in the (now visible) preview
   * pane and return the preview root element so the dispatcher can scan it
   * for pages, blocks, and error markers. May switch the view to preview.
   */
  ensurePreview(): Promise<HTMLElement>;

  // --- D. export ---
  exportMarkdown(): Promise<{ markdown: string; bytes: number }>;
  exportLatex(): Promise<LatexArtifact>;
  exportPdf(): Promise<{ started: boolean }>;

  // --- E. settings ---
  getSettings(): { profile?: ProfileSummary; settings: Record<string, unknown> };
  listProfiles(): ProfileSummary[];
  setProfile(uuid: string): { profile: ProfileSummary };
}
