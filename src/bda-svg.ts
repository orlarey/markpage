/********************************* bda-svg.ts ********************************
 *
 * Purpose: Render a BDA expression AST as an inline SVG — boxes for
 *   primitives, wires for the five compositions, with the Faust visual
 *   conventions (left→right reading order, mirrored block in `~`, black
 *   dot on the input side of every box).
 * How: Recursive bottom-up layout. Each subexpression produces a `Layout`
 *   record carrying its bounding-box width / height, the y-coordinates of
 *   its input ports (on the left edge, x=0) and output ports (on the
 *   right edge, x=w), and an SVG fragment already positioned in its own
 *   local frame. Composition functions wrap children in `<g transform=…>`
 *   to position them and draw the connecting wires between port pairs.
 *
 *   Geometry uses a fixed port pitch (PITCH) so ports auto-align in
 *   sequential composition: both children are vertically centered, which
 *   makes output i of A and input i of B share the same y when their
 *   counts match.
 *
 *******************************************************************************/

import type { BdaNode, PrimNode } from './bda';

// ---- Geometry constants ------------------------------------------------

const PITCH = 20;        // vertical spacing between adjacent ports
const BOX_PAD_H = 10;    // horizontal padding inside a primitive box
const CHAR_W = 7;        // approximate per-character advance for label width
const MIN_BOX_W = 24;
const SEQ_GAP = 18;      // horizontal gap between A and B in `:`
const PAR_GAP = 10;      // vertical gap between A and B in `,`
const SPLIT_GAP = 36;    // minimum gap for `<:` — actual gap grows with the steepest wire's |dy|
const MERGE_GAP = 36;    // minimum gap for `:>`
const FAN_STUB = 10;     // horizontal stub on each end of fan-out / fan-in wires before the diagonal
const MAX_FAN_SLOPE = 1.5; // max |dy/dx| on the diagonal portion; if exceeded the gap stretches
const REC_GAP_V = 14;    // gap between B (top) and A (bottom) in `~`
const REC_APPROACH = 12; // gap between a box edge and the closest feedback lane
const REC_LANE = 12;     // horizontal spacing between adjacent feedback lanes (≈ PITCH/2)
const REC_OUTER = 6;     // outer padding beyond the farthest feedback lane
const SVG_PAD = 6;       // padding around the whole diagram inside the viewBox
const PORT_DOT_R = 1.8;  // radius of the black dot on each input port
const DELAY_SZ = 8;      // side length of the z⁻¹ delay marker (faust style)
const WIRE_CORNER_R = 4; // radius of the rounded corners on elbow/feedback wires

// ---- Options ------------------------------------------------------------

export interface BdaOpts {
  // When true, draw a small white square in the middle of each B→A
  // feedback wire to mark the implicit unit delay (Faust convention,
  // matching the `z⁻¹` semantics of `~`). Off by default — keeps the
  // diagram pure topology unless the user opts in.
  delays?: boolean;
}

// ---- Layout type --------------------------------------------------------

interface Layout {
  w: number;
  h: number;
  // y-coordinates of input ports on the left edge (x = 0).
  inputs: number[];
  // y-coordinates of output ports on the right edge (x = w).
  outputs: number[];
  // SVG fragment already positioned within the local frame [0,w] × [0,h].
  svg: string;
  // True when this subtree is exclusively made of identity wires (`_`),
  // possibly composed via `,` parallel. When such a subtree appears as
  // the right operand of a `:`, `layoutSeq` short-circuits its rendering
  // and just extends the left operand's outputs horizontally through
  // the passthrough's footprint — eliminating the redundant elbows that
  // would otherwise be drawn on each side of every `_`.
  passthrough?: boolean;
  // Parallel to `inputs`: marks the inputs that terminate in a `!`
  // (cut). Wires that would target these inputs are skipped in seq /
  // split / merge — the signal is dropped silently rather than drawn
  // as a connection ending in a stub, which keeps idioms like the
  // cross-wiring `_,_ <: !,_,_,!` readable as a clean X.
  inputIsCut?: boolean[];
  // x at which output wires are conceptually rooted, in the layout's
  // local frame. Defaults to `w` (the right edge). When < w (because a
  // seq absorbed a passthrough trail to its right), an enclosing
  // composition can use this earlier x as the source for elbow
  // centering AND extend the wire across the trail itself — instead
  // of drawing the trail in the inner layout and bending only in the
  // outer gap, which crowds the bend against the next block.
  outputsBaseX?: number;
}

