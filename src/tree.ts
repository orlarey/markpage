/********************************* tree.ts *************************************
 *
 * Purpose: Render the ` ```tree ` fence — an indent-based outline source
 *   becomes a Unicode-box-drawing tree (files, syntax, proof, anything).
 * How: Parse lines by indent depth to build a forest, then walk it emitting
 *   `├── ` / `└── ` / `│   ` / `    ` connectors. Output is plain text inside
 *   a `<pre class="tree-block">` so it inherits the user's code-block style.
 *
 *******************************************************************************/

interface TreeNode {
  text: string;
  children: TreeNode[];
}

export type TreeMode = 'unicode' | 'svg';

/**
 * Purpose: Convert an indent-based outline to either a Unicode tree (default)
 *   or a top-down SVG diagram (root at top, children below, parent→child
 *   lines) — useful for linguistic / parsing syntax trees.
 * How: `parseTree` builds the forest; `renderUnicode` or `renderSvg` walks
 *   it. Single-root inputs (the common syntax-tree shape) skip the root
 *   connector / wrap; multiple roots render as siblings under an implicit
 *   empty parent.
 */
export function renderTreeBlock(text: string, mode: TreeMode = 'unicode'): string {
  const roots = parseTree(text);
  if (mode === 'svg') return renderSvg(roots);
  let body = '';
  if (roots.length === 1) {
    const [root] = roots;
    body = escapeHtml(root.text) + '\n' + renderUnicode(root.children, '');
  } else if (roots.length > 1) {
    body = renderUnicode(roots, '');
  }
  return `<pre class="tree-block">${body}</pre>\n`;
}

/**
 * Purpose: Split the fence body into a forest of (text, children) nodes.
 * How: Detect the indent unit from the first indented line (fallback: 2
 *   spaces). Each line's depth = floor(leading-whitespace-length / unit).
 *   A stack tracks the current ancestry; we attach each node to the
 *   ancestor at `depth - 1`.
 */
function parseTree(text: string): TreeNode[] {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  let unit = 0;
  for (const line of lines) {
    const m = /^([ \t]+)/.exec(line);
    if (m) {
      unit = m[1].length;
      break;
    }
  }
  if (unit === 0) unit = 2;
  const items = lines.map((line) => {
    const m = /^([ \t]*)(.*)$/.exec(line);
    const indent = m?.[1] ?? '';
    const txt = m?.[2] ?? '';
    return { depth: Math.floor(indent.length / unit), text: txt };
  });
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const item of items) {
    const node: TreeNode = { text: item.text, children: [] };
    if (item.depth === 0) {
      roots.push(node);
      stack.length = 0;
      stack.push(node);
      continue;
    }
    // Trim the stack to expose the parent at depth - 1 (or the closest
    // ancestor when the user skipped a level).
    while (stack.length > item.depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
      stack.push(node);
    } else {
      // Orphan (indented line with no parent) — treat as root.
      roots.push(node);
      stack.length = 0;
      stack.push(node);
    }
  }
  return roots;
}

/**
 * Purpose: Recursive box-drawing renderer for a list of sibling nodes.
 * How: Each child gets `├── ` (or `└── ` if last); its subtree is prefixed
 *   by the parent's prefix plus `│   ` (or `    ` if the parent was last)
 *   so the vertical line stops at the right depth.
 */
function renderUnicode(nodes: TreeNode[], parentPrefix: string): string {
  let out = '';
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    out += `${parentPrefix}${connector}${escapeHtml(node.text)}\n`;
    if (node.children.length > 0) {
      const childPrefix = parentPrefix + (isLast ? '    ' : '│   ');
      out += renderUnicode(node.children, childPrefix);
    }
  });
  return out;
}

/**
 * Purpose: Escape the user's node labels for safe insertion in HTML.
 * How: Replace `& < > " '` with the corresponding entities; the box-
 *   drawing characters around the labels are added after escaping and
 *   don't need it.
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---- SVG renderer (`tree svg`) ----------------------------------------

interface LayoutNode {
  text: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

const SVG_LEVEL_HEIGHT = 48; // px between depth levels
const SVG_LEAF_GAP_BASE = 28; // minimum px between leaf centres
const SVG_CHAR_WIDTH = 8; // approx px per character at the default font-size
const SVG_PADDING = 12;
const SVG_TEXT_HALF_HEIGHT = 6; // half the cap height — used to keep lines clear of text

/**
 * Purpose: Render the forest as a top-down SVG syntax tree (root above,
 *   children below, plain text labels joined by straight lines).
 * How: Two passes over each tree — first lays out (assign x/y to every
 *   node), second emits SVG (lines first so labels sit on top).
 */
