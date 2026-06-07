/********************************* page-running.ts *****************************
 *
 * Purpose: Render the ` ```header ` / ` ```footer ` fences — running
 *   content for the page margin boxes (top / bottom band, 3 slots each:
 *   left | center | right). Variables `{page}`, `{pages}`, `{date}` are
 *   substituted at render time (counters or static date).
 * How:
 *   - `renderPageRunning` emits an invisible `<style class="page-
 *     running-fence" data-kind="..." data-args="...">` sentinel
 *     containing only the `@<box>` declarations (no `@page` wrapper).
 *     The sentinel marks its position in the document flow and carries
 *     its payload as plain CSS box declarations.
 *   - `applyPageRunningRuns` walks the document, partitions it into
 *     runs at each sentinel, tags each top-level content child with
 *     a `page: mp-section-N` inline style, and emits a CSS string
 *     of `@page mp-section-N { ... }` rules to be passed to paged.js
 *     as an additional stylesheet.
 *
 *   This realizes SPEC §26 Phase 2 — runs (the LAST fence of a given
 *   `(kind, arg)` tuple wins for the section starting at its position,
 *   inheriting all other tuples from prior sections). Sections come
 *   from accumulated state, not from one section per fence.
 *
 *   Args recognized in Phase 2 (cf. SPEC §26.4):
 *     - no args (default) — applies to all pages of the section
 *     - first  — applies to the first page of the section (`@page name:first`)
 *     - blank  — applies to paged.js-inserted blank pages (`:blank`)
 *
 *   A fence ALWAYS emits all 3 slots of its band, even if some are
 *   empty (content: ""). Reason: SPEC §26.6 — a fence replaces the
 *   ENTIRE band, so missing slots must clear any prior section's
 *   slots for the same boxes.
 *
 *******************************************************************************/

export type PageRunningKind = 'header' | 'footer';

/** Args we recognize in Phase 2. Others are silently ignored. */
type RecognizedArg = '' | 'first' | 'blank';

const RECOGNIZED_ARGS: ReadonlySet<RecognizedArg> = new Set(['', 'first', 'blank']);

/**
 * Monotonic counter for unique running-element names (`mpr1`, `mpr2`, …).
 * Used when a slot mixes plain text with inline markdown emphasis and
 * therefore can't be rendered as a flat CSS `content: "..."` string —
 * we inject an actual HTML element and let paged.js's
 * `position: running()` + `content: element()` machinery render it in
 * the margin box. Module-level rather than per-render: stale names
 * don't conflict because previous renders' DOM is fully replaced.
 * Tests can call `resetPageRunningCounter()` for deterministic names.
 */
let runningCounter = 0;
function nextRunningName(): string {
  runningCounter += 1;
  return `mpr${runningCounter}`;
}
export function resetPageRunningCounter(): void {
  runningCounter = 0;
}

/**
 * Purpose: Render a `<style>` sentinel that carries the @-rule body for
 *   one band (top for header, bottom for footer) plus the args as a
 *   `data-args` attribute. The sentinel is placed inline in the
 *   document flow at the fence's source position so
 *   `applyPageRunningRuns` can partition the document there.
 * How: Parse the body into 3 slots, convert each slot's mini-syntax
 *   into a CSS `content` value, emit one declaration per margin box.
 *   The `<style>` content is JUST the box declarations — no surrounding
 *   `@page { ... }`. The wrapper is added per-section by
 *   `applyPageRunningRuns` once it has assigned a section name.
 */
