import { describe, expect, it } from 'vitest';

import { formatMarkdownTables } from '../src/format-tables';

describe('formatMarkdownTables', () => {
  it('aligns a basic table with uneven cell widths', () => {
    const input = [
      '| Name | Type | Description |',
      '|---|---|---|',
      '| foo | int | A counter |',
      '| longname | string | Something else |',
    ].join('\n');
    const expected = [
      '| Name     | Type   | Description    |',
      '| -------- | ------ | -------------- |',
      '| foo      | int    | A counter      |',
      '| longname | string | Something else |',
    ].join('\n');
    expect(formatMarkdownTables(input)).toBe(expected);
  });

  it('preserves left / center / right alignment from the separator', () => {
    const input = [
      '| L | C | R |',
      '|:---|:---:|---:|',
      '| a | b | c |',
      '| longer | longer | longer |',
    ].join('\n');
    // Center alignment with odd slack lands `floor(slack/2)` on the
    // left (Pandoc convention) — so a 1-char cell in a 6-wide column
    // gets 2 left + 3 right. Left-aligned columns drop the explicit
    // `:` marker since left is the default.
    const expected = [
      '| L      |   C    |      R |',
      '| ------ |:------:| ------:|',
      '| a      |   b    |      c |',
      '| longer | longer | longer |',
    ].join('\n');
    expect(formatMarkdownTables(input)).toBe(expected);
  });

  it('leaves non-table content untouched', () => {
    const input = [
      '# Heading',
      '',
      'Some prose with a literal | pipe.',
      '',
      '```',
      '| not a | table | because | code fence',
      '|---|---|',
      '```',
      '',
      '| Real | Table |',
      '|---|---|',
      '| a | b |',
    ].join('\n');
    const formatted = formatMarkdownTables(input);
    expect(formatted).toContain('# Heading');
    expect(formatted).toContain('Some prose with a literal | pipe.');
    expect(formatted).toContain('| Real | Table |');
    expect(formatted).toContain('| a    | b     |');
  });

  it('handles tables without leading/trailing pipe borders', () => {
    const input = ['Name | Age', '---|---', 'Alice | 30', 'Bob | 25'].join(
      '\n',
    );
    const expected = [
      '| Name  | Age |',
      '| ----- | --- |',
      '| Alice | 30  |',
      '| Bob   | 25  |',
    ].join('\n');
    expect(formatMarkdownTables(input)).toBe(expected);
  });

  it('pads short rows and truncates over-long rows to the header column count', () => {
    const input = [
      '| A | B | C |',
      '|---|---|---|',
      '| 1 |',
      '| 1 | 2 | 3 | 4 |',
    ].join('\n');
    // Minimum cell width is 3 (so the separator always has at least
    // `---`). Extra cells past the header count are dropped.
    const expected = [
      '| A   | B   | C   |',
      '| --- | --- | --- |',
      '| 1   |     |     |',
      '| 1   | 2   | 3   |',
    ].join('\n');
    expect(formatMarkdownTables(input)).toBe(expected);
  });

  it('processes multiple tables in one document', () => {
    const input = [
      '| A | B |',
      '|---|---|',
      '| 1 | 22 |',
      '',
      'Prose between.',
      '',
      '| X | Y |',
      '|---|---|',
      '| longer | y |',
    ].join('\n');
    const formatted = formatMarkdownTables(input);
    expect(formatted).toContain('| A   | B   |');
    expect(formatted).toContain('| 1   | 22  |');
    expect(formatted).toContain('Prose between.');
    expect(formatted).toContain('| X      | Y   |');
    expect(formatted).toContain('| longer | y   |');
  });

  it(String.raw`keeps escaped \| inside cells intact`, () => {
    const input = [
      '| Operator | Meaning |',
      '|---|---|',
      String.raw`| a \| b | or |`,
    ].join('\n');
    const formatted = formatMarkdownTables(input);
    expect(formatted).toContain(String.raw`a \| b`);
  });

  it('is idempotent — running twice yields the same output', () => {
    const input = [
      '| Name | Type | Description |',
      '|---|---|---|',
      '| foo | int | A counter |',
      '| longname | string | Something else |',
    ].join('\n');
    const once = formatMarkdownTables(input);
    const twice = formatMarkdownTables(once);
    expect(twice).toBe(once);
  });
});
