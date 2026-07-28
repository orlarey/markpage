/********************************* style-vocabulary ****************************
 *
 * The serialized COLOUR axis of a style (docs/STYLE-EDITOR-SPEC.md §8).
 *
 * A style's colours are carried by two flat front-matter keys:
 *
 *     color-hue: 213
 *     color-crans: "titre:4,4 h1:4,3 corps:n4 code:n4 legende:n3 en-tete:n2"
 *
 * We store the CRAN — a position on the fixed 6×6 saturation × value grid, or
 * `n<i>` on the 6-step neutral column — never the resolved hex. The final
 * colour is DERIVED from (hue, cran) here, so the coordination invariant
 * "one hue → the whole family pivots" (SPEC §4) survives a save: rotating
 * `color-hue` re-derives every tinted element at once.
 *
 * Pure and host-agnostic: shared by the app and the VS Code preview. No DOM,
 * no settings types — it maps element names to `{ element → #rrggbb }`, and the
 * caller splices those onto its own per-element style model.
 *
 *****************************************************************************/

/** The fixed colour grid — 6 saturation × 6 value crans, plus the 6-step
 *  neutral column. Frozen by SPEC §4 / invariant I3: enough nuance for a rich
 *  family, few enough to not reopen the degrees of freedom. Index 0..5. */
const SAT = [0.06, 0.18, 0.32, 0.48, 0.65, 0.82] as const;
const VAL = [0.98, 0.85, 0.7, 0.54, 0.38, 0.2] as const;
const GRAY = [1.0, 0.82, 0.62, 0.42, 0.22, 0.0] as const; // white → black

/** A cran: a tinted position (sat×value index) or a neutral step. */
export type Cran =
  | { kind: 'tint'; s: number; v: number }
  | { kind: 'neutral'; g: number };

const clampIdx = (n: number): number => Math.max(0, Math.min(5, Math.round(n)));

/** HSV (h∈[0,360), s,v∈[0,1]) → `#rrggbb`. */
export function hsvToHex(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hx = (u: number): string =>
    Math.round((u + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

/** Resolve a cran to a concrete colour under a given hue. A neutral cran
 *  ignores the hue entirely (saturation 0). */
export function cranToHex(hue: number, cran: Cran): string {
  if (cran.kind === 'neutral') {
    return hsvToHex(0, 0, GRAY[clampIdx(cran.g)]);
  }
  return hsvToHex(hue, SAT[clampIdx(cran.s)], VAL[clampIdx(cran.v)]);
}

/** Parse one cran token: `4,3` → tint(s=4,v=3); `n4` → neutral(g=4).
 *  Returns null on a malformed token (caller keeps the element's own colour). */
export function parseCran(token: string): Cran | null {
  const t = token.trim();
  const neutral = /^n([0-5])$/i.exec(t);
  if (neutral) return { kind: 'neutral', g: Number(neutral[1]) };
  const tint = /^([0-5])\s*,\s*([0-5])$/.exec(t);
  if (tint) return { kind: 'tint', s: Number(tint[1]), v: Number(tint[2]) };
  return null;
}

/** Parse the whole `color-crans` string into `{ element → cran }`.
 *  Grammar: space-separated `element:cran` jetons (SPEC §8). Malformed jetons
 *  are skipped so one typo never voids the rest. Element names are lowercased. */
export function parseColorCrans(source: string): Map<string, Cran> {
  const out = new Map<string, Cran>();
  for (const jeton of source.trim().split(/\s+/)) {
    if (jeton === '') continue;
    const colon = jeton.indexOf(':');
    if (colon <= 0) continue;
    const element = jeton.slice(0, colon).toLowerCase();
    const cran = parseCran(jeton.slice(colon + 1));
    if (cran) out.set(element, cran);
  }
  return out;
}

/** The spec's colour-roster element names (SPEC §4) → the markpage element
 *  style keys whose `.color` they drive. One spec name may fan out to several
 *  keys (code → inline + block). `page` / `cover` are BACKGROUND surfaces, not
 *  foreground `.color`, and are handled separately by the caller (they need
 *  dedicated settings fields) — so they are absent here on purpose. */
const COLOR_TARGETS: Record<string, readonly string[]> = {
  titre: ['title'],
  title: ['title'],
  h1: ['h1'],
  h2: ['h2'],
  h3: ['h3'],
  h4: ['h4'],
  corps: ['body'],
  body: ['body'],
  code: ['code-inline', 'code-block'],
  notes: ['footnote'],
  footnote: ['footnote'],
  legende: ['caption'],
  'légende': ['caption'],
  caption: ['caption'],
  'en-tete': ['running-content'],
  'en-tête': ['running-content'],
  header: ['running-content'],
};

/** Resolve `(hue, color-crans)` into `{ styleKey → #rrggbb }` ready to splice
 *  onto a per-element style map. Only foreground text colours; unknown element
 *  names (and the background surfaces page / cover) are skipped. */
export function deriveElementColors(
  hue: number,
  crans: Map<string, Cran>,
): Map<string, string> {
  const colors = new Map<string, string>();
  for (const [element, cran] of crans) {
    const targets = COLOR_TARGETS[element];
    if (!targets) continue;
    const hex = cranToHex(hue, cran);
    for (const key of targets) colors.set(key, hex);
  }
  return colors;
}

/** The `page` / `cover` background cran, if present in the table. Backgrounds
 *  are foreground-vs-background distinct surfaces (SPEC §4); the caller applies
 *  them to whatever page/cover-fill field it owns. */
export function backgroundColor(
  hue: number,
  crans: Map<string, Cran>,
  which: 'page' | 'cover',
): string | null {
  const cran = crans.get(which);
  return cran ? cranToHex(hue, cran) : null;
}
