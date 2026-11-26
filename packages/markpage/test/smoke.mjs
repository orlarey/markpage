// smoke.mjs — render a small document through the CLI's renderStandalone and
// check the saved page: laid out in pages, formulas and diagrams rendered,
// self-contained (no script), every word of the source on the pages.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocument, guide, renderPdf, renderStandalone } from '../bin/markpage.mjs';

const md = `---
title: Essai
language: fr
---

::: toc+
- **Une section** — tout l'essai.
:::

# Une section

Une formule $a^2 + b^2 = c^2$, du \`code\` et une table :

\`\`\`tsv
nom\tvaleur
hoa_octo\t\`pow(2, 3)\`
\`\`\`

\`\`\`mermaid
graph LR
  A --> B
\`\`\`

::: note
Une note </script> qui ne ferme rien.
:::
`;

const dir = await mkdtemp(join(tmpdir(), 'markpage-smoke-'));
await writeFile(join(dir, 'essai.md'), md);
const { html, pages } = await renderStandalone(md, { docDir: dir });
assert.ok(pages >= 1, 'no page');
assert.ok(!/<script\b/i.test(html), 'the saved page must carry no script');
assert.ok(html.includes('class="pagedjs_page'), 'not paginated');
assert.ok(/<svg[\s>]/.test(html), 'no SVG: formula / diagram not rendered');
// Vivliostyle bakes a style attribute onto every element it lays out.
assert.ok(/<code[^>]*>pow\(2, 3\)<\/code>/.test(html), 'tsv cell not rendered as Markdown');
assert.ok(html.includes('qui ne ferme rien'), 'text after </script> lost');
// The contents link to their section inside the saved page — not to the local
// server the render ran on, gone by the time the page is read.
assert.ok(!/href="https?:\/\/(127\.0\.0\.1|localhost)/.test(html), 'a link points at the render server');
assert.match(html, /<a[^>]*href="#sec-une-section"/, 'the contents entry does not link to its section');
assert.match(html, /<h1[^>]*id="sec-une-section"/, 'the section has lost its anchor');
// Readable offline: the faces the document uses are in the page. When the
// font host cannot be reached while rendering, its stylesheet stays linked —
// never neither.
const embedded = (html.match(/@font-face\s*\{[^}]*url\("data:/g) ?? []).length;
const linked = (html.match(/<link[^>]+fonts\.googleapis\.com/g) ?? []).length;
assert.ok(embedded > 0 || linked > 0, 'the page carries no font at all');
if (linked > 0) console.warn(`smoke html: ${linked} font stylesheet(s) left linked (font host unreachable?)`);
else assert.ok(!/<link\b/i.test(html), 'an external stylesheet is still linked');
console.log(`smoke html: ok — ${pages} page(s), ${(html.length / 1e6).toFixed(2)} MB, ${embedded} face(s) embedded`);

// check: the same document, at both device pixel ratios, conserved.
const reports = await checkDocument(md, { docDir: dir, scales: [1, 2] });
assert.equal(reports.length, 2);
for (const r of reports) {
  for (const k of ['lost', 'added', 'duplicated', 'notes', 'math', 'overflow', 'errors']) {
    assert.deepEqual(r[k], [], `check at scale ${r.scale}: ${k}`);
  }
}
for (const r of reports) {
  for (const k of ['blocks', 'toc', 'tocEmpty']) assert.deepEqual(r[k], [], `check at scale ${r.scale}: ${k}`);
}
console.log(`smoke check: ok — ${reports.map((r) => `${r.pages} page(s) at ${r.scale}`).join(', ')}`);

// check: the authoring defects are reported — a fence that fails, a contents
// entry with no heading, and a contents block written without a list.
const faulty = (toc) =>
  ['---', 'title: Fautif', 'language: fr', '---', '', '::: toc+', toc, ':::', '', '# Une section', '',
   '```ebnf', 'a ::= b', '```', ''].join('\n');
const [bad] = await checkDocument(faulty('- **Une section** — présente.\n- **Une autre** — absente.'), {
  docDir: dir,
  scales: [1],
});
assert.equal(bad.blocks.length, 1, 'the failed ebnf fence is not reported');
assert.match(bad.blocks[0], /EBNF parse error/);
assert.deepEqual(bad.toc, ['Une autre'], 'the contents entry with no heading is not reported');
assert.deepEqual(bad.tocEmpty, []);
const [empty] = await checkDocument(faulty('**Une section** — écrite en paragraphe.'), { docDir: dir, scales: [1] });
assert.equal(empty.tocEmpty.length, 1, 'the contents block with no entry is not reported');
console.log('smoke check: ok — a failed fence, a dangling and an empty contents block are reported');

// pdf: the same pages, one sheet each.
const printed = await renderPdf(md, { docDir: dir });
assert.equal(printed.pdf.subarray(0, 5).toString('latin1'), '%PDF-');
const sheets = (printed.pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
assert.equal(sheets, printed.pages, 'one PDF sheet per page');
console.log(`smoke pdf: ok — ${sheets} sheet(s), ${(printed.pdf.length / 1e3).toFixed(0)} kB`);

// The command itself, reached through a symlink as `npx` / node_modules/.bin
// do: it must run (it used to do nothing, silently — the "am I the main
// module" test compared a symlink with a real path).
const bin = join(dirname(fileURLToPath(import.meta.url)), '../bin/markpage.mjs');
const link = join(dir, 'markpage');
await symlink(bin, link);
const help = execFileSync(process.execPath, [link, '--help'], { encoding: 'utf8' });
assert.ok(help.includes('markpage check'), 'the linked command prints its usage');
console.log('smoke bin: ok — runs through a symlink');

// guide: the authoring guide travels with the command, section by section.
const guideText = execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), '../bin/markpage.mjs'), 'guide', 'ebnf'], { encoding: 'utf8' });
assert.match(guideText, /^## EBNF railroad diagrams/, 'guide ebnf does not print the EBNF section');
assert.ok(!/^## Mermaid/m.test(guideText), 'guide ebnf prints other sections');
const sample = ['intro', '## Un', 'a', '```md', '## pas une section', '```', '## Deux (`::: toc+`)', '```adt', 'x', '```'].join('\n');
assert.equal(guide(sample, []).split('\n').filter((l) => l.startsWith('  ')).length, 2, 'a heading in a fence counted as a section');
assert.match(guide(sample, ['adt']), /^## Deux/, 'a block name does not find its section');
assert.throws(() => guide(sample, ['introuvable']), /no section/);
console.log('smoke guide: ok — sections by title, by block, none in a fence');