// ---- Public entry point -------------------------------------------------

/**
 * Purpose: Render a typechecked BDA AST to an `<svg>` string.
 * How: Compute the recursive layout, wrap it in a padded viewBox, expose
 *   the result's input and output ports as small horizontal stubs at the
 *   left and right edges so it's visually clear where the signal enters
 *   and exits.
 */
export function emitSvg(ast: BdaNode, opts: BdaOpts = {}): string {
  const inner = layoutNode(ast, opts);
  // Add stubs for the top-level input / output ports so they don't end
  // abruptly at the edge of the layout box.
  const STUB = 8;
  const stubs: string[] = [];
  const innerCuts = inner.inputIsCut ?? inner.inputs.map(() => false);
  for (let i = 0; i < inner.inputs.length; i += 1) {
    if (innerCuts[i]) continue;
    const y = inner.inputs[i] ?? 0;
    stubs.push(line(-STUB, y, 0, y, 'bda-wire'));
    stubs.push(`<circle cx="${num(-STUB)}" cy="${num(y)}" r="${PORT_DOT_R}" class="bda-port-in"/>`);
  }
  // Finalize any unfinished output trails: when `outputsBaseX < inner.w`
  // (a seq absorbed a passthrough trail and left it for the outer to
  // draw, but the outer was the top level), draw the trail from
  // outputsBaseX all the way to the output stub.
  const innerBaseX = inner.outputsBaseX ?? inner.w;
  for (const y of inner.outputs) {
    stubs.push(line(innerBaseX, y, inner.w + STUB, y, 'bda-wire'));
    stubs.push(`<circle cx="${num(inner.w + STUB)}" cy="${num(y)}" r="${PORT_DOT_R}" class="bda-port-out"/>`);
  }
  const vbX = -STUB - SVG_PAD;
  const vbY = -SVG_PAD;
  const vbW = inner.w + 2 * STUB + 2 * SVG_PAD;
  const vbH = inner.h + 2 * SVG_PAD;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="bda-svg" ` +
    `width="${num(vbW)}" height="${num(vbH)}" ` +
    `viewBox="${num(vbX)} ${num(vbY)} ${num(vbW)} ${num(vbH)}" ` +
    `font-family="inherit" font-size="12" role="img">` +
    inner.svg +
    stubs.join('') +
    `</svg>`
  );
}

// ---- Layout dispatch ----------------------------------------------------

function layoutNode(node: BdaNode, opts: BdaOpts): Layout {
  switch (node.kind) {
    case 'prim': return layoutPrim(node);
    case 'seq':  return layoutSeq(layoutNode(node.left, opts), layoutNode(node.right, opts));
    case 'par':  return layoutPar(layoutNode(node.left, opts), layoutNode(node.right, opts));
    case 'split': return layoutSplit(layoutNode(node.left, opts), layoutNode(node.right, opts));
    case 'merge': {
      // Collapse the `A <: P :> B` idiom when P is a passthrough AND the
      // merge degenerates to a 1-to-1 mapping (|outputs(P)| == |inputs(B)|,
      // so k_merge = 1). In that case the merge is semantically a no-op
      // and `A <: P :> B` is equivalent to a direct `A <: B`; rendering
      // it as one wide fan avoids the redundant "splice" visual where
      // the split-fan and the merge-fan meet at the middle.
      if (node.left.kind === 'split') {
        const middle = layoutNode(node.left.right, opts);
        const right = layoutNode(node.right, opts);
        if (middle.passthrough && middle.outputs.length === right.inputs.length) {
          const left = layoutNode(node.left.left, opts);
          return layoutSplit(left, right, middle.w + MERGE_GAP);
        }
        // Not the collapsible form — fall through to a normal merge,
        // reusing the layouts we already computed.
        return layoutMerge(layoutSplit(layoutNode(node.left.left, opts), middle), right);
      }
      return layoutMerge(layoutNode(node.left, opts), layoutNode(node.right, opts));
    }
    case 'rec':  return layoutRec(layoutNode(node.left, opts), layoutNode(node.right, opts), opts);
  }
}

// ---- Primitive ----------------------------------------------------------

/**
 * Purpose: Lay out a primitive — box (with label + per-input dot), wire
 *   (`_`, just a horizontal line), or cut (`!`, a short stub ending in a
 *   filled terminator).
 * How: Box height is `max(n, m, 1) * PITCH` so a 1-in / 1-out primitive
 *   is exactly one pitch tall; multi-port boxes grow vertically. Ports
 *   of each side are centered within the box so unbalanced n vs m looks
 *   visually symmetric.
 */
function layoutPrim(p: PrimNode): Layout {
  if (p.display === 'wire') {
    const w = 24;
    const h = PITCH;
    return {
      w,
      h,
      inputs: [h / 2],
      outputs: [h / 2],
      svg: line(0, h / 2, w, h / 2, 'bda-wire'),
      passthrough: true,
      inputIsCut: [false],
    };
  }
  if (p.display === 'cut') {
    // The cut primitive `!` is entirely invisible: zero width / height,
    // no svg. Wires that would feed it are skipped (via `inputIsCut`),
    // and `layoutPar` collapses the gap when a sibling has h = 0, so a
    // cross idiom like `_,_ <: !,_,_,!` renders as a clean X with no
    // floating stub-and-dot terminators above and below.
    return {
      w: 0,
      h: 0,
      inputs: [0],
      outputs: [],
      svg: '',
      inputIsCut: [true],
    };
  }
  const k = Math.max(p.n, p.m, 1);
  const h = k * PITCH;
  const labelW = labelWidth(p.label);
  const w = Math.max(MIN_BOX_W, labelW + 2 * BOX_PAD_H);
  const offIn = ((k - p.n) * PITCH) / 2;
  const offOut = ((k - p.m) * PITCH) / 2;
  const inputs: number[] = [];
  for (let i = 0; i < p.n; i += 1) inputs.push(offIn + (i + 0.5) * PITCH);
  const outputs: number[] = [];
  for (let i = 0; i < p.m; i += 1) outputs.push(offOut + (i + 0.5) * PITCH);
  let svg = `<rect x="0" y="0" width="${num(w)}" height="${num(h)}" class="bda-box"/>`;
  svg += `<text x="${num(w / 2)}" y="${num(h / 2)}" text-anchor="middle" ` +
    `dominant-baseline="central" class="bda-label">${escapeXml(p.label)}</text>`;
  for (const y of inputs) {
    svg += `<circle cx="0" cy="${num(y)}" r="${PORT_DOT_R}" class="bda-port-in"/>`;
  }
  for (const y of outputs) {
    svg += `<circle cx="${num(w)}" cy="${num(y)}" r="${PORT_DOT_R}" class="bda-port-out"/>`;
  }
  return {
    w,
    h,
    inputs,
    outputs,
    svg,
    inputIsCut: inputs.map(() => false),
  };
}

// ---- Compositions -------------------------------------------------------

/**
 * Purpose: Sequential composition `A : B` — A on the left, B on the right,
 *   wires from each output of A to the corresponding input of B.
 * How: Both children centered vertically about the shared centerline, so
 *   when their port counts match (enforced by the typechecker) every
 *   output of A lands directly across from the matching input of B.
 *   When a wire's endpoints don't share a y (e.g. A's centered single
 *   output meets a B whose first input sits at the bottom), the wire
 *   is routed as a horizontal-vertical-horizontal elbow bending at the
 *   gap's midpoint, instead of a slanted straight line. The port
 *   order is preserved, so multi-wire bundles bend in parallel without
 *   crossing.
 */
function layoutSeq(a: Layout, b: Layout): Layout {
  // Short-circuit when b is an identity passthrough (`_`, or a `,`-built
  // bundle of `_`s). In that case b would otherwise force its own port
  // y's and trigger a redundant elbow on EACH side of every `_`. We
  // drop b's svg AND we don't draw the horizontal trail through b's
  // footprint either — we only widen the layout (so spacing is
  // preserved) and record `outputsBaseX = a's original right edge`.
  // An enclosing seq can then center its elbow across the full
  // (a-right ↔ next-block) span, and the wire visually covers the
  // trail too. If there is no enclosing user, `emitSvg`'s finalize
  // draws the trail from `outputsBaseX` to the output stub.
  if (b.passthrough) {
    const h = a.h;
    const ax = 0;
    const bx = a.w + SEQ_GAP;
    const w = bx + b.w;
    const svg = wrap(a.svg, ax, 0);
    const aBaseX = a.outputsBaseX ?? a.w;
    return {
      w,
      h,
      inputs: a.inputs.slice(),
      outputs: a.outputs.slice(),
      svg,
      passthrough: !!a.passthrough,
      inputIsCut: a.inputIsCut?.slice(),
      outputsBaseX: aBaseX,
    };
  }
  const h = Math.max(a.h, b.h);
  const ay = (h - a.h) / 2;
  const by = (h - b.h) / 2;
  const ax = 0;
  const bx = a.w + SEQ_GAP;
  const w = bx + b.w;
  let svg = wrap(a.svg, ax, ay) + wrap(b.svg, bx, by);
  // Wires start from a's CONCEPTUAL right (outputsBaseX) — when a
  // absorbed a passthrough trail this is earlier than a.w, so the
  // elbow can be centered across the full span and visually covers
  // the trail.
  const aBaseX = ax + (a.outputsBaseX ?? a.w);
  const midX = (aBaseX + bx) / 2;
  for (let i = 0; i < a.outputs.length; i += 1) {
    if (b.inputIsCut?.[i]) continue;
    const y1 = ay + (a.outputs[i] ?? 0);
    const y2 = by + (b.inputs[i] ?? 0);
    if (Math.abs(y1 - y2) < 0.5) {
      svg += line(aBaseX, y1, bx, y2, 'bda-wire');
    } else {
      svg += polyline(
        [
          [aBaseX, y1],
          [midX, y1],
          [midX, y2],
          [bx, y2],
        ],
        'bda-wire',
      );
    }
  }
  return {
    w,
    h,
    inputs: a.inputs.map((y) => ay + y),
    outputs: b.outputs.map((y) => by + y),
    svg,
    inputIsCut: a.inputIsCut?.slice(),
    // b.outputsBaseX is in b's local frame; translate to the result's frame.
    outputsBaseX: bx + (b.outputsBaseX ?? b.w),
  };
}

