// Custom Faust language definition for highlight.js. Faust is the
// functional DSL for audio signal processing (faust.grame.fr). It
// isn't in highlight.js core, so we declare it here.
//
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
