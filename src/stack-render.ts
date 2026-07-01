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
    if (key.startsWith('--') || key.startsWith('styles.')) return true;
    if (value.includes('var(--')) return true;
  }
  return false;
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
  const frontmatter = resolveTokens(mergeFrontmatter(chain));
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
): string {
  const cur = normalizeProfile(serializeProfile(settings));
  const def = normalizeProfile(serializeProfile(defaults));
  const upserts = new Map<string, string>();
  const deletes: string[] = [];
  for (const key of new Set([...cur.keys(), ...def.keys()])) {
    if (key === 'customFonts') continue; // font payloads travel by their own path
    const cv = cur.get(key);
    if (cv !== undefined && cv !== def.get(key)) upserts.set(key, cv);
    else deletes.push(key);
  }
  return setFrontmatterKeys(source, upserts, deletes);
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
    if (!flat) return current;
    const styled = applyProfilePatch(DEFAULT_SETTINGS, flat.patch);
    return {
      ...current,
      fonts: styled.fonts,
      styles: styled.styles,
      pageSize: styled.pageSize,
      margins: styled.margins,
      marginMode: styled.marginMode,
      footer: styled.footer,
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
