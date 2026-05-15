// Syntax highlighting for fenced code blocks. Curated subset of
// highlight.js languages — keeps the bundle weight to ~80-150 KB
// while covering the languages a spec writer typically reaches for.
//
// Faust is registered as a custom language (defined below) since
// it isn't in highlight.js core.
//
// `highlightCode(code, lang)` returns HTML markup wrapped in a
// `<pre class="hljs"><code class="hljs language-…">…</code></pre>`
// structure. If the language isn't registered, we fall back to an
// escaped plain `<pre><code>` so the source still renders.

import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import haskell from 'highlight.js/lib/languages/haskell';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import ocaml from 'highlight.js/lib/languages/ocaml';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import scheme from 'highlight.js/lib/languages/scheme';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

import { faustLanguage } from './highlight-faust';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('faust', faustLanguage);
hljs.registerLanguage('dsp', faustLanguage); // Faust files often have `.dsp`
hljs.registerLanguage('go', go);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('ocaml', ocaml);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('scheme', scheme);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('sh', shell);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

// Returns true if highlight.js knows about the given language alias.
// Lets marked-config decide whether to invoke the highlighter or
// fall through to plain code rendering.
export function isKnownLanguage(lang: string): boolean {
  return hljs.getLanguage(lang) !== undefined;
}

// Renders an already-known language. The output is wrapped in
// `<pre class="hljs"><code class="hljs language-…">…</code></pre>`
// — the matching CSS classes drive the colour theme.
export function highlightCode(code: string, lang: string): string {
  const result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
  return (
    `<pre class="hljs"><code class="hljs language-${escapeAttr(lang)}">` +
    result.value +
    `</code></pre>`
  );
}

function escapeAttr(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
