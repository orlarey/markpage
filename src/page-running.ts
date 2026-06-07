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
  const decls = [
    cssMarginBox(`${bandPrefix}-left`, slots.left),
    cssMarginBox(`${bandPrefix}-center`, slots.center),
    cssMarginBox(`${bandPrefix}-right`, slots.right),
  ].join(' ');
  const argKey = pickArg(args);
  const argsAttr = argKey === '' ? '' : ` data-args="${argKey}"`;
  return `<style class="page-running-fence" data-kind="${kind}"${argsAttr}>${decls}</style>\n`;
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
export function applyPageRunningRuns(root: HTMLElement): string {
  const children = Array.from(root.children);
  let sectionIdx = 0;
  let currentDecls = new Map<string, string>();
  // Per-section snapshot of accumulated declarations, indexed by section number.
  const stateBySection = new Map<number, Map<string, string>>();

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
    } else if (sectionIdx > 0 && child instanceof HTMLElement) {
      child.style.setProperty('page', `mp-section-${sectionIdx}`);
    }
  }

  // Emit one @page rule per section × arg key combination.
  const cssRules: string[] = [];
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
      const selector = argKey === '' ? pageName : `${pageName}:${argKey}`;
      cssRules.push(`@page ${selector} { ${declList.join(' ')} }`);
    }
  }
  return cssRules.join('\n');
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
 */
function cssMarginBox(boxName: string, slotContent: string): string {
  return `@${boxName} { content: ${slotContentToCss(slotContent)}; }`;
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
 *   (paged.js has no native date counter). `title` is Phase 4 — emits
 *   an empty string for now. Unknown names emit the literal `{name}`
 *   text so the user notices the typo.
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
      return '""';
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
