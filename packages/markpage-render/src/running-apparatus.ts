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

/** A material → its CSS `content` fragment. */
export function materialToCss(m: ApparatusMaterial): string {
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
    case 'date':
      return cssString(formatDate());
    default:
      return '""';
  }
}

/** A zone's stack → an inline CSS `content` value; reversed on verso. */
export function zoneToCss(stack: ApparatusMaterial[], reversed: boolean): string {
  if (stack.length === 0) return '""';
  const items = reversed ? [...stack].reverse() : stack;
  const parts: string[] = [];
  items.forEach((m, i) => {
    if (i > 0) parts.push(cssString(SEP));
    parts.push(materialToCss(m));
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
  // running-content declarations (colour / size / font …) placed on EACH margin
  // box: Vivliostyle styles the @page-generated running content here, not via the
  // host `.pagedjs_margin-*` classes. Empty string leaves the boxes unstyled.
  boxDecls = '',
): string {
  const rules: string[] = [...apparatusStringSets(app)];
  const d = boxDecls ? ` ${boxDecls}` : '';
  const band = (edge: 'top' | 'bottom', b: ApparatusBand): string => {
    const recto =
      `@page :right { ` +
      `@${edge}-left { content: ${zoneToCss(b.recto.inner, false)};${d} } ` +
      `@${edge}-center { content: ${zoneToCss(b.recto.center, false)};${d} } ` +
      `@${edge}-right { content: ${zoneToCss(b.recto.outer, false)};${d} } }`;
    const verso =
      `@page :left { ` +
      `@${edge}-left { content: ${zoneToCss(b.verso.outer, true)};${d} } ` +
      `@${edge}-center { content: ${zoneToCss(b.verso.center, true)};${d} } ` +
      `@${edge}-right { content: ${zoneToCss(b.verso.inner, true)};${d} } }`;
    return `${recto}\n${verso}`;
  };
  rules.push(band('top', app.header));
  rules.push(band('bottom', app.footer));
  return rules.join('\n');
}
