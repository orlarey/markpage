/****************************** running-apparatus.ts ***************************
 *
 * Purpose: Compile a RESOLVED running apparatus — the style editor's header /
 *   footer composition (band × parity × zone → stack of materials) — into CSS
 *   Paged Media margin-box declarations. Values only, never a rule engine: the
 *   editor already resolved everything; this just formats it.
 * How: Each zone's stack renders as an inline sequence (separator " · "),
 *   REVERSED on verso to hold the left↔right spread mirror. Positions mirror
 *   too (inner = spine, outer = edge): on a recto (@page :right) inner→left …
 *   outer→right; on a verso (@page :left) the two swap. Running-head materials
 *   (chapter / section / doctitle) resolve via `string-set` on the matching
 *   heading; folio via `counter(page)`.
 *
 * NOTE: the exact `@page` scoping for the live Vivliostyle pipeline (which today
 *   names per-fence sections `mp-section-N`) is wiring left for a follow-up —
 *   this module owns only the engine-neutral compilation logic, unit-tested.
 *
 *******************************************************************************/

/** One running material. Objects carry a literal string; strings are tokens. */
export type ApparatusMaterial =
  | 'folio'
  | 'folioRoman'
  | 'chapter'
  | 'section'
  | 'doctitle'
  | 'author'
  | 'date'
  | { text: string };

export interface ApparatusZones {
  inner: ApparatusMaterial[];
  center: ApparatusMaterial[];
  outer: ApparatusMaterial[];
}
export interface ApparatusBand {
  verso: ApparatusZones;
  recto: ApparatusZones;
}
export interface RunningApparatus {
  header: ApparatusBand;
  footer: ApparatusBand;
}

const SEP = ' · ';

function cssString(s: string): string {
  return `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

/** The current date, long French form (matches the fence path's {date}). */
function formatDate(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
    new Date(),
  );
}

/** A material → its CSS `content` fragment. `author` resolves to the document's
 *  author (a metadata value known only at render), like `{text}`. */
export function materialToCss(m: ApparatusMaterial, author = ''): string {
  if (typeof m === 'object') return cssString(m.text);
  switch (m) {
    case 'folio':
      return 'counter(page)';
    case 'folioRoman':
      return 'counter(page, lower-roman)';
    case 'chapter':
      return 'string(mp-title)';
    case 'section':
      return 'string(mp-section)';
    case 'doctitle':
      return 'string(mp-doctitle)';
    case 'author':
      return cssString(author);
    case 'date':
      return cssString(formatDate());
    default:
      return '""';
  }
}

/** A zone's stack → an inline CSS `content` value; reversed on verso. */
export function zoneToCss(
  stack: ApparatusMaterial[],
  reversed: boolean,
  author = '',
): string {
  if (stack.length === 0) return '""';
  const items = reversed ? [...stack].reverse() : stack;
  const parts: string[] = [];
  items.forEach((m, i) => {
    if (i > 0) parts.push(cssString(SEP));
    parts.push(materialToCss(m, author));
  });
  return parts.join(' ');
}

/** The `string-set` rules needed by the running-head materials actually used. */
export function apparatusStringSets(app: RunningApparatus): string[] {
  const used = new Set<string>();
  const scan = (z: ApparatusZones): void => {
    [...z.inner, ...z.center, ...z.outer].forEach((m) => {
      if (typeof m === 'string') used.add(m);
    });
  };
  [app.header, app.footer].forEach((b) => {
    scan(b.verso);
    scan(b.recto);
  });
  const rules: string[] = [];
  if (used.has('chapter'))
    rules.push('h1:not(.doc-title) { string-set: mp-title content(); }');
  if (used.has('section'))
    rules.push('h2 { string-set: mp-section content(); }');
  if (used.has('doctitle'))
    rules.push('h1.doc-title { string-set: mp-doctitle content(); }');
  return rules;
}

/**
 * Compile the whole apparatus to CSS. Emits the needed `string-set` rules then,
 * per band (header→@top, footer→@bottom), an `@page :right` (recto) and an
 * `@page :left` (verso) rule filling the three margin boxes with the mirrored,
 * verso-reversed zone content.
 */
export function runningApparatusCss(
  app: RunningApparatus,
  // opts.boxDecls: running-content declarations (colour / size / font …) placed on
  // EACH margin box — Vivliostyle styles the @page-generated running content here,
  // not via the host `.pagedjs_margin-*` classes. opts.author resolves the `author`
  // material to the document's author (a render-time metadata value).
  opts: { boxDecls?: string; author?: string } = {},
): string {
  const rules: string[] = [...apparatusStringSets(app)];
  const d = opts.boxDecls ? ` ${opts.boxDecls}` : '';
  const a = opts.author ?? '';
  const band = (edge: 'top' | 'bottom', b: ApparatusBand): string => {
    const recto =
      `@page :right { ` +
      `@${edge}-left { content: ${zoneToCss(b.recto.inner, false, a)};${d} } ` +
      `@${edge}-center { content: ${zoneToCss(b.recto.center, false, a)};${d} } ` +
      `@${edge}-right { content: ${zoneToCss(b.recto.outer, false, a)};${d} } }`;
    const verso =
      `@page :left { ` +
      `@${edge}-left { content: ${zoneToCss(b.verso.outer, true, a)};${d} } ` +
      `@${edge}-center { content: ${zoneToCss(b.verso.center, true, a)};${d} } ` +
      `@${edge}-right { content: ${zoneToCss(b.verso.inner, true, a)};${d} } }`;
    return `${recto}\n${verso}`;
  };
  rules.push(band('top', app.header));
  rules.push(band('bottom', app.footer));
  return rules.join('\n');
}
