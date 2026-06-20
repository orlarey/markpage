/********************************* category-svg.ts ***************************
 *
 * Purpose: Render a `category` AST as a native SVG — textbook-quality
 *   commutative diagram with objects placed on a grid such that every
 *   skeletal morphism becomes a strictly horizontal or vertical arrow.
 *   Implements CD-SPEC §7.A.
 * How: Three passes.
 *   1. `classifyEdges` — separate skeletal (true generators) / shortcut
 *      (declared morphisms that equal a composition) / induced (universal).
 *   2. `layoutOnGrid` — BFS with backtracking on the skeletal subgraph,
 *      scoring each complete layout by (skeletal edges satisfied, lines
 *      that don't cross objects, bounding-box compactness). Returns null
 *      when no acceptable layout is found — caller falls back to Mermaid.
 *   3. `emitSvg` — straight-line SVG: objects as plain text labels at
 *      grid positions, arrows as `<line>` from edge-of-text to
 *      edge-of-text, arrowheads via `<marker>`, edge labels at midpoint
 *      with perpendicular offset.
 *
 *******************************************************************************/

import type { CdAst, Morphism, Induced } from './category.js';

// All geometry in pixels at a 16 px base font-size. The SVG carries
// explicit width / height in px so the diagram retains its intrinsic
// scale next to body text; the outer wrapper's CSS lets it shrink on
// narrow pages.
const CELL = 64;
const PADDING = 16;
const FONT_PX = 14;
const CHAR_PX = 8; // approximation of x-height-ish text width per char
const LABEL_OFFSET = 6; // perpendicular distance from arrow to its label
const NODE_HALF_HEIGHT = 8; // half cap-height — used for edge endpoint trim

interface Position {
  x: number;
  y: number;
}

interface Classification {
  skeletal: Morphism[];
  shortcut: Morphism[];
  induced: Induced[];
}

interface Layout {
  positions: Map<string, Position>;
  score: number;
}

// ---- Phase 1 — classify edges ------------------------------------------

/**
 * Purpose: Split declared morphisms into "skeletal" (true generators) and
 *   "shortcut" (a single morphism that equals a composition of length > 1
 *   in some equation, with no induced arrow in the composition).
 *   Induced arrows are passed through as their own bag.
 * How: A morphism `m` is a shortcut iff some equation has `m` on one
 *   side and a path of length ≥ 2 on the other AND no morphism in
 *   that path is induced. The induced exception matters for universal
 *   properties: e.g. in a pullback the equation `pi1 . u = f` (with `u`
 *   induced) is the universal property of `u`, NOT a shortcut for `f`.
 *   `f` stays skeletal (a primary cone arrow that should sit on the
 *   layout grid).
 */
export function classifyEdges(ast: CdAst): Classification {
  const inducedNames = new Set(ast.induced.map((i) => i.name));
  const shortcutNames = new Set<string>();
  const isShortcutCandidate = (single: string, composition: string[]): boolean =>
    single !== '' &&
    composition.length > 1 &&
    !composition.some((n) => inducedNames.has(n));
  for (const eq of ast.equations) {
    if (eq.lhs.length === 1 && isShortcutCandidate(eq.lhs[0] ?? '', eq.rhs)) {
      shortcutNames.add(eq.lhs[0] ?? '');
    }
    if (eq.rhs.length === 1 && isShortcutCandidate(eq.rhs[0] ?? '', eq.lhs)) {
      shortcutNames.add(eq.rhs[0] ?? '');
    }
  }
  const skeletal: Morphism[] = [];
  const shortcut: Morphism[] = [];
  for (const m of ast.morphisms) {
    if (shortcutNames.has(m.name)) shortcut.push(m);
    else skeletal.push(m);
  }
  return { skeletal, shortcut, induced: ast.induced };
}

// ---- Phase 2 — layout on grid ------------------------------------------

/**
 * Purpose: Find a grid embedding where every skeletal edge connects two
 *   objects at Manhattan distance 1 (strictly H or V) and the overall
 *   layout doesn't pass shortcut arrows through other objects.
 * How: BFS with backtracking. Anchor at the highest-degree skeletal node,
 *   place its neighbours in the four cardinal directions, recurse, score
 *   each complete layout. Returns the best layout or null if nothing
 *   satisfying was reached.
 */
