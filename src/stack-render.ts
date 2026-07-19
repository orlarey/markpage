/********************************* stack-render.ts ****************************
 *
 * Purpose: Bridge the pure document-stack engine (@orlarey/markpage-render) into
 *   the app's render path — resolve a document's `extends` chain against the
 *   library, flatten it (merge front-matter + reset + token resolution + body
 *   fold), and hand back the flattened `.md` plus a profile patch the renderer
 *   applies on top of the document's effective settings.
 * How: the root of every chain is `default.md`, auto-generated from the active
 *   settings (`serializeProfile` → `normalizeProfile`) with a self-`extends`
 *   (the fixpoint). Resolution of named parents is delegated to an async
 *   `resolveByName` callback (the store), so this stays testable in-memory.
 *
 *******************************************************************************/

import {
  parseStackDoc,
  resolveChainAsync,
  mergeFrontmatter,
  resolveTokens,
  foldBodies,
  normalizeProfile,
  denormalizeProfile,
  serializeStackDoc,
  ROOT_NAME,
  type StackDoc,
  type ProfilePatch,
} from '@orlarey/markpage-render';

/**
 * Purpose: "Extraire un style" fallback — when the document carries no style
 *   front-matter of its own (it was styled through the Réglages panel, i.e. the
 *   active app profile), capture the active profile's *delta from the defaults*
 *   into the new style layer, and re-parent the document to it.
 * How: explode both profiles to dotted keys, keep only the keys where the active
 *   profile differs from the defaults (the user's actual changes); the document
 *   keeps all its front-matter and gains `extends: <styleName>` (an existing
 *   chain is preserved as the new style's parent). Returns null when the active
 *   profile equals the defaults (nothing was changed → nothing to extract).
 */
export function extractStyleFromSettings(
  source: string,
  styleName: string,
  activeProfileJson: string,
  defaultProfileJson: string,
): { styleMd: string; leafMd: string } | null {
  const active = normalizeProfile(activeProfileJson);
  const defaults = normalizeProfile(defaultProfileJson);
  const styleFm = new Map<string, string>();
  for (const [key, value] of active) {
    if (defaults.get(key) !== value) styleFm.set(key, value); // only the changes
  }
  if (styleFm.size === 0) return null;

  const leaf = parseStackDoc(source, '__leaf__');
  const parent = leaf.frontmatter.get('extends');
  if (parent !== undefined) styleFm.set('extends', parent); // keep the chain
  const leafFm = new Map(leaf.frontmatter);
  leafFm.delete('extends');
  leafFm.set('extends', styleName);
  return {
    styleMd: serializeStackDoc(styleFm, ''),
    leafMd: serializeStackDoc(leafFm, leaf.body),
  };
}

import { serializeProfile, DEFAULT_SETTINGS, type PdfSettings, type PageSize, type Style } from './settings';
import {
  APPEARANCES,
  DENSITIES,
  DOCUMENT_MODELS,
  PAGINATION_STYLES,
  PARAGRAPH_SEPARATIONS,
  DEFAULT_ESSENTIAL_STYLE,
  applyEssentialStyle,
  contextualEssentialStyle,
  detectAccentColor,
  detectAppearance,
  detectDensity,
  detectDocumentModelLayout,
  detectPaginationStyle,
  detectParagraphSeparation,
  type Appearance,
  type Density,
  type DocumentModel,
  type EssentialStyle,
  type PaginationStyle,
  type ParagraphSeparation,
} from './style-recipes';

/** Resolve an `extends` reference (a document name) to its source, or null. */
export type ResolveByName = (name: string) => Promise<StackDoc | null>;

/**
 * Purpose: Does this document use any stack feature (extends, tokens, dotted
 *   style keys)? Gate the new path so documents that use none render
 *   byte-identically to before. Also doubles as the "already migrated /
 *   already has its own style" check for `planProfileMigration`.
 */
export function usesStackFeatures(frontmatter: Map<string, string>): boolean {
  if (frontmatter.has('extends')) return true;
  for (const [key, value] of frontmatter) {
    if (
      key.startsWith('--') ||
      key.startsWith('styles.') ||
      SEMANTIC_STYLE_KEYS.has(key)
    )
      return true;
    if (value.includes('var(--')) return true;
  }
  return false;
}