function renderSvg(roots: TreeNode[]): string {
  if (roots.length === 0) return '<pre class="tree-svg"></pre>\n';

  // Layout each root independently, then horizontally concatenate them.
  let xCursor = 0;
  const laidOut: LayoutNode[] = [];
  for (const root of roots) {
    const leafGap = pickLeafGap(root);
    const ln = layoutNode(root, 0, { value: xCursor }, leafGap);
    const widthUsed = subtreeWidth(ln);
    xCursor += widthUsed + leafGap;
    laidOut.push(ln);
  }

  const all = collectNodes(laidOut);
  const minX = Math.min(...all.map((n) => n.x));
  const maxX = Math.max(...all.map((n) => n.x));
  const maxY = Math.max(...all.map((n) => n.y));
  // Make room around the text — rough text-width approximation per node.
  const maxLabelHalf =
    Math.max(...all.map((n) => n.text.length)) * SVG_CHAR_WIDTH * 0.5;
  const width = maxX - minX + 2 * (SVG_PADDING + maxLabelHalf);
  const height = maxY + 2 * SVG_PADDING + SVG_TEXT_HALF_HEIGHT * 2;
  const dx = SVG_PADDING + maxLabelHalf - minX;
  const dy = SVG_PADDING + SVG_TEXT_HALF_HEIGHT;

  // Render at intrinsic pixel resolution (width/height attrs match the
  // viewBox 1:1) so the text inside stays at its natural size relative
  // to the body. Without this the SVG is scaled to fill the column and
  // the labels balloon along with the diagram.
  const parts: string[] = [
    `<svg class="tree-svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" xmlns="http://www.w3.org/2000/svg" role="img">`,
  ];
  // Lines first so the text overlays them cleanly.
  for (const n of all) {
    for (const c of n.children) {
      parts.push(
        `<line x1="${round(n.x + dx)}" y1="${round(n.y + dy + SVG_TEXT_HALF_HEIGHT)}" x2="${round(c.x + dx)}" y2="${round(c.y + dy - SVG_TEXT_HALF_HEIGHT * 2)}" stroke="currentColor" stroke-width="1" />`,
      );
    }
  }
  // Text labels.
  for (const n of all) {
    parts.push(
      `<text x="${round(n.x + dx)}" y="${round(n.y + dy)}" text-anchor="middle" dominant-baseline="middle" font-family="inherit" font-size="14" fill="currentColor">${escapeHtml(n.text)}</text>`,
    );
  }
  parts.push('</svg>');
  return `<div class="tree-svg-wrap">${parts.join('')}</div>\n`;
}

/**
 * Purpose: Pick a per-tree leaf gap wide enough that the longest leaf label
 *   doesn't overlap its neighbour.
 * How: `text.length × char-width` is a coarse upper bound; clamp at a sane
 *   minimum so trees of single-letter labels don't squeeze together.
 */
function pickLeafGap(root: TreeNode): number {
  const leaves = collectLeaves(root);
  const widest = Math.max(0, ...leaves.map((l) => l.text.length));
  return Math.max(SVG_LEAF_GAP_BASE, widest * SVG_CHAR_WIDTH + 8);
}

function collectLeaves(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectLeaves);
}

/**
 * Purpose: Recursive layout — leaves get sequential x (via the mutable cursor);
 *   internal nodes sit at the average of their children's x.
 */
function layoutNode(
  node: TreeNode,
  depth: number,
  cursor: { value: number },
  leafGap: number,
): LayoutNode {
  const y = depth * SVG_LEVEL_HEIGHT;
  if (node.children.length === 0) {
    const x = cursor.value;
    cursor.value += leafGap;
    return { text: node.text, x, y, children: [] };
  }
  const children = node.children.map((c) =>
    layoutNode(c, depth + 1, cursor, leafGap),
  );
  const first = children[0]?.x ?? cursor.value;
  const last = children[children.length - 1]?.x ?? first;
  return { text: node.text, x: (first + last) / 2, y, children };
}

function subtreeWidth(node: LayoutNode): number {
  const all = collectNodes([node]);
  const minX = Math.min(...all.map((n) => n.x));
  const maxX = Math.max(...all.map((n) => n.x));
  return maxX - minX;
}

function collectNodes(nodes: LayoutNode[]): LayoutNode[] {
  const out: LayoutNode[] = [];
  function walk(n: LayoutNode): void {
    out.push(n);
    for (const c of n.children) walk(c);
  }
  for (const n of nodes) walk(n);
  return out;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
