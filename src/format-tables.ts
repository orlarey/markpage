// Reformat GFM-style Markdown tables in a source string. Each table
// block is detected as a header line containing `|`, immediately
// followed by a separator line of the form `| --- | :---: | ---: |`
// (the `:` markers carry the alignment). Cells are trimmed and
// repadded so the `|` columns line up visually in a monospace
// context, and the separator dashes are normalised to match.
//
// Pure function — anything outside a detected table block is passed
// through verbatim, so code fences, math, inference rules, and
// other Markdown constructs are left untouched.

type CellAlign = 'left' | 'center' | 'right';

// Split a row on unescaped `|`. Strips the optional leading and
// trailing `|` borders so `| a | b |` and `a | b` both yield
// `['a', 'b']`. A backslash-escaped `\|` inside a cell survives.
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) {
    // Count trailing backslashes immediately before the `|`. An even
    // count (including zero) means the `|` is a real border.
    let bs = 0;
    for (let k = s.length - 2; k >= 0 && s[k] === '\\'; k -= 1) bs += 1;
    if (bs % 2 === 0) s = s.slice(0, -1);
  }
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += String.raw`\|`;
      i += 1;
    } else if (c === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorLine(line: string): boolean {
  const s = line.trim();
  if (!s.includes('-')) return false;
  if (!/^[\s|:-]+$/.test(s)) return false;
  const cells = splitCells(s);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c));
}

function parseAlign(cell: string): CellAlign {
  const startsColon = cell.startsWith(':');
  const endsColon = cell.endsWith(':');
  if (startsColon && endsColon) return 'center';
  if (endsColon) return 'right';
  return 'left';
}

function padCell(cell: string, width: number, align: CellAlign): string {
  const slack = Math.max(width - cell.length, 0);
  if (align === 'left') return cell + ' '.repeat(slack);
  if (align === 'right') return ' '.repeat(slack) + cell;
  const leftN = Math.floor(slack / 2);
  return ' '.repeat(leftN) + cell + ' '.repeat(slack - leftN);
}

function renderRow(
  cells: string[],
  widths: number[],
  aligns: CellAlign[],
): string {
  const parts = widths.map(
    (w, i) => ` ${padCell(cells[i] ?? '', w, aligns[i] ?? 'left')} `,
  );
  return `|${parts.join('|')}|`;
}

function renderSeparator(widths: number[], aligns: CellAlign[]): string {
  const parts = widths.map((w, i) => {
    const align = aligns[i] ?? 'left';
    const dashes = '-'.repeat(w);
    if (align === 'center') return `:${dashes}:`;
    if (align === 'right') return ` ${dashes}:`;
    return ` ${dashes} `;
  });
  return `|${parts.join('|')}|`;
}

interface ParsedTable {
  header: string[];
  aligns: CellAlign[];
  rows: string[][];
  // Number of source lines consumed (header + separator + body).
  consumed: number;
}

// Parse one GFM table block starting at `lines[start]`. Returns null
// if no table is present at that position (header lacks a `|` or the
// next line isn't a valid separator).
function parseTableAt(lines: string[], start: number): ParsedTable | null {
  const headerLine = lines[start] ?? '';
  const sepLine = lines[start + 1] ?? '';
  if (!headerLine.includes('|') || !isSeparatorLine(sepLine)) return null;

  const headerCells = splitCells(headerLine);
  const sepCells = splitCells(sepLine);
  const colCount = Math.max(headerCells.length, sepCells.length);

  const aligns: CellAlign[] = [];
  for (let c = 0; c < colCount; c += 1) {
    aligns.push(c < sepCells.length ? parseAlign(sepCells[c] ?? '') : 'left');
  }

  const padRow = (cells: string[]): string[] => {
    const padded = cells.slice(0, colCount);
    while (padded.length < colCount) padded.push('');
    return padded;
  };

  const rows: string[][] = [];
  let j = start + 2;
  while (j < lines.length) {
    const bodyLine = lines[j] ?? '';
    if (bodyLine.trim() === '' || !bodyLine.includes('|')) break;
    rows.push(padRow(splitCells(bodyLine)));
    j += 1;
  }

  return {
    header: padRow(headerCells),
    aligns,
    rows,
    consumed: j - start,
  };
}

function renderTable(t: ParsedTable): string[] {
  const widths: number[] = [];
  for (let c = 0; c < t.aligns.length; c += 1) {
    let max = (t.header[c] ?? '').length;
    for (const row of t.rows) {
      max = Math.max(max, (row[c] ?? '').length);
    }
    // Minimum 3 so the separator always has at least `---`.
    widths.push(Math.max(max, 3));
  }
  return [
    renderRow(t.header, widths, t.aligns),
    renderSeparator(widths, t.aligns),
    ...t.rows.map((row) => renderRow(row, widths, t.aligns)),
  ];
}

export function formatMarkdownTables(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const table = parseTableAt(lines, i);
    if (table === null) {
      out.push(lines[i] ?? '');
      i += 1;
      continue;
    }
    out.push(...renderTable(table));
    i += table.consumed;
  }
  return out.join('\n');
}