/**
 * Purpose: Parallel composition `A , B` — stack A on top, B on the bottom.
 *   Inputs/outputs concatenate (A's first, B's second).
 * How: Both children centered horizontally; if the narrower one's edge is
 *   inset from the layout border, draw short horizontal stubs so the
 *   ports still reach x=0 (inputs) and x=w (outputs) — that way an outer
 *   composition sees a single consistent port-x convention.
 */
function layoutPar(a: Layout, b: Layout): Layout {
  const w = Math.max(a.w, b.w);
  const ax = (w - a.w) / 2;
  const bx = (w - b.w) / 2;
  const ay = 0;
  // When either child has h = 0 (a cut, hidden) the PAR_GAP would
  // become a spurious empty band; skip it so the par's height matches
  // its visible content.
  const gap = (a.h === 0 || b.h === 0) ? 0 : PAR_GAP;
  const by = a.h + gap;
  const h = by + b.h;
  let svg = wrap(a.svg, ax, ay) + wrap(b.svg, bx, by);
  // Stubs from x=0 to the child's left edge for inputs — skip cut
  // inputs (no incoming wire is ever drawn to them).
  const aCuts = a.inputIsCut ?? a.inputs.map(() => false);
  const bCuts = b.inputIsCut ?? b.inputs.map(() => false);
  for (let i = 0; i < a.inputs.length; i += 1) {
    if (aCuts[i]) continue;
    const py = a.inputs[i] ?? 0;
    if (ax > 0) svg += line(0, ay + py, ax, ay + py, 'bda-wire');
  }
  for (let i = 0; i < b.inputs.length; i += 1) {
    if (bCuts[i]) continue;
    const py = b.inputs[i] ?? 0;
    if (bx > 0) svg += line(0, by + py, bx, by + py, 'bda-wire');
  }
  // Output extension stubs — use each child's `outputsBaseX` as the
  // start so any pending passthrough trails are drawn here (the par
  // consolidates everyone's outputs at its own right edge).
  const aBaseX = a.outputsBaseX ?? a.w;
  const bBaseX = b.outputsBaseX ?? b.w;
  for (const py of a.outputs) {
    const start = ax + aBaseX;
    if (start < w) svg += line(start, ay + py, w, ay + py, 'bda-wire');
  }
  for (const py of b.outputs) {
    const start = bx + bBaseX;
    if (start < w) svg += line(start, by + py, w, by + py, 'bda-wire');
  }
  return {
    w,
    h,
    inputs: [
      ...a.inputs.map((y) => ay + y),
      ...b.inputs.map((y) => by + y),
    ],
    outputs: [
      ...a.outputs.map((y) => ay + y),
      ...b.outputs.map((y) => by + y),
    ],
    svg,
    passthrough: !!a.passthrough && !!b.passthrough,
    inputIsCut: [
      ...(a.inputIsCut ?? a.inputs.map(() => false)),
      ...(b.inputIsCut ?? b.inputs.map(() => false)),
    ],
  };
}