// Two-stage candidate sets. The tight set (cardinal-1 only) handles all
// the well-behaved topologies — triangle, square, product, coproduct,
// equalizer — without surprises. The extended set is only used when the
// tight pass leaves crossings unresolved (pullback-like K_{2,3} cases).
const TIGHT_DIRS: Position[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
];
const EXTENDED_DIRS: Position[] = [
  ...TIGHT_DIRS,
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
  { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
];

export function layoutOnGrid(ast: CdAst, skeletal: Morphism[]): Layout | null {
  if (ast.objects.length === 0) return null;
  // First pass: tight cardinal-1 placements only. This is what well-
  // behaved topologies (triangle, K_{2,2} product, square) need, and
  // produces compact predictable layouts. If it returns a layout with
  // no crossings, we keep it — no need for the extended search.
  const tight = layoutWith(ast, skeletal, TIGHT_DIRS);
  if (tight !== null && countCrossings(ast, tight.positions) === 0) {
    return tight;
  }
  // Second pass: extended candidate set (12 directions including
  // diagonals and cardinal-2). Lets the BFS find scaled-up layouts
  // for dense topologies where the tight version inevitably crosses.
  const extended = layoutWith(ast, skeletal, EXTENDED_DIRS);
  if (extended === null) return tight;
  if (tight === null) return extended;
  // Pick the layout with strictly fewer crossings; on a tie, prefer
  // the tight one (it's more compact).
  const tightCx = countCrossings(ast, tight.positions);
  const extCx = countCrossings(ast, extended.positions);
  if (extCx < tightCx) return extended;
  return tight;
}

/**
 * Purpose: Run the BFS placement with a specific candidate-direction set.
 * How: Standard backtracking — anchor highest-degree node, place each
 *   subsequent node adjacent to a placed skeletal neighbour using one of
 *   `dirs`, score complete layouts, retain the best.
 */
function layoutWith(
  ast: CdAst,
  skeletal: Morphism[],
  dirs: Position[],
): Layout | null {
  // Undirected adjacency in the skeleton.
  const adj = new Map<string, Set<string>>();
  for (const o of ast.objects) adj.set(o.name, new Set());
  for (const m of skeletal) {
    adj.get(m.dom)?.add(m.cod);
    adj.get(m.cod)?.add(m.dom);
  }
  // Sort objects by skeleton-degree descending — anchor is the most
  // connected one (more constraints satisfied early).
  const sorted = [...ast.objects].sort(
    (a, b) => (adj.get(b.name)?.size ?? 0) - (adj.get(a.name)?.size ?? 0),
  );
  const anchor = sorted[0]?.name ?? '';
  if (anchor === '') return null;

  const state = { best: null as Layout | null, nodes: 0 };
  const NODE_LIMIT = 30000;

  function recurse(positions: Map<string, Position>): void {
    if (state.nodes++ > NODE_LIMIT) return;
    if (positions.size === ast.objects.length) {
      const score = scoreLayout(ast, skeletal, positions);
      if (state.best === null || score > state.best.score) {
        state.best = { positions: new Map(positions), score };
      }
      return;
    }
    let target: string | null = null;
    let parent: Position | null = null;
    for (const o of sorted) {
      if (positions.has(o.name)) continue;
      const ns = adj.get(o.name) ?? new Set();
      for (const n of ns) {
        if (positions.has(n)) {
          target = o.name;
          parent = positions.get(n) ?? null;
          break;
        }
      }
      if (target) break;
    }
    if (target === null) {
      const unplaced = sorted.find((o) => !positions.has(o.name));
      if (!unplaced) return;
      const maxX = Math.max(...[...positions.values()].map((p) => p.x), 0);
      const next = new Map(positions);
      next.set(unplaced.name, { x: maxX + 2, y: 0 });
      recurse(next);
      return;
    }
    const occupied = new Set(
      [...positions.values()].map((p) => `${p.x},${p.y}`),
    );
    for (const d of dirs) {
      if (parent === null) continue;
      const np = { x: parent.x + d.x, y: parent.y + d.y };
      if (occupied.has(`${np.x},${np.y}`)) continue;
      const next = new Map(positions);
      next.set(target, np);
      recurse(next);
    }
  }

  const init = new Map<string, Position>([[anchor, { x: 0, y: 0 }]]);
  recurse(init);
  if (state.best === null) return null;
  if (skeletal.length > 0) {
    const minAcceptable = skeletal.length * 5;
    if (state.best.score < minAcceptable) return null;
  }
  return state.best;
}

/**
 * Purpose: Count line-line crossings in a given layout — used by the
 *   two-pass `layoutOnGrid` to decide whether the tight pass was enough.
 * How: Walk each unordered pair of edges (all morphisms + induced),
 *   test with `segmentsCross`.
 */
function countCrossings(ast: CdAst, positions: Map<string, Position>): number {
  const edges: { dom: string; cod: string }[] = [];
  for (const m of ast.morphisms) edges.push({ dom: m.dom, cod: m.cod });
  for (const i of ast.induced) edges.push({ dom: i.dom, cod: i.cod });
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const e1 = edges[i]!;
      const e2 = edges[j]!;
      const a1 = positions.get(e1.dom);
      const a2 = positions.get(e1.cod);
      const b1 = positions.get(e2.dom);
      const b2 = positions.get(e2.cod);
      if (!a1 || !a2 || !b1 || !b2) continue;
      if (segmentsCross(a1, a2, b1, b2)) count += 1;
    }
  }
  return count;
}

