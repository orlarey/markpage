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

/**
 * Purpose: Convert an indent-based outline to a Unicode tree inside a `<pre>`.
 * How: `parseTree` builds the forest; `renderUnicode` walks it printing the
 *   right box-drawing characters at each depth. Single-root inputs print the
 *   root name unadorned (the typical README file-tree shape); multiple roots
 *   render as siblings under an implicit empty parent.
 */
export function renderTreeBlock(text: string): string {
  const roots = parseTree(text);
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
