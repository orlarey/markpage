/********************************* labels.ts ***********************************
 *
 * Purpose: Extract a `\label{key}` from a fence info string. Self-contained
 *   copy for @markpage/blocks (the app has its own richer cross-ref module;
 *   the library only needs the label-extraction primitive).
 *
 *******************************************************************************/

/** The `key` of the first `\label{key}` in `s`, or null. */
export function extractLabel(s: string): string | null {
  const m = /\\label\{([^}\n]+)\}/.exec(s);
  return m ? (m[1] ?? '').trim() : null;
}
