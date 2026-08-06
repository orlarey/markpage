/**
 * O1 build (variant B′): generate markpage's built-in styles by driving the style
 * EDITOR's own compileStyle() in headless Chromium — the prototype IS the compiler,
 * so there is zero drift between what a designer produces and what markpage ships.
 *
 *   archetype specs (below)  ──▶  archetypes/<name>.mpstyle-src.json   (editor gallery)
 *                            └─▶  src/assets/builtin-styles.json       (compiled, per format)
 *
 * Each archetype is authored as a compact spec (structure + identity) applied over
 * the editor's default state; geometry is re-derived by the canon FOR EACH target
 * format, so one source yields A4 + Letter (and 16:9 for slides) with no duplication.
 *
 * Run: npm run build:styles
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const META = { author: 'markpage', version };

// A hand-tuned archetype: the full editor state, authored in the style editor
// and dropped in verbatim. Preferred over a compact spec when a designer has
// dialed in details (fonts, per-element scale/colour, cover zoom, apparatus)
// that the compact spec cannot express. Geometry is still re-baked per format.
const RAPPORT_STATE = JSON.parse(
  readFileSync(join(root, 'scripts', 'rapport.state.json'), 'utf8'),
);
const LETTRE_STATE = JSON.parse(
  readFileSync(join(root, 'scripts', 'lettre.state.json'), 'utf8'),
);

const FMT = {
  A4: { slug: 'a4', label: 'A4' },
  Letter: { slug: 'letter', label: 'Letter' },
  '16:9': { slug: '16x9', label: '16:9' },
};

// One compact spec per archetype: structure + visual identity. Everything else
// falls back to the editor's sensible defaults (crans, scale steps, cover zoom…).
const ARCHETYPES = [
  {
    base: 'Note', pageFormat: 'A4', formats: ['A4', 'Letter'],
    pairing: 'classique', hue: 213, hasCover: false, duplex: false,
    chapterBreak: 'none', notesPos: 'foot', numberingOn: true, apparatus: 2, // Folio en pied
  },
  {
    // Lettre ships a hand-tuned full state (ET Book, centred title/heading,
    // wide letter margins, date-only footer) — see scripts/lettre.state.json.
    base: 'Lettre', pageFormat: 'A4', formats: ['A4', 'Letter'],
    state: LETTRE_STATE,
  },
  {
    // Rapport ships a hand-tuned full state (ET Book, marginal chapter numbers,
    // scholarly apparatus with author/date in the footer) rather than a compact
    // spec — see scripts/rapport.state.json.
    base: 'Rapport', pageFormat: 'A4', formats: ['A4', 'Letter'],
    state: RAPPORT_STATE,
  },
  {
    base: 'Livre', pageFormat: 'A4', formats: ['A4', 'Letter'],
    pairing: 'livre', hue: 20, hasCover: true, duplex: true,
    chapterBreak: 'next-recto', notesPos: 'foot', numberingOn: true, apparatus: 1, // Savant, ET Book
  },
  {
    base: 'Présentation', pageFormat: '16:9', formats: ['16:9'],
    pairing: 'moderne', hue: 265, hasCover: true, duplex: false,
    chapterBreak: 'none', notesPos: 'foot', numberingOn: false, apparatus: 0, // Vierge
  },
];

// slug mirrors the editor's slug()
const slug = (s) =>
  (s || 'style').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style';

// Applied IN the page (runs in the prototype's scope): mutate the editor state S
// from a spec at one page format, then produce a value.
const inPage = ([spec, pageFormat, meta, want]) => {
  if (spec.state) {
    // Hand-tuned archetype: load the authored editor state verbatim. Its `geo`
    // may carry a hand-dragged text block that the canon cannot reproduce, so
    // PRESERVE it (absolute mm, reused as-is across formats) — re-baking with
    // canon1_9() would silently discard the custom margins.
    Object.assign(S, JSON.parse(JSON.stringify(spec.state)));
    S.pageFormat = pageFormat;
  } else {
    const P = PAIRINGS.find((p) => p.id === spec.pairing);
    if (P) { S.pairing = P.id; S.fam = { head: P.head, body: P.body, code: P.code }; S.ratio = P.ratio; S.mset = P.math; }
    if (spec.hue != null) S.hue1 = spec.hue;
    S.hasCover = !!spec.hasCover;
    S.duplex = !!spec.duplex;
    S.chapterBreak = spec.chapterBreak || 'none';
    S.notesPos = spec.notesPos || 'foot';
    if (spec.numberingOn != null) S.numbering.on = !!spec.numberingOn;
    if (spec.apparatus != null) S.running = JSON.parse(JSON.stringify(APPAREIL_PRESETS[spec.apparatus].running));
    S.pageFormat = pageFormat;
    S.geo = canon1_9(); // re-bake the canon for THIS format
  }
  S.meta = { ...S.meta, ...meta };
  return want === 'source'
    ? { 'markpage-style-src': 1, meta: { ...S.meta }, state: S }
    : compileStyle();
};

const url = pathToFileURL(join(root, 'prototypes', 'editeur-style.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage();

const builtins = [];
const sources = [];

for (const spec of ARCHETYPES) {
  const baseSlug = slug(spec.base);

  // 1) the re-editable SOURCE (home format) → archetypes/<name>.mpstyle-src.json
  await page.goto(url);
  const source = await page.evaluate(inPage, [spec, spec.pageFormat, { name: spec.base, ...META }, 'source']);
  sources.push({ file: `${baseSlug}.mpstyle-src.json`, source });

  // 2) one COMPILED built-in per target format
  for (const fmt of spec.formats) {
    const name = `${spec.base} ${FMT[fmt].label}`;
    const key = `${baseSlug}-${FMT[fmt].slug}`;
    await page.goto(url);
    const style = await page.evaluate(inPage, [spec, fmt, { name, ...META }, 'style']);
    builtins.push({ key, name, style, meta: { ...META } });
  }
}

await browser.close();

mkdirSync(join(root, 'archetypes'), { recursive: true });
for (const { file, source } of sources) {
  writeFileSync(join(root, 'archetypes', file), JSON.stringify(source, null, 2) + '\n');
}
writeFileSync(
  join(root, 'src', 'assets', 'builtin-styles.json'),
  JSON.stringify(builtins, null, 2) + '\n',
);

// The editor's starter gallery — the SAME sources, embedded so the standalone
// prototype needs no fetch (served from any directory).
const gallery = sources.map(({ source }) => ({ name: source.meta.name, source }));
writeFileSync(
  join(root, 'prototypes', 'archetypes.gallery.js'),
  '/* generated by build:styles — the editor starter gallery */\n' +
    'window.ARCHETYPE_GALLERY = ' + JSON.stringify(gallery) + ';\n',
);

console.log(`✓ ${sources.length} sources → archetypes/ + prototypes/archetypes.gallery.js`);
console.log(`✓ ${builtins.length} built-ins → src/assets/builtin-styles.json`);
for (const b of builtins) console.log(`  · ${b.key.padEnd(20)} ${b.name}`);
