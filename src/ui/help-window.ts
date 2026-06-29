/********************************* help-window.ts ******************************
 *
 * Purpose: Standalone help window with "Insert into document" buttons attached
 *   to every code / data-source block in the rendered Markdown.
 * How: `window.open()` (modal fallback when blocked), bundle the app CSS via
 *   `?inline`, post-process math + mermaid, then attach per-block insert buttons.
 *
 *******************************************************************************/

// Standalone help window. Opens via `window.open()` so the user can
// move it to another monitor / position, leaving the editor below
// fully visible. Each fenced code block in the rendered help gets an
// "Insérer dans le document" button — clicking it inserts the block's
// raw source into the editor.
//
// We do NOT use postMessage to talk back to the editor: even though
// the button DOM lives in the spawned window, the click handler is
// registered from the opener's JS realm, so it already runs there
// and can call the insert callback directly.
//
// Falls back to the in-app modal (help-modal.ts) if the popup is
// blocked.

import { marked } from 'marked';
import {
  renderMathBlocks,
  renderMathInlines,
  renderMermaidBlocks,
} from '@orlarey/markpage-render';
import { openHelpModal, type HelpModalOptions } from './help-modal';
import { getLanguage } from '../i18n/locale';
import { t } from '../i18n/strings';
import { makeLogo } from './logo';
// Vite returns the processed CSS string for the `?inline` query.
// Bundling the whole app stylesheet keeps the help window visually
// consistent with the editor / preview without us hand-curating a
// subset.
import blocksCss from '@orlarey/blocks/styles.css?inline';
import constructsCss from '@orlarey/markpage-render/constructs.css?inline';
import appCss from '../style.css?inline';

/**
 * Purpose: Help-window callbacks — insert into editor, plus optional undo/redo forwarders.
 * How: Extends `HelpModalOptions`; the modal fallback uses the shared subset.
 */
export interface HelpWindowOptions extends HelpModalOptions {
  /** Called when the user clicks an "Insert" button in the help. */
  onInsert(source: string): void;
  /**
   * Forwards Cmd/Ctrl+Z when the help window has focus, so the user
   * can undo an insertion they just made without first switching back
   * to the editor window.
   */
  onUndo?(): void;
  /** Like onUndo, for Shift+Cmd/Ctrl+Z (and Cmd/Ctrl+Y on Windows). */
  onRedo?(): void;
}

// Single instance — clicking Aide again refocuses the existing window
// rather than spawning a second one.
let currentHelpWindow: Window | null = null;

/**
 * Purpose: Open (or refocus) the help window; fall back to the modal if popup-blocked.
 * How: `window.open` with shared sizing, then build the document and wire undo/redo keys.
 */
export function openHelp(
  helpMarkdown: string,
  options: HelpWindowOptions,
): void {
  // Re-focus an already-open window instead of opening a second one.
  if (currentHelpWindow && !currentHelpWindow.closed) {
    currentHelpWindow.focus();
    return;
  }

  const win = window.open(
    '',
    'markpage-help',
    'width=760,height=900,scrollbars=yes,resizable=yes',
  );
  if (!win) {
    // Popup blocked — fall back to the modal so the user still gets
    // the help. They lose the "movable window" but not the content.
    openHelpModal(helpMarkdown, options);
    return;
  }
  currentHelpWindow = win;

  buildHelpWindow(win, helpMarkdown, options);

  // Forward undo / redo keystrokes to the editor so the user can
  // cancel an insertion without leaving the help window. The listener
  // is registered from the opener's realm, so calling
  // options.onUndo() runs the editor command directly. preventDefault
  // is important on Firefox / Safari where Cmd+Z on the help window
  // would otherwise navigate back in any focused input.
  win.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      options.onUndo?.();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      options.onRedo?.();
    }
  });

  // Clear our reference if the user closes the window so a future
  // click re-opens cleanly.
  const checkClosed = setInterval(() => {
    if (win.closed) {
      currentHelpWindow = null;
      clearInterval(checkClosed);
    }
  }, 1000);
}

/**
 * Purpose: Populate the spawned window — head, header, body, post-processing.
 * How: Inject CSS, render markdown via marked, await render passes, then add insert buttons.
 */