/**
 * Purpose: Split composition `A <: B` — A on the left, B on the right,
 *   each input i of B drawn from output (i mod lm) of A.
 * How: Geometry mirrors `seq`; the only difference is the wire pattern —
 *   we loop over B's inputs and pick the source A-output by modulo. With
 *   k = rn / lm copies, each output of A fans into k destinations.
 */
function layoutSplit(a: Layout, b: Layout, extraGap = 0): Layout {
  const lm = a.outputs.length;
  const h = Math.max(a.h, b.h);
  const ay = (h - a.h) / 2;
  const by = (h - b.h) / 2;
  // Passthrough shortcuts: if either operand is a bundle of `_`s,
  // skip drawing its body so the fan-out diagonals extend across its
  // footprint. The shunt applies symmetrically — left side (a) starts
  // the fan at x=0, right side (b) ends it at the layout's right edge.
  const skipA = !!a.passthrough;
  const skipB = !!b.passthrough;
  const sourceYs = skipA ? a.inputs : a.outputs;
  const targetYs = skipB ? b.outputs : b.inputs;
  // Stretch the gap to bound the steepest fan-out wire's slope. The
  // available diagonal span is `(skipA ? a.w : 0) + gap + (skipB ? b.w
  // : 0) - 2*FAN_STUB`; we require it ≥ maxYDiff / MAX_FAN_SLOPE.
  let maxYDiff = 0;
  for (let i = 0; i < targetYs.length; i += 1) {
    const srcIdx = lm === 0 ? 0 : i % lm;
    const dy = Math.abs((ay + (sourceYs[srcIdx] ?? 0)) - (by + (targetYs[i] ?? 0)));
    if (dy > maxYDiff) maxYDiff = dy;
  }
  const skipW = (skipA ? a.w : 0) + (skipB ? b.w : 0);
  const requiredGap = 2 * FAN_STUB + maxYDiff / MAX_FAN_SLOPE - skipW;
  const gap = Math.max(SPLIT_GAP + extraGap, requiredGap);
  const ax = 0;
  const bx = a.w + gap;
  const w = bx + b.w;
  let svg = '';
  if (!skipA) svg += wrap(a.svg, ax, ay);
  if (!skipB) svg += wrap(b.svg, bx, by);
  const fanStartX = skipA ? 0 : a.w;
  const fanEndX = skipB ? bx + b.w : bx;
  for (let i = 0; i < targetYs.length; i += 1) {
    if (b.inputIsCut?.[i]) continue;
    const srcIdx = lm === 0 ? 0 : i % lm;
    const y1 = ay + (sourceYs[srcIdx] ?? 0);
    const y2 = by + (targetYs[i] ?? 0);
    svg += fanWire(fanStartX, y1, fanEndX, y2);
  }
  return {
    w,
    h,
    inputs: a.inputs.map((y) => ay + y),
    outputs: b.outputs.map((y) => by + y),
    svg,
    inputIsCut: a.inputIsCut?.slice(),
  };
}