export function renderPageRunning(
  kind: PageRunningKind,
  body: string,
  args: string[] = [],
): string {
  const slots = parseSlots(body);
  const bandPrefix = kind === 'header' ? 'top' : 'bottom';
  const outputs = [
    renderSlot(`${bandPrefix}-left`, slots.left),
    renderSlot(`${bandPrefix}-center`, slots.center),
    renderSlot(`${bandPrefix}-right`, slots.right),
  ];
  const decls = outputs.map((o) => o.decl).join(' ');
  // Slots that needed the element() path bring their own HTML running
  // element (positioned out of flow by paged.js via `position: running()`
  // — see applyPageRunningRuns for the global rule that wires it up).
  // The element MUST sit in the document near its sentinel so paged.js
  // sees it during the chunking pass.
  const runningEls = outputs
    .filter((o) => o.runningHtml !== undefined)
    .map((o) => o.runningHtml)
    .join('');
  const argKey = pickArg(args);
  const argsAttr = argKey === '' ? '' : ` data-args="${argKey}"`;
  return `<style class="page-running-fence" data-kind="${kind}"${argsAttr}>${decls}</style>${runningEls}\n`;
}

/**
 * Purpose: Walk the document, partition it into runs at each fence
 *   sentinel, tag each top-level content child with the inline style
 *   `page: mp-section-N`, and return the assembled CSS string of
 *   `@page` rules for all the sections.
 * How: One left-to-right pass over `root.children`.
 *   - When a sentinel is encountered: increment the section counter,
 *     copy the previous section's accumulated state, and update the
 *     one slot keyed by `(kind, arg)` carried by the sentinel.
 *   - When a non-sentinel content element is encountered: set its
 *     inline `page` property to the current section name (so paged.js
 *     places it on a page of that name).
 *   - At the end, emit one `@page mp-section-N { ... }` rule per
 *     section, grouping the box declarations by arg key
 *     (no arg → `@page name { ... }`, `first` → `@page name:first`,
 *     `blank` → `@page name:blank`).
 *
 *   Content elements appearing BEFORE the first sentinel are not
 *   tagged: they use the unnamed default `@page` rule (= no running
 *   content). The user who wants a header on page 1 must place the
 *   fence at the very top of the source.
 *
 *   Cascade semantics: a new fence with args `''` (default) replaces
 *   the previous section's `''` declarations for that kind. A new
 *   fence with args `first` updates only `first` and leaves the `''`
 *   default untouched (so the section now has BOTH a default and a
 *   first-page-only override). This is the "missing slots clear"
 *   property of SPEC §26.5 at the (kind, arg) granularity.
 *
 *   Side effect: mutates the DOM. The mutation is idempotent on a
 *   stable input — calling twice yields the same result.
 */