/**
 * Purpose: Score a complete layout per CD-SPEC §7.A.3.
 * How: Skeletal edges score +10 when aligned in either of the two natural
 *   frames — cardinal H/V (`dx == 0 || dy == 0`) or rotated H/V
 *   (`|dx| == |dy|`). Length beyond 1 unit decays the bonus slightly so
 *   compact arrangements are preferred when they exist. Line-line
 *   crossings cost -15 each (significant — visually the worst defect).
 *   Object-on-line crossings cost -5. Bounding box perimeter -0.1 each
 *   as a final compactness tiebreaker.
 */
function scoreLayout(
  ast: CdAst,
  skeletal: Morphism[],
  positions: Map<string, Position>,
): number {
  let score = 0;
  const skelSet = new Set(skeletal.map((m) => m.name));
  for (const m of skeletal) {
    const a = positions.get(m.dom);
    const b = positions.get(m.cod);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const cardinalAligned = adx === 0 || ady === 0;
    const diagonalAligned = adx === ady;
    if (cardinalAligned || diagonalAligned) {
      score += 10;
      // Bonus for natural reading direction in either frame.
      if (cardinalAligned) {
        if ((adx > 0 && dx > 0) || (ady > 0 && dy > 0)) score += 3;
      } else if (diagonalAligned) {
        // Diagonal pointing down-right or down-left feels natural too.
        if (dy > 0) score += 2;
      }
      // Length penalty: longer arrows are visually less appealing.
      const len = Math.max(adx, ady);
      if (len > 1) score -= (len - 1) * 0.5;
    } else {
      score -= 3;
    }
  }
  // Object-on-segment crossings — a straight edge that passes literally
  // through another object's grid cell hides the label and looks broken.
  for (const m of ast.morphisms) {
    const a = positions.get(m.dom);
    const b = positions.get(m.cod);
    if (!a || !b) continue;
    if (skelSet.has(m.name)) {
      const adx = Math.abs(b.x - a.x);
      const ady = Math.abs(b.y - a.y);
      // 1-step edges (in either frame) by construction don't pass through
      // anything else; skip the check.
      if ((adx <= 1 && ady <= 1)) continue;
    }
    for (const [name, p] of positions) {
      if (name === m.dom || name === m.cod) continue;
      if (segmentPassesThrough(p, a, b)) score -= 5;
    }
  }
  for (const i of ast.induced) {
    const a = positions.get(i.dom);
    const b = positions.get(i.cod);
    if (!a || !b) continue;
    for (const [name, p] of positions) {
      if (name === i.dom || name === i.cod) continue;
      if (segmentPassesThrough(p, a, b)) score -= 5;
    }
  }
  // Line-line crossings — when two edges intersect at a point that's
  // not an endpoint of either, the resulting "X" pattern is the most
  // visually disruptive defect a diagram can have. -15 per crossing is
  // strong enough to flip the BFS toward a "scaled-up" layout (e.g. for
  // the pullback's K_{2,3} topology, where the user-canonical placement
  // with P at the centre of an outer 2×2 square has 0 crossings and is
  // chosen even though it has 4 length-2 edges instead of 4 length-1).
  const allEdges: { dom: string; cod: string }[] = [];
  for (const m of ast.morphisms) allEdges.push({ dom: m.dom, cod: m.cod });
  for (const i of ast.induced) allEdges.push({ dom: i.dom, cod: i.cod });
  for (let i = 0; i < allEdges.length; i += 1) {
    for (let j = i + 1; j < allEdges.length; j += 1) {
      const e1 = allEdges[i]!;
      const e2 = allEdges[j]!;
      const a1 = positions.get(e1.dom);
      const a2 = positions.get(e1.cod);
      const b1 = positions.get(e2.dom);
      const b2 = positions.get(e2.cod);
      if (!a1 || !a2 || !b1 || !b2) continue;
      if (segmentsCross(a1, a2, b1, b2)) score -= 15;
    }
  }
  // Compactness — prefer small bounding box.
  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  score -= (w + h) * 0.1;
  return score;
}