export const SEMANTIC_STYLE_KEYS = new Set([
  'document-type',
  'appearance',
  'density',
  'body-size',
  'paragraphs',
  'alignment',
  'accent',
  'pagination',
  'notes',
]);

export const ESSENTIAL_FRONTMATTER_KEYS = [
  'document-type',
  'appearance',
  'density',
  'body-size',
  'paragraphs',
  'alignment',
  'accent',
  'pagination',
  'notes',
  'page-size',
] as const;

export type EssentialFrontmatterKey =
  (typeof ESSENTIAL_FRONTMATTER_KEYS)[number];

/** Return the essential variation keys explicitly authored on the leaf. */
export function essentialFrontmatterKeys(
  source: string,
): Set<EssentialFrontmatterKey> {
  const fm = parseStackDoc(source, '__leaf__').frontmatter;
  return new Set(
    ESSENTIAL_FRONTMATTER_KEYS.filter((key) => fm.has(key)),
  );
}

export const DETAILED_STYLE_KEYS = new Set([
  'font-body',
  'font-heading',
  'font-mono',
  'slides',
  'page-size',
  'margins',
  'page-numbers',
  'margin-mode',
  'measure-chars',
  'live-area-chars',
  'duplex',
  'chapter-break',
  'notes',
  'footer',
  'math-font-set',
  'markpage-profile',
]);

/** Count local style overrides, excluding the two coordinates of the recipe. */
export function styleVariationCount(source: string): number {
  const fm = parseStackDoc(source, '__leaf__').frontmatter;
  const variationKeys = new Set([
    ...[...SEMANTIC_STYLE_KEYS].filter(
      (key) => key !== 'document-type' && key !== 'appearance',
    ),
    ...DETAILED_STYLE_KEYS,
  ]);
  let count = 0;
  for (const key of fm.keys()) {
    if (variationKeys.has(key) || key.startsWith('styles.')) count += 1;
  }
  return count;
}

/**
 * Replace the leaf's complete local style with one recipe selection.
 * Metadata, body content and the `extends` relation are preserved. Every
 * semantic or detailed variation is removed in the same source rewrite, so a
 * caller can dispatch the result as one atomic undo/redo transaction.
 */
export function resetStyleRecipeInLeaf(
  source: string,
  documentType: DocumentModel,
  appearance: Appearance,
): string {
  const parsed = parseStackDoc(source, '__leaf__').frontmatter;
  const deletes = new Set<string>([
    ...SEMANTIC_STYLE_KEYS,
    ...DETAILED_STYLE_KEYS,
    ...[...parsed.keys()].filter((key) => key.startsWith('styles.')),
  ]);
  const upserts = new Map<string, string>();
  if (documentType !== DEFAULT_ESSENTIAL_STYLE.documentType)
    upserts.set('document-type', documentType);
  if (appearance !== DEFAULT_ESSENTIAL_STYLE.appearance)
    upserts.set('appearance', appearance);
  return setFrontmatterKeys(
    source,
    upserts,
    new Set([...deletes].filter((key) => !upserts.has(key))),
  );
}

