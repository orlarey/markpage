// smoke.mjs — render a small document through the CLI's renderStandalone and
// check the saved page: laid out in pages, formulas and diagrams rendered,
// self-contained (no script), every word of the source on the pages.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocument, renderPdf, renderStandalone } from '../bin/markpage.mjs';

const md = `---
title: Essai
language: fr
---

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
console.log(`smoke html: ok — ${pages} page(s), ${(html.length / 1e6).toFixed(2)} MB`);

// check: the same document, at both device pixel ratios, conserved.
const reports = await checkDocument(md, { docDir: dir, scales: [1, 2] });
assert.equal(reports.length, 2);
for (const r of reports) {
  for (const k of ['lost', 'added', 'duplicated', 'notes', 'math', 'overflow', 'errors']) {
    assert.deepEqual(r[k], [], `check at scale ${r.scale}: ${k}`);
  }
}
console.log(`smoke check: ok — ${reports.map((r) => `${r.pages} page(s) at ${r.scale}`).join(', ')}`);

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