/**
 * Purpose: Merge composition `A :> B` — A on the left, B on the right,
 *   each output i of A goes to input (i mod rn) of B.
 * How: Dual of `split`. We loop over A's outputs and pick the target
 *   B-input by modulo. With k = lm / rn copies, each input of B receives
 *   the merged signal from k outputs of A.
 */
function layoutMerge(a: Layout, b: Layout): Layout {
  const rn = b.inputs.length;
  const h = Math.max(a.h, b.h);
  const ay = (h - a.h) / 2;
  const by = (h - b.h) / 2;
  // Passthrough shortcuts symmetric to split: skip drawing whichever
  // operand is an identity bundle, so the fan-in can stretch across
  // the full available horizontal span and stay gentle.
  const skipA = !!a.passthrough;
  const skipB = !!b.passthrough;
  const sourceYs = skipA ? a.inputs : a.outputs;
  const targetYs = skipB ? b.outputs : b.inputs;
  let maxYDiff = 0;
  for (let i = 0; i < sourceYs.length; i += 1) {
    const dstIdx = rn === 0 ? 0 : i % rn;
    const dy = Math.abs((ay + (sourceYs[i] ?? 0)) - (by + (targetYs[dstIdx] ?? 0)));
    if (dy > maxYDiff) maxYDiff = dy;
  }
  const skipW = (skipA ? a.w : 0) + (skipB ? b.w : 0);
  const requiredGap = 2 * FAN_STUB + maxYDiff / MAX_FAN_SLOPE - skipW;
  const gap = Math.max(MERGE_GAP, requiredGap);
  const ax = 0;
  const bx = a.w + gap;
  const w = bx + b.w;
  let svg = '';
  if (!skipA) svg += wrap(a.svg, ax, ay);
  if (!skipB) svg += wrap(b.svg, bx, by);
  const fanStartX = skipA ? 0 : a.w;
  const fanEndX = skipB ? bx + b.w : bx;
  for (let i = 0; i < sourceYs.length; i += 1) {
    const dstIdx = rn === 0 ? 0 : i % rn;
    if (b.inputIsCut?.[dstIdx]) continue;
    const y1 = ay + (sourceYs[i] ?? 0);
    const y2 = by + (targetYs[dstIdx] ?? 0);
    svg += fanWire(fanStartX, y1, fanEndX, y2);
  }
  return {
    w,
    h,
    inputs: a.inputs.map((y) => ay + y),
    outputs: b.outputs.map((y) => by + y),
    svg,
    inputIsCut: a.inputIsCut?.slice(),
  };
}

