/********************************* highlight.ts *********************************
 *
 * Purpose: Syntax-highlighting backend for fenced code blocks — curated
 *   subset of highlight.js languages plus our custom Faust definition.
 * How: Register languages on the shared hljs instance at module load, then
 *   expose `isKnownLanguage` (lookup) and `highlightCode` (render to HTML).
 *
 *******************************************************************************/

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

/**
 * Purpose: Test whether highlight.js knows the given language alias.
 * How: Thin wrapper over `hljs.getLanguage(lang)`.
 */
export function isKnownLanguage(lang: string): boolean {
  return hljs.getLanguage(lang) !== undefined;
}

/**
 * Purpose: Render code in a known language to highlighted HTML markup.
 * How: Call `hljs.highlight` then wrap in `<pre class="hljs"><code …>`.
 */
export function highlightCode(code: string, lang: string): string {
  const result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
  return (
    `<pre class="hljs"><code class="hljs language-${escapeAttr(lang)}">` +
    result.value +
    `</code></pre>`
  );
}

/**
 * Purpose: Escape a string for safe insertion in a `"`-quoted HTML attribute.
 * How: Replace `&` and `"`; other characters are class names — already safe.
 */
function escapeAttr(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
