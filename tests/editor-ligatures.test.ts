import { describe, expect, it } from 'vitest';

import { applyLigaturesToString } from '../src/editor-ligatures';
import { latexToUnicode, mathBodyToLatex } from '@orlarey/markpage-render';

describe('applyLigaturesToString — non-code text', () => {
  it('rewrites tail ligatures', () => {
    expect(applyLigaturesToString('a -> b')).toBe('a → b');
    expect(applyLigaturesToString('a <= b')).toBe('a ≤ b');
    expect(applyLigaturesToString('|N is a monoid')).toBe('ℕ is a monoid');
  });

  it('rewrites backslash commands', () => {
    expect(applyLigaturesToString('\\alpha + \\beta')).toBe('α + β');
    expect(applyLigaturesToString('\\subseteq')).toBe('⊆');
  });

  it('respects the same-first-char guard', () => {
    // `-->` should stay intact — common in Mermaid arrows.
    expect(applyLigaturesToString('a --> b')).toBe('a --> b');
  });

  it('accepts every symbol the LaTeX export round-trips', () => {
    // The editor commands are derived from the export table, so commands
    // that previously had no ligature (\star, \leq, \aleph, …) now fire.
    expect(applyLigaturesToString('a \\star b')).toBe('a ⋆ b');
    expect(applyLigaturesToString('x \\leq y')).toBe('x ≤ y');
    expect(applyLigaturesToString('\\aleph_0')).toBe('ℵ₀');
    expect(applyLigaturesToString('\\longrightarrow')).toBe('⟶');
  });

  it('accepts synonyms whose canonical export command differs', () => {
    // \perp normalises to \bot, \wedge to \land, etc. — same glyph.
    expect(applyLigaturesToString('A \\perp B')).toBe('A ⊥ B');
    expect(applyLigaturesToString('p \\wedge q')).toBe('p ∧ q');
    expect(applyLigaturesToString('p \\vee q')).toBe('p ∨ q');
  });
});

describe('round-trip invariant — editor ⇄ export share one table', () => {
  it('every editor command maps to a glyph the export turns back into a command', () => {
    // The single-table design promise: \cmd → glyph → (export) → \cmd.
    for (const [cmd, glyph] of latexToUnicode()) {
      const back = mathBodyToLatex(glyph).text.trim();
      expect(back, `glyph ${glyph} (from \\${cmd})`).toBe(`\\${cmd}`);
    }
  });
});

describe('applyLigaturesToString — fenced code blocks (regression)', () => {
  it('leaves |X labels inside a ```mermaid fence untouched', () => {
    const input =
      '```mermaid\nflowchart LR\n    Client -->|JSON-RPC| Server\n    Server -->|tools/list| Client\n```';
    expect(applyLigaturesToString(input)).toBe(input);
  });

  it('leaves backslash commands inside a fence untouched', () => {
    const input = '```python\nresult = \\alpha + \\beta\n```';
    expect(applyLigaturesToString(input)).toBe(input);
  });

  it('handles ~~~ fences too', () => {
    const input = '~~~js\nconst x = |N|\n~~~';
    expect(applyLigaturesToString(input)).toBe(input);
  });

  it('handles 4-backtick fences too', () => {
    const input = '````js\nconst x = |N|\n````';
    expect(applyLigaturesToString(input)).toBe(input);
  });

  it('rewrites text outside the fence, leaves text inside intact', () => {
    const input = [
      'See |N for the natural numbers.',
      '',
      '```mermaid',
      'Client -->|JSON-RPC| Server',
      '```',
      '',
      'And |R for reals.',
    ].join('\n');
    const expected = [
      'See ℕ for the natural numbers.',
      '',
      '```mermaid',
      'Client -->|JSON-RPC| Server',
      '```',
      '',
      'And ℝ for reals.',
    ].join('\n');
    expect(applyLigaturesToString(input)).toBe(expected);
  });

  it('matches the closing fence by length: 3-backtick fence ignores 4-backtick line inside', () => {
    // The inner ```` is longer than the opener — not a closing fence, so the
    // outer fence keeps going. Mermaid-style |J stays untouched.
    const input = '```mermaid\n````not the close\nClient -->|N|\n```';
    expect(applyLigaturesToString(input)).toBe(input);
  });

  it('honours the inference / category whitelist — ligatures fire inside', () => {
    // `inference` is in LIGATURE_FRIENDLY_FENCES so |N → ℕ even inside.
    const input = '```inference\nx |N\n---\nx ∈ ℕ\n```';
    const out = applyLigaturesToString(input);
    expect(out).toContain('x ℕ\n---');
  });

  it('multiple fences in sequence are each handled', () => {
    const input =
      '|N before\n```\n|N inside-1\n```\nmiddle |R text\n```\n|N inside-2\n```\nend |Z';
    const expected =
      'ℕ before\n```\n|N inside-1\n```\nmiddle ℝ text\n```\n|N inside-2\n```\nend ℤ';
    expect(applyLigaturesToString(input)).toBe(expected);
  });

  it('unclosed fence: everything from the opener stays unligature-d', () => {
    // Pasting a half-fence (no closing) is unusual but should fail-safe:
    // we treat the rest of the input as if still inside the fence.
    const input = '```mermaid\n-->|N| something\nbody |R text';
    expect(applyLigaturesToString(input)).toBe(input);
  });
});