/**
 * Purpose: Recursive composition `A ~ B` — B drawn rotated 180° above A,
 *   feedback wires looping around the sides so B's outputs feed A's first
 *   `p` inputs and A's first `o` outputs feed B's inputs.
 * How: B is rotated 180° (the Faust convention), NOT flipped horizontally.
 *   The rotation reverses *both* axes, so B's input 0 (originally top-left)
 *   ends up at the BOTTOM-right of the rotated block, input 1 above it,
 *   and so on. With this ordering, the feedback wires connecting "same
 *   index" ports nest concentrically — the wire for index 0 is the
 *   shortest (closest to the B/A junction) and higher indices wrap
 *   around it — and the multi-wire bundles never need to cross.
 *   Feedback wires are routed in vertical "lanes" in the side margins;
 *   the closest lane goes to index 0, lanes farther out to higher
 *   indices, matching the natural nesting. The exposed inputs of the
 *   result are A's remaining `n - p` inputs, and the exposed outputs are
 *   all of A's outputs.
 */
function layoutRec(a: Layout, b: Layout, opts: BdaOpts): Layout {
  const aN = a.inputs.length;
  const aM = a.outputs.length;
  const o = b.inputs.length;   // B's inputs ← A's first o outputs
  const p = b.outputs.length;  // B's outputs → A's first p inputs

  const innerW = Math.max(a.w, b.w);
  // Side margin = REC_OUTER (left padding) + REC_APPROACH (gap to closest
  // lane) + (p-1) * REC_LANE (additional lanes). With this layout, lane k
  // sits at distance REC_APPROACH + k * REC_LANE from the box's frame
  // edge — so the feedback wire's corner never crowds the box outline.
  const leftMargin = p > 0 ? REC_OUTER + REC_APPROACH + (p - 1) * REC_LANE : REC_OUTER;
  const rightMargin = o > 0 ? REC_OUTER + REC_APPROACH + (o - 1) * REC_LANE : REC_OUTER;
  const w = leftMargin + innerW + rightMargin;
  const h = b.h + REC_GAP_V + a.h;
  const ax = leftMargin + (innerW - a.w) / 2;
  const ay = b.h + REC_GAP_V;
  const bx = leftMargin + (innerW - b.w) / 2;
  const by = 0;

  // B is rotated 180° around its own center. The transform
  // `translate(bx + b.w, by + b.h) scale(-1, -1)` maps a point (px, py)
  // in B's local frame to (bx + b.w - px, by + b.h - py) — i.e. flips
  // both x and y. So:
  //   - B's input i (originally at x=0, y=b.inputs[i]) ends up on the
  //     visible RIGHT edge at y = by + b.h - b.inputs[i] — input 0 at
  //     the BOTTOM, input n-1 at the TOP. This is the key ordering that
  //     lets the feedback bundle nest without crossings.
  //   - B's output j (originally at x=b.w, y=b.outputs[j]) ends up on
  //     the visible LEFT edge with the analogous reversed y order.
  // Geometry rotates with the outer transform, but text glyphs become
  // upside-down. We counter-rotate each text element with a 180°
  // rotation around its own anchor (matrix -1 0 0 -1 2X 2Y), which
  // composes with the outer 180° to the identity for glyph orientation
  // while preserving the mirrored anchor position. See
  // `unrotateTextGlyphs`.
  const bSvgWrapped =
    `<g transform="translate(${num(bx + b.w)},${num(by + b.h)}) scale(-1,-1)">` +
    unrotateTextGlyphs(b.svg) +
    `</g>`;
  const aSvgWrapped = wrap(a.svg, ax, ay);

  const wires: string[] = [];

  // Feedback 1: A's first o outputs → B's o (rotated) inputs.
  // The rotated B's input j is on the visible right edge at
  // y = by + b.h - b.inputs[j] (reversed y order). Index 0 lands at
  // the bottom of B — closest to A — so the j=0 wire is the shortest
  // and gets the closest lane. Subsequent wires nest concentrically
  // around it.
  // When opts.delays is set, drop a small white square (Faust z⁻¹
  // marker) on the upward-going feedback lane, sitting just above the
  // bifurcation point (colX, yA) where the feedback branches off from
  // A's exposed output wire. This is the Faust convention: the marker
  // reads as a "tap" placed on the signal as it leaves A toward B.
  for (let j = 0; j < o; j += 1) {
    const yA = ay + (a.outputs[j] ?? 0);
    const yB = by + b.h - (b.inputs[j] ?? 0);
    const colX = leftMargin + innerW + REC_APPROACH + j * REC_LANE;
    wires.push(
      polyline(
        [
          [ax + a.w, yA],
          [colX, yA],
          [colX, yB],
          [bx + b.w, yB],
        ],
        'bda-wire-fb',
      ),
    );
    if (opts.delays) {
      // Centered on the vertical lane, with its bottom edge at yA so it
      // sits flush against the horizontal exposed-output wire without
      // overlapping it.
      wires.push(
        `<rect x="${num(colX - DELAY_SZ / 2)}" y="${num(yA - DELAY_SZ)}" ` +
          `width="${DELAY_SZ}" height="${DELAY_SZ}" class="bda-delay"/>`,
      );
    }
  }
  // Feedback 2: B's p (rotated) outputs → A's first p inputs. Same
  // pattern on the left, with rotated B's output k at the visible left
  // edge at y = by + b.h - b.outputs[k]. Again index 0 sits closest to
  // A and gets the innermost lane. No delay marker on this side —
  // Faust convention puts it on the A→B arms (B's input side, above).
  for (let k = 0; k < p; k += 1) {
    const yB = by + b.h - (b.outputs[k] ?? 0);
    const yA = ay + (a.inputs[k] ?? 0);
    const colX = leftMargin - REC_APPROACH - k * REC_LANE;
    wires.push(
      polyline(
        [
          [bx, yB],
          [colX, yB],
          [colX, yA],
          [ax, yA],
        ],
        'bda-wire-fb',
      ),
    );
  }

  // Expose: A's remaining inputs (positions p..aN-1) as the result's inputs;
  // stubs go from x=0 to ax at the matching y.
  const exposedInputs: number[] = [];
  for (let k = p; k < aN; k += 1) {
    const y = ay + (a.inputs[k] ?? 0);
    wires.push(line(0, y, ax, y, 'bda-wire'));
    exposedInputs.push(y);
  }
  // Expose: ALL of A's outputs as the result's outputs; stubs from
  // (ax + a.w) to w. The first `o` of these share their starting point
  // with the feedback lanes, which visually reads as a clean T-junction.
  const exposedOutputs: number[] = [];
  for (let j = 0; j < aM; j += 1) {
    const y = ay + (a.outputs[j] ?? 0);
    wires.push(line(ax + a.w, y, w, y, 'bda-wire'));
    exposedOutputs.push(y);
  }

  return {
    w,
    h,
    inputs: exposedInputs,
    outputs: exposedOutputs,
    svg: bSvgWrapped + aSvgWrapped + wires.join(''),
    inputIsCut: a.inputIsCut?.slice(p),
  };
}