function buildHelpWindow(
  win: Window,
  helpMarkdown: string,
  options: HelpWindowOptions,
): void {
  win.document.title = t('help.window-title');
  win.document.documentElement.lang = getLanguage();
  win.document.head.innerHTML = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${blocksCss}</style>
    <style>${constructsCss}</style>
    <style>${appCss}</style>
    <style>${windowSpecificCss()}</style>
  `;
  win.document.body.innerHTML = `
    <header class="help-window-header">
      <h1><span class="markpage-logo" id="help-window-logo"></span> &mdash; ${t('help.title-suffix')}</h1>
      <div class="help-window-actions">
        <button type="button" class="toc-toggle" aria-expanded="false" aria-controls="help-toc-nav">${t('help.toc')}</button>
        ${options.onExportPdf ? `<button type="button" class="export-pdf">${t('help.export-pdf')}</button>` : ''}
        <button type="button" class="close">${t('help.close')}</button>
      </div>
    </header>
    <div class="help-window-layout">
      <nav class="help-toc" id="help-toc-nav" aria-label="${t('help.toc')}"></nav>
      <main class="help-body markpage" id="help-body"></main>
    </div>
  `;
  // Render the brand into the placeholder span. We do this from JS
  // rather than inlining the <span class="markpage-logo-mark">… because
  // the help window lives in a separate Document and we want the same
  // construction path everywhere.
  const logoSlot = win.document.getElementById('help-window-logo');
  if (logoSlot) {
    logoSlot.replaceWith(makeLogo(win.document, 'full'));
  }

  const body = win.document.getElementById('help-body');
  if (!body) return;
  body.innerHTML = marked.parse(helpMarkdown, { async: false });

  // Build the sticky table of contents from h2 / h3 headings in the
  // rendered body. Each heading gets a slug id (assigned by buildToc
  // for ones that don't already carry one), and the TOC links scroll
  // smoothly to those targets. We do this BEFORE the async render
  // pass below: math / mermaid render only swaps inner content of
  // already-existing elements, it doesn't shift heading offsets.
  const tocNav = win.document.getElementById('help-toc-nav');
  if (tocNav) {
    buildToc(win, body, tocNav);
  }

  // Post-processing then insert buttons. We await the render* pass
  // before scanning for buttons because mermaid (in particular)
  // replaces its <pre><code> with a <div class="mermaid-block">
  // carrying the data-source attribute we just stashed — adding
  // buttons too early would attach them to the about-to-be-replaced
  // <pre>.
  void (async () => {
    try {
      await Promise.all([
        renderMathBlocks(body),
        renderMathInlines(body),
        renderMermaidBlocks(body),
      ]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Help post-processing failed', err);
    }
    addInsertButtons(win, body, options.onInsert);
  })();

  // Wire header buttons.
  const closeBtn = win.document.querySelector('.help-window-actions .close');
  closeBtn?.addEventListener('click', () => win.close());

  const pdfBtn = win.document.querySelector(
    '.help-window-actions .export-pdf',
  ) as HTMLButtonElement | null;
  if (pdfBtn && options.onExportPdf) {
    pdfBtn.addEventListener('click', () => {
      const cb = options.onExportPdf;
      if (!cb) return;
      pdfBtn.disabled = true;
      pdfBtn.textContent = t('help.generating');
      void cb()
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error('Help PDF export failed', err);
        })
        .finally(() => {
          pdfBtn.disabled = false;
          pdfBtn.textContent = t('help.export-pdf');
        });
    });
  }

  // Wire the responsive "Sommaire" toggle. On wide windows the sidebar
  // is always visible (the toggle button is hidden via CSS media
  // query); on narrow windows the toggle slides the sidebar in / out
  // as an overlay. Toggling sets `aria-expanded` and adds a class on
  // <body> that CSS hooks for the drawer animation.
  const tocBtn = win.document.querySelector(
    '.help-window-actions .toc-toggle',
  ) as HTMLButtonElement | null;
  if (tocBtn) {
    tocBtn.addEventListener('click', () => {
      const open = win.document.body.classList.toggle('toc-open');
      tocBtn.setAttribute('aria-expanded', String(open));
    });
  }
}

/**
 * Purpose: Decorate every `<pre>` / `[data-source]` block with an "Insérer" button.
 * How: Resolve the block's raw source, attach a click handler calling `onInsert`
 *   with brief inline confirmation feedback.
 */
// Walks every insertable block in the help body and prepends a small
// "Insérer" button. Two kinds of blocks qualify:
//   - <pre> code blocks (the literal markdown shown to the user) —
//     source = textContent of the inner <code>.
//   - elements with a `data-source` attribute — set by the marked
//     extensions and the mermaid post-processor on rendered blocks
//     (math placeholders, csv/tsv tables, charts, mermaid wrappers,
//     admonitions, inference rules). Source = data-source.
//
// The click handler runs in the parent's JS realm even though the
// DOM lives in the popup window, so we call onInsert(source)
// directly without any cross-window plumbing.
function addInsertButtons(
  win: Window,
  root: HTMLElement,
  onInsert: (source: string) => void,
): void {
  const candidates = root.querySelectorAll<HTMLElement>(
    'pre, [data-source]',
  );
  for (const el of candidates) {
    let source: string;
    if (el.dataset['source']) {
      source = el.dataset['source'];
    } else {
      const code = el.querySelector('code');
      source = (code?.textContent ?? el.textContent ?? '').replace(/\n$/, '');
    }
    if (source.trim() === '') continue;
    const btn = win.document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-insert-btn';
    // Permanent compact shape: just the arrow. The full label is
    // hidden until the user hovers / focuses the button (CSS in
    // windowSpecificCss). Hover-only used to make the button itself
    // disappear, which meant the user couldn't tell which blocks
    // were insertable without scanning every <pre>.
    const iconHtml = '<span class="icon">↘</span>';
    const labelHtml = '<span class="label">Insérer dans le document</span>';
    const defaultHtml = `${iconHtml}${labelHtml}`;
    btn.innerHTML = defaultHtml;
    btn.title = 'Copier cet exemple dans votre document à la position du curseur';
    btn.addEventListener('click', () => {
      onInsert(source);
      // Visual feedback. We force-show the label via an "inserted"
      // class so the message stays visible even after the cursor
      // leaves the button.
      btn.classList.add('inserted');
      btn.textContent = 'Inséré ✓';
      setTimeout(() => {
        btn.classList.remove('inserted');
        btn.innerHTML = defaultHtml;
      }, 1200);
    });
    el.classList.add('help-insertable');
    el.append(btn);
  }
}

/**
 * Purpose: Build a sticky table of contents from h2 / h3 headings in
 *   the help body, and wire smooth scroll-to-anchor on click plus
 *   active-section tracking via IntersectionObserver.
 * How: Walk every h2 and h3 in the rendered body that is NOT inside a
 *   `<pre>` (code-example headings shouldn't appear in the TOC). For
 *   each, assign a slug id if it doesn't already have one (markdown
 *   examples never reach here, so collisions are unlikely; we still
 *   deduplicate by suffixing -2, -3…). Build a flat list of `<li>`
 *   with class `toc-h2` / `toc-h3`, each wrapping an `<a>` whose
 *   href is `#<slug>`. On click, smoothly scroll the heading into
 *   view AND collapse the responsive drawer if it's open.
 *
 *   IntersectionObserver fires every time a heading crosses the top
 *   of the viewport — we mark the most recent one as the active
 *   section and add `.active` on its TOC link. A small rootMargin
 *   (top: -20% / bottom: -75%) makes the highlight feel responsive
 *   to scroll without flickering on tiny scroll movements.
 */
export function buildToc(win: Window, body: HTMLElement, nav: HTMLElement): void {
  const doc = win.document;
  // Skip headings that live inside code examples (```markdown blocks
  // showing markdown source). They render as `<pre><code>…</code></pre>`,
  // and any `## Foo` shown there isn't a real H2 element anyway —
  // marked emits them as text inside <code>, not as <h2>. So the
  // `:not(pre h*)` guard is mostly defensive against edge cases.
  const headings = Array.from(
    body.querySelectorAll<HTMLElement>('h2, h3, h4'),
  ).filter((h) => h.closest('pre') === null);
  if (headings.length === 0) return;

  const seenSlugs = new Set<string>();
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section';

  const ul = doc.createElement('ul');
  ul.className = 'help-toc-list';
  for (const h of headings) {
    if (!h.id) {
      let slug = slugify(h.textContent ?? '');
      let bumped = slug;
      let n = 2;
      while (seenSlugs.has(bumped)) {
        bumped = `${slug}-${n}`;
        n += 1;
      }
      h.id = bumped;
      seenSlugs.add(bumped);
    } else {
      seenSlugs.add(h.id);
    }
    const li = doc.createElement('li');
    li.className = `toc-${h.tagName.toLowerCase()}`;
    const a = doc.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = (h.textContent ?? '').trim();
    a.dataset.target = h.id;
    a.addEventListener('click', (evt) => {
      evt.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update the URL hash without a re-scroll so the address bar
      // reflects the section and the user can copy a deep link.
      history.replaceState(null, '', `#${h.id}`);
      // Close the responsive drawer if it was open.
      doc.body.classList.remove('toc-open');
      const tocBtn = doc.querySelector(
        '.help-window-actions .toc-toggle',
      ) as HTMLButtonElement | null;
      tocBtn?.setAttribute('aria-expanded', 'false');
    });
    li.append(a);
    ul.append(li);
  }
  nav.append(ul);

  // Scroll-spy: keep the active link in sync with the heading
  // currently nearest the top of the viewport. We observe ALL
  // headings (h2 + h3) so the highlight tracks deep sections too.
  const linksByTarget = new Map<string, HTMLAnchorElement>();
  for (const a of ul.querySelectorAll<HTMLAnchorElement>('a[data-target]')) {
    const target = a.dataset.target;
    if (target !== undefined) linksByTarget.set(target, a);
  }
  let activeId: string | null = null;
  const setActive = (id: string | null): void => {
    if (id === activeId) return;
    if (activeId !== null) linksByTarget.get(activeId)?.classList.remove('active');
    if (id !== null) {
      const link = linksByTarget.get(id);
      link?.classList.add('active');
      // Keep the active link in view inside the sidebar's scroll
      // container — `nearest` avoids jumping the whole sidebar to
      // top/bottom when the active heading is already visible.
      link?.scrollIntoView({ block: 'nearest' });
    }
    activeId = id;
  };
  // Track which headings are currently above the top fold line —
  // the deepest one is the active section. `entries` only fires on
  // crossing, so we maintain our own set instead of recomputing.
  const aboveFold = new Set<string>();
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).id;
        if (!id) continue;
        const bbox = e.boundingClientRect;
        // The heading is considered "above the fold" once its TOP
        // passes the rootMargin band — IntersectionObserver fires
        // with isIntersecting=false in both directions, so use
        // bbox.top to disambiguate above vs below the viewport.
        if (e.isIntersecting) {
          aboveFold.add(id);
        } else if (bbox.top < 0) {
          aboveFold.add(id);
        } else {
          aboveFold.delete(id);
        }
      }
      // Pick the last heading (in document order) that's currently
      // above the fold — that's the section the reader is in.
      let last: string | null = null;
      for (const h of headings) {
        if (aboveFold.has(h.id)) last = h.id;
      }
      setActive(last ?? headings[0]?.id ?? null);
    },
    {
      root: null,
      // Top band that defines "above the fold" for the scroll-spy.
      // -10% from the top keeps a small dead zone so the highlight
      // doesn't flicker when a heading is right at the edge.
      rootMargin: '-10% 0% -75% 0%',
      threshold: 0,
    },
  );
  for (const h of headings) obs.observe(h);
}