export function applyPageRunningRuns(
  root: HTMLElement,
  options: { duplex?: boolean } = {},
): string {
  const duplex = options.duplex === true;
  const children = Array.from(root.children);
  let sectionIdx = 0;
  let currentDecls = new Map<string, string>();
  // Per-section snapshot of accumulated declarations, indexed by section number.
  const stateBySection = new Map<number, Map<string, string>>();
  // Collected running-element names (from .mp-running divs that the
  // element() path injects next to its sentinel). Each needs a global
  // `position: running()` rule so paged.js captures it and pipes it to
  // the matching `content: element(...)` reference in the @page rules.
  const runningNames: string[] = [];
  // Collected .mp-running divs themselves. We defer tagging them with
  // a data-page until AFTER the walk completes: every fence in a run
  // increments sectionIdx, so consecutive fences (e.g. header + footer
  // at the top of the doc) would otherwise give their respective
  // .mp-running divs DIFFERENT data-page values (mp-section-1 vs
  // mp-section-2). paged.js treats those data-page transitions between
  // sibling elements as page boundaries, leaving the cover page
  // visually empty (it contains only invisible running sources).
  // Tagging all .mp-running divs with the FINAL section after the walk
  // keeps the data-page uniform across the whole leading block of
  // sentinels + their sources, so the first body element lands on the
  // same page as the sources.
  const mpRunningDivs: HTMLElement[] = [];

  for (const child of children) {
    if (
      child.tagName === 'STYLE' &&
      child.classList.contains('page-running-fence')
    ) {
      const sentinel = child as HTMLStyleElement;
      const kind = (sentinel.dataset.kind ?? 'header') as PageRunningKind;
      const argKey = (sentinel.dataset.args ?? '') as RecognizedArg;
      const decls = sentinel.textContent ?? '';
      sectionIdx += 1;
      currentDecls = new Map(currentDecls);
      currentDecls.set(`${kind}:${argKey}`, decls);
      stateBySection.set(sectionIdx, currentDecls);
      // Remove the sentinel from the DOM now that we've extracted its
      // payload. Leaving it in place would make paged.js treat it as
      // content (it sits between blocks), creating a stray block in the
      // page flow and pushing the first content element onto page 2 —
      // which then becomes the only page that gets the named-page
      // classes (verified by probe).
      sentinel.remove();
    } else if (
      child instanceof HTMLElement &&
      child.classList.contains('mp-running')
    ) {
      // Running element for the element() path. paged.js's
      // `position: running()` rule (registered globally below) will set
      // display:none on the source and append a clone to whichever
      // @margin box references it via `content: element(name)`. Collect
      // its name so we can emit the matching `position: running()` rule.
      for (const cls of child.classList) {
        const m = /^mp-running-(\w+)$/.exec(cls);
        if (m && m[1] !== undefined) runningNames.push(m[1]);
      }
      // Defer the data-page tagging — done in a second pass below so
      // every .mp-running gets the SAME (final) section, regardless of
      // when its parent fence was processed (see mpRunningDivs comment).
      mpRunningDivs.push(child);
    } else if (sectionIdx > 0 && child instanceof HTMLElement) {
      // paged.js's named-page tagging reads `data-page` attribute, not
      // the CSS `page` property. Setting `style: page: name` is silently
      // ignored — verified in pagedjs/src/modules/paged-media/atpage.js
      // (`addPageAttributes` calls `start.dataset.page`).
      child.setAttribute('data-page', `mp-section-${sectionIdx}`);
    }
  }
  // Second pass: tag every .mp-running with the FINAL section index so
  // adjacent sources don't trigger page boundaries (see mpRunningDivs
  // comment above). The final section is the one that actually consumes
  // the running elements via element() in its (cascaded) @page rule —
  // section 1 in a header-only doc, section 2 if the doc has both a
  // header and a footer fence at the top, etc.
  if (sectionIdx > 0) {
    for (const div of mpRunningDivs) {
      div.setAttribute('data-page', `mp-section-${sectionIdx}`);
    }
  }

  // Emit one @page rule per section × arg key combination.
  const cssRules: string[] = [];
  // Prepend the string-set rule so {title} ↦ string(mp-title) can
  // resolve to the most recent h1 the renderer has crossed (SPEC §26.3).
  // Harmless when no fence references {title}. Only emitted when there
  // is at least one section — without fences there is nothing to back.
  if (stateBySection.size > 0) {
    cssRules.push('h1 { string-set: mp-title content() }');
  }
  // Global `position: running()` rules for every running element the
  // element() path injected. UNSCOPED on purpose: paged.js's
  // running-headers handler runs the selector against the cloned source
  // DOM (which lives outside `#preview-pane`), so a scope wrapper would
  // make the rule match zero elements — same caveat as `float: footnote`
  // in buildSidenoteCss(). Belt-and-braces: a non-paged.js renderer
  // (no running-headers handler) would still show the element in body
  // flow; hide it with a fallback `display: none` so users never see
  // running content twice. paged.js's `position: running()` overrides
  // the `display: none` for the captured copy.
  for (const name of runningNames) {
    cssRules.push(`.mp-running-${name} { position: running(${name}); }`);
  }
  if (runningNames.length > 0) {
    cssRules.push('.mp-running { display: none; }');
  }
  for (const [idx, decls] of stateBySection) {
    const pageName = `mp-section-${idx}`;
    // Group declarations by arg key.
    const byArg = new Map<RecognizedArg, string[]>();
    for (const [key, declText] of decls) {
      const argKey = key.split(':')[1] as RecognizedArg;
      if (!byArg.has(argKey)) byArg.set(argKey, []);
      byArg.get(argKey)!.push(declText);
    }
    for (const [argKey, declList] of byArg) {
      const declText = declList.join(' ');
      if (argKey === '') {
        // §9.6.6 / §9.5.4 — in duplex, the slot alphabet is
        // `inner-left | center | outer-right`. On recto (`@page
        // :right`) they map literally to @top-left / @top-center /
        // @top-right; on verso (`@page :left`) we swap left ↔ right
        // so the outer-right slot stays physically on the trim side
        // of the open book.
        // paged.js applies the `:left` rule even in simplex (every
        // even page gets `pagedjs_left_page`), so we MUST gate the
        // swap on the duplex flag — otherwise even pages would render
        // with their slots inverted in a simplex document.
        if (duplex) {
          cssRules.push(`@page ${pageName}:right { ${declText} }`);
          cssRules.push(`@page ${pageName}:left  { ${swapInnerOuter(declText)} }`);
        } else {
          cssRules.push(`@page ${pageName} { ${declText} }`);
        }
      } else {
        // Non-default args (`first`, `blank`) keep the literal slot
        // mapping for now — the auto-swap only applies to the default
        // run rule. Refinement (per-arg swap) is a follow-up if the
        // need surfaces.
        cssRules.push(`@page ${pageName}:${argKey} { ${declText} }`);
      }
    }
  }
  return cssRules.join('\n');
}

