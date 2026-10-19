#!/usr/bin/env node
// sync-docs.mjs — copy the authoring docs into the plugin.
//
// A plugin installed from the marketplace is copied on its own: files above
// claude-code/ do not come along, and a symlink to one is not guaranteed to. So
// the write skill carries real copies of the two docs whose source of truth is
// elsewhere in the repo:
//   AI-AUTHORING.md          → skills/write/references/AI-AUTHORING.md
//   packages/blocks/SYNTAX.md → skills/write/references/SYNTAX.md
//
//   node claude-code/sync-docs.mjs           copy them
//   node claude-code/sync-docs.mjs --check   exit 1 if a copy is stale (CI)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = dirname(fileURLToPath(import.meta.url));
const REPO = join(PLUGIN, '..');
const REFS = join(PLUGIN, 'skills', 'write', 'references');
const DOCS = [
  [join(REPO, 'AI-AUTHORING.md'), join(REFS, 'AI-AUTHORING.md')],
  [join(REPO, 'packages', 'blocks', 'SYNTAX.md'), join(REFS, 'SYNTAX.md')],
];

const check = process.argv.includes('--check');
let stale = 0;
for (const [from, to] of DOCS) {
  const text = readFileSync(from, 'utf8');
  const same = existsSync(to) && readFileSync(to, 'utf8') === text;
  if (same) continue;
  if (check) {
    stale += 1;
    console.error(`stale: ${relative(REPO, to)} differs from ${relative(REPO, from)}`);
  } else {
    writeFileSync(to, text);
    console.log(`synced ${relative(REPO, to)}`);
  }
}
if (stale) {
  console.error('run `node claude-code/sync-docs.mjs` (or `make claude-plugin`) and commit');
  process.exit(1);
}