/**
 * Purpose: Window-only styles (sticky header, insert-button positioning).
 * How: Returns a CSS string concatenated after the bundled app stylesheet.
 */
// Styles only meaningful inside the help window itself — header bar,
// insert button positioning. The bulk of the typography comes from
// the bundled appCss above.
function windowSpecificCss(): string {
  return `
    body {
      margin: 0;
      font-family: var(--font-sans, system-ui);
      color: #1f2328;
      background: #fff;
    }
    .help-window-header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 1rem;
      background: #fff8d6;
      border-bottom: 1px solid #d0d7de;
    }
    .help-window-header h1 {
      flex: 1;
      margin: 0;
      font-size: 1.05rem;
      font-weight: 500;
    }
    .help-window-actions {
      display: flex;
      gap: 0.5rem;
    }
    .help-window-actions button {
      padding: 0.3rem 0.7rem;
      border: 1px solid #d0d7de;
      background: #fff;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
    }
    .help-window-actions button:disabled {
      opacity: 0.6;
      cursor: progress;
    }
    /* Layout: sticky TOC sidebar on the left + scrolling body on the
       right. The sidebar is height-locked to the viewport so its
       contents stay visible regardless of body scroll position. */
    .help-window-layout {
      display: grid;
      grid-template-columns: 250px 1fr;
      align-items: start;
    }
    .help-toc {
      position: sticky;
      /* Header height (~52px) defines where the sidebar starts so it
         doesn't slide under the sticky header. */
      top: 52px;
      max-height: calc(100vh - 52px);
      overflow-y: auto;
      padding: 1rem 0.6rem 1rem 1rem;
      border-right: 1px solid #eaecef;
      font-size: 0.86rem;
      line-height: 1.35;
    }
    .help-toc-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .help-toc-list li {
      margin: 0;
    }
    .help-toc-list a {
      display: block;
      padding: 0.15rem 0.4rem;
      color: #57606a;
      text-decoration: none;
      border-radius: 4px;
      border-left: 2px solid transparent;
    }
    .help-toc-list a:hover {
      background: #f3f4f6;
      color: #1f2328;
    }
    .help-toc-list a.active {
      color: #0969da;
      border-left-color: #0969da;
      background: #ddf4ff;
    }
    .help-toc-list .toc-h2 a {
      font-weight: 500;
      margin-top: 0.35rem;
    }
    .help-toc-list .toc-h3 a {
      padding-left: 1.1rem;
      font-size: 0.82rem;
    }
    .help-toc-list .toc-h4 a {
      padding-left: 1.9rem;
      font-size: 0.78rem;
      color: #6e7681;
    }
    /* Help body lives next to the TOC, mimic the historical padding. */
    #help-body {
      padding: 1rem 1.5rem 4rem;
      max-width: 740px;
      margin: 0 auto;
      /* Add scroll-margin so anchor jumps don't hide the heading
         under the sticky header. */
      scroll-padding-top: 60px;
    }
    #help-body :is(h1, h2, h3, h4) {
      scroll-margin-top: 60px;
    }
    /* The Sommaire toggle button is only useful on narrow windows. */
    .help-window-actions .toc-toggle {
      display: none;
    }

    /* Narrow window: sidebar slides in / out as an overlay drawer.
       The Sommaire toggle becomes visible; clicking it sets
       .toc-open on body which slides the sidebar into view. */
    @media (max-width: 800px) {
      .help-window-layout {
        grid-template-columns: 1fr;
      }
      .help-window-actions .toc-toggle {
        display: inline-block;
      }
      .help-toc {
        position: fixed;
        top: 52px;
        left: 0;
        z-index: 9;
        width: 260px;
        max-width: 80vw;
        background: #fff;
        border-right: 1px solid #d0d7de;
        box-shadow: 2px 0 8px rgba(0, 0, 0, 0.08);
        transform: translateX(-105%);
        transition: transform 180ms ease-out;
      }
      body.toc-open .help-toc {
        transform: translateX(0);
      }
    }
    /* Insert button: floats top-right of each <pre>. Always visible
       at low opacity so the user can tell at a glance which blocks
       are insertable; ramps to full opacity on hover/focus and
       reveals the full label. */
    .help-insertable {
      position: relative;
    }
    .help-insertable .help-insert-btn {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      font-size: 0.78rem;
      padding: 0.15rem 0.45rem;
      border: 1px solid #d0d7de;
      background: #ffffffcc;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0.45;
      transition: opacity 0.12s;
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
      font: inherit;
    }
    .help-insertable .help-insert-btn .icon {
      font-size: 1em;
      line-height: 1;
    }
    .help-insertable .help-insert-btn .label {
      display: none;
    }
    .help-insertable:hover .help-insert-btn,
    .help-insertable .help-insert-btn:focus,
    .help-insertable .help-insert-btn.inserted {
      opacity: 1;
    }
    .help-insertable:hover .help-insert-btn .label,
    .help-insertable .help-insert-btn:focus .label {
      display: inline;
    }
  `;
}