/**
 * Purpose: Produce the verso (`@page :left`) variant of a band of
 *   margin-box declarations by swapping `@top-left ↔ @top-right` and
 *   `@bottom-left ↔ @bottom-right`. The center box never moves.
 * How: Three-step rename via a unique placeholder so the two-way swap
 *   doesn't lose its first side to the second renaming. Operates on
 *   both `@top-*` and `@bottom-*` in one call — a fence's declarations
 *   only ever touch one band but accumulated sections combine them.
 */
function swapInnerOuter(decls: string): string {
  const TOP_PLACEHOLDER = '';
  const BOT_PLACEHOLDER = '';
  return decls
    .replaceAll('@top-left', TOP_PLACEHOLDER)
    .replaceAll('@top-right', '@top-left')
    .replaceAll(TOP_PLACEHOLDER, '@top-right')
    .replaceAll('@bottom-left', BOT_PLACEHOLDER)
    .replaceAll('@bottom-right', '@bottom-left')
    .replaceAll(BOT_PLACEHOLDER, '@bottom-right');
}

/**
 * Purpose: Reduce a positional args array to the single recognized key
 *   we use to disambiguate fences within a section. In Phase 2 these
 *   are `first`, `blank`, or the empty string (default).
 * How: Take the first arg that matches one of the recognized keys.
 *   Unknown args are silently ignored (forward-compat with Phase 3+).
 */
function pickArg(args: string[]): RecognizedArg {
  for (const a of args) {
    if (RECOGNIZED_ARGS.has(a as RecognizedArg) && a !== '') return a as RecognizedArg;
  }
  return '';
}

interface Slots {
  left: string;
  center: string;
  right: string;
}

/**
 * Purpose: Emit one `@<box-name> { content: ... }` declaration for a
 *   margin box (e.g. `@top-left { content: "Mon doc"; }`).
 * How: Convert the slot's mini-syntax to a CSS content value via
 *   slotContentToCss. Always emit the box — missing slots must clear
 *   (content: "") to override any inherited rule.
 *
 *   Phase-4b partial support: if the slot text is entirely wrapped in
 *   `**...**` (bold), `*...*` (italic), or `***...***` (bold italic),
 *   strip the markers AND apply font-weight / font-style to the whole
 *   margin box. CSS `content` can't host nested styling, so we get
 *   exactly one styled slot at a time — sufficient for the common
 *   case of a bold folio (`**{page}**`). Mixed-style slots like
 *   `Page **{page}**` still render the asterisks literally; users
 *   wanting per-fragment styling have to wait for the proper
 *   `running()` + element pipeline (out of v1 practice, SPEC §26.10).
 */
interface RenderedSlot {
  /** The `@<box> { ... }` CSS rule for this slot. */
  decl: string;
  /**
   * Set when the slot was rendered via the element() path: an HTML
   * element that paged.js will pull out of flow and place in the
   * margin box. Empty when the slot used the plain CSS `content: "..."`
   * path. The element carries `class="mp-running mp-running-<name>"`
   * so applyPageRunningRuns can emit the matching `position: running()`
   * rule.
   */
  runningHtml?: string;
}

