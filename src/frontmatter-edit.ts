/******************************** frontmatter-edit.ts **************************
 *
 * Purpose: Surgical writes into a document's front-matter — the app sets
 *   `document-style:` from the Style menu without reformatting anything else.
 *
 *******************************************************************************/

/**
 * Purpose: Targeted multi-key front-matter write — upsert each `key: value` and
 *   delete the listed keys, touching only those lines and leaving the rest of the
 *   front-matter (and the body) verbatim.
 * How: locate the front-matter block, then per key replace its line in place if
 *   present, append inside the block if new, or splice it out (delete). Values
 *   are already-serialized YAML scalars. Creates the front-matter block when
 *   absent and there is something to upsert.
 */
export function setFrontmatterKeys(
  source: string,
  upserts: Map<string, string>,
  deletes: Iterable<string> = [],
): string {
  const delSet = new Set(deletes);
  const lines = source.split('\n');

  const buildBlock = (): string | null => {
    const entries = [...upserts].filter(([k]) => !delSet.has(k));
    if (entries.length === 0) return null;
    return `---\n${entries.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n`;
  };

  if (lines[0]?.trim() !== '---') {
    const block = buildBlock();
    return block === null ? source : `${block}${source}`;
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    const block = buildBlock();
    return block === null ? source : `${block}${source}`;
  }

  const indexOfKey = (key: string): number => {
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
    for (let i = 1; i < end; i += 1) {
      if (re.test(lines[i])) return i;
    }
    return -1;
  };

  // Deletes first so the block shrinks before we compute append positions.
  for (const key of delSet) {
    const idx = indexOfKey(key);
    if (idx !== -1) {
      lines.splice(idx, 1);
      end -= 1;
    }
  }
  for (const [key, value] of upserts) {
    if (delSet.has(key)) continue;
    const idx = indexOfKey(key);
    if (idx !== -1) {
      lines[idx] = `${key}: ${value}`;
    } else {
      lines.splice(end, 0, `${key}: ${value}`); // append at the end of the block
      end += 1;
    }
  }
  return lines.join('\n');
}