/** Build the effective settings of a fresh recipe while preserving metadata. */
export function settingsForRecipe(
  current: PdfSettings,
  documentType: DocumentModel,
  appearance: Appearance,
): PdfSettings {
  const styled = applyEssentialStyle(
    DEFAULT_SETTINGS,
    contextualEssentialStyle(documentType, appearance),
  );
  return {
    ...current,
    fonts: styled.fonts,
    styles: styled.styles,
    pageSize: styled.pageSize,
    margins: styled.margins,
    marginMode: styled.marginMode,
    measureChars: styled.measureChars,
    liveAreaChars: styled.liveAreaChars,
    duplex: styled.duplex,
    chapterBreak: styled.chapterBreak,
    notes: styled.notes,
    footer: styled.footer,
    mathFontSet: styled.mathFontSet,
  };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function semanticStyleFromFrontmatter(
  fm: Map<string, string>,
): EssentialStyle | null {
  if (![...SEMANTIC_STYLE_KEYS].some((key) => fm.has(key))) return null;
  const documentType = unquote(fm.get('document-type') ?? '');
  const appearance = unquote(fm.get('appearance') ?? '');
  const resolvedDocumentType = (
    DOCUMENT_MODELS as readonly string[]
  ).includes(documentType)
    ? (documentType as DocumentModel)
    : DEFAULT_ESSENTIAL_STYLE.documentType;
  const resolvedAppearance = (APPEARANCES as readonly string[]).includes(
    appearance,
  )
    ? (appearance as Appearance)
    : DEFAULT_ESSENTIAL_STYLE.appearance;
  const style = contextualEssentialStyle(
    resolvedDocumentType,
    resolvedAppearance,
  );
  const density = unquote(fm.get('density') ?? '');
  if ((DENSITIES as readonly string[]).includes(density))
    style.density = density as Density;
  const bodySizeRaw = fm.get('body-size');
  if (bodySizeRaw !== undefined) {
    const bodySize = Number(unquote(bodySizeRaw));
    if (Number.isFinite(bodySize)) style.bodySize = bodySize;
  }
  const paragraphs = unquote(fm.get('paragraphs') ?? '');
  if ((PARAGRAPH_SEPARATIONS as readonly string[]).includes(paragraphs))
    style.paragraphs = paragraphs as ParagraphSeparation;
  const alignment = unquote(fm.get('alignment') ?? '');
  if (alignment === 'left' || alignment === 'justify')
    style.alignment = alignment;
  const accent = unquote(fm.get('accent') ?? '');
  if (/^#[0-9a-f]{6}$/i.test(accent)) style.accent = accent;
  const pagination = unquote(fm.get('pagination') ?? '');
  if ((PAGINATION_STYLES as readonly string[]).includes(pagination))
    style.pagination = pagination as PaginationStyle;
  const notes = unquote(fm.get('notes') ?? '');
  if (notes === 'foot' || notes === 'side' || notes === 'end')
    style.notes = notes;
  return style;
}

/** Return the leaf's semantic intent, completed with contextual defaults. */
export function essentialStyleFromSource(source: string): EssentialStyle {
  return (
    semanticStyleFromFrontmatter(
      parseStackDoc(source, '__leaf__').frontmatter,
    ) ??
    contextualEssentialStyle(
      DEFAULT_ESSENTIAL_STYLE.documentType,
      DEFAULT_ESSENTIAL_STYLE.appearance,
    )
  );
}

/**
 * Compile semantic style keys on each layer before the ordinary flat-key merge.
 * The generated detailed keys exist only in memory; explicit `styles.*` keys
 * from the same layer are applied afterwards and therefore remain exceptions.
 */
function compileSemanticChain(chain: StackDoc[]): StackDoc[] {
  return chain.map((doc) => {
    const semantic = semanticStyleFromFrontmatter(doc.frontmatter);
    if (!semantic) return doc;
    const compiled = normalizeProfile(
      serializeProfile(applyEssentialStyle(DEFAULT_SETTINGS, semantic)),
    );
    const frontmatter = new Map(compiled);
    for (const [key, value] of doc.frontmatter) frontmatter.set(key, value);
    return { ...doc, frontmatter };
  });
}

/**
 * Purpose: The root document `default.md` — markpage's defaults, as the canonical
 *   dotted/flat keys, with a self-`extends` (the chain fixpoint).
 * How: serialize the active settings to the profile JSON, explode it to keys.
 *   (Transitional: the root mirrors the *active* settings so a stack-less doc
 *   flattens to today's render; the factory-vs-active split lands with the
 *   Réglages round-trip.)
 */
function defaultDoc(settings: PdfSettings): StackDoc {
  const frontmatter = normalizeProfile(serializeProfile(settings));
  frontmatter.set('extends', ROOT_NAME);
  return { name: ROOT_NAME, frontmatter, body: '' };
}

/**
 * Purpose: Flatten a document for rendering — or `null` when it uses no stack
 *   feature (caller renders the source as-is, no behaviour change).
 * How: parse the leaf, resolve its `extends` chain to `default.md`, merge +
 *   resolve tokens, fold the bodies; return the flattened `.md` (folded body +
 *   merged front-matter) and the per-element style patch to apply.
 * Throws on a cycle, a missing parent, or an undefined token — the caller
 *   decides how to surface that (it degrades to the un-flattened render).
 */
export async function flattenForRender(
  source: string,
  opts: { settings: PdfSettings; resolveByName: ResolveByName },
): Promise<{ md: string; patch: ProfilePatch } | null> {
  const leaf = parseStackDoc(source, '__leaf__');
  if (!usesStackFeatures(leaf.frontmatter)) return null;

  const resolve = (name: string): Promise<StackDoc | null> =>
    name === ROOT_NAME ? Promise.resolve(defaultDoc(opts.settings)) : opts.resolveByName(name);

  const chain = await resolveChainAsync(leaf, resolve);
  const frontmatter = resolveTokens(mergeFrontmatter(compileSemanticChain(chain)));
  const body = foldBodies(chain);
  return { md: serializeStackDoc(frontmatter, body), patch: denormalizeProfile(frontmatter) };
}

/**
 * Purpose: Read a document's `extends` (its parent style), or null if it has none.
 * How: a targeted scan of the front-matter block — no full re-parse, so it works
 *   on the live editor text.
 */
export function getExtendsFromSource(source: string): string | null {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') return null; // end of front-matter, not found
    const m = /^extends\s*:\s*(.*)$/.exec(lines[i]);
    if (m) return m[1].trim() || null;
  }
  return null;
}

/**
 * Purpose: Set (or clear, with `null`) a document's `extends` key — the
 *   round-trip write of the "Style parent" control (STACK-SPEC §12.1).
 * How: a targeted front-matter edit that touches only the `extends:` line,
 *   preserving the rest of the front-matter and the body verbatim. Creates the
 *   front-matter block when absent and a parent is given.
 */
export function setExtendsInSource(source: string, parent: string | null): string {
  const lines = source.split('\n');
  const hasFm = lines[0]?.trim() === '---';
  if (!hasFm) {
    return parent === null ? source : `---\nextends: ${parent}\n---\n\n${source}`;
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return parent === null ? source : `---\nextends: ${parent}\n---\n\n${source}`;
  }
  let idx = -1;
  for (let i = 1; i < end; i += 1) {
    if (/^extends\s*:/.test(lines[i])) {
      idx = i;
      break;
    }
  }
  if (parent === null) {
    if (idx !== -1) lines.splice(idx, 1);
  } else if (idx === -1) {
    lines.splice(1, 0, `extends: ${parent}`); // right after the opening fence
  } else {
    lines[idx] = `extends: ${parent}`;
  }
  return lines.join('\n');
}

/**
 * Purpose: Targeted multi-key front-matter write — upsert each `key: value` and
 *   delete the listed keys, touching only those lines and leaving the rest of the
 *   front-matter (and the body) verbatim. The write half of the round-trip.
 * How: locate the front-matter block, then per key replace its line in place if
 *   present, append inside the block if new, or splice it out (delete). Keys may
 *   be dotted (`styles.h1.color`); values are already-serialized YAML scalars.
 *   Creates the front-matter block when absent and there is something to upsert.
 */
export function setFrontmatterKeys(
  source: string,
  upserts: Map<string, string>,
  deletes: Iterable<string> = [],
): string {
  const delSet = new Set(deletes);
  const lines = source.split('\n');

  const buildBlock = (): string | null => {
    const entries = [...upserts].filter(([k]) => !delSet.has(k));
    if (entries.length === 0) return null;
    return `---\n${entries.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n`;
  };

  if (lines[0]?.trim() !== '---') {
    const block = buildBlock();
    return block === null ? source : `${block}${source}`;
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    const block = buildBlock();
    return block === null ? source : `${block}${source}`;
  }

  const indexOfKey = (key: string): number => {
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
    for (let i = 1; i < end; i += 1) {
      if (re.test(lines[i])) return i;
    }
    return -1;
  };

  // Deletes first so the block shrinks before we compute append positions.
  for (const key of delSet) {
    const idx = indexOfKey(key);
    if (idx !== -1) {
      lines.splice(idx, 1);
      end -= 1;
    }
  }
  for (const [key, value] of upserts) {
    if (delSet.has(key)) continue;
    const idx = indexOfKey(key);
    if (idx !== -1) {
      lines[idx] = `${key}: ${value}`;
    } else {
      lines.splice(end, 0, `${key}: ${value}`); // append at the end of the block
      end += 1;
    }
  }
  return lines.join('\n');
}

/**
 * Purpose: The round-trip write (STACK-SPEC §12.1) — make a document carry its
 *   own style as front-matter: every setting that deviates from the factory
 *   defaults becomes a dotted/flat key on the leaf, and any setting back at its
 *   default is removed (so reverting a control cleans up after itself). This is
 *   what lets moving a Réglages slider land as a `styles.…` key in the document.
 * How: normalize both the live settings and the defaults to the canonical key
 *   space; upsert the keys that differ, delete the keys that match. `customFonts`
 *   is left to the font machinery (its payload can be large) and never written
 *   here. Pure: non-style keys (`extends`, `title`, …) are untouched.
 */
export function writeStyleToLeaf(
  source: string,
  settings: PdfSettings,
  defaults: PdfSettings,
  forcedVariations: ReadonlySet<EssentialFrontmatterKey> = new Set(),
): string {
  const parsed = parseStackDoc(source, '__leaf__').frontmatter;
  const authoredSemantic = semanticStyleFromFrontmatter(parsed);
  if (serializeProfile(settings) === serializeProfile(defaults)) {
    return setFrontmatterKeys(
      source,
      new Map(),
      new Set([
        ...SEMANTIC_STYLE_KEYS,
        ...DETAILED_STYLE_KEYS,
        ...[...parsed.keys()].filter((key) => key.startsWith('styles.')),
      ]),
    );
  }
  const semantic: EssentialStyle = {
    documentType:
      detectDocumentModelLayout(settings) ??
      authoredSemantic?.documentType ??
      DEFAULT_ESSENTIAL_STYLE.documentType,
    appearance:
      detectAppearance(settings) ??
      authoredSemantic?.appearance ??
      DEFAULT_ESSENTIAL_STYLE.appearance,
    density:
      detectDensity(settings) ??
      authoredSemantic?.density ??
      DEFAULT_ESSENTIAL_STYLE.density,
    bodySize: settings.styles.body.fontSize ?? DEFAULT_ESSENTIAL_STYLE.bodySize,
    paragraphs:
      detectParagraphSeparation(settings) ??
      authoredSemantic?.paragraphs ??
      DEFAULT_ESSENTIAL_STYLE.paragraphs,
    alignment:
      settings.styles.body.align === 'justify' ? 'justify' : 'left',
    accent: detectAccentColor(settings),
    pagination:
      detectPaginationStyle(settings) ??
      authoredSemantic?.pagination ??
      DEFAULT_ESSENTIAL_STYLE.pagination,
    notes: settings.notes.position,
  };
  const compiled = applyEssentialStyle(defaults, semantic);
  const cur = normalizeProfile(serializeProfile(settings));
  const def = normalizeProfile(serializeProfile(compiled));
  const factory = normalizeProfile(serializeProfile(defaults));
  const upserts = new Map<string, string>();
  const deletes = [
    ...new Set([
      ...SEMANTIC_STYLE_KEYS,
      ...DETAILED_STYLE_KEYS,
      ...[...parsed.keys()].filter((key) => key.startsWith('styles.')),
    ]),
  ];

  const semanticEntries: Array<[keyof EssentialStyle, string, string]> = [
    ['documentType', 'document-type', semantic.documentType],
    ['appearance', 'appearance', semantic.appearance],
    ['density', 'density', semantic.density],
    ['bodySize', 'body-size', String(semantic.bodySize)],
    ['paragraphs', 'paragraphs', semantic.paragraphs],
    ['alignment', 'alignment', semantic.alignment],
    ['accent', 'accent', `"${semantic.accent}"`],
    ['pagination', 'pagination', semantic.pagination],
    ['notes', 'notes', semantic.notes],
  ];
  const contextualDefaults = contextualEssentialStyle(
    semantic.documentType,
    semantic.appearance,
  );
  for (const [property, key, value] of semanticEntries) {
    const baseline =
      property === 'documentType' || property === 'appearance'
        ? DEFAULT_ESSENTIAL_STYLE[property]
        : contextualDefaults[property];
    if (semantic[property] !== baseline)
      upserts.set(key, value);
  }

  for (const key of new Set([...cur.keys(), ...def.keys()])) {
    if (key === 'customFonts') continue; // font payloads travel by their own path
    const cv = cur.get(key);
    // A value inherited unchanged from the historical factory profile is not
    // an authored advanced exception. Omitting it lets the semantic recipe
    // become authoritative and avoids dumping legacy fonts, rhythm and colours
    // into an otherwise minimal frontmatter. A genuine advanced edit differs
    // from both the recipe and the factory value, so it remains explicit.
    if (
      cv !== undefined &&
      cv !== def.get(key) &&
      (cv !== factory.get(key) ||
        parsed.has(key) ||
        forcedVariations.has(key as EssentialFrontmatterKey))
    )
      upserts.set(key, cv);
  }
  return setFrontmatterKeys(
    source,
    upserts,
    deletes.filter((key) => !upserts.has(key)),
  );
}

/**
 * Purpose: Fold a stack profile patch into PdfSettings — the per-element styles,
 *   fonts, and layout — so the existing renderer applies the stacked result.
 * How: shallow-merge fonts; deep-merge styles per element/attribute (the patch
 *   carries only what the stack set); map layout keys. Pure: returns a new
 *   settings object, leaving the input untouched.
 */
export function applyProfilePatch(settings: PdfSettings, patch: ProfilePatch): PdfSettings {
  let out = settings;

  if (patch.fonts) {
    const fonts = { ...out.fonts };
    if (patch.fonts.body) fonts.body = patch.fonts.body;
    if (patch.fonts.headings) fonts.headings = patch.fonts.headings;
    if (patch.fonts.code) fonts.code = patch.fonts.code;
    out = { ...out, fonts };
  }

  if (patch.styles) {
    const styles = { ...out.styles } as Record<string, Style>;
    for (const [el, attrs] of Object.entries(patch.styles)) {
      styles[el] = { ...(styles[el] ?? {}), ...(attrs as Partial<Style>) } as Style;
    }
    out = { ...out, styles: styles as PdfSettings['styles'] };
  }

  if (patch.pageSize) out = { ...out, pageSize: patch.pageSize as PageSize };
  if (patch.margins) out = { ...out, marginMode: 'manual', margins: patch.margins };
  if (patch.marginMode === 'manual' || patch.marginMode === 'derived')
    out = { ...out, marginMode: patch.marginMode };
  if (Number.isFinite(patch.measureChars))
    out = { ...out, measureChars: patch.measureChars! };
  if (Number.isFinite(patch.liveAreaChars))
    out = { ...out, liveAreaChars: patch.liveAreaChars! };
  if (patch.duplex !== undefined) out = { ...out, duplex: patch.duplex };
  if (
    patch.chapterBreak === 'none' ||
    patch.chapterBreak === 'next-page' ||
    patch.chapterBreak === 'next-recto'
  )
    out = { ...out, chapterBreak: patch.chapterBreak };
  if (
    patch.notesPosition === 'foot' ||
    patch.notesPosition === 'side' ||
    patch.notesPosition === 'end'
  )
    out = { ...out, notes: { position: patch.notesPosition } };
  if (patch.footer !== undefined) out = { ...out, footer: patch.footer };
  if (
    patch.mathFontSet === 'newcm' ||
    patch.mathFontSet === 'fira' ||
    patch.mathFontSet === 'stix2' ||
    patch.mathFontSet === 'asana' ||
    patch.mathFontSet === 'tex'
  )
    out = { ...out, mathFontSet: patch.mathFontSet };
  if (patch.pageNumbers !== undefined) {
    out = { ...out, footer: patch.pageNumbers ? ' | {page} | ' : '' };
  }

  return out;
}

/**
 * Purpose: Derive a document's effective settings from its own stack (extends
 *   chain + dotted style keys) — the Réglages panel's source of truth as a
 *   document becomes self-describing (STACK-SPEC §12.1). Root the style at the
 *   true factory defaults (not `current`), so a property the chain never sets
 *   falls back to `default.md`, not whatever app profile happens to be active.
 * How: flatten against `DEFAULT_SETTINGS`; `null` (no stack feature yet) means
 *   the doc carries no style of its own — return `current` unchanged
 *   (pre-migration fallback, §12.2). Otherwise apply the patch onto
 *   `DEFAULT_SETTINGS` and graft only the style-relevant fields onto
 *   `current` — everything else (author, language, MathJax/mermaid tuning,
 *   …) is outside the pile's scope and passes through untouched. Swallows
 *   flatten errors (cycle, missing parent, undefined token) into the same
 *   fallback, matching `buildPreviewDom`'s degrade-to-unflattened behaviour.
 */
export async function deriveSettingsForDoc(
  source: string,
  current: PdfSettings,
  resolveByName: ResolveByName,
): Promise<PdfSettings> {
  try {
    const flat = await flattenForRender(source, { settings: DEFAULT_SETTINGS, resolveByName });
    const styled = flat
      ? applyProfilePatch(DEFAULT_SETTINGS, flat.patch)
      : applyEssentialStyle(DEFAULT_SETTINGS, DEFAULT_ESSENTIAL_STYLE);
    return {
      ...current,
      fonts: styled.fonts,
      styles: styled.styles,
      pageSize: styled.pageSize,
      margins: styled.margins,
      marginMode: styled.marginMode,
      measureChars: styled.measureChars,
      liveAreaChars: styled.liveAreaChars,
      duplex: styled.duplex,
      chapterBreak: styled.chapterBreak,
      notes: styled.notes,
      footer: styled.footer,
      mathFontSet: styled.mathFontSet,
    };
  } catch (err) {
    console.warn('[markpage] settings derivation failed', err);
    return current;
  }
}

/** A profile as seen by `planProfileMigration` — settings already loaded. */
export interface ProfileForMigration {
  uuid: string;
  displayName: string;
  settings: PdfSettings;
  active: boolean;
}

/** A library document as seen by `planProfileMigration` — content already loaded. */
export interface DocForMigration {
  uuid: string;
  content: string;
}

/** What `planProfileMigration` proposes: new style docs + doc rewrites. */
export interface ProfileMigrationPlan {
  styleDocsToCreate: { name: string; markdown: string }[];
  leavesToUpdate: { uuid: string; markdown: string }[];
}

/**
 * Purpose: STACK-SPEC §12.2 one-time migration — convert every profile with
 *   real customizations into a style document in the library, and point every
 *   document that has no style of its own at the currently active profile's
 *   style doc. This is the only historically-recoverable per-doc association:
 *   today every non-stack document renders via whichever profile is active,
 *   there was never a recorded doc→profile link to restore more precisely.
 * How: pure planning, no I/O — for each profile, `writeStyleToLeaf('',
 *   settings, DEFAULT_SETTINGS)` gives its delta as a style doc's front-matter
 *   (empty string when the profile equals the factory defaults — nothing to
 *   preserve). For each library doc using no stack feature yet
 *   (`usesStackFeatures`), point it at the active profile's style doc via
 *   `setExtendsInSource`. Idempotent: a migrated doc gains `extends`, so a
 *   second run's `usesStackFeatures` check skips it; a doc already present
 *   under the profile's name (typically the style doc a previous run
 *   created) is assumed already migrated and reused as-is, never recreated.
 */
export function planProfileMigration(
  profiles: ProfileForMigration[],
  existingDocNames: ReadonlySet<string>,
  docs: DocForMigration[],
): ProfileMigrationPlan {
  const styleDocsToCreate: { name: string; markdown: string }[] = [];
  const nameForProfile = new Map<string, string>();

  for (const p of profiles) {
    const markdown = writeStyleToLeaf('', p.settings, DEFAULT_SETTINGS);
    if (markdown.trim() === '') continue; // profile == factory defaults, nothing to preserve
    nameForProfile.set(p.uuid, p.displayName);
    if (existingDocNames.has(p.displayName)) continue; // already migrated — reuse, don't recreate
    styleDocsToCreate.push({ name: p.displayName, markdown });
  }

  const activeProfile = profiles.find((p) => p.active);
  const activeStyleName = activeProfile ? nameForProfile.get(activeProfile.uuid) : undefined;

  const leavesToUpdate: { uuid: string; markdown: string }[] = [];
  if (activeStyleName) {
    for (const d of docs) {
      const fm = parseStackDoc(d.content, '__leaf__').frontmatter;
      if (usesStackFeatures(fm)) continue; // already has its own style or a parent
      leavesToUpdate.push({ uuid: d.uuid, markdown: setExtendsInSource(d.content, activeStyleName) });
    }
  }

  return { styleDocsToCreate, leavesToUpdate };
}