function renderSlot(boxName: string, slotContent: string): RenderedSlot {
  const { content, bold, italic } = extractWholeSlotStyle(slotContent);
  // Whole-slot wrap path (and the trivial plain-text / vars-only path):
  // emit a `content: "..."` CSS string, optionally bolding / italicizing
  // the entire margin box. This is the only path that supports `{var}`
  // substitutions because CSS `content` can mix strings and counter()
  // calls — element() captures a static HTML element and would lose
  // dynamic counters.
  if (bold || italic || !needsElementRendering(content)) {
    const decls = [`content: ${slotContentToCss(content)};`];
    if (bold) decls.push('font-weight: bold;');
    if (italic) decls.push('font-style: italic;');
    return { decl: `@${boxName} { ${decls.join(' ')} }` };
  }
  // element() path: the slot mixes plain text with inline emphasis
  // (and contains no `{var}` substitutions, so we don't sacrifice
  // dynamic counter rendering). Convert the slot's inline markdown
  // (`**bold**`, `*italic*`, `***both***`) to an HTML fragment, wrap
  // it in a `<div class="mp-running mp-running-<name>">`, and reference
  // it via element(<name>) in the margin box. paged.js's
  // running-headers handler (modules/generated-content/running-headers.js)
  // captures the element from the source and renders it at the
  // requested location.
  const name = nextRunningName();
  const html = inlineMarkdownToHtml(content);
  return {
    decl: `@${boxName} { content: element(${name}); }`,
    runningHtml: `<div class="mp-running mp-running-${name}">${html}</div>`,
  };
}

/**
 * Whether the slot needs the element() rendering path — i.e. it has
 * inline markdown emphasis the CSS `content` string can't express AND
 * it has no `{var}` substitutions (which only the CSS path supports).
 */
function needsElementRendering(slot: string): boolean {
  return slotHasInlineEmphasis(slot) && !slotHasVars(slot);
}

function slotHasVars(slot: string): boolean {
  return /\{[\w-]+\}/.test(slot);
}

/**
 * True if the slot contains a `**bold**` / `*italic*` pair that isn't
 * the whole-slot wrap already handled by extractWholeSlotStyle. The
 * markers must surround at least one non-whitespace character (markdown
 * requires emphasis spans to have content) — `* foo *` with leading /
 * trailing space inside the markers doesn't count as emphasis per
 * CommonMark.
 */
function slotHasInlineEmphasis(slot: string): boolean {
  // bold (`**X**`) or bold-italic (`***X***`) — pattern requires a
  // non-space character right after the opening run.
  if (/\*\*\S[\s\S]*?\S\*\*|\*\*\S\*\*/.test(slot)) return true;
  // italic (`*X*`) — must NOT be part of a `**` run. The negative
  // lookbehind / lookahead exclude `*` neighbours.
  if (/(?<!\*)\*\S[\s\S]*?\S\*(?!\*)|(?<!\*)\*\S\*(?!\*)/.test(slot)) return true;
  return false;
}

/**
 * Tiny inline-markdown → HTML converter for fence slot text. Handles
 * `***X***` (bold + italic), `**X**` (bold) and `*X*` (italic) — order
 * matters: longer markers first so the shorter regex doesn't match a
 * leading `*` of a `**` pair. Everything else is HTML-escaped first to
 * keep authors from accidentally injecting raw tags.
 */