// ---- Helpers ------------------------------------------------------------

function labelWidth(s: string): number {
  // Cheap monospace-style approximation. Good enough for sizing — fine
  // typography uses a different font, but the box just needs a bit of
  // breathing room around the text.
  return s.length * CHAR_W;
}

function wrap(svg: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return svg;
  return `<g transform="translate(${num(dx)},${num(dy)})">${svg}</g>`;
}

/**
 * Purpose: Wire used by `<:` / `:>` — a short horizontal stub at each
 *   end, a diagonal in the middle. Lets the wire exit / re-enter each
 *   box perpendicularly before going off at an angle.
 * How: For aligned endpoints, emits a single straight line. Otherwise
 *   builds a 4-point polyline `(start) → (start + stub) → (end - stub)
 *   → (end)` which the `polyline` helper renders as a rounded path.
 */
function fanWire(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 0.5) {
    return line(x1, y1, x2, y2, 'bda-wire');
  }
  return polyline(
    [
      [x1, y1],
      [x1 + FAN_STUB, y1],
      [x2 - FAN_STUB, y2],
      [x2, y2],
    ],
    'bda-wire',
  );
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  return (
    `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" ` +
    `class="${cls}"/>`
  );
}

/**
 * Purpose: Emit a polyline-ish path with the corners slightly rounded —
 *   each interior bend becomes a small quadratic-bezier arc instead of a
 *   sharp 90° angle. Adjacent collinear points stay visually straight.
 * How: Walk the point list emitting `L` for straight portions and `Q` for
 *   each interior corner. The corner's radius is clamped to half the
 *   shorter adjacent segment so the arcs never eat past the next bend.
 */
