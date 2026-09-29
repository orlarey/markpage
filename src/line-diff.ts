/********************************* line-diff.ts ********************************
 *
 * Purpose: What changed between two versions of a document, as the smallest set
 *   of edits — so a reload applies ONLY those edits to the editor, and the
 *   reader's caret, selection and view move with the text they were on (a
 *   whole-text replacement would send them to the top).
 * How: Myers' O(ND) diff over lines (each line keeps its newline, so the lines
 *   concatenate back to the text), turned into character-offset edits in the
 *   OLD text. Past a budget of differing lines — two unrelated texts — it falls
 *   back to one edit between the common prefix and suffix: correct, just
 *   coarser.
 *
 *******************************************************************************/

/** One edit, in offsets of the OLD text: replace [from, to) by `insert`. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** Split into lines that keep their `\n`, so `lines.join('') === text`. */
function splitLines(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** Above this many differing lines, one coarse edit instead (bounds the cost). */
const MAX_D = 2000;

/**
 * The edits turning `before` into `after`, sorted and non-overlapping, in
 * offsets of `before`. Empty when the texts are equal.
 */
export function diffText(before: string, after: string): TextEdit[] {
  if (before === after) return [];
  const a = splitLines(before);
  const b = splitLines(after);
  // Trim the common head and tail: most reloads touch one region.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }
  const A = a.slice(head, a.length - tail);
  const B = b.slice(head, b.length - tail);
  const ops = myers(A, B) ?? [{ kind: 'replace' as const, aFrom: 0, aTo: A.length, bFrom: 0, bTo: B.length }];

  // Line indices → character offsets in `before`.
  const aOffset: number[] = [0];
  for (const line of a) aOffset.push((aOffset.at(-1) ?? 0) + line.length);
  return ops.map((op) => ({
    from: aOffset[head + op.aFrom] ?? before.length,
    to: aOffset[head + op.aTo] ?? before.length,
    insert: B.slice(op.bFrom, op.bTo).join(''),
  }));
}

interface Op {
  kind: 'replace';
  aFrom: number;
  aTo: number;
  bFrom: number;
  bTo: number;
}

/**
 * Myers' greedy diff: the edit script as maximal runs of non-matching lines,
 * each a replacement of A[aFrom, aTo) by B[bFrom, bTo). Null past MAX_D.
 */
function myers(A: string[], B: string[]): Op[] | null {
  const n = A.length;
  const m = B.length;
  if (n === 0 || m === 0) return [{ kind: 'replace', aFrom: 0, aTo: n, bFrom: 0, bTo: m }];
  const max = Math.min(n + m, MAX_D);
  const off = max + 1;
  let v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d += 1) {
    trace.push(v.slice());
    const next = v.slice();
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && (v[off + k - 1] ?? 0) < (v[off + k + 1] ?? 0))
          ? (v[off + k + 1] ?? 0)
          : (v[off + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x += 1;
        y += 1;
      }
      next[off + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
    v = next;
  }
  if (!found) return null;

  // Walk the trace back into the path of matched diagonals.
  const matches: [number, number][] = []; // (x, y) of each matched line pair
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const vd = trace[d]!;
    const k = x - y;
    const prevK =
      k === -d || (k !== d && (vd[off + k - 1] ?? 0) < (vd[off + k + 1] ?? 0)) ? k + 1 : k - 1;
    const prevX = vd[off + prevK] ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      matches.push([x, y]);
    }
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    matches.push([x, y]);
  }
  matches.reverse();

  // The gaps between matched lines are the replacements.
  const ops: Op[] = [];
  let ax = 0;
  let by = 0;
  for (const [mx, my] of [...matches, [n, m] as [number, number]]) {
    if (mx > ax || my > by) ops.push({ kind: 'replace', aFrom: ax, aTo: mx, bFrom: by, bTo: my });
    ax = mx + 1;
    by = my + 1;
  }
  return ops;
}

/** Apply edits (offsets of the old text) — the reference the tests check against. */
export function applyEdits(before: string, edits: TextEdit[]): string {
  let out = '';
  let at = 0;
  for (const e of edits) {
    out += before.slice(at, e.from) + e.insert;
    at = e.to;
  }
  return out + before.slice(at);
}