function inlineMarkdownToHtml(s: string): string {
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped
    .replace(/\*\*\*(\S(?:[\s\S]*?\S)?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(\S(?:[\s\S]*?\S)?)\*(?!\*)/g, '<em>$1</em>');
}

/**
 * Purpose: If the slot is wrapped entirely in markdown-style emphasis
 *   markers, return the content stripped of the markers plus the
 *   styling flags to apply on the margin box.
 * How: Test the strongest wrap (`***`) first, then bold (`**`), then
 *   italic (`*`). The length guards (≥7, ≥5, ≥3) ensure we have at
 *   least one character inside the markers — guards against `**`
 *   (empty bold) and similar pathological inputs.
 */
function extractWholeSlotStyle(slot: string): {
  content: string;
  bold: boolean;
  italic: boolean;
} {
  if (slot.startsWith('***') && slot.endsWith('***') && slot.length >= 7) {
    return { content: slot.slice(3, -3), bold: true, italic: true };
  }
  if (slot.startsWith('**') && slot.endsWith('**') && slot.length >= 5) {
    return { content: slot.slice(2, -2), bold: true, italic: false };
  }
  if (slot.startsWith('*') && slot.endsWith('*') && slot.length >= 3) {
    return { content: slot.slice(1, -1), bold: false, italic: true };
  }
  return { content: slot, bold: false, italic: false };
}

/**
 * Purpose: Split the fence body into the 3 slots (left | center | right).
 * How: Take the first non-blank line of the body — multi-line per slot
 *   is reserved for later (CSS @page boxes have a fixed height anyway).
 *   Split on unescaped `|`; `\|` is a literal pipe. Trim each slot.
 *   Missing trailing pipes yield empty slots (e.g. `Title |` →
 *   {left: 'Title', center: '', right: ''}).
 */
function parseSlots(body: string): Slots {
  const line = body.split('\n').find((l) => l.trim() !== '') ?? '';
  const parts: string[] = [];
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && line[i + 1] === '|') {
      buf += '|';
      i += 1;
      continue;
    }
    if (c === '|') {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
  parts.push(buf);
  return {
    left: (parts[0] ?? '').trim(),
    center: (parts[1] ?? '').trim(),
    right: (parts[2] ?? '').trim(),
  };
}

/**
 * Purpose: Translate a slot's mini-syntax (plain text + `{var}`
 *   substitutions) into a CSS `content` value — a space-separated list
 *   of CSS strings and `counter(...)` calls.
 * How: Walk the slot, accumulating literal characters into a string
 *   buffer. On `{name}` emit the buffer as a CSS string token, then
 *   emit the corresponding counter / static substitution. Empty slot
 *   → `""` (a single empty string, valid CSS).
 */
function slotContentToCss(slot: string): string {
  if (slot === '') return '""';
  const tokens: string[] = [];
  let text = '';
  let i = 0;
  while (i < slot.length) {
    if (slot[i] === '{') {
      const end = slot.indexOf('}', i + 1);
      if (end !== -1) {
        const name = slot.slice(i + 1, end);
        if (text !== '') {
          tokens.push(cssString(text));
          text = '';
        }
        tokens.push(varToCss(name));
        i = end + 1;
        continue;
      }
    }
    text += slot[i];
    i += 1;
  }
  if (text !== '') tokens.push(cssString(text));
  return tokens.join(' ');
}

/**
 * Purpose: Map a `{name}` variable to its CSS content equivalent.
 * How: `page` / `pages` become `counter(...)` calls (resolved per-page
 *   by paged.js). `date` is substituted statically at render time
 *   (paged.js has no native date counter). `title` becomes
 *   `string(mp-title)`, fed by the string-set rule on h1 that
 *   `applyPageRunningRuns` prepends to its CSS output. Unknown names
 *   emit the literal `{name}` text so the user notices the typo.
 */
function varToCss(name: string): string {
  switch (name) {
    case 'page':
      return 'counter(page)';
    case 'pages':
      return 'counter(pages)';
    case 'date':
      return cssString(formatDate());
    case 'title':
      return 'string(mp-title)';
    default:
      return cssString(`{${name}}`);
  }
}

/** Format the current date as the long French form (matches §9.2). */
function formatDate(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
    new Date(),
  );
}

/**
 * Purpose: Quote a string as a CSS `<string>` literal.
 * How: Backslash-escape backslashes and double quotes, wrap in `"..."`.
 *   CSS strings allow most characters literally; the two we MUST escape
 *   are `"` (delimiter) and `\` (escape char).
 */
function cssString(s: string): string {
  return `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
