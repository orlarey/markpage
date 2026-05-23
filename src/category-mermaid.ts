/********************************* category-mermaid.ts ***********************
 *
 * Purpose: Transpile a `category` AST (parsed + typechecked by
 *   [category.ts]) to a Mermaid `graph` source. The output goes through
 *   the existing markpage Mermaid pipeline for SVG rendering and caching.
 * How: Walk the AST in three passes — node declarations (one per object),
 *   solid edges (morphisms, with `↣`/`↠`/`≅` suffixes for mono/epi/iso),
 *   dotted edges (induced arrows). Object and morphism names may contain
 *   Unicode + balanced parens (e.g. `F(X)`, `π₁`) — node IDs are
 *   sanitised to alphanumeric while the visible label keeps the original.
 *
 *******************************************************************************/

import type { CdAst, MorphismProp } from './category';

/**
 * Purpose: Emit a Mermaid `graph <dir>` source for the given AST.
 * How: Build a node-id map (Unicode names → safe Mermaid ids), then concat
 *   declarations and edges. Modifier suffixes follow CD-SPEC §7.3.
 */
export function emitMermaid(ast: CdAst): string {
  const idMap = buildIdMap(ast.objects.map((o) => o.name));
  // `curve: linear` forces straight arrows instead of Mermaid's default
  // Bézier curves — straight lines are the typographic convention for
  // commutative diagrams. The directive must come before `graph`.
  const lines: string[] = [
    `%%{init: {'flowchart': {'curve': 'linear'}}}%%`,
    `graph ${ast.direction}`,
  ];

  // Node declarations: `id["label"]` keeps the original name visible.
  // Quoting is required when the label contains `(`, `)`, spaces, or
  // anything Mermaid would parse as a node-shape delimiter.
  for (const obj of ast.objects) {
    const id = idMap.get(obj.name) ?? obj.name;
    lines.push(`  ${id}${nodeLabel(obj.name)}`);
  }

  // Solid edges — morphisms.
  for (const m of ast.morphisms) {
    const src = idMap.get(m.dom) ?? m.dom;
    const dst = idMap.get(m.cod) ?? m.cod;
    const lbl = edgeLabel(m.name + propSuffix(m.props));
    lines.push(`  ${src} -- ${lbl} --> ${dst}`);
  }

  // Dotted edges — induced (universal) arrows.
  for (const i of ast.induced) {
    const src = idMap.get(i.dom) ?? i.dom;
    const dst = idMap.get(i.cod) ?? i.cod;
    const lbl = edgeLabel(i.name);
    lines.push(`  ${src} -. ${lbl} .-> ${dst}`);
  }

  // Object nodes are rendered as plain text — no fill, no border. The
  // typesetting convention for commutative diagrams is just the object
  // name with the arrows pointing into the glyphs themselves. Mermaid's
  // default rounded-rectangle look is not what mathematicians expect.
  // `classDef` declares the style, `class` applies it to every object.
  if (ast.objects.length > 0) {
    const allIds = ast.objects
      .map((o) => idMap.get(o.name) ?? o.name)
      .join(',');
    lines.push('  classDef cd-obj fill:none,stroke:none');
    lines.push(`  class ${allIds} cd-obj`);
  }

  return lines.join('\n');
}

/**
 * Purpose: Build a stable name → safe-Mermaid-id mapping.
 * How: For each name, strip everything outside [A-Za-z0-9_]; if the result
 *   collides with another id (e.g. `F(X)` and `FX` both collapse to `FX`)
 *   or starts with a digit, append a numeric suffix. Deterministic across
 *   runs (insertion order) so cache keys stay stable.
 */
function buildIdMap(names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const n of names) {
    let base = n.replace(/[^A-Za-z0-9_]/g, '');
    if (base === '' || /^[0-9]/.test(base)) base = `n${base}`;
    let id = base;
    let i = 2;
    while (used.has(id)) {
      id = `${base}${i}`;
      i += 1;
    }
    used.add(id);
    out.set(n, id);
  }
  return out;
}

/**
 * Purpose: Format the visible label for a node — `[plain]` if safe,
 *   `["quoted"]` otherwise.
 * How: Plain form is allowed when the name contains only Unicode letters,
 *   digits, underscore, and combining marks; anything with parens / spaces
 *   / quotes goes through the quoted form.
 */
function nodeLabel(name: string): string {
  return needsQuoting(name) ? `["${escapeLabel(name)}"]` : `[${name}]`;
}

/**
 * Purpose: Format an edge label (`-- foo -->` vs `-- "f ↣" -->`).
 * How: Quote if it has special chars; otherwise emit bare for a slightly
 *   nicer Mermaid source.
 */
function edgeLabel(name: string): string {
  return needsQuoting(name) ? `"${escapeLabel(name)}"` : name;
}

/**
 * Purpose: Decide whether a Mermaid label needs surrounding quotes.
 * How: Quote on parens, spaces, quotes, brackets, or any of Mermaid's
 *   own metacharacters that would otherwise be parsed as syntax.
 */
function needsQuoting(s: string): boolean {
  return /[()[\]{}"'<>|\s]/u.test(s);
}

/**
 * Purpose: Escape a string for use inside a Mermaid quoted label.
 * How: Mermaid uses `#34;` and similar HTML-entity escapes inside
 *   quoted labels for `"`. Other chars pass through.
 */
function escapeLabel(s: string): string {
  return s.replaceAll('"', '#34;');
}

/**
 * Purpose: Build the modifier suffix appended to a morphism label —
 *   `↣` for mono, `↠` for epi, `≅` for iso (CD-SPEC §7.3).
 * How: Concatenate in a deterministic order; separate by a thin space.
 */
function propSuffix(props: MorphismProp[]): string {
  if (props.length === 0) return '';
  const map: Record<MorphismProp, string> = {
    mono: '↣',
    epi: '↠',
    iso: '≅',
  };
  // Stable order keeps the output deterministic for snapshot tests.
  const order: MorphismProp[] = ['mono', 'epi', 'iso'];
  const parts = order.filter((p) => props.includes(p)).map((p) => map[p]);
  return ' ' + parts.join(' ');
}