/**
 * Purpose: Test whether two line segments cross at a point that is NOT an
 *   endpoint of either. Shared endpoints (two arrows meeting at the same
 *   object) don't count — they're a normal feature of the diagram.
 * How: Standard CCW orientation test. Two segments cross iff each one's
 *   endpoints are on opposite sides of the other.
 */
function segmentsCross(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
): boolean {
  // Endpoint sharing — explicit early exit.
  if (
    (a1.x === b1.x && a1.y === b1.y) ||
    (a1.x === b2.x && a1.y === b2.y) ||
    (a2.x === b1.x && a2.y === b1.y) ||
    (a2.x === b2.x && a2.y === b2.y)
  ) {
    return false;
  }
  const ccw = (p: Position, q: Position, r: Position): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = ccw(a1, a2, b1);
  const o2 = ccw(a1, a2, b2);
  const o3 = ccw(b1, b2, a1);
  const o4 = ccw(b1, b2, a2);
  return Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4);
}

/**
 * Purpose: Test whether the integer point `p` lies on the open segment
 *   between integer points `a` and `b`.
 * How: Colinearity (cross = 0) + strict-betweenness via dot products.
 */
function segmentPassesThrough(p: Position, a: Position, b: Position): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (cross !== 0) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot <= 0) return false;
  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (dot >= lenSq) return false;
  return true;
}

// ---- Phase 3 — emit SVG ------------------------------------------------

/**
 * Purpose: Public entry — render an AST to an SVG string, or return null
 *   when the native renderer can't produce an acceptable layout (caller
 *   falls back to Mermaid).
 * How: Classify edges → layout on grid → render. Stylesheet hooks are
 *   exposed via classes (`.cd-obj`, `.cd-edge`, `.cd-edge-induced`,
 *   `.cd-edge-label`).
 */