function polyline(points: [number, number][], cls: string, r = WIRE_CORNER_R): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    const [a, b] = points;
    return line(a![0], a![1], b![0], b![1], cls);
  }
  let d = `M ${num(points[0]![0])} ${num(points[0]![1])}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const dxIn = cur[0] - prev[0];
    const dyIn = cur[1] - prev[1];
    const lenIn = Math.hypot(dxIn, dyIn) || 1;
    const dxOut = next[0] - cur[0];
    const dyOut = next[1] - cur[1];
    const lenOut = Math.hypot(dxOut, dyOut) || 1;
    const ri = Math.min(r, lenIn / 2, lenOut / 2);
    const ax = cur[0] - (dxIn / lenIn) * ri;
    const ay = cur[1] - (dyIn / lenIn) * ri;
    const bx = cur[0] + (dxOut / lenOut) * ri;
    const by = cur[1] + (dyOut / lenOut) * ri;
    d += ` L ${num(ax)} ${num(ay)}`;
    d += ` Q ${num(cur[0])} ${num(cur[1])} ${num(bx)} ${num(by)}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${num(last[0])} ${num(last[1])}`;
  return `<path d="${d}" class="${cls}" fill="none"/>`;
}

function num(n: number): string {
  // One decimal is enough precision; keeps the SVG compact.
  return (Math.round(n * 10) / 10).toString();
}

/**
 * Purpose: Add a counter-rotation around each `<text>` element in an
 *   SVG fragment so its glyphs stay upright when the fragment is
 *   wrapped in an outer 180° rotation (as in `~`'s rotated B). Must
 *   cascade safely through nested `~`s.
 * How: We WRAP each text in a `<g transform="matrix(-1 0 0 -1 2X 2Y)">`
 *   instead of mutating the text's own attributes. matrix(-1 0 0 -1 2X
 *   2Y) is the 180° rotation around the text's anchor (X, Y) — a
 *   fixed point of the rotation, so the anchor's position is
 *   unchanged, while each glyph picks up a 180° flip that cancels the
 *   enclosing rotation.
 *   Nested ~ recursions invoke this function once per level on the
 *   *cumulative* SVG of the inner subtree. The wrap-based approach
 *   lets multiple un-rotations stack as nested `<g>` elements that
 *   each contribute their own 180° around the same anchor — pairs of
 *   them cancel cleanly. The earlier "add a transform attribute to
 *   the text" trick failed here because SVG accepts only one
 *   `transform` attribute and browsers keep the first occurrence, so
 *   the outer rec's un-rotation was silently dropped and labels ended
 *   up upside-down (540° = 180° net) in nested cases like
 *   `(_,1:+) ~ + ~ (sin:cos:tan)`.
 */
function unrotateTextGlyphs(svg: string): string {
  return svg.replace(
    /<text\b[^>]*\bx="([^"]+)"\s+y="([^"]+)"[^>]*>[^<]*<\/text>/g,
    (match, xStr, yStr) => {
      const x = parseFloat(xStr);
      const y = parseFloat(yStr);
      const tx = num(2 * x);
      const ty = num(2 * y);
      return `<g transform="matrix(-1 0 0 -1 ${tx} ${ty})">${match}</g>`;
    },
  );
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
