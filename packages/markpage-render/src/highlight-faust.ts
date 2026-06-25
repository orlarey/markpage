/********************************* highlight-faust.ts ***************************
 *
 * Purpose: Custom highlight.js language definition for Faust (functional DSL
 *   for audio signal processing, faust.grame.fr) — not in hljs core.
 * How: Export a factory `faustLanguage(hljs)` returning the standard
 *   `Language` shape (keyword groups + `contains` patterns).
 *
 *******************************************************************************/

// Tokens covered:
//   - line `//` and block `/* … */` comments
//   - double-quoted strings (mostly used in `library(...)`,
//     `import(...)` and `declare key "value";`)
//   - integer and float literals (incl. exponent form)
//   - block- and definition-level keywords (process, with, letrec,
//     case, import, library, environment, declare, route, define)
//   - UI primitives (button, checkbox, vslider, hslider, nentry,
//     vbargraph, hbargraph, vgroup, hgroup, tgroup, attach, enable,
//     control)
//   - Audio primitives & shorthands (_, !, mem, prefix, select2,
//     select3, fconstant, fvariable)
//   - Types in signatures (int, float)
//   - Identifiers introduced by `declare` metadata keys (name,
//     author, copyright, license, version)

import type { HLJSApi, Language } from 'highlight.js';

/**
 * Purpose: highlight.js language factory for Faust / `.dsp` files.
 * How: Returns a `Language` with keyword groups (keyword/type/built_in)
 *   plus `contains` rules for comments, strings, numbers and module prefixes.
 */
export function faustLanguage(_hljs: HLJSApi): Language {
  return {
    name: 'Faust',
    aliases: ['dsp'],
    keywords: {
      keyword:
        'process effect with letrec case import library environment ' +
        'declare route define waveform',
      type: 'int float',
      built_in:
        // Audio shorthands and core primitives
        '_ ! mem prefix select2 select3 fconstant fvariable ' +
        // UI elements
        'button checkbox vslider hslider nentry ' +
        'vbargraph hbargraph vgroup hgroup tgroup ' +
        'attach enable control ' +
        // Foreign-function bridges
        'ffunction',
    },
    contains: [
      // `//` line comments
      {
        className: 'comment',
        begin: '//',
        end: '$',
      },
      // `/* … */` block comments
      {
        className: 'comment',
        begin: '/\\*',
        end: '\\*/',
        contains: [{ className: 'doctag', begin: '@\\w+' }],
      },
      // double-quoted strings
      {
        className: 'string',
        begin: '"',
        end: '"',
        illegal: '\\n',
      },
      // numbers — int, float, scientific notation
      {
        className: 'number',
        begin: '\\b\\d+(\\.\\d+)?([eE][+-]?\\d+)?\\b',
      },
      // module accesses like `os.osc`, `ba.beat`, `de.delay` — the
      // module prefix gets a slightly muted style via the title class.
      {
        className: 'title.function',
        begin: '\\b[a-z][a-zA-Z0-9_]*(?=\\.)',
      },
    ],
  };
}