export function emitSvg(ast: CdAst): string | null {
  const { skeletal, shortcut, induced } = classifyEdges(ast);
  const layout = layoutOnGrid(ast, skeletal);
  if (layout === null) return null;

  // Normalise to (0,0) origin.
  const xs = [...layout.positions.values()].map((p) => p.x);
  const ys = [...layout.positions.values()].map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const positions = new Map<string, Position>();
  for (const [name, p] of layout.positions) {
    positions.set(name, { x: p.x - minX, y: p.y - minY });
  }
  const maxX = Math.max(...[...positions.values()].map((p) => p.x));
  const maxY = Math.max(...[...positions.values()].map((p) => p.y));
  const W = maxX * CELL + 2 * PADDING;
  const H = maxY * CELL + 2 * PADDING;

  const toPx = (p: Position) => ({
    x: PADDING + p.x * CELL,
    y: PADDING + p.y * CELL,
  });
  // Centroid of all object positions, in pixels. Used by edge-label
  // placement to put labels on the *outside* of the figure (the side
  // opposite the centroid).
  const cx =
    [...positions.values()].reduce((s, p) => s + p.x, 0) / positions.size;
  const cy =
    [...positions.values()].reduce((s, p) => s + p.y, 0) / positions.size;
  const centroidPx = toPx({ x: cx, y: cy });

  // Build the SVG body and track the overall bounding box. Labels —
  // both object names and edge labels — can stick out beyond the
  // object grid, so we expand the viewBox to include them rather
  // than clipping (the previous behaviour).
  const bodyParts: string[] = [];
  let bbox = { minX: 0, minY: 0, maxX: W, maxY: H };

  // Group skeletal morphisms by (dom, cod) pair to detect parallel
  // pairs (equalizer-style). Each pair gets a perpendicular offset so
  // the two arrows don't overlap visually.
  const parallelOffsets = computeParallelOffsets(skeletal);

  const renderEdgeAndTrack = (
    a: Position,
    b: Position,
    label: string,
    kind: 'skeletal' | 'shortcut' | 'induced',
    domName: string,
    codName: string,
    perpShift = 0,
  ): void => {
    const result = drawEdge(
      toPx(a),
      toPx(b),
      label,
      kind,
      domName,
      codName,
      centroidPx,
      perpShift,
    );
    bodyParts.push(result.svg);
    bbox = expandBbox(bbox, result.labelBbox);
  };

  // Draw skeletal edges first (behind), then shortcut, then induced.
  for (const m of skeletal) {
    const a = positions.get(m.dom);
    const b = positions.get(m.cod);
    if (!a || !b) continue;
    const offset = parallelOffsets.get(m) ?? 0;
    renderEdgeAndTrack(a, b, labelOf(m), 'skeletal', m.dom, m.cod, offset);
  }
  for (const m of shortcut) {
    const a = positions.get(m.dom);
    const b = positions.get(m.cod);
    if (!a || !b) continue;
    renderEdgeAndTrack(a, b, labelOf(m), 'shortcut', m.dom, m.cod);
  }
  for (const i of induced) {
    const a = positions.get(i.dom);
    const b = positions.get(i.cod);
    if (!a || !b) continue;
    renderEdgeAndTrack(a, b, i.name, 'induced', i.dom, i.cod);
  }

  // Object labels — drawn last so they sit on top of any arrow head.
  // Each object label may also stick out past the grid origin (e.g. a
  // multi-char name like `F(X)` extends past x=0 when placed at column 0).
  for (const [name, p] of positions) {
    const px = toPx(p);
    bodyParts.push(
      `<text x="${px.x}" y="${px.y}" text-anchor="middle" ` +
        `dominant-baseline="middle" class="cd-obj" fill="currentColor">${escapeXml(name)}</text>`,
    );
    const hw = halfTextWidth(name);
    const hh = FONT_PX / 2;
    bbox = expandBbox(bbox, {
      minX: px.x - hw,
      minY: px.y - hh,
      maxX: px.x + hw,
      maxY: px.y + hh,
    });
  }

  // Add a small safety margin so glyphs don't kiss the SVG border.
  const SAFETY = 4;
  const vbX = Math.floor(bbox.minX) - SAFETY;
  const vbY = Math.floor(bbox.minY) - SAFETY;
  const vbW = Math.ceil(bbox.maxX - bbox.minX) + 2 * SAFETY;
  const vbH = Math.ceil(bbox.maxY - bbox.minY) + 2 * SAFETY;

  const header =
    `<svg xmlns="http://www.w3.org/2000/svg" class="category-svg" ` +
    `width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" ` +
    `font-family="inherit" font-size="${FONT_PX}" role="img">`;
  const defs =
    `<defs><marker id="cd-arrow" viewBox="0 0 10 10" refX="9" refY="5" ` +
    `markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 Z" fill="currentColor"/></marker></defs>`;
  return `${header}${defs}${bodyParts.join('')}</svg>`;
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function expandBbox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

// ---- Helpers ------------------------------------------------------------

const MOD_GLYPH = { mono: '↣', epi: '↠', iso: '≅' } as const;

/**
 * Purpose: Build the visible edge label — morphism name plus any
 *   `(mono)` / `(epi)` / `(iso)` suffix glyph.
 */
function labelOf(m: Morphism): string {
  if (m.props.length === 0) return m.name;
  const order: (keyof typeof MOD_GLYPH)[] = ['mono', 'epi', 'iso'];
  const suffix = order
    .filter((p) => m.props.includes(p))
    .map((p) => MOD_GLYPH[p])
    .join(' ');
  return suffix === '' ? m.name : `${m.name} ${suffix}`;
}

/**
 * Purpose: Detect parallel skeletal pairs and assign each a perpendicular
 *   offset so they don't render on top of each other.
 * How: Group morphisms by ordered (dom, cod). For groups with > 1 entry,
 *   alternate offsets: ±0.5 * LABEL_OFFSET, then ±1, etc.
 */
function computeParallelOffsets(skeletal: Morphism[]): Map<Morphism, number> {
  const groups = new Map<string, Morphism[]>();
  for (const m of skeletal) {
    const key = `${m.dom}${m.cod}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  const out = new Map<Morphism, number>();
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.set(list[0]!, 0);
      continue;
    }
    // Alternate above / below: indices 0,1,2,3 → offsets 0.5, -0.5, 1.5, -1.5, …
    // Multiplier picked so a pair lands ~12 px apart — enough that the
    // two labels next to them don't visually merge (FONT_PX = 14).
    const PAIR_SPREAD = 6;
    list.forEach((m, idx) => {
      const sign = idx % 2 === 0 ? 1 : -1;
      const mag = Math.floor(idx / 2) + 0.5;
      out.set(m, sign * mag * PAIR_SPREAD * 2);
    });
  }
  return out;
}

/**
 * Purpose: Emit a single edge — line + arrowhead + label. `kind` drives
 *   the CSS class (and the dashed style for `induced`).
 * How: Trim the endpoints by a half-label width so the line stops short
 *   of the object glyph; compute perpendicular offset for the label;
 *   emit one `<line>` and one `<text>`.
 */
function drawEdge(
  a: { x: number; y: number },
  b: { x: number; y: number },
  label: string,
  kind: 'skeletal' | 'shortcut' | 'induced',
  domName: string,
  codName: string,
  centroidPx: { x: number; y: number },
  perpShift = 0,
): { svg: string; labelBbox: BBox } {
  const emptyBbox: BBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { svg: '', labelBbox: emptyBbox };
  const ux = dx / len;
  const uy = dy / len;
  // Per-endpoint trim: each end gets shortened by half the text width
  // of THAT endpoint's object label (plus a small gap) so the line
  // stops just at the glyph edge. Previously a single shared trim
  // mis-centred the visible segment when the endpoints had labels of
  // different widths.
  const trimA = Math.max(NODE_HALF_HEIGHT, halfTextWidth(domName) + 4);
  const trimB = Math.max(NODE_HALF_HEIGHT, halfTextWidth(codName) + 4);
  // Perpendicular unit (90° CCW rotation of the direction).
  const perpX = -uy;
  const perpY = ux;
  const sx = a.x + ux * trimA + perpX * perpShift;
  const sy = a.y + uy * trimA + perpY * perpShift;
  const ex = b.x - ux * trimB + perpX * perpShift;
  const ey = b.y - uy * trimB + perpY * perpShift;
  const dash = kind === 'induced' ? ' stroke-dasharray="4,3"' : '';
  const lineCls = `cd-edge cd-edge-${kind}`;
  const lineEl =
    `<line x1="${round(sx)}" y1="${round(sy)}" x2="${round(ex)}" y2="${round(ey)}" ` +
    `class="${lineCls}" stroke="currentColor" stroke-width="1"${dash} ` +
    `marker-end="url(#cd-arrow)"/>`;
  // Label placement: on the perpendicular side opposite to the figure
  // centroid (i.e. outside the figure for closed shapes like triangles
  // and squares). The label is offset by LABEL_OFFSET plus half its
  // own width so the text doesn't visually touch the line.
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  // Decide which side of the line to place the label.
  // For parallel pairs (perpShift !== 0): the line itself has been
  // pushed in some perpendicular direction; we want the label to stay
  // on that SAME side so the two labels of a pair don't stack on top of
  // each other. This overrides the centroid heuristic — the parallel
  // pair handles its own visual separation.
  // For solo arrows: the centroid heuristic picks the outside of the
  // figure (perpendicular pointing away from the centre).
  let sign: number;
  if (perpShift !== 0) {
    sign = Math.sign(perpShift);
  } else {
    const vcx = centroidPx.x - mx;
    const vcy = centroidPx.y - my;
    const dot = perpX * vcx + perpY * vcy;
    sign = dot > 0 ? -1 : 1;
    if (dot === 0) {
      sign = Math.abs(ux) >= Math.abs(uy) ? -1 : 1;
    }
  }
  // Centre-to-line distance: LABEL_OFFSET gives the desired gap between
  // the line and the *near edge* of the label, so we add the label's
  // half-width so the centre sits one full half-width further out.
  const labelDist = LABEL_OFFSET + halfTextWidth(label);
  const labelOx = sign * perpX * labelDist;
  const labelOy = sign * perpY * labelDist;
  const labelEl =
    `<text x="${round(mx + labelOx)}" y="${round(my + labelOy)}" ` +
    `text-anchor="middle" dominant-baseline="middle" ` +
    `class="cd-edge-label" fill="currentColor">${escapeXml(label)}</text>`;
  const lhw = halfTextWidth(label);
  const lhh = FONT_PX / 2;
  const labelBbox: BBox = {
    minX: mx + labelOx - lhw,
    minY: my + labelOy - lhh,
    maxX: mx + labelOx + lhw,
    maxY: my + labelOy + lhh,
  };
  return { svg: lineEl + labelEl, labelBbox };
}

function halfTextWidth(s: string): number {
  return (s.length * CHAR_PX) / 2;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
